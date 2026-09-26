import { QrArtifactErrorV1, type QrArtifactV1 } from './qr-values-v1';

const crestUrl = new URL('./assets/school-crest.png', import.meta.url).href;
const emblemUrl = new URL('./assets/school-emblem-outline.png', import.meta.url).href;
const WIDTH = 856;
const HEIGHT = 540;
const SCALE = 2;
/** Batch print art: vector QR is drawn by the PDF, so the bitmap only needs text/photo detail. */
const PRINT_SCALE = 1.5;
const PRINT_JPEG_QUALITY = 0.9;
/** Card art geometry in its own 856 × 540 units; the QR box includes its quiet zone. */
export const QR_ACCESS_CARD_ART_V1 = {
  width: WIDTH,
  height: HEIGHT,
  qr: { x: 542, y: 142, size: 304 },
} as const;

export type QrAccessCardInputV1 = {
  qr: Blob;
  photo?: Blob;
  name: string;
  classLabel: string;
};
export type QrAccessCardPrintInputV1 = Omit<QrAccessCardInputV1, 'qr'>;

let cardAssets: Promise<[HTMLImageElement, HTMLImageElement]> | undefined;
// Crest and emblem are static bundle assets; decode them once per page, not once per card.
function cardAssetsV1() {
  cardAssets ??= Promise.all([imageFromUrl(crestUrl), imageFromUrl(emblemUrl)]).catch(
    (error: unknown) => {
      cardAssets = undefined;
      throw error;
    },
  );
  return cardAssets;
}

function imageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new QrArtifactErrorV1('render-unavailable'));
    image.src = url;
  });
}

function fillRoundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
}

function paintPattern(
  context: CanvasRenderingContext2D,
  emblem: HTMLImageElement,
  top: number,
  height: number,
  rows: number,
) {
  const size = 20;
  const stepX = (WIDTH - size) / 28;
  const stepY = (height - size) / (rows - 1);
  context.save();
  context.globalAlpha = 0.38;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column <= 28; column++) {
      context.drawImage(emblem, column * stepX, top + row * stepY, size, size);
    }
  }
  context.restore();
}

function paintPhoto(context: CanvasRenderingContext2D, photo?: ImageBitmap) {
  const x = 28;
  const y = 185;
  const width = 164;
  const height = 218;
  context.save();
  context.shadowColor = '#15386626';
  context.shadowBlur = 24;
  context.shadowOffsetY = 12;
  context.fillStyle = '#ffffff';
  fillRoundRect(context, x, y, width, height, 16);
  context.restore();
  context.save();
  context.beginPath();
  context.roundRect(x + 4, y + 4, width - 8, height - 8, 12);
  context.clip();
  if (photo) {
    const innerWidth = width - 8;
    const innerHeight = height - 8;
    const scale = Math.max(innerWidth / photo.width, innerHeight / photo.height);
    const cropWidth = innerWidth / scale;
    const cropHeight = innerHeight / scale;
    const cropX = (photo.width - cropWidth) / 2;
    const cropY = (photo.height - cropHeight) * 0.34;
    context.drawImage(
      photo,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      x + 4,
      y + 4,
      innerWidth,
      innerHeight,
    );
  } else {
    const fallback = context.createLinearGradient(x, y, x + width, y + height);
    fallback.addColorStop(0, '#d9e5f4');
    fallback.addColorStop(1, '#aebfd7');
    context.fillStyle = fallback;
    context.fillRect(x + 4, y + 4, width - 8, height - 8);
    context.fillStyle = '#829cbf';
    context.beginPath();
    context.arc(x + width / 2, y + 76, 31, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.ellipse(x + width / 2, y + 193, 70, 68, 0, Math.PI, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function wrappedName(context: CanvasRenderingContext2D, name: string, size: number) {
  context.font = `850 ${size}px Inter, Arial, sans-serif`;
  const words = name.normalize('NFC').trim().split(/\s+/u);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= 292) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const character of word) {
      if (line && context.measureText(line + character).width > 292) {
        lines.push(line);
        line = '';
      }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function paintIdentity(context: CanvasRenderingContext2D, name: string, classLabel: string) {
  let size = name.length > 42 ? 24 : name.length > 25 ? 29 : 32;
  let lines = wrappedName(context, name, size);
  while (lines.length > 5 && size > 16) lines = wrappedName(context, name, --size);
  if (lines.length > 5) {
    lines = lines.slice(0, 5);
    const last = lines[4]!;
    lines[4] = last.slice(0, Math.max(0, last.length - 1)) + '…';
  }
  const lineHeight = Math.round(size * 1.1);
  const nameHeight = lines.length * lineHeight;
  const classHeight = 34;
  const groupHeight = nameHeight + 21 + 3 + 16 + classHeight;
  let y = 132 + (324 - groupHeight) / 2;
  context.textBaseline = 'top';
  context.fillStyle = '#102a60';
  context.font = `850 ${size}px Inter, Arial, sans-serif`;
  for (const line of lines) {
    context.fillText(line, 220, y);
    y += lineHeight;
  }
  y += 21;
  context.fillStyle = '#bb293a';
  fillRoundRect(context, 220, y, 42, 3, 2);
  y += 19;
  let classSize = 18;
  context.font = `820 ${classSize}px Inter, Arial, sans-serif`;
  while (context.measureText(classLabel).width > 270 && classSize > 12)
    context.font = `820 ${--classSize}px Inter, Arial, sans-serif`;
  const badgeWidth = Math.min(294, Math.ceil(context.measureText(classLabel).width + 24));
  context.fillStyle = '#1b4480';
  fillRoundRect(context, 220, y, badgeWidth, classHeight, 8);
  context.fillStyle = '#ffffff';
  context.fillText(classLabel, 232, y + 7);
}

function paintCard(
  context: CanvasRenderingContext2D,
  crest: HTMLImageElement,
  emblem: HTMLImageElement,
  qr: ImageBitmap | undefined,
  input: QrAccessCardPrintInputV1,
  photo?: ImageBitmap,
) {
  context.save();
  context.beginPath();
  context.roundRect(0, 0, WIDTH, HEIGHT, 28);
  context.clip();

  const navy = context.createLinearGradient(0, 0, WIDTH, 0);
  navy.addColorStop(0, '#061632');
  navy.addColorStop(0.48, '#0d2c63');
  navy.addColorStop(1, '#1c4c82');
  context.fillStyle = navy;
  context.fillRect(0, 0, WIDTH, 132);
  context.fillRect(0, 456, WIDTH, 84);
  paintPattern(context, emblem, 0, 132, 5);
  paintPattern(context, emblem, 456, 84, 4);

  const red = context.createLinearGradient(509, 0, 856, 0);
  red.addColorStop(0, '#ed5b5b');
  red.addColorStop(0.53, '#bc2b40');
  red.addColorStop(1, '#7c1429');
  context.fillStyle = red;
  context.beginPath();
  context.moveTo(535, 0);
  context.lineTo(856, 0);
  context.lineTo(856, 132);
  context.lineTo(509, 132);
  context.closePath();
  context.fill();

  const center = context.createLinearGradient(0, 132, 600, 132);
  center.addColorStop(0, '#e8f2ff');
  center.addColorStop(0.7, '#f6faff');
  center.addColorStop(1, '#ffffff');
  context.fillStyle = center;
  context.fillRect(0, 132, WIDTH, 324);
  context.strokeStyle = '#1e40af';
  context.lineWidth = 1;
  for (let x = 0; x <= 568; x += 20) {
    context.globalAlpha = 0.08 * Math.min(1, (568 - x) / 140);
    context.beginPath();
    context.moveTo(x + 0.5, 132);
    context.lineTo(x + 0.5, 456);
    context.stroke();
  }
  for (let y = 132; y <= 456; y += 20) {
    context.globalAlpha = 0.08;
    context.beginPath();
    context.moveTo(0, y + 0.5);
    context.lineTo(568, y + 0.5);
    context.stroke();
  }
  context.globalAlpha = 1;

  const qrJoin = context.createLinearGradient(400, 0, 542, 0);
  qrJoin.addColorStop(0, 'rgba(255, 255, 255, 0)');
  qrJoin.addColorStop(1, '#ffffff');
  context.fillStyle = qrJoin;
  context.fillRect(400, 132, 142, 324);
  context.fillStyle = '#ffffff';
  context.fillRect(542, 132, WIDTH - 542, 324);

  paintPhoto(context, photo);
  paintIdentity(context, input.name, input.classLabel);
  if (qr) {
    const box = QR_ACCESS_CARD_ART_V1.qr;
    context.imageSmoothingEnabled = false;
    context.drawImage(qr, box.x, box.y, box.size, box.size);
    context.imageSmoothingEnabled = true;
  }

  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(66, 66, 50, 0, Math.PI * 2);
  context.fill();
  context.save();
  context.beginPath();
  context.arc(66, 66, 48, 0, Math.PI * 2);
  context.clip();
  context.drawImage(crest, 18, 18, 96, 96);
  context.restore();
  context.textBaseline = 'top';
  context.fillStyle = '#ffffff';
  context.font = '800 15px Inter, Arial, sans-serif';
  context.fillText('ESCOLA MUNICIPAL', 134, 49);
  context.font = '850 20px Inter, Arial, sans-serif';
  context.fillText('PROFª IÊDA ALVES DE OLIVEIRA', 134, 68);

  context.fillStyle = '#ffffff';
  context.font = '700 18px Inter, Arial, sans-serif';
  context.fillText('Portal do Aluno', 552, 43);
  let titleSize = 29;
  context.font = `850 ${titleSize}px Inter, Arial, sans-serif`;
  while (context.measureText('Cartão de acesso').width > 272 && titleSize > 22)
    context.font = `850 ${--titleSize}px Inter, Arial, sans-serif`;
  context.fillText('Cartão de acesso', 552, 67);
  context.restore();
}

async function renderCardBlobV1(
  input: QrAccessCardPrintInputV1 & { qr?: Blob },
  signal: AbortSignal,
  scale: number,
  type: 'image/png' | 'image/jpeg',
): Promise<Blob> {
  signal.throwIfAborted();
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined')
    throw new QrArtifactErrorV1('render-unavailable');
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(WIDTH * scale);
  canvas.height = Math.round(HEIGHT * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new QrArtifactErrorV1('render-unavailable');
  let qr: ImageBitmap | undefined;
  let photo: ImageBitmap | undefined;
  try {
    const [[crest, emblem], qrImage, photoImage] = await Promise.all([
      cardAssetsV1(),
      input.qr ? createImageBitmap(input.qr) : Promise.resolve(undefined),
      input.photo ? createImageBitmap(input.photo) : Promise.resolve(undefined),
    ]);
    qr = qrImage;
    photo = photoImage;
    signal.throwIfAborted();
    context.scale(scale, scale);
    // JPEG has no alpha: the rounded corners must match the white paper, not turn black.
    if (type === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, WIDTH, HEIGHT);
    }
    paintCard(context, crest, emblem, qr, input, photo);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new QrArtifactErrorV1('render-unavailable'))),
        type,
        type === 'image/jpeg' ? PRINT_JPEG_QUALITY : undefined,
      ),
    );
    signal.throwIfAborted();
    return blob;
  } finally {
    qr?.close();
    photo?.close();
    canvas.width = canvas.height = 1;
  }
}

/** Generates a local PNG from the current QR and the school's served portrait. */
export async function renderQrAccessCardV1(
  input: QrAccessCardInputV1,
  signal: AbortSignal,
): Promise<QrArtifactV1> {
  const blob = await renderCardBlobV1(input, signal, SCALE, 'image/png');
  return { blob, format: 'png', count: 1, pages: 1 };
}

/** Card art without the QR, as JPEG, for the A4 batch; the PDF overlays the vector QR. */
export function renderQrAccessCardPrintV1(
  input: QrAccessCardPrintInputV1,
  signal: AbortSignal,
): Promise<Blob> {
  return renderCardBlobV1(input, signal, PRINT_SCALE, 'image/jpeg');
}
