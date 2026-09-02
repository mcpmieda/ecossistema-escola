import {
  createGradebookD1BulletinSnapshotRepositoryV1,
  type GradebookD1BulletinSnapshotRepositoryV1,
} from '../bulletins/d1-bulletin-snapshot-repository-v1';
import {
  createGradebookD1CouncilDecisionStoreV1,
  type GradebookD1CouncilDecisionStoreV1,
} from '../council/d1-council-decision-store-v1';
import type { D1WriteDatabaseV1 } from '../write/d1-write-adapter-v1';

/** Isolated local/preview composition; central runtime wiring remains reserved for integration. */
export interface GradebookD1BulletinCouncilDurabilityV1 {
  readonly bulletinSnapshots: GradebookD1BulletinSnapshotRepositoryV1;
  readonly councilDecisions: GradebookD1CouncilDecisionStoreV1;
}

export function createGradebookD1BulletinCouncilDurabilityV1(
  database: D1WriteDatabaseV1,
): GradebookD1BulletinCouncilDurabilityV1 {
  return {
    bulletinSnapshots: createGradebookD1BulletinSnapshotRepositoryV1(database),
    councilDecisions: createGradebookD1CouncilDecisionStoreV1(database),
  };
}
