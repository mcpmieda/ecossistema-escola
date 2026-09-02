/// <reference lib="dom" />

import type {
  BulletinReprintRequestV1,
  BulletinReprintResultV1,
  BulletinSnapshotV1,
} from '../../../../../shared/gradebook-contracts/bulletins/bulletin-contract-v1';
import {
  BulletinPdfActionErrorV1,
  bulletinPdfFilenameV1,
  loadBulletinPdfRendererV1,
  type BulletinPdfActionFailureV1,
  type BulletinPdfRendererImporterV1,
} from './bulletin-pdf-actions-v1';

export const BULLETIN_PDF_BATCH_LIMITS_V1 = Object.freeze({
  maxDocuments: 3,
  maxPagesPerDocument: 24,
  maxOutputBytesPerDocument: 12 * 1024 * 1024,
  maxTotalPages: 72,
  maxTotalOutputBytes: 36 * 1024 * 1024,
  concurrentDocuments: 1,
  maxRetainedArtifacts: 1,
  estimatedActiveCanvasRgbaBytes: 1_191 * 1_684 * 4,
} as const);

export type BulletinPdfBatchFailureV1 =
  | BulletinPdfActionFailureV1
  | 'historical-snapshot-unavailable';

export interface BulletinPdfBatchReadyItemV1 {
  readonly requestIndex: number;
  readonly status: 'ready';
  readonly filename: string;
  readonly pageCount: number;
  readonly byteLength: number;
}

export interface BulletinPdfBatchFailedItemV1 {
  readonly requestIndex: number;
  readonly status: 'failed';
  readonly code: BulletinPdfBatchFailureV1;
}

export interface BulletinPdfBatchResultV1 {
  readonly ready: readonly BulletinPdfBatchReadyItemV1[];
  readonly failed: readonly BulletinPdfBatchFailedItemV1[];
  readonly totalPageCount: number;
  readonly totalByteLength: number;
}

export interface BulletinPdfBatchArtifactV1 {
  readonly snapshot: BulletinSnapshotV1;
  readonly filename: string;
  readonly blob: Blob;
  readonly pageCount: number;
  readonly byteLength: number;
}

export type BulletinPdfBatchArtifactConsumerV1 = (
  artifact: BulletinPdfBatchArtifactV1,
  requestIndex: number,
) => Promise<void>;

export type BulletinHistoricalReprintLoaderV1 = (
  request: BulletinReprintRequestV1,
) => Promise<BulletinReprintResultV1>;

export class BulletinPdfBatchErrorV1 extends Error {
  constructor(
    readonly code: 'bounds-exceeded' | 'invalid-input',
    message: string,
  ) {
    super(message);
    this.name = 'BulletinPdfBatchErrorV1';
  }
}

type SnapshotLoaderV1 = (requestIndex: number) => Promise<BulletinSnapshotV1>;

function requireBatchCardinality(count: number): void {
  if (!Number.isInteger(count) || count < 1) {
    throw new BulletinPdfBatchErrorV1('invalid-input', 'O lote de PDF deve conter ao menos um item.');
  }
  if (count > BULLETIN_PDF_BATCH_LIMITS_V1.maxDocuments) {
    throw new BulletinPdfBatchErrorV1(
      'bounds-exceeded',
      `O lote de PDF excede ${BULLETIN_PDF_BATCH_LIMITS_V1.maxDocuments} documentos.`,
    );
  }
}

function rendererFailureCode(cause: unknown): BulletinPdfActionFailureV1 {
  if (cause instanceof BulletinPdfActionErrorV1) return cause.code;
  if (cause !== null && typeof cause === 'object' && 'code' in cause) {
    const code = cause.code;
    if (code === 'invalid-input' || code === 'bounds-exceeded' || code === 'renderer-unavailable') {
      return code;
    }
  }
  return 'renderer-unavailable';
}

function validateArtifactBounds(pageCount: number, byteLength: number): void {
  if (
    !Number.isSafeInteger(pageCount) ||
    pageCount < 1 ||
    pageCount > BULLETIN_PDF_BATCH_LIMITS_V1.maxPagesPerDocument ||
    !Number.isSafeInteger(byteLength) ||
    byteLength < 1 ||
    byteLength > BULLETIN_PDF_BATCH_LIMITS_V1.maxOutputBytesPerDocument
  ) {
    throw new BulletinPdfActionErrorV1(
      'bounds-exceeded',
      'O renderer retornou um artefato fora dos limites do lote.',
    );
  }
}

async function processBatchV1(
  count: number,
  loadSnapshot: SnapshotLoaderV1,
  consume: BulletinPdfBatchArtifactConsumerV1,
  importer?: BulletinPdfRendererImporterV1,
): Promise<BulletinPdfBatchResultV1> {
  requireBatchCardinality(count);

  let renderer: Awaited<ReturnType<typeof loadBulletinPdfRendererV1>>;
  try {
    renderer = await loadBulletinPdfRendererV1(importer);
  } catch (cause) {
    return {
      ready: [],
      failed: Array.from({ length: count }, (_, requestIndex) => ({
        requestIndex,
        status: 'failed' as const,
        code: rendererFailureCode(cause),
      })),
      totalPageCount: 0,
      totalByteLength: 0,
    };
  }

  const ready: BulletinPdfBatchReadyItemV1[] = [];
  const failed: BulletinPdfBatchFailedItemV1[] = [];
  let totalPageCount = 0;
  let totalByteLength = 0;

  for (let requestIndex = 0; requestIndex < count; requestIndex += 1) {
    let snapshot: BulletinSnapshotV1;
    try {
      snapshot = await loadSnapshot(requestIndex);
    } catch (cause) {
      failed.push({
        requestIndex,
        status: 'failed',
        code:
          cause instanceof BulletinPdfActionErrorV1
            ? cause.code
            : 'historical-snapshot-unavailable',
      });
      continue;
    }

    try {
      const artifact = await renderer.renderBulletinPdfV1({ snapshot });
      validateArtifactBounds(artifact.pageCount, artifact.byteLength);
      if (
        totalPageCount + artifact.pageCount > BULLETIN_PDF_BATCH_LIMITS_V1.maxTotalPages ||
        totalByteLength + artifact.byteLength > BULLETIN_PDF_BATCH_LIMITS_V1.maxTotalOutputBytes
      ) {
        throw new BulletinPdfActionErrorV1(
          'bounds-exceeded',
          'O lote de PDF excedeu o limite agregado de páginas ou bytes.',
        );
      }

      const filename = bulletinPdfFilenameV1(snapshot);
      await consume(
        {
          snapshot,
          filename,
          blob: artifact.blob,
          pageCount: artifact.pageCount,
          byteLength: artifact.byteLength,
        },
        requestIndex,
      );
      totalPageCount += artifact.pageCount;
      totalByteLength += artifact.byteLength;
      ready.push({
        requestIndex,
        status: 'ready',
        filename,
        pageCount: artifact.pageCount,
        byteLength: artifact.byteLength,
      });
    } catch (cause) {
      failed.push({
        requestIndex,
        status: 'failed',
        code: rendererFailureCode(cause),
      });
    }
  }

  return { ready, failed, totalPageCount, totalByteLength };
}

export async function processBulletinPdfSnapshotBatchV1(
  snapshots: readonly BulletinSnapshotV1[],
  consume: BulletinPdfBatchArtifactConsumerV1,
  importer?: BulletinPdfRendererImporterV1,
): Promise<BulletinPdfBatchResultV1> {
  return processBatchV1(
    snapshots.length,
    async (requestIndex) => {
      const snapshot = snapshots[requestIndex];
      if (snapshot === undefined) {
        throw new BulletinPdfActionErrorV1('invalid-input', 'Snapshot ausente no lote.');
      }
      return snapshot;
    },
    consume,
    importer,
  );
}

export async function processHistoricalBulletinPdfBatchV1(
  requests: readonly BulletinReprintRequestV1[],
  loadReprint: BulletinHistoricalReprintLoaderV1,
  consume: BulletinPdfBatchArtifactConsumerV1,
  importer?: BulletinPdfRendererImporterV1,
): Promise<BulletinPdfBatchResultV1> {
  return processBatchV1(
    requests.length,
    async (requestIndex) => {
      const request = requests[requestIndex];
      if (request === undefined) {
        throw new BulletinPdfActionErrorV1('invalid-input', 'Pedido histórico ausente no lote.');
      }
      const result = await loadReprint(request);
      if (
        result.status !== 'ready' ||
        result.source !== 'historical-snapshot' ||
        result.snapshot.snapshotId !== request.snapshotId ||
        result.snapshot.snapshotVersion !== request.snapshotVersion
      ) {
        throw new Error('historical-snapshot-unavailable');
      }
      return result.snapshot;
    },
    consume,
    importer,
  );
}

function requireBrowserDownloadApis(): void {
  if (
    typeof document === 'undefined' ||
    typeof window === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function' ||
    typeof URL.revokeObjectURL !== 'function'
  ) {
    throw new BulletinPdfActionErrorV1(
      'download-unavailable',
      'Download em lote indisponível neste navegador.',
    );
  }
}

async function consumeDownloadV1(artifact: BulletinPdfBatchArtifactV1): Promise<void> {
  requireBrowserDownloadApis();
  const objectUrl = URL.createObjectURL(artifact.blob);
  const anchor = document.createElement('a');
  try {
    anchor.href = objectUrl;
    anchor.download = artifact.filename;
    anchor.rel = 'noopener';
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  } catch (cause) {
    throw new BulletinPdfActionErrorV1(
      'download-unavailable',
      'O download do item do lote não pôde ser iniciado.',
      { cause },
    );
  } finally {
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }
}

export async function downloadBulletinPdfSnapshotBatchV1(
  snapshots: readonly BulletinSnapshotV1[],
  importer?: BulletinPdfRendererImporterV1,
): Promise<BulletinPdfBatchResultV1> {
  return processBulletinPdfSnapshotBatchV1(snapshots, consumeDownloadV1, importer);
}

export async function downloadHistoricalBulletinPdfBatchV1(
  requests: readonly BulletinReprintRequestV1[],
  loadReprint: BulletinHistoricalReprintLoaderV1,
  importer?: BulletinPdfRendererImporterV1,
): Promise<BulletinPdfBatchResultV1> {
  return processHistoricalBulletinPdfBatchV1(requests, loadReprint, consumeDownloadV1, importer);
}
