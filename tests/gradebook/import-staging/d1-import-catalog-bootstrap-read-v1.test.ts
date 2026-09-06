import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AcademicYearId, SchoolId, TeacherId } from '../../../shared/gradebook-contracts/entities';
import { createGradebookD1PersistenceUnitOfWorkV2 } from '../../../server/gradebook/persistence/d1/composition/d1-persistence-unit-of-work-v1';
import { createGradebookD1ImportCatalogBootstrapReadV1 } from '../../../server/gradebook/persistence/d1/read/d1-import-catalog-bootstrap-read-v1';
import { ACADEMIC_CONTEXT_2026_IDENTITY_V1 } from '../../../src/gradebook-domain/context/academic-context-2026-v1';
import {
  academicYearId,
  instant,
  openMigratedDatabase,
  type SqliteD1Database,
} from '../persistence/d1-transaction/d1-write-test-support';

let database: SqliteD1Database;
const teacherId = 'teacher:catalog-bootstrap:001' as TeacherId;

beforeEach(async () => {
  database = await openMigratedDatabase();
  const unit = createGradebookD1PersistenceUnitOfWorkV2(database, { now: () => instant });
  expect(
    (
      await unit.entities.appendVersion(
        { academicYearId },
        {
          kind: 'academic-year',
          value: {
            id: academicYearId as AcademicYearId,
            schoolId: 'school:catalog-bootstrap' as SchoolId,
            year: 2026,
            status: 'active',
            startsOn: '2026-02-01',
            endsOn: '2026-12-20',
            activeEvaluationProfileId: ACADEMIC_CONTEXT_2026_IDENTITY_V1.evaluationProfileId,
            configurationVersion: String(ACADEMIC_CONTEXT_2026_IDENTITY_V1.configurationVersion),
          },
        },
        { expectedVersion: null },
      )
    ).status,
  ).toBe('written');
  expect(
    (
      await unit.entities.appendVersion(
        { academicYearId },
        {
          kind: 'teacher',
          value: {
            id: teacherId,
            displayName: 'Docente Sintético',
            sourceNames: ['Docente Sintético'],
            status: 'active',
          },
        },
        { expectedVersion: null },
      )
    ).status,
  ).toBe('written');
});

afterEach(() => database.raw.close());

describe('D1 import catalog bootstrap snapshot', () => {
  it('loads the academic year and catalog through one physical D1 query', async () => {
    let prepareCalls = 0;
    const reader = createGradebookD1ImportCatalogBootstrapReadV1({
      prepare(query: string) {
        prepareCalls += 1;
        return database.prepare(query);
      },
    });

    const snapshot = await reader.getImportCatalogBootstrapSnapshot({ academicYearId });

    expect(prepareCalls).toBe(1);
    expect(snapshot.academicYear).toMatchObject({
      value: {
        kind: 'academic-year',
        value: { id: academicYearId, year: 2026, status: 'active' },
      },
    });
    expect(snapshot.catalog).toEqual([
      expect.objectContaining({
        value: {
          kind: 'teacher',
          value: expect.objectContaining({ id: teacherId, displayName: 'Docente Sintético' }),
        },
      }),
    ]);
  });

  it('returns a null academic year without inventing bootstrap authority', async () => {
    database.raw.prepare('DELETE FROM academic_year_versions').run();
    database.raw.prepare('DELETE FROM academic_year_configuration_versions').run();
    database.raw.prepare('DELETE FROM academic_entity_versions').run();
    database.raw.prepare('DELETE FROM academic_entity_streams').run();
    database.raw.prepare('DELETE FROM academic_years').run();

    const reader = createGradebookD1ImportCatalogBootstrapReadV1(database);
    await expect(reader.getImportCatalogBootstrapSnapshot({ academicYearId })).resolves.toEqual({
      academicYear: null,
      catalog: [],
    });
  });
});
