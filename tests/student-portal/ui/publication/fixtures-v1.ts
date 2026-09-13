import type { AdminResponseV1 } from '../../../../shared/student-portal-contracts/admin-v1';
import type { ScopeV1 } from '../../../../shared/student-portal-contracts/core-v1';
import { SYNTHETIC_ID_V1 } from '../../../../shared/student-portal-contracts/fixtures-v1';
import { PERIODS_V1 } from '../../../../src/features/student-portal-admin/settings/settings-values-v1';
import type { PublicationSnapshotV1 } from '../../../../src/features/student-portal-admin/publication/publication-values-v1';
import { SETTINGS_CLASS_V1, settingsFixtureV1 } from '../settings/fixtures-v1';
export const PUBLICATION_ACCOUNT_V1 = {
  kind: 'account',
  academicYear: 2026,
  accountId: SYNTHETIC_ID_V1,
} as const;
export const PUBLICATION_META_V1 = { contractVersion: 1, requestId: SYNTHETIC_ID_V1 } as const;
/** Invented revisions and settings; never imported from production. */
export function publicationFixtureV1(scope: ScopeV1 = SETTINGS_CLASS_V1): PublicationSnapshotV1 {
  return {
    settings: settingsFixtureV1(scope),
    items: PERIODS_V1.map((period) => ({
      period,
      version: 9,
      state:
        period === 'T1'
          ? 'available'
          : period === 'T2'
            ? 'update-pending'
            : period === 'REC1'
              ? 'published'
              : 'no-data',
      availableRevision: ['T1', 'T2', 'REC1'].includes(period) ? 'synthetic:2026:revision:2' : null,
      publishedRevision:
        period === 'T2'
          ? 'synthetic:2026:revision:1'
          : period === 'REC1'
            ? 'synthetic:2026:revision:2'
            : null,
    })),
  };
}
export function publicationResponseV1(snapshot: PublicationSnapshotV1): AdminResponseV1 {
  return { ...PUBLICATION_META_V1, state: 'publication', items: snapshot.items };
}
