import { normalizeTemplateDescriptionsV1 } from '../../../../shared/gradebook-contracts/source/qualitative-slot-evidence-v1';
import type {
  GradebookImportPersistenceRequestV9,
  GradebookImportPersistenceResponseV9,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v9';
import type { D1WriteDatabaseV1 } from '../../persistence/d1/write/d1-write-adapter-v1';
import { createBufferedRelationalImportDatabaseV11 } from '../../persistence/postgres/relational-import-write-buffer-v11';
import { createGradebookRelationalImportServiceV10 } from './import-relational-service-v10';

/**
 * V11 is a transport-preserving performance layer.
 *
 * V10 remains the academic policy layer (including FOI_PARA filtering) and V9
 * remains the delta/idempotency implementation. V11 only groups the repetitive
 * single-row nota/fechamento writes produced by V9 into bounded PostgreSQL
 * recordset statements inside the same transaction. No academic semantics,
 * response contract or write counts are changed.
 */
export function createGradebookRelationalImportServiceV11(database: D1WriteDatabaseV1) {
  const service = createGradebookRelationalImportServiceV10(
    createBufferedRelationalImportDatabaseV11(database),
  );
  return {
    execute(
      request: GradebookImportPersistenceRequestV9,
    ): Promise<GradebookImportPersistenceResponseV9> {
      return service.execute(normalizeTemplateDescriptionsV1(request));
    },
  };
}
