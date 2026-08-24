import { z } from 'zod';
import type { RuntimeEnv } from '../env';
import { graphRequest } from '../graph/client';

const createdListSchema = z.object({ id: z.string().min(1), displayName: z.string().optional() });
const createdItemSchema = z.object({ id: z.string().min(1) });
const readItemSchema = z.object({
  id: z.string().min(1),
  fields: z.object({ Title: z.string().optional() }).passthrough().optional(),
});

export const RECOVERY_TEST_PREFIX = 'RECOVERY_VERIFY_';
export const RECOVERY_TEST_SCOPE = 'sharepoint-disposable-record-backup-restore-roundtrip' as const;

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

  const listName = `${RECOVERY_TEST_PREFIX}${suffix}`;
  const sentinel = `recovery-sentinel-${suffix}`;
  const corrupted = `recovery-corrupted-${suffix}`;
  let listId: string | undefined;
  let primaryError: unknown;
  let result: RecoveryVerificationResult | undefined;

  try {
    const createdList = createdListSchema.parse(
      (
        await graph<unknown>({
          env,
          path: `/sites/${env.SHAREPOINT_SITE_ID}/lists`,
          method: 'POST',
          body: {
            displayName: listName,
            description: 'Disposable recovery verification resource. Safe to delete.',
            list: { template: 'genericList' },
          },
          correlationId,
        })
      ).data,
    );
    listId = createdList.id;

    const createdItem = createdItemSchema.parse(
      (
        await graph<unknown>({
          env,
          path: `/sites/${env.SHAREPOINT_SITE_ID}/lists/${listId}/items`,
          method: 'POST',
          body: { fields: { Title: sentinel } },
          correlationId,
        })
      ).data,
    );

    const before = readItemSchema.parse(
      (
        await graph<unknown>({
          env,
          path: `/sites/${env.SHAREPOINT_SITE_ID}/lists/${listId}/items/${createdItem.id}?$expand=fields($select=Title)`,
          correlationId,
        })
      ).data,
    );
    const backup = { Title: before.fields?.Title ?? '' };
    if (backup.Title !== sentinel)
      throw new Error('Recovery sentinel was not persisted as expected');
    const backupChecksum = await checksum(backup);

    await graph<unknown>({
      env,
      path: `/sites/${env.SHAREPOINT_SITE_ID}/lists/${listId}/items/${createdItem.id}/fields`,
      method: 'PATCH',
      body: { Title: corrupted },
      correlationId,
    });

    const afterCorruption = readItemSchema.parse(
      (
        await graph<unknown>({
          env,
          path: `/sites/${env.SHAREPOINT_SITE_ID}/lists/${listId}/items/${createdItem.id}?$expand=fields($select=Title)`,
          correlationId,
        })
      ).data,
    );
    if (afterCorruption.fields?.Title !== corrupted) {
      throw new Error('Recovery destructive-overwrite simulation did not take effect');
    }

    await graph<unknown>({
      env,
      path: `/sites/${env.SHAREPOINT_SITE_ID}/lists/${listId}/items/${createdItem.id}/fields`,
      method: 'PATCH',
      body: backup,
      correlationId,
    });

    const restored = readItemSchema.parse(
      (
        await graph<unknown>({
          env,
          path: `/sites/${env.SHAREPOINT_SITE_ID}/lists/${listId}/items/${createdItem.id}?$expand=fields($select=Title)`,
          correlationId,
        })
      ).data,
    );
    const restoredValue = { Title: restored.fields?.Title ?? '' };
    const restoredChecksum = await checksum(restoredValue);
    if (restoredChecksum !== backupChecksum || restoredValue.Title !== sentinel) {
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
  if (listId) {
    try {
      await graph<unknown>({
        env,
        path: `/sites/${env.SHAREPOINT_SITE_ID}/lists/${listId}`,
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
  if (!listId || !result) throw new Error('Recovery verification did not complete safely');

  return result;
}
