import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import { qrUrlV1 } from '../../../../shared/student-portal-contracts/auth-v1';
import {
  QrArtifactErrorV1,
  validatePrintCardsV1,
  type PrintCardV1,
  type QrArtifactV1,
} from './qr-values-v1';
export const QR_LAYOUT_V1 = {
  pageWidth: 595.28,
  pageHeight: 841.89,
  margin: 24,
  gap: 12,
  columns: 2,
  rows: 3,
  qrSize: 108,
  quietModules: 4,
} as const;
export function qrMatrixV1(qr: string) {
  if (!qrUrlV1.safeParse(qr).success) throw new QrArtifactErrorV1('invalid-cards');
  return QRCode.create(qr, { errorCorrectionLevel: 'M' }).modules;
}
// A task boundary keeps cancellation responsive without background-tab timer throttling.
const yieldToBrowser = () =>
  new Promise<void>((resolve) => {
    if (typeof MessageChannel === 'undefined') {
      setTimeout(resolve, 0);
      return;
    }
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
function canvasV1(width: number, height: number) {
  if (typeof document === 'undefined') throw new QrArtifactErrorV1('render-unavailable');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new QrArtifactErrorV1('render-unavailable');
  return { canvas, context };
}
async function canvasBlobV1(canvas: HTMLCanvasElement, signal: AbortSignal) {
  signal.throwIfAborted();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new QrArtifactErrorV1('render-unavailable'))),
      'image/png',
    ),
  );
  signal.throwIfAborted();
  return blob;
}
/** The bitmap contains only black/white QR modules and the four-module quiet zone. */
export async function renderQrPngV1(qr: string, signal: AbortSignal): Promise<QrArtifactV1> {
  signal.throwIfAborted();
  const matrix = qrMatrixV1(qr),
    scale = 8,
    quiet = QR_LAYOUT_V1.quietModules;
  const { canvas, context } = canvasV1(
    (matrix.size + quiet * 2) * scale,
    (matrix.size + quiet * 2) * scale,
  );
  try {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000000';
    for (let row = 0; row < matrix.size; row++)
      for (let col = 0; col < matrix.size; col++) {
        if (matrix.get(row, col))
          context.fillRect((col + quiet) * scale, (row + quiet) * scale, scale, scale);
      }
    return { blob: await canvasBlobV1(canvas, signal), format: 'png', count: 1, pages: 1 };
  } finally {
    canvas.width = canvas.height = 1;
  }
}
function cleanLabelV1(value: string) {
  return Array.from(value.normalize('NFC'), (character) => {
    const point = character.codePointAt(0)!;
    return point <= 31 || point === 127 ? ' ' : character;
  })
    .join('')
    .replace(/\s+/gu, ' ')
    .trim();
}
/** Wrap by measured glyphs, including words longer than the card; never truncate a name. */
export function wrapQrLabelV1(value: string, width: number, measure: (s: string) => number) {
  const lines: string[] = [];
  let line = '';
  const graphemes = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' }).segment(
    cleanLabelV1(value),
  );
  for (const { segment } of graphemes) {
    if (measure(segment) > width) throw new QrArtifactErrorV1('text-does-not-fit');
    if (line && measure(line + segment) > width) {
      const space = line.lastIndexOf(' ');
      if (space > 0) {
        lines.push(line.slice(0, space));
        line = line.slice(space + 1) + segment;
      } else {
        lines.push(line.trimEnd());
        line = segment.trimStart();
      }
    } else line += segment;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}
function labelPartsV1(card: PrintCardV1) {
  return card.mode === 'qr-only'
    ? []
    : [
        { text: cleanLabelV1(card.name), size: 9, leading: 11 },
        ...(card.mode === 'qr-name-class'
          ? [{ text: cleanLabelV1(card.classLabel), size: 8.5, leading: 10.5 }]
          : []),
      ];
}
async function drawLabelsV1(
  pdf: PDFDocument,
  page: PDFPage,
  font: PDFFont,
  card: PrintCardV1,
  x: number,
  top: number,
  width: number,
  maxHeight: number,
  signal: AbortSignal,
) {
  const parts = labelPartsV1(card);
  if (!parts.length) return;
  let supported = true;
  try {
    for (const part of parts) font.encodeText(part.text);
  } catch {
    supported = false;
  }
  if (supported) {
    let used = 0;
    for (const part of parts) {
      const lines = wrapQrLabelV1(part.text, width, (s) => font.widthOfTextAtSize(s, part.size));
      for (const line of lines) {
        used += part.leading;
        if (used > maxHeight) throw new QrArtifactErrorV1('text-does-not-fit');
        page.drawText(line, {
          font,
          size: part.size,
          x: x + (width - font.widthOfTextAtSize(line, part.size)) / 2,
          y: top - used,
          color: rgb(0, 0, 0),
        });
      }
      used += 4;
    }
    return;
  }
  // Standard PDF fonts cover Portuguese. Other scripts use the browser's local fonts,
  // rasterized at 288dpi; no font/CDN request, character replacement or lost name.
  const scale = 4,
    { canvas, context } = canvasV1(Math.ceil(width * scale), Math.ceil(maxHeight * scale));
  try {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000';
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    let used = 0;
    for (const part of parts) {
      context.font = `${part.size * scale}px Arial, sans-serif`;
      const lines = wrapQrLabelV1(part.text, width, (s) => context.measureText(s).width / scale);
      for (const line of lines) {
        used += part.leading;
        if (used > maxHeight) throw new QrArtifactErrorV1('text-does-not-fit');
        context.fillText(line, canvas.width / 2, used * scale);
      }
      used += 4;
    }
    const png = await canvasBlobV1(canvas, signal);
    const image = await pdf.embedPng(await png.arrayBuffer());
    signal.throwIfAborted();
    page.drawImage(image, { x, y: top - maxHeight, width, height: maxHeight });
  } finally {
    canvas.width = canvas.height = 1;
  }
}
/** A4, six bounded cards/page. QR is vector geometry, never PDF text, URL or annotation. */
export async function renderQrPdfV1(
  input: unknown,
  signal: AbortSignal,
  progress: (completed: number, total: number) => void = () => {},
): Promise<QrArtifactV1> {
  signal.throwIfAborted();
  const cards = validatePrintCardsV1(input),
    layout = QR_LAYOUT_V1;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.setTitle('Cartões de acesso');
  pdf.setCreator('Centro de Administração');
  const width = (layout.pageWidth - 2 * layout.margin - layout.gap) / 2;
  const height = (layout.pageHeight - 2 * layout.margin - 2 * layout.gap) / 3;
  let page: PDFPage | undefined;
  progress(0, cards.length);
  for (const [index, card] of cards.entries()) {
    await yieldToBrowser();
    signal.throwIfAborted();
    if (index % 6 === 0) page = pdf.addPage([layout.pageWidth, layout.pageHeight]);
    const x = layout.margin + (index % 2) * (width + layout.gap);
    const top =
      layout.pageHeight - layout.margin - Math.floor((index % 6) / 2) * (height + layout.gap);
    const matrix = qrMatrixV1(card.qr),
      quiet = layout.quietModules;
    const unit = layout.qrSize / (matrix.size + 2 * quiet);
    const qrX = x + (width - layout.qrSize) / 2,
      qrTop = top - 8;
    page!.drawRectangle({
      x: qrX,
      y: qrTop - layout.qrSize,
      width: layout.qrSize,
      height: layout.qrSize,
      color: rgb(1, 1, 1),
    });
    for (let row = 0; row < matrix.size; row++)
      for (let col = 0; col < matrix.size;) {
        if (!matrix.get(row, col)) {
          col++;
          continue;
        }
        const start = col;
        while (col < matrix.size && matrix.get(row, col)) col++;
        page!.drawRectangle({
          x: qrX + (start + quiet) * unit,
          y: qrTop - (row + quiet + 1) * unit,
          width: (col - start) * unit,
          height: unit,
          color: rgb(0, 0, 0),
        });
      }
    const labelTop = qrTop - layout.qrSize - 8;
    await drawLabelsV1(
      pdf,
      page!,
      font,
      card,
      x + 8,
      labelTop,
      width - 16,
      height - 8 - layout.qrSize - 8 - 8,
      signal,
    );
    signal.throwIfAborted();
    progress(index + 1, cards.length);
  }
  await yieldToBrowser();
  signal.throwIfAborted();
  const bytes = await pdf.save({ objectsPerTick: 30 });
  signal.throwIfAborted();
  return {
    blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
    format: 'pdf',
    count: cards.length,
    pages: Math.ceil(cards.length / 6),
  };
}
