import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  BULLETIN_CONTRACT_VERSION_V1,
  type BulletinReprintRequestV1,
  type BulletinReprintResultV1,
  type BulletinSnapshotIdV1,
  type BulletinSnapshotV1,
} from '../../../shared/gradebook-contracts/bulletins/bulletin-contract-v1';
import {
  BULLETIN_PDF_BATCH_LIMITS_V1,
  BulletinPdfBatchErrorV1,
  processBulletinPdfSnapshotBatchV1,
  processHistoricalBulletinPdfBatchV1,
} from '../../../src/features/gradebook/bulletins/pdf/bulletin-pdf-batch-actions-v1';
import { bulletinSnapshotFixtureV1 } from './bulletin-pdf-fixtures-v1';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function snapshot(index: number): BulletinSnapshotV1 {
  const base = bulletinSnapshotFixtureV1(undefined, index + 1);
  return {
    ...base,
    snapshotId: `bulletin-snapshot:synthetic:batch:${index}` as BulletinSnapshotIdV1,
    snapshotVersion: index + 1,
  };
}

function importer(render: (input: { readonly snapshot: BulletinSnapshotV1 }) => Promise<{
  readonly blob: Blob;
  readonly byteLength: number;
  readonly pageCount: number;
}>) {
  return async () => ({ renderBulletinPdfV1: render });
}

describe('Boletins PDF batch V1', () => {
  it('rejeita cardinalidade acima do bound antes de carregar o renderer', async () => {
    const render = vi.fn(async () => ({ blob: new Blob(['synthetic']), byteLength: 9, pageCount: 1 }));
    const load = vi.fn(importer(render));
    await expect(
      processBulletinPdfSnapshotBatchV1(
        [snapshot(0), snapshot(1), snapshot(2), snapshot(3)],
        async () => undefined,
        load,
      ),
    ).rejects.toMatchObject({ code: 'bounds-exceeded' } satisfies Partial<BulletinPdfBatchErrorV1>);
    expect(load).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it('processa e consome estritamente um documento por vez com limites agregados explícitos', async () => {
    let activeRender = 0;
    let maxActiveRender = 0;
    let activeConsumer = 0;
    let maxActiveConsumer = 0;
    const render = vi.fn(async () => {
      activeRender += 1;
      maxActiveRender = Math.max(maxActiveRender, activeRender);
      await Promise.resolve();
      activeRender -= 1;
      return {
        blob: new Blob(['synthetic']),
        byteLength: BULLETIN_PDF_BATCH_LIMITS_V1.maxOutputBytesPerDocument,
        pageCount: BULLETIN_PDF_BATCH_LIMITS_V1.maxPagesPerDocument,
      };
    });
    const consume = vi.fn(async () => {
      activeConsumer += 1;
      maxActiveConsumer = Math.max(maxActiveConsumer, activeConsumer);
      await Promise.resolve();
      activeConsumer -= 1;
    });

    const result = await processBulletinPdfSnapshotBatchV1(
      [snapshot(0), snapshot(1), snapshot(2)],
      consume,
      importer(render),
    );

    expect(maxActiveRender).toBe(BULLETIN_PDF_BATCH_LIMITS_V1.concurrentDocuments);
    expect(maxActiveConsumer).toBe(BULLETIN_PDF_BATCH_LIMITS_V1.maxRetainedArtifacts);
    expect(result.ready).toHaveLength(3);
    expect(result.failed).toEqual([]);
    expect(result.totalPageCount).toBe(BULLETIN_PDF_BATCH_LIMITS_V1.maxTotalPages);
    expect(result.totalByteLength).toBe(BULLETIN_PDF_BATCH_LIMITS_V1.maxTotalOutputBytes);
  });

  it('isola falha de um snapshot inválido e continua com os demais', async () => {
    const render = vi.fn(async ({ snapshot: current }: { readonly snapshot: BulletinSnapshotV1 }) => {
      if (current.snapshotVersion === 2) {
        throw Object.assign(new Error('synthetic-invalid-input'), { code: 'invalid-input' as const });
      }
      return { blob: new Blob(['synthetic']), byteLength: 9, pageCount: 1 };
    });
    const consume = vi.fn(async () => undefined);
    const result = await processBulletinPdfSnapshotBatchV1(
      [snapshot(0), snapshot(1), snapshot(2)],
      consume,
      importer(render),
    );

    expect(result.ready.map((item) => item.requestIndex)).toEqual([0, 2]);
    expect(result.failed).toEqual([{ requestIndex: 1, status: 'failed', code: 'invalid-input' }]);
    expect(consume).toHaveBeenCalledTimes(2);
  });

  it('mantém renderer indisponível como fallback por item sem corromper snapshots', async () => {
    const original = snapshot(0);
    const frozenJson = JSON.stringify(original);
    const consume = vi.fn(async () => undefined);
    const result = await processBulletinPdfSnapshotBatchV1(
      [original, snapshot(1)],
      consume,
      async () => {
        throw new Error('synthetic-renderer-unavailable');
      },
    );

    expect(result.ready).toEqual([]);
    expect(result.failed).toEqual([
      { requestIndex: 0, status: 'failed', code: 'renderer-unavailable' },
      { requestIndex: 1, status: 'failed', code: 'renderer-unavailable' },
    ]);
    expect(consume).not.toHaveBeenCalled();
    expect(JSON.stringify(original)).toBe(frozenJson);
  });

  it('reimprime em lote exclusivamente snapshots históricos com identidade e versão exatas', async () => {
    const requests: BulletinReprintRequestV1[] = [snapshot(0), snapshot(1)].map((item) => ({
      contractVersion: BULLETIN_CONTRACT_VERSION_V1,
      snapshotId: item.snapshotId,
      snapshotVersion: item.snapshotVersion,
    }));
    const loadReprint = vi.fn(async (request: BulletinReprintRequestV1): Promise<BulletinReprintResultV1> => ({
      contractVersion: BULLETIN_CONTRACT_VERSION_V1,
      status: 'ready',
      source: 'historical-snapshot',
      snapshot: {
        ...bulletinSnapshotFixtureV1(undefined, request.snapshotVersion),
        snapshotId: request.snapshotId,
        snapshotVersion: request.snapshotVersion,
      },
    }));
    const consume = vi.fn(async () => undefined);
    const render = vi.fn(async () => ({ blob: new Blob(['synthetic']), byteLength: 9, pageCount: 1 }));

    const result = await processHistoricalBulletinPdfBatchV1(
      requests,
      loadReprint,
      consume,
      importer(render),
    );

    expect(result.ready.map((item) => item.requestIndex)).toEqual([0, 1]);
    expect(result.failed).toEqual([]);
    expect(loadReprint.mock.calls.map(([request]) => request)).toEqual(requests);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('falha fechado por item quando reprint não é histórico e ainda processa o próximo', async () => {
    const requests: BulletinReprintRequestV1[] = [snapshot(0), snapshot(1)].map((item) => ({
      contractVersion: BULLETIN_CONTRACT_VERSION_V1,
      snapshotId: item.snapshotId,
      snapshotVersion: item.snapshotVersion,
    }));
    const loadReprint = vi.fn(async (request: BulletinReprintRequestV1) => {
      if (request.snapshotVersion === 1) {
        return {
          contractVersion: 1,
          status: 'ready',
          source: 'current-model',
          snapshot: { ...snapshot(0), snapshotId: request.snapshotId, snapshotVersion: request.snapshotVersion },
        } as unknown as BulletinReprintResultV1;
      }
      return {
        contractVersion: BULLETIN_CONTRACT_VERSION_V1,
        status: 'ready',
        source: 'historical-snapshot',
        snapshot: { ...snapshot(1), snapshotId: request.snapshotId, snapshotVersion: request.snapshotVersion },
      } satisfies BulletinReprintResultV1;
    });
    const consume = vi.fn(async () => undefined);
    const result = await processHistoricalBulletinPdfBatchV1(
      requests,
      loadReprint,
      consume,
      importer(async () => ({ blob: new Blob(['synthetic']), byteLength: 9, pageCount: 1 })),
    );

    expect(result.failed).toEqual([
      { requestIndex: 0, status: 'failed', code: 'historical-snapshot-unavailable' },
    ]);
    expect(result.ready.map((item) => item.requestIndex)).toEqual([1]);
    expect(consume).toHaveBeenCalledTimes(1);
  });

  it('mantém implementação sem fan-out, persistência de browser, queue, worker ou storage remoto', () => {
    const batch = source('src/features/gradebook/bulletins/pdf/bulletin-pdf-batch-actions-v1.ts');
    expect(batch).toContain('for (let requestIndex = 0; requestIndex < count; requestIndex += 1)');
    expect(batch).not.toContain('Promise.all');
    expect(batch).not.toContain('localStorage');
    expect(batch).not.toContain('sessionStorage');
    expect(batch).not.toContain('indexedDB');
    expect(batch).not.toContain('caches.open');
    expect(batch).not.toContain('new Worker');
    expect(batch).not.toContain('fetch(');
    expect(batch).not.toContain('queueMicrotask');
    expect(batch).toContain("result.source !== 'historical-snapshot'");
    expect(BULLETIN_PDF_BATCH_LIMITS_V1).toMatchObject({
      maxDocuments: 3,
      maxPagesPerDocument: 24,
      maxTotalPages: 72,
      concurrentDocuments: 1,
      maxRetainedArtifacts: 1,
    });
  });
});
