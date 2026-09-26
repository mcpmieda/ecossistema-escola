import { PDFDocument, rgb } from 'pdf-lib';
import { PhotoAdminClientErrorV1 } from '../../student-photos/admin-client-v1';
import { readCurrentPhotoV1 } from '../../student-photos/catalog-client-v1';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import { renderQrAccessCardV1 } from './qr-access-card-render-v1';
import { QR_LAYOUT_V1, renderQrPngV1 } from './qr-artifacts-v1';
import { QrArtifactErrorV1, validatePrintCardsV1, type QrArtifactV1 } from './qr-values-v1';

const ptPerMm = 72 / 25.4;
export const QR_ACCESS_CARD_PDF_LAYOUT_V1 = {
  pageWidth: QR_LAYOUT_V1.pageWidth,
  pageHeight: QR_LAYOUT_V1.pageHeight,
  cutWidth: 95 * ptPerMm,
  cutHeight: 59 * ptPerMm,
  margin: 5 * ptPerMm,
  columnGap: 10 * ptPerMm,
  rowGap: 5 * ptPerMm,
  columns: 2,
  rows: 4,
} as const;

type CardPdfDependenciesV1 = {
  renderQr: typeof renderQrPngV1;
  readPhoto: typeof readCurrentPhotoV1;
  renderCard: typeof renderQrAccessCardV1;
};
const defaultDependencies: CardPdfDependenciesV1 = {
  renderQr: renderQrPngV1,
  readPhoto: readCurrentPhotoV1,
  renderCard: renderQrAccessCardV1,
};

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
  const layout = QR_ACCESS_CARD_PDF_LAYOUT_V1;
  const perPage = layout.columns * layout.rows;
  const artWidth = (layout.cutHeight * 856) / 540;
  let page = pdf.addPage([layout.pageWidth, layout.pageHeight]);
  progress(0, cards.length);
  for (const [index, card] of cards.entries()) {
    signal.throwIfAborted();
    if (index > 0 && index % perPage === 0)
      page = pdf.addPage([layout.pageWidth, layout.pageHeight]);
    const qr = await dependencies.renderQr(card.qr, signal);
    signal.throwIfAborted();
    let photo: Blob | undefined;
    try {
      photo = await dependencies.readPhoto(
        { source: 'portal', academicYear, accountIds: [card.accountId] },
        null,
        signal,
      );
    } catch (error) {
      if (
        error instanceof PhotoAdminClientErrorV1 &&
        (error.code === 'unauthenticated' || error.code === 'forbidden')
      )
        throw new PortalClientErrorV1(error.code);
      throw error;
    }
    signal.throwIfAborted();
    const cardImage = await dependencies.renderCard(
      { qr: qr.blob, photo, name: card.name, classLabel: card.classLabel },
      signal,
      1,
    );
    signal.throwIfAborted();
    const image = await pdf.embedPng(await cardImage.blob.arrayBuffer());
    signal.throwIfAborted();
    const slot = index % perPage;
    const column = slot % layout.columns;
    const row = Math.floor(slot / layout.columns);
    const x = layout.margin + column * (layout.cutWidth + layout.columnGap);
    const y =
      layout.pageHeight -
      layout.margin -
      layout.cutHeight -
      row * (layout.cutHeight + layout.rowGap);
    page.drawImage(image, {
      x: x + (layout.cutWidth - artWidth) / 2,
      y,
      width: artWidth,
      height: layout.cutHeight,
    });
    page.drawRectangle({
      x,
      y,
      width: layout.cutWidth,
      height: layout.cutHeight,
      borderColor: rgb(0.68, 0.73, 0.79),
      borderWidth: 0.4,
      borderDashArray: [2, 2],
    });
    progress(index + 1, cards.length);
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
