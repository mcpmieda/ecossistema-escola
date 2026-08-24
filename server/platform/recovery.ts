import { z } from 'zod';
import type { RuntimeEnv } from '../env';
import { graphRequest } from '../graph/client';

const listCollectionSchema = z.object({
  value: z.array(z.object({ id: z.string().min(1), displayName: z.string().optional() })),
});
const driveSchema = z.object({ id: z.string().min(1) });
const folderSchema = z.object({ id: z.string().min(1), name: z.string().optional() });
const driveListItemSchema = z.object({
  id: z.string().optional(),
  fields: z.object({ Modulo: z.string().optional() }).passthrough().optional(),
});

export const RECOVERY_TEST_PREFIX = 'RECOVERY_VERIFY_';
export const RECOVERY_SNAPSHOT_LIBRARY = 'SNAPSHOTS_PLATAFORMA';
export const RECOVERY_TEST_SCOPE =
  'sharepoint-snapshots-disposable-metadata-backup-restore-roundtrip' as const;

export type RecoveryGraphInput = {
  env: RuntimeEnv;
  path: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  correlationId?: string;
};

export type GraphCall = <T>(
  input: RecoveryGraphInput,
) => Promise<{ data: T; etag: string | null; correlationId: string }>;

export type RecoveryVerificationResult = {
  status: 'verified';
  scope: typeof RECOVERY_TEST_SCOPE;
  verifiedAt: string;
  correlationId: string;
  backupChecksum: string;
  restoredChecksum: string;
  restoreMatched: true;
  cleanup: 'deleted';
};

async function checksum(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyRecoveryRoundTrip(
  env: RuntimeEnv,
  graph: GraphCall = graphRequest,
  now: () => Date = () => new Date(),
  randomId: () => string = () => crypto.randomUUID(),
): Promise<RecoveryVerificationResult> {
  const correlationId = crypto.randomUUID();
  const suffix = randomId()
    .replace(/[^a-zA-Z0-9]/gu, '')
    .slice(0, 16);
  if (!suffix) throw new Error('Recovery verification could not derive a safe resource suffix');

  const folderName = `${RECOVERY_TEST_PREFIX}${suffix}`;
  const sentinel = `recovery-sentinel-${suffix}`;
  const corrupted = `recovery-corrupted-${suffix}`;
  let driveId: string | undefined;
  let folderId: string | undefined;
  let primaryError: unknown;
  let result: RecoveryVerificationResult | undefined;

  try {
    const encodedFilter = encodeURIComponent(`displayName eq '${RECOVERY_SNAPSHOT_LIBRARY}'`);
    const lists = listCollectionSchema.parse(
      (
        await graph<unknown>({
          env,
          path: `/sites/${env.SHAREPOINT_SITE_ID}/lists?$filter=${encodedFilter}&$select=id,displayName`,
          correlationId,
        })
      ).data,
    );
    const snapshotList = lists.value.find(
      (candidate) => candidate.displayName === RECOVERY_SNAPSHOT_LIBRARY,
    );
    if (!snapshotList) throw new Error('Recovery snapshot library was not found');

    const drive = driveSchema.parse(
      (
        await graph<unknown>({
          env,
          path: `/sites/${env.SHAREPOINT_SITE_ID}/lists/${snapshotList.id}/drive?$select=id`,
          correlationId,
        })
      ).data,
    );
    driveId = drive.id;

    const folder = folderSchema.parse(
      (
        await graph<unknown>({
          env,
          path: `/drives/${driveId}/root/children`,
          method: 'POST',
          body: {
            name: folderName,
            folder: {},
            '@microsoft.graph.conflictBehavior': 'fail',
          },
          correlationId,
        })
      ).data,
    );
    folderId = folder.id;

    await graph<unknown>({
      env,
      path: `/drives/${driveId}/items/${folderId}/listItem/fields`,
      method: 'PATCH',
      body: { Modulo: sentinel, CorrelationId: correlationId },
      correlationId,
    });

    const before = driveListItemSchema.parse(
      (
        await graph<unknown>({
          env,
          path: `/drives/${driveId}/items/${folderId}/listItem?$expand=fields($select=Modulo)`,
          correlationId,
        })
      ).data,
    );
    const backup = { Modulo: before.fields?.Modulo ?? '' };
    if (backup.Modulo !== sentinel)
      throw new Error('Recovery sentinel was not persisted as expected');
    const backupChecksum = await checksum(backup);

    await graph<unknown>({
      env,
      path: `/drives/${driveId}/items/${folderId}/listItem/fields`,
      method: 'PATCH',
      body: { Modulo: corrupted },
      correlationId,
    });

    const afterCorruption = driveListItemSchema.parse(
      (
        await graph<unknown>({
          env,
          path: `/drives/${driveId}/items/${folderId}/listItem?$expand=fields($select=Modulo)`,
          correlationId,
        })
      ).data,
    );
    if (afterCorruption.fields?.Modulo !== corrupted) {
      throw new Error('Recovery destructive-overwrite simulation did not take effect');
    }

    await graph<unknown>({
      env,
      path: `/drives/${driveId}/items/${folderId}/listItem/fields`,
      method: 'PATCH',
      body: backup,
      correlationId,
    });

    const restored = driveListItemSchema.parse(
      (
        await graph<unknown>({
          env,
          path: `/drives/${driveId}/items/${folderId}/listItem?$expand=fields($select=Modulo)`,
          correlationId,
        })
      ).data,
    );
    const restoredValue = { Modulo: restored.fields?.Modulo ?? '' };
    const restoredChecksum = await checksum(restoredValue);
    if (restoredChecksum !== backupChecksum || restoredValue.Modulo !== sentinel) {
      throw new Error('Recovery restore checksum mismatch');
    }

    result = {
      status: 'verified',
      scope: RECOVERY_TEST_SCOPE,
      verifiedAt: now().toISOString(),
      correlationId,
      backupChecksum,
      restoredChecksum,
      restoreMatched: true,
      cleanup: 'deleted',
    };
  } catch (error) {
    primaryError = error;
  }

  let cleanupError: unknown;
  if (driveId && folderId) {
    try {
      await graph<unknown>({
        env,
        path: `/drives/${driveId}/items/${folderId}`,
        method: 'DELETE',
        correlationId,
      });
    } catch (error) {
      cleanupError = error;
    }
  }

  if (primaryError) {
    if (cleanupError) {
      console.error(
        JSON.stringify({
          message: 'recovery_verification_cleanup_failed',
          correlationId,
        }),
      );
    }
    throw primaryError;
  }
  if (cleanupError) throw cleanupError;
  if (!driveId || !folderId || !result)
    throw new Error('Recovery verification did not complete safely');

  return result;
}
