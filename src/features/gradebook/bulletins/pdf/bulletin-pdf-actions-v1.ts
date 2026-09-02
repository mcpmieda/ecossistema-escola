import type { BulletinSnapshotV1 } from '../../../../../shared/gradebook-contracts/bulletins/bulletin-contract-v1';
import { bulletinModelLabelV1, bulletinPeriodLabelV1 } from '../bulletin-presentation-v1';

export type BulletinPdfActionFailureV1 =
  | 'invalid-input'
  | 'bounds-exceeded'
  | 'renderer-unavailable'
  | 'download-unavailable'
  | 'print-unavailable';

export interface BulletinPdfActionResultV1 {
  readonly filename: string;
  readonly pageCount: number;
  readonly byteLength: number;
}

interface BulletinPdfRendererModuleV1 {
  readonly renderBulletinPdfV1: (input: { readonly snapshot: BulletinSnapshotV1 }) => Promise<{
    readonly blob: Blob;
    readonly byteLength: number;
    readonly pageCount: number;
  }>;
}

export type BulletinPdfRendererImporterV1 = () => Promise<BulletinPdfRendererModuleV1>;

export class BulletinPdfActionErrorV1 extends Error {
  constructor(
    readonly code: BulletinPdfActionFailureV1,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BulletinPdfActionErrorV1';
  }
}

function sanitizeSegment(value: string, fallback: string): string {
  const normalized = value
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/[\\/<>:"|?*]/gu, '-')
    .replace(/\s+/gu, ' ')
    .replace(/\.{2,}/gu, '.')
    .trim()
    .replace(/^[. -]+|[. -]+$/gu, '');
  const safe = normalized.length === 0 ? fallback : normalized;
  return Array.from(safe).slice(0, 72).join('').trim() || fallback;
}

export function bulletinPdfFilenameV1(snapshot: BulletinSnapshotV1): string {
  const student = sanitizeSegment(snapshot.model.student.displayName, 'aluno');
  const classGroup = sanitizeSegment(snapshot.model.classGroup.code, 'turma');
  const period = sanitizeSegment(bulletinPeriodLabelV1(snapshot.model.period), 'periodo');
  const model = sanitizeSegment(bulletinModelLabelV1(snapshot.model.modelKind), 'modelo');
  const version = Number.isSafeInteger(snapshot.snapshotVersion) && snapshot.snapshotVersion > 0
    ? snapshot.snapshotVersion
    : 1;
  return `boletim-${student}-${classGroup}-${period}-${model}-v${version}.pdf`;
}

const defaultRendererImporter: BulletinPdfRendererImporterV1 = async () => {
  const module = await import('./bulletin-pdf-renderer-v1');
  return { renderBulletinPdfV1: module.renderBulletinPdfV1 };
};

export async function loadBulletinPdfRendererV1(
  importer: BulletinPdfRendererImporterV1 = defaultRendererImporter,
): Promise<BulletinPdfRendererModuleV1> {
  try {
    const renderer = await importer();
    if (typeof renderer.renderBulletinPdfV1 !== 'function') throw new Error('invalid-renderer-module');
    return renderer;
  } catch (cause) {
    throw new BulletinPdfActionErrorV1(
      'renderer-unavailable',
      'O renderer de PDF não pôde ser carregado.',
      { cause },
    );
  }
}

function mapRendererFailure(cause: unknown): BulletinPdfActionErrorV1 {
  if (
    cause !== null &&
    typeof cause === 'object' &&
    'code' in cause &&
    (cause.code === 'invalid-input' ||
      cause.code === 'bounds-exceeded' ||
      cause.code === 'renderer-unavailable')
  ) {
    return new BulletinPdfActionErrorV1(
      cause.code,
      cause instanceof Error ? cause.message : String(cause.code),
      { cause },
    );
  }
  return new BulletinPdfActionErrorV1(
    'renderer-unavailable',
    'O PDF não pôde ser gerado.',
    { cause },
  );
}

async function generateBulletinPdfV1(
  snapshot: BulletinSnapshotV1,
  importer?: BulletinPdfRendererImporterV1,
) {
  const renderer = await loadBulletinPdfRendererV1(importer);
  try {
    return await renderer.renderBulletinPdfV1({ snapshot });
  } catch (cause) {
    throw mapRendererFailure(cause);
  }
}

function requireBrowserDownloadApis(): void {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function' ||
    typeof URL.revokeObjectURL !== 'function'
  ) {
    throw new BulletinPdfActionErrorV1(
      'download-unavailable',
      'Download de PDF indisponível neste navegador.',
    );
  }
}

export async function downloadBulletinPdfV1(
  snapshot: BulletinSnapshotV1,
  importer?: BulletinPdfRendererImporterV1,
): Promise<BulletinPdfActionResultV1> {
  requireBrowserDownloadApis();
  const artifact = await generateBulletinPdfV1(snapshot, importer);
  const filename = bulletinPdfFilenameV1(snapshot);
  const objectUrl = URL.createObjectURL(artifact.blob);
  const anchor = document.createElement('a');
  try {
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
  } catch (cause) {
    throw new BulletinPdfActionErrorV1(
      'download-unavailable',
      'O download do PDF não pôde ser iniciado.',
      { cause },
    );
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  }
  return { filename, pageCount: artifact.pageCount, byteLength: artifact.byteLength };
}

export async function printBulletinPdfV1(
  snapshot: BulletinSnapshotV1,
  importer?: BulletinPdfRendererImporterV1,
): Promise<BulletinPdfActionResultV1> {
  requireBrowserDownloadApis();
  if (typeof window === 'undefined') {
    throw new BulletinPdfActionErrorV1(
      'print-unavailable',
      'Impressão de PDF indisponível neste navegador.',
    );
  }

  const artifact = await generateBulletinPdfV1(snapshot, importer);
  const filename = bulletinPdfFilenameV1(snapshot);
  const objectUrl = URL.createObjectURL(artifact.blob);
  const frame = document.createElement('iframe');
  frame.title = `Impressão de ${filename}`;
  frame.hidden = true;
  frame.src = objectUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new BulletinPdfActionErrorV1('print-unavailable', 'Tempo limite da impressão do PDF.'));
      }, 15_000);

      frame.addEventListener(
        'load',
        () => {
          if (settled) return;
          const target = frame.contentWindow;
          if (target === null) {
            settled = true;
            window.clearTimeout(timeout);
            reject(new BulletinPdfActionErrorV1('print-unavailable', 'Janela de impressão indisponível.'));
            return;
          }
          try {
            target.focus();
            target.print();
            settled = true;
            window.clearTimeout(timeout);
            resolve();
          } catch (cause) {
            settled = true;
            window.clearTimeout(timeout);
            reject(
              new BulletinPdfActionErrorV1(
                'print-unavailable',
                'A impressão do PDF não pôde ser iniciada.',
                { cause },
              ),
            );
          }
        },
        { once: true },
      );
      frame.addEventListener(
        'error',
        () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          reject(new BulletinPdfActionErrorV1('print-unavailable', 'O PDF não pôde ser aberto para impressão.'));
        },
        { once: true },
      );
      document.body.append(frame);
    });
  } finally {
    window.setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(objectUrl);
    }, 1_000);
  }

  return { filename, pageCount: artifact.pageCount, byteLength: artifact.byteLength };
}
