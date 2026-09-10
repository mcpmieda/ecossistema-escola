import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClassGroupId } from '../../../shared/gradebook-contracts/entities';
import { createGradebookD1PersistenceUnitOfWorkV2 } from '../../../server/gradebook/persistence/d1/composition/d1-persistence-unit-of-work-v1';
import type { GradebookD1ImportCatalogBulkReadV1 } from '../../../server/gradebook/persistence/d1/read/d1-import-catalog-bulk-read-v1';
import {
  academicYearId,
  openMigratedDatabase,
  type SqliteD1Database,
} from '../persistence/d1-transaction/d1-write-test-support';

let database: SqliteD1Database;

beforeEach(async () => {
  database = await openMigratedDatabase();
});

afterEach(() => database.raw.close());

describe('D1 import catalog bulk composition wiring', () => {
  it('exposes and binds the class-backed bulk methods through the composed unit of work', async () => {
    const unit = createGradebookD1PersistenceUnitOfWorkV2(database);
    const entities = unit.entities as typeof unit.entities &
      Partial<GradebookD1ImportCatalogBulkReadV1>;

    expect(typeof entities.getImportCatalogSnapshot).toBe('function');
    expect(typeof entities.getImportRosterMany).toBe('function');

    await expect(entities.getImportCatalogSnapshot!({ academicYearId })).resolves.toEqual([]);
    await expect(
      entities.getImportRosterMany!({ academicYearId }, [
        {
          classGroupId: 'class-group:catalog-bulk-wiring' as ClassGroupId,
          sourcePosition: 1,
        },
      ]),
    ).resolves.toEqual([{ state: 'missing' }]);
  });
});
