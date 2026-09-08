import { createGradebookD1BulletinCouncilDurabilityV1 } from '../d1/durability/d1-bulletin-council-durability-v1';
import { GradebookD1ImportStagingRepositoryV1 } from '../d1/imports/d1-import-staging-repository-v1';
import { GradebookD1BatchPromotionTransactionV1 } from '../d1/transaction/d1-batch-promotion-transaction-v1';
import { GradebookD1ImportBootstrapTransactionV2 } from '../d1/transaction/d1-import-bootstrap-transaction-v2';
import type { GradebookD1WriteAdapterOptionsV1 } from '../d1/write/d1-write-adapter-v1';
import type { GradebookPostgresDatabaseV1 } from './postgres-database-v1';
import { createGradebookPostgresPersistenceUnitOfWorkV2 } from './postgres-persistence-unit-of-work-v1';

/**
 * Complete PostgreSQL persistence composition for the official gradebook runtime.
 * The mature provider-independent mapping is shared without dual writes; D1 remains
 * a separately bound rollback store during the controlled cutover window.
 */
export function createGradebookPostgresAdaptersV1(
  database: GradebookPostgresDatabaseV1,
  options: GradebookD1WriteAdapterOptionsV1 = {},
) {
  return {
    unitOfWork: createGradebookPostgresPersistenceUnitOfWorkV2(database, options),
    importBootstrapTransaction: new GradebookD1ImportBootstrapTransactionV2(database, options),
    batchPromotionTransaction: new GradebookD1BatchPromotionTransactionV1(database, options),
    staging: new GradebookD1ImportStagingRepositoryV1(database),
    durability: createGradebookD1BulletinCouncilDurabilityV1(database),
  } as const;
}
