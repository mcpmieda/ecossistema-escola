import {
  snapshotRequestAsV6,
  type GradebookImportPersistenceRequestV8,
  type GradebookImportPersistenceResponseV8,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v8';
import type { GradebookImportPersistenceServiceDependenciesV4 } from './import-persistence-service-v2';
import { createGradebookImportPersistenceServiceV6 } from './import-persistence-service-v6';

export function createGradebookImportPersistenceServiceV8(
  dependencies: GradebookImportPersistenceServiceDependenciesV4,
) {
  return {
    async execute(
      request: GradebookImportPersistenceRequestV8,
    ): Promise<GradebookImportPersistenceResponseV8> {
      const response = await createGradebookImportPersistenceServiceV6({
        ...dependencies,
        sourceValues: true,
      }).execute(snapshotRequestAsV6(request));
      return { ...response, transportVersion: 8 };
    },
  };
}
