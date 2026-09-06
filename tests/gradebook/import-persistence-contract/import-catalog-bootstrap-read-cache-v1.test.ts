import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  SchoolId,
  TeacherId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import type { AssessmentComponentId } from '../../../shared/gradebook-contracts/results/results-contract-v1';
import type {
  AcademicEntityRecordV1,
  AcademicEntityRepositoryV1,
  VersionedRecordV1,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import { createGradebookImportCatalogBootstrapReadCacheV1 } from '../../../server/gradebook/application/import/import-catalog-bootstrap-read-cache-v1';

const academicYearId = 'academic-year:catalog-bootstrap-cache:2026' as AcademicYearId;
const context = { academicYearId };
const instant = '2026-09-06T00:00:00.000Z';
const assessmentComponentId =
  'assessment-component:v2:catalog-bootstrap-cache:001' as AssessmentComponentId;

const yearRecord = {
  value: {
    kind: 'academic-year',
    value: {
      id: academicYearId,
      schoolId: 'school:catalog-bootstrap-cache' as SchoolId,
      year: 2026,
      status: 'active',
      activeEvaluationProfileId: 'evaluation-profile:synthetic',
      configurationVersion: '1',
    },
  },
  version: 1,
  recordedAt: instant,
} as const satisfies VersionedRecordV1<AcademicEntityRecordV1>;

const teacherRecord = {
  value: {
    kind: 'teacher',
    value: {
      id: 'teacher:catalog-bootstrap-cache:001' as TeacherId,
      displayName: 'Docente Sintético',
      sourceNames: ['Docente Sintético'],
      status: 'active',
    },
  },
  version: 1,
  recordedAt: instant,
} as const satisfies VersionedRecordV1<AcademicEntityRecordV1>;

const assessmentComponentRecord = {
  value: {
    kind: 'assessment-component',
    value: {
      id: assessmentComponentId,
      academicYearId,
      teachingAssignmentId:
        'teaching-assignment:catalog-bootstrap-cache:001' as TeachingAssignmentId,
      term: 1,
      type: 'quantitative-assessment',
      name: 'Avaliação quantitativa sintética',
      maximum: { state: 'defined', value: 10 },
      order: 1,
      applicability: { state: 'applicable' },
    },
  },
  version: 1,
  recordedAt: instant,
} as const satisfies VersionedRecordV1<AcademicEntityRecordV1>;

function baseRepository() {
  const repository: AcademicEntityRepositoryV1 = {
    async get() {
      return yearRecord;
    },
    async list() {
      return { items: [], nextCursor: null };
    },
    async appendVersion() {
      throw new Error('not-used');
    },
  };
  return repository;
}

describe('import catalog bootstrap read cache', () => {
  it('serves year, catalog and component getMany from one bootstrap snapshot', async () => {
    let bootstrapCalls = 0;
    let baseGetCalls = 0;
    let baseCatalogCalls = 0;
    let baseGetManyCalls = 0;
    const base = baseRepository();
    const source = Object.assign({}, base, {
      async get() {
        baseGetCalls += 1;
        return yearRecord;
      },
      async getMany() {
        baseGetManyCalls += 1;
        return [assessmentComponentRecord];
      },
      async getImportCatalogSnapshot() {
        baseCatalogCalls += 1;
        return [teacherRecord];
      },
      async getImportCatalogBootstrapSnapshot() {
        bootstrapCalls += 1;
        return {
          academicYear: yearRecord,
          catalog: [teacherRecord],
          assessmentComponents: [assessmentComponentRecord],
        };
      },
    });
    const cached = createGradebookImportCatalogBootstrapReadCacheV1(source);

    await expect(
      cached.get(context, { kind: 'academic-year', id: academicYearId }),
    ).resolves.toEqual(yearRecord);
    await expect(cached.getImportCatalogSnapshot?.(context)).resolves.toEqual([teacherRecord]);
    await expect(
      cached.getMany?.(context, [
        { kind: 'assessment-component', id: assessmentComponentId },
        {
          kind: 'assessment-component',
          id: 'assessment-component:v2:catalog-bootstrap-cache:missing' as AssessmentComponentId,
        },
      ]),
    ).resolves.toEqual([assessmentComponentRecord, null]);

    expect(bootstrapCalls).toBe(1);
    expect(baseGetCalls).toBe(0);
    expect(baseCatalogCalls).toBe(0);
    expect(baseGetManyCalls).toBe(0);
  });

  it('falls back to base getMany when component snapshot is unavailable', async () => {
    let baseGetManyCalls = 0;
    const base = baseRepository();
    const source = Object.assign({}, base, {
      async getMany() {
        baseGetManyCalls += 1;
        return [assessmentComponentRecord];
      },
      async getImportCatalogBootstrapSnapshot() {
        return {
          academicYear: yearRecord,
          catalog: [teacherRecord],
          assessmentComponents: null,
        };
      },
    });
    const cached = createGradebookImportCatalogBootstrapReadCacheV1(source);

    await expect(
      cached.getMany?.(context, [{ kind: 'assessment-component', id: assessmentComponentId }]),
    ).resolves.toEqual([assessmentComponentRecord]);
    expect(baseGetManyCalls).toBe(1);
  });

  it('preserves the historical two-read fallback when bootstrap snapshot is absent', async () => {
    let baseGetCalls = 0;
    let baseCatalogCalls = 0;
    const base = baseRepository();
    const source = Object.assign({}, base, {
      async get() {
        baseGetCalls += 1;
        return yearRecord;
      },
      async getImportCatalogSnapshot() {
        baseCatalogCalls += 1;
        return [teacherRecord];
      },
    });
    const cached = createGradebookImportCatalogBootstrapReadCacheV1(source);

    await expect(
      cached.get(context, { kind: 'academic-year', id: academicYearId }),
    ).resolves.toEqual(yearRecord);
    await expect(cached.getImportCatalogSnapshot?.(context)).resolves.toEqual([teacherRecord]);

    expect(baseGetCalls).toBe(1);
    expect(baseCatalogCalls).toBe(1);
  });
});
