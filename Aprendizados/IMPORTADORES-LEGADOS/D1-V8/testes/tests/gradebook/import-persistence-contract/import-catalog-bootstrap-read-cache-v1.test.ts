import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  EnrollmentId,
  SchoolId,
  StudentStatusEventId,
  TeacherId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import type { AssessmentComponentId } from '../../../shared/gradebook-contracts/results/results-contract-v1';
import type {
  AcademicEntityRecordV1,
  AcademicEntityRepositoryV1,
  VersionedRecordV1,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  createGradebookImportBatchCatalogReadCacheV1,
  createGradebookImportCatalogBootstrapReadCacheV1,
} from '../../../server/gradebook/application/import/import-catalog-bootstrap-read-cache-v1';

const academicYearId = 'academic-year:catalog-bootstrap-cache:2026' as AcademicYearId;
const context = { academicYearId };
const instant = '2026-09-06T00:00:00.000Z';
const assessmentComponentId =
  'assessment-component:v2:catalog-bootstrap-cache:001' as AssessmentComponentId;
const studentStatusEventId =
  'student-status-event:catalog-bootstrap-cache:001' as StudentStatusEventId;

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

const teacherRecordV2 = {
  value: {
    kind: 'teacher',
    value: {
      ...teacherRecord.value.value,
      displayName: 'Docente Sintético Atualizado',
      sourceNames: ['Docente Sintético', 'Docente Sintético Atualizado'],
    },
  },
  version: 2,
  recordedAt: '2026-09-06T00:01:00.000Z',
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

const studentStatusRecord = {
  value: {
    kind: 'student-status-event',
    value: {
      id: studentStatusEventId,
      academicYearId,
      enrollmentId: 'enrollment:catalog-bootstrap-cache:001' as EnrollmentId,
      status: 'active',
      sourceText: 'ATIVO',
      sourceReference: 'RELACAO',
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

function bootstrapSource(onRead: () => void = () => undefined) {
  return Object.assign({}, baseRepository(), {
    async getImportCatalogBootstrapSnapshot() {
      onRead();
      return {
        academicYear: yearRecord,
        catalog: [teacherRecord],
        assessmentComponents: [assessmentComponentRecord],
        studentStatusEvents: [studentStatusRecord],
      };
    },
  });
}

describe('import catalog bootstrap read cache', () => {
  it('serves nested year/catalog/component/status reads from one physical bootstrap snapshot', async () => {
    let bootstrapCalls = 0;
    let baseGetCalls = 0;
    let baseCatalogCalls = 0;
    let baseGetManyCalls = 0;
    let baseStatusCalls = 0;
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
      async getStudentStatusEventsMany() {
        baseStatusCalls += 1;
        return [studentStatusRecord];
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
          studentStatusEvents: [studentStatusRecord],
        };
      },
    });
    const cached = createGradebookImportCatalogBootstrapReadCacheV1(
      createGradebookImportCatalogBootstrapReadCacheV1(source),
    );

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
    await expect(
      cached.getStudentStatusEventsMany?.(context, [
        studentStatusEventId,
        'student-status-event:catalog-bootstrap-cache:missing',
      ]),
    ).resolves.toEqual([studentStatusRecord, null]);

    expect(bootstrapCalls).toBe(1);
    expect(baseGetCalls).toBe(0);
    expect(baseCatalogCalls).toBe(0);
    expect(baseGetManyCalls).toBe(0);
    expect(baseStatusCalls).toBe(0);
  });

  it('shares one physical snapshot across V7 files and exposes only explicitly committed overlay', async () => {
    let bootstrapCalls = 0;
    const batch = createGradebookImportBatchCatalogReadCacheV1();
    const firstFile = createGradebookImportCatalogBootstrapReadCacheV1(
      batch.wrap(bootstrapSource(() => (bootstrapCalls += 1))),
    );

    await expect(firstFile.getImportCatalogSnapshot?.(context)).resolves.toEqual([teacherRecord]);

    const secondBeforeCommit = createGradebookImportCatalogBootstrapReadCacheV1(
      batch.wrap(bootstrapSource(() => (bootstrapCalls += 1))),
    );
    await expect(secondBeforeCommit.getImportCatalogSnapshot?.(context)).resolves.toEqual([
      teacherRecord,
    ]);

    batch.commit({ context, records: [teacherRecordV2] });
    const secondAfterCommit = createGradebookImportCatalogBootstrapReadCacheV1(
      batch.wrap(bootstrapSource(() => (bootstrapCalls += 1))),
    );
    await expect(secondAfterCommit.getImportCatalogSnapshot?.(context)).resolves.toEqual([
      teacherRecordV2,
    ]);
    await expect(
      secondAfterCommit.get(context, { kind: 'teacher', id: teacherRecord.value.value.id }),
    ).resolves.toEqual(teacherRecordV2);
    expect(bootstrapCalls).toBe(1);
  });

  it('evicts a rejected physical snapshot so a fresh V7 attempt can reload through its own source', async () => {
    let failedCalls = 0;
    let retryCalls = 0;
    const batch = createGradebookImportBatchCatalogReadCacheV1();
    const failedSource = Object.assign({}, baseRepository(), {
      async getImportCatalogBootstrapSnapshot() {
        failedCalls += 1;
        throw new Error('Network connection lost');
      },
    });
    const failedAttempt = createGradebookImportCatalogBootstrapReadCacheV1(batch.wrap(failedSource));

    await expect(failedAttempt.getImportCatalogSnapshot?.(context)).rejects.toThrow(
      'Network connection lost',
    );

    const retryAttempt = createGradebookImportCatalogBootstrapReadCacheV1(
      batch.wrap(bootstrapSource(() => (retryCalls += 1))),
    );
    await expect(retryAttempt.getImportCatalogSnapshot?.(context)).resolves.toEqual([teacherRecord]);
    expect(failedCalls).toBe(1);
    expect(retryCalls).toBe(1);
  });

  it('falls back to base component/status readers when their snapshot families are unavailable', async () => {
    let baseGetManyCalls = 0;
    let baseStatusCalls = 0;
    const base = baseRepository();
    const source = Object.assign({}, base, {
      async getMany() {
        baseGetManyCalls += 1;
        return [assessmentComponentRecord];
      },
      async getStudentStatusEventsMany() {
        baseStatusCalls += 1;
        return [studentStatusRecord];
      },
      async getImportCatalogBootstrapSnapshot() {
        return {
          academicYear: yearRecord,
          catalog: [teacherRecord],
          assessmentComponents: null,
          studentStatusEvents: null,
        };
      },
    });
    const cached = createGradebookImportCatalogBootstrapReadCacheV1(source);

    await expect(
      cached.getMany?.(context, [{ kind: 'assessment-component', id: assessmentComponentId }]),
    ).resolves.toEqual([assessmentComponentRecord]);
    await expect(
      cached.getStudentStatusEventsMany?.(context, [studentStatusEventId]),
    ).resolves.toEqual([studentStatusRecord]);
    expect(baseGetManyCalls).toBe(1);
    expect(baseStatusCalls).toBe(1);
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
