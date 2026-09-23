import { describe, expect, it, vi } from 'vitest';
import type { RuntimeEnv } from '../../server/env';
import { PhotoCatalogRepositoryV1, legacyPhotoReferenceV1, legacyPhotoSnapshotV1 } from '../../server/student-photos/catalog-repository-v1';
import { PhotoCatalogServiceV1 } from '../../server/student-photos/catalog-service-v1';
import type { PhotoWriteDatabaseV1 } from '../../server/student-photos/write-repository-v1';

const context = { actorId: '10000000-0000-4000-8000-000000000001', studentUid: '20000000-0000-4000-8000-000000000001' };
const reference = { accountId: context.studentUid, driveId: 'synthetic-drive', itemId: 'synthetic-item',
  etag: null, byteSize: 64, version: 1, contentType: 'image/webp' as const };
function repositoryFor(snapshot: unknown) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('legacy_reference_v1')) return [{ data: snapshot }];
    if (sql.includes('AS ready')) return [{ ready: 0 }];
    return [];
  });
  const database: PhotoWriteDatabaseV1 = { transaction: work => work({ query }) };
  return new PhotoCatalogRepositoryV1(database);
}

describe('explicit legacy compatibility and bounded list reads', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('preserves unsupported %s snapshots instead of treating them as absence', async contentType => {
    const snapshot = { ...reference, contentType, byteSize: 200000 };
    expect(legacyPhotoSnapshotV1.parse(snapshot)).toEqual(snapshot);
    expect(legacyPhotoReferenceV1.safeParse(snapshot).success).toBe(false);
    const repository = repositoryFor(snapshot);
    expect(await repository.legacy(context.studentUid)).toEqual(snapshot);
    expect(await repository.state(context)).toMatchObject({ hasPortrait: true, initialized: false, legacyCompatible: false });
    const initialize = vi.spyOn(repository, 'initialize');
    const codec = { validate: vi.fn() };
    const service = new PhotoCatalogServiceV1({} as RuntimeEnv, repository, codec, async () => undefined);
    await expect(service.open(context, new AbortController().signal)).rejects.toThrow('student-photo-write-conflict');
    expect(initialize).not.toHaveBeenCalled();
    expect(codec.validate).not.toHaveBeenCalled();
  });

  it('keeps a supported original visible in catalog state', async () => {
    expect(await repositoryFor(reference).state(context)).toMatchObject({ hasPortrait: true, initialized: false, legacyCompatible: true });
  });

  it('returns fallback for an unadopted avatar without any legacy lookup, Graph request or codec work', async () => {
    const repository = repositoryFor(reference);
    const legacy = vi.spyOn(repository, 'legacy');
    const codec = { validate: vi.fn() };
    const service = new PhotoCatalogServiceV1({} as RuntimeEnv, repository, codec, async () => undefined);
    expect(await service.read(context, 'avatar', null, new AbortController().signal)).toBeNull();
    expect(legacy).not.toHaveBeenCalled();
    expect(codec.validate).not.toHaveBeenCalled();
  });

  it('reads the private cached image without requesting SharePoint', async () => {
    const repository = repositoryFor(reference);
    vi.spyOn(repository, 'image').mockResolvedValue({ revision: context.studentUid,
      asset: { driveId: 'synthetic-drive', itemId: 'synthetic-item', etag: 'synthetic-etag', byteSize: 32, width: 3, height: 4, sha256: 'a'.repeat(64) },
      bytes: new Uint8Array(32).fill(7) });
    const legacy = vi.spyOn(repository, 'legacy');
    const codec = { validate: vi.fn() };
    const service = new PhotoCatalogServiceV1({} as RuntimeEnv, repository, codec, async () => undefined);
    expect(await service.read(context, 'avatar', null, new AbortController().signal)).toEqual(new Uint8Array(32).fill(7));
    expect(legacy).not.toHaveBeenCalled(); expect(codec.validate).not.toHaveBeenCalled();
  });
});
