import {
  createGradebookD1BulletinSnapshotRepositoryV1,
  type GradebookD1BulletinSnapshotRepositoryV1,
} from '../bulletins/d1-bulletin-snapshot-repository-v1';
import {
  createGradebookD1CouncilDecisionStoreV1,
  type GradebookD1CouncilDecisionStoreV1,
} from '../council/d1-council-decision-store-v1';
import {
  createGradebookD1CouncilSessionStoreV2,
  type GradebookD1CouncilSessionStoreV2,
} from './d1-council-session-store-v2';
import type { D1WriteDatabaseV1 } from '../write/d1-write-adapter-v1';

/** Local/preview durability composition. Remote use still depends on the explicit runtime gate. */
export interface GradebookD1BulletinCouncilDurabilityV1 {
  readonly bulletinSnapshots: GradebookD1BulletinSnapshotRepositoryV1;
  readonly councilDecisions: GradebookD1CouncilDecisionStoreV1;
  readonly councilSessions: GradebookD1CouncilSessionStoreV2;
}

export function createGradebookD1BulletinCouncilDurabilityV1(
  database: D1WriteDatabaseV1,
): GradebookD1BulletinCouncilDurabilityV1 {
  return {
    bulletinSnapshots: createGradebookD1BulletinSnapshotRepositoryV1(database),
    councilDecisions: createGradebookD1CouncilDecisionStoreV1(database),
    councilSessions: createGradebookD1CouncilSessionStoreV2(database),
  };
}
