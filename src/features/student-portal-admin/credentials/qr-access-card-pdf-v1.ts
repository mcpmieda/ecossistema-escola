import { PDFDocument, PrintScaling, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { PhotoAdminClientErrorV1 } from '../../student-photos/admin-client-v1';
import { readCurrentPhotoV1 } from '../../student-photos/catalog-client-v1';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import { QR_ACCESS_CARD_ART_V1, renderQrAccessCardPrintV1 } from './qr-access-card-render-v1';
import { QR_LAYOUT_V1, qrMatrixV1 } from './qr-artifacts-v1';
import { qrLayerPathsV1 } from './qr-shapes-v1';
import { QrArtifactErrorV1, validatePrintCardsV1, type QrArtifactV1 } from './qr-values-v1';

const ptPerMm = 72 / 25.4;
/** The 95 × 59 mm card size is required by the lamination pouch; no cut guide is printed. */
export const QR_ACCESS_CARD_PDF_LAYOUT_V1 = {
  pageWidth: QR_LAYOUT_V1.pageWidth,
  pageHeight: QR_LAYOUT_V1.pageHeight,
  cardWidth: 95 * ptPerMm,
  cardHeight: 59 * ptPerMm,
  columnGap: 10 * ptPerMm,
  rowGap: 5 * ptPerMm,
  columns: 2,
  rows: 4,
  rulerLength: 50 * ptPerMm,
} as const;
const PHOTO_CONCURRENCY = 4;
const PHOTO_RETRY_DELAYS_MS = [400, 1_200] as const;

type CardPdfDependenciesV1 = {
  readPhoto: typeof readCurrentPhotoV1;
  renderCard: typeof renderQrAccessCardPrintV1;
  wait: (milliseconds: number, signal: AbortSignal) => Promise<void>;
};
const waitV1 = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const timer = setTimeout(done, milliseconds);
    function done() {
      signal.removeEventListener('abort', abort);
      resolve();
    }
    function abort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal.addEventListener('abort', abort, { once: true });
  });
const defaultDependencies: CardPdfDependenciesV1 = {
  readPhoto: readCurrentPhotoV1,
  renderCard: renderQrAccessCardPrintV1,
  wait: waitV1,
};

/** Grid origin (PDF coordinates, bottom-left) centred on the page, away from printer margins. */
export function qrAccessCardSlotV1(slot: number) {
  const layout = QR_ACCESS_CARD_PDF_LAYOUT_V1;
  const gridWidth = layout.columns * layout.cardWidth + (layout.columns - 1) * layout.columnGap;
  const gridHeight = layout.rows * layout.cardHeight + (layout.rows - 1) * layout.rowGap;
  const left = (layout.pageWidth - gridWidth) / 2;
  const top = layout.pageHeight - (layout.pageHeight - gridHeight) / 2;
  const column = slot % layout.columns;
  const row = Math.floor(slot / layout.columns);
  return {
    x: left + column * (layout.cardWidth + layout.columnGap),
    y: top - layout.cardHeight - row * (layout.cardHeight + layout.rowGap),
  };
}

/** A missing or unreadable portrait still prints (owner decision); only lost access stops. */
async function readPhotoOrNoneV1(
  dependencies: CardPdfDependenciesV1,
  accountId: string,
  academicYear: number,
  signal: AbortSignal,
): Promise<Blob | undefined> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await dependencies.readPhoto(
        { source: 'portal', academicYear, accountIds: [accountId] },
        null,
        signal,
      );
    } catch (error) {
      signal.throwIfAborted();
      if (
        error instanceof PhotoAdminClientErrorV1 &&
        (error.code === 'unauthenticated' || error.code === 'forbidden')
      )
        throw new PortalClientErrorV1(error.code);
      const delay = PHOTO_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) return undefined;
      await dependencies.wait(delay, signal);
    }
  }
}

function drawCalibrationV1(page: PDFPage, font: PDFFont) {
  const layout = QR_ACCESS_CARD_PDF_LAYOUT_V1;
  const color = rgb(0.45, 0.5, 0.58);
  const center = layout.pageWidth / 2;
  const y = 12 * ptPerMm;
  const start = center - layout.rulerLength / 2;
  const end = center + layout.rulerLength / 2;
  page.drawLine({ start: { x: start, y }, end: { x: end, y }, thickness: 0.5, color });
  for (const x of [start, end])
    page.drawLine({
      start: { x, y: y - 1.5 * ptPerMm },
      end: { x, y: y + 1.5 * ptPerMm },
      thickness: 0.5,
      color,
    });
  const text = 'Imprima em tamanho real (100%). A linha acima deve medir 5 cm.';
  const size = 7;
  page.drawText(text, {
    x: center - font.widthOfTextAtSize(text, size) / 2,
    y: 7 * ptPerMm,
    size,
    font,
    color,
  });
}

/** Print complete cards only after an explicit batch request; private images stay in memory. */
export async function renderQrAccessCardsPdfV1(
  input: unknown,
  academicYear: number,
  signal: AbortSignal,
  progress: (completed: number, total: number) => void = () => {},
  dependencies: CardPdfDependenciesV1 = defaultDependencies,
): Promise<QrArtifactV1> {
  signal.throwIfAborted();
  if (!Number.isInteger(academicYear) || academicYear < 1900 || academicYear > 9999)
    throw new QrArtifactErrorV1('invalid-cards');
  const cards = validatePrintCardsV1(input).map((card) => {
    if (card.mode !== 'qr-name-class') throw new QrArtifactErrorV1('invalid-cards');
    return card;
  });
  const pdf = await PDFDocument.create();
  pdf.setTitle('Cartões de acesso');
  pdf.setCreator('Centro de Administração');
  // Viewers must not shrink the sheet to "fit": the card size is fixed by the pouch.
  pdf.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const layout = QR_ACCESS_CARD_PDF_LAYOUT_V1;
  const art = QR_ACCESS_CARD_ART_V1;
  const perPage = layout.columns * layout.rows;
  const artWidth = (layout.cardHeight * art.width) / art.height;
  const unit = artWidth / art.width;
  const quiet = QR_LAYOUT_V1.quietModules;

  // Photos download a few cards ahead while earlier cards are painted; order stays fixed.
  const photoController = new AbortController();
  const stopPhotos = () => photoController.abort(signal.reason);
  signal.addEventListener('abort', stopPhotos, { once: true });
  const photos: Promise<Blob | undefined>[] = [];
  const photoAt = (index: number) => {
    const last = Math.min(cards.length, index + PHOTO_CONCURRENCY);
    for (let next = photos.length; next < last; next++) {
      const request = readPhotoOrNoneV1(
        dependencies,
        cards[next]!.accountId,
        academicYear,
        photoController.signal,
      );
      request.catch(() => {}); // Awaited in order below; a stopped batch must not leak rejections.
      photos.push(request);
    }
    return photos[index]!;
  };

  let page: PDFPage | undefined;
  try {
    progress(0, cards.length);
    for (const [index, card] of cards.entries()) {
      signal.throwIfAborted();
      if (index % perPage === 0) {
        page = pdf.addPage([layout.pageWidth, layout.pageHeight]);
        drawCalibrationV1(page, font);
      }
      const photo = await photoAt(index);
      signal.throwIfAborted();
      const identity = { name: card.name, classLabel: card.classLabel };
      let artBlob: Blob;
      try {
        artBlob = await dependencies.renderCard({ ...identity, photo }, signal);
      } catch (error) {
        signal.throwIfAborted();
        if (!photo) throw error;
        artBlob = await dependencies.renderCard(identity, signal); // Undecodable portrait.
      }
      signal.throwIfAborted();
      const image = await pdf.embedJpg(await artBlob.arrayBuffer());
      signal.throwIfAborted();

      const { x, y } = qrAccessCardSlotV1(index % perPage);
      const artX = x + (layout.cardWidth - artWidth) / 2;
      page!.drawImage(image, { x: artX, y, width: artWidth, height: layout.cardHeight });

      // Vector QR over the art's white QR box: crisp modules at any printer resolution.
      const matrix = qrMatrixV1(card.qr);
      const qrSize = art.qr.size * unit;
      const qrX = artX + art.qr.x * unit;
      const qrTop = y + layout.cardHeight - art.qr.y * unit;
      page!.drawRectangle({
        x: qrX,
        y: qrTop - qrSize,
        width: qrSize,
        height: qrSize,
        color: rgb(1, 1, 1),
      });
      // SVG coordinates increase downwards; pdf-lib's path operator applies the matching Y flip.
      for (const shape of qrLayerPathsV1(matrix, quiet))
        page!.drawSvgPath(shape.path, {
          x: qrX,
          y: qrTop,
          scale: qrSize / (matrix.size + 2 * quiet),
          color: shape.dark ? rgb(0, 0, 0) : rgb(1, 1, 1),
          borderWidth: 0,
        });
      progress(index + 1, cards.length);
    }
  } finally {
    signal.removeEventListener('abort', stopPhotos);
    photoController.abort();
  }
  signal.throwIfAborted();
  const bytes = await pdf.save({ objectsPerTick: 30 });
  signal.throwIfAborted();
  return {
    blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
    format: 'pdf',
    count: cards.length,
    pages: pdf.getPageCount(),
  };
}
