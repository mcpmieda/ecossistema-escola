import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  ClassGroupId,
  SchoolId,
  StudentId,
  SubjectId,
  TeacherId,
  TeachingAssignmentId,
  EnrollmentId,
} from '../../../shared/gradebook-contracts/entities';
import type { GradebookImportPersistenceRequestV2 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v2';
import {
  SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2,
  SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2,
} from '../../../shared/gradebook-contracts/source/source-contract-v2';
import { createGradebookImportPersistenceServiceV2 } from '../../../server/gradebook/application/import/import-persistence-service-v2';
import { createGradebookD1PersistenceUnitOfWorkV2 } from '../../../server/gradebook/persistence/d1/composition/d1-persistence-unit-of-work-v1';
import { GradebookD1ImportBootstrapTransactionV2 } from '../../../server/gradebook/persistence/d1/transaction/d1-import-bootstrap-transaction-v2';
import type {
  ImportBootstrapTransactionPortV2,
  PersistenceUnitOfWorkV2,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import type { AcademicEntityRecordV1 } from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type {
  D1WriteDatabaseV1,
  D1WriteRunResultV1,
  D1WriteStatementV1,
} from '../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import { ACADEMIC_CONTEXT_2026_IDENTITY_V1 } from '../../../src/gradebook-domain/context/academic-context-2026-v1';
import {
  academicYearId,
  instant,
  openMigratedDatabase,
  type SqliteD1Database,
} from '../persistence/d1-transaction/d1-write-test-support';

const schoolId = 'school:import-integration-v2' as SchoolId;
const teacherId = 'teacher:import-integration-v2' as TeacherId;
const classGroupId = 'class-group:import-integration-v2' as ClassGroupId;
const subjectId = 'subject:import-integration-v2' as SubjectId;
const assignmentId = 'teaching-assignment:import-integration-v2' as TeachingAssignmentId;
const studentId = 'student:import-integration-v2' as StudentId;
const enrollmentId = 'enrollment:import-integration-v2' as EnrollmentId;
let database: SqliteD1Database;

beforeEach(async () => {
  database = await openMigratedDatabase();
  const unit = createGradebookD1PersistenceUnitOfWorkV2(database, { now: () => instant });
  const context = { academicYearId };
  const year: AcademicEntityRecordV1 = {
    kind: 'academic-year',
    value: {
      id: academicYearId,
      schoolId,
      year: 2026,
      status: 'active',
      startsOn: '2026-02-01',
      endsOn: '2026-12-20',
      activeEvaluationProfileId: ACADEMIC_CONTEXT_2026_IDENTITY_V1.evaluationProfileId,
      configurationVersion: String(ACADEMIC_CONTEXT_2026_IDENTITY_V1.configurationVersion),
    },
  };
  expect((await unit.entities.appendVersion(context, year, { expectedVersion: null })).status).toBe(
    'written',
  );
  const entities: AcademicEntityRecordV1[] = [
    {
      kind: 'teacher',
      value: { id: teacherId, displayName: 'Docente sintético', sourceNames: [], status: 'active' },
    },
    {
      kind: 'class-group',
      value: { id: classGroupId, academicYearId, code: '6S', grade: '6', section: 'S' },
    },
    {
      kind: 'subject',
      value: {
        id: subjectId,
        code: 'SYN',
        displayName: 'Componente sintético',
        shortName: 'SYN',
        status: 'active',
      },
    },
    {
      kind: 'teaching-assignment',
      value: {
        id: assignmentId,
        academicYearId,
        teacherId,
        classGroupId,
        subjectId,
        sourceDisciplineIndex: 'D1',
        effectivePeriod: {},
        confirmationOrigin: 'user-confirmed',
      },
    },
    {
      kind: 'student',
      value: { id: studentId, displayName: 'Estudante sintético', sourceNames: [] },
    },
    {
      kind: 'enrollment',
      value: {
        id: enrollmentId,
        academicYearId,
        studentId,
        classGroupId,
        effectivePeriod: {},
        position: 'current',
        sourcePosition: 1,
      },
    },
  ];
  for (const entity of entities) {
    expect(
      (await unit.entities.appendVersion(context, entity, { expectedVersion: null })).status,
    ).toBe('written');
  }
});

afterEach(() => database.raw.close());

function request(
  hash = 'a',
  grade: number | null = 7,
  fileName = 'fixture-sintetica.xlsx',
): GradebookImportPersistenceRequestV2 {
  const definitions = [
    ...SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2.map((slot) => ({
      sourceSlot: slot.sourceSlot,
      maximumConfiguration: { state: 'numeric' as const, rawValue: 10 },
    })),
    ...SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2.map((slot) => ({
      sourceSlot: slot.sourceSlot,
      maximumConfiguration: { state: 'numeric' as const, rawValue: 1 },
      name: { state: 'text' as const, rawValue: `Atividade sintética ${slot.sourceSlot}` },
    })),
  ];
  return {
    transportVersion: 2,
    operation: 'persist-recognized-file',
    manifest: {
      fileName,
      extension: 'xlsx',
      reportedMimeType: null,
      sizeBytes: 128,
      lastModifiedAt: null,
      sha256: hash.repeat(64),
      sourceContractVersion: 2,
      parserVersion: 'synthetic-v2',
      readAt: instant,
    },
    recognizedSuggestions: { academicYear: 2026, teacherName: 'Sugestão não autoritativa' },
    confirmedContext: { academicYearId },
    sourceResolution: { mode: 'resolve-or-create' },
    sheets: [
      {
        kind: 'term',
        sourceSheetName: '6S1ºD1',
        term: 1,
        recognizedContext: {
          classGroupLabel: '6S',
          subjectLabel: 'Componente sintético',
          disciplineIndex: 'D1',
        },
        teachingAssignmentId: assignmentId,
        assessmentDefinitions: definitions,
        students: [
          {
            sourceRow: 5,
            confirmedStudent: { studentId, enrollmentId },
            assessmentValues:
              grade === null
                ? []
                : [{ sourceSlot: 'R', value: { kind: 'manual', source: grade, value: grade } }],
            aggregates: {
              quantitativeTotal: null,
              parallelAssessment: null,
              qualitativeTotal: null,
              officialTermGrade: null,
              annualAccumulatedTotal: null,
            },
          },
        ],
      },
    ],
    diagnostics: [],
  };
}

function service(transaction?: ImportBootstrapTransactionPortV2) {
  let sequence = 0;
  const unitOfWork = createGradebookD1PersistenceUnitOfWorkV2(database, { now: () => instant });
  return createGradebookImportPersistenceServiceV2({
    unitOfWork,
    transaction:
      transaction ?? new GradebookD1ImportBootstrapTransactionV2(database, { now: () => instant }),
    now: () => instant,
    createId: (kind) => `${kind}:integration-v2:${++sequence}`,
  });
}

function tracedUnitOfWork(
  unitOfWork: PersistenceUnitOfWorkV2,
  phases: string[],
): PersistenceUnitOfWorkV2 {
  return {
    ...unitOfWork,
    logicalSources: {
      get: unitOfWork.logicalSources.get.bind(unitOfWork.logicalSources),
      listByContext: unitOfWork.logicalSources.listByContext.bind(unitOfWork.logicalSources),
      async createInitial(context, source) {
        phases.push('logical-source');
        return unitOfWork.logicalSources.createInitial(context, source);
      },
    },
    imports: {
      ...unitOfWork.imports,
      async appendSourceFileVersion(context, value, expectation) {
        phases.push('source-file');
        return unitOfWork.imports.appendSourceFileVersion(context, value, expectation);
      },
      async appendImportBatchVersion(context, value, expectation) {
        phases.push('import-batch');
        return unitOfWork.imports.appendImportBatchVersion(context, value, expectation);
      },
    },
    entities: {
      ...unitOfWork.entities,
      async appendVersion(context, record, expectation) {
        phases.push('assessment-component');
        return unitOfWork.entities.appendVersion(context, record, expectation);
      },
    },
    academicRecords: {
      ...unitOfWork.academicRecords,
      async appendVersion(context, stream, record, expectation) {
        phases.push('academic-record');
        return unitOfWork.academicRecords.appendVersion(context, stream, record, expectation);
      },
    },
    logicalSourceRecords: {
      ...unitOfWork.logicalSourceRecords,
      async appendVersion(context, stream, association, expectation) {
        phases.push('logical-source-record');
        return unitOfWork.logicalSourceRecords.appendVersion(
          context,
          stream,
          association,
          expectation,
        );
      },
    },
  };
}

describe('Import persistence integration V2', () => {
  it('revalidates opaque student/enrollment references before source resolution and planning', async () => {
    const incompatible = structuredClone(request()) as GradebookImportPersistenceRequestV2;
    const sheet = incompatible.sheets[0];
    if (!sheet) throw new Error('missing synthetic sheet');
    const student = sheet.students[0];
    if (!student) throw new Error('missing synthetic student');
    (student.confirmedStudent as { enrollmentId: EnrollmentId }).enrollmentId =
      'enrollment:not-compatible' as EnrollmentId;
    expect(await service().execute(incompatible)).toMatchObject({
      state: 'review-required',
      issues: [{ code: 'incompatible-reference' }],
      summary: { committedWrites: { total: 0 } },
    });
    expect(
      (
        database.raw.prepare('SELECT COUNT(*) AS count FROM logical_sources').get() as {
          count: number;
        }
      ).count,
    ).toBe(0);
    expect(await service().execute(request())).toMatchObject({ state: 'applied' });
    expect(
      (
        database.raw.prepare('SELECT COUNT(*) AS count FROM import_batch_versions').get() as {
          count: number;
        }
      ).count,
    ).toBe(1);
  });

  it('rejects assignments owned by different teachers before source resolution or writes', async () => {
    const otherTeacherId = 'teacher:import-integration-v2:other' as TeacherId;
    const otherAssignmentId =
      'teaching-assignment:import-integration-v2:other' as TeachingAssignmentId;
    const unit = createGradebookD1PersistenceUnitOfWorkV2(database, { now: () => instant });
    for (const entity of [
      {
        kind: 'teacher',
        value: {
          id: otherTeacherId,
          displayName: 'Outro docente sintético',
          sourceNames: [],
          status: 'active',
        },
      },
      {
        kind: 'teaching-assignment',
        value: {
          id: otherAssignmentId,
          academicYearId,
          teacherId: otherTeacherId,
          classGroupId,
          subjectId,
          sourceDisciplineIndex: 'D2',
          effectivePeriod: {},
          confirmationOrigin: 'user-confirmed',
        },
      },
    ] as const satisfies readonly AcademicEntityRecordV1[]) {
      expect(
        (await unit.entities.appendVersion({ academicYearId }, entity, { expectedVersion: null }))
          .status,
      ).toBe('written');
    }
    const mixed = structuredClone(request()) as GradebookImportPersistenceRequestV2;
    (mixed.sheets as GradebookImportPersistenceRequestV2['sheets'][number][]).push({
      ...structuredClone(mixed.sheets[0]!),
      sourceSheetName: '6S1ºD2',
      teachingAssignmentId: otherAssignmentId,
      recognizedContext: {
        classGroupLabel: '6S',
        subjectLabel: 'Outro componente sintético',
        disciplineIndex: 'D2',
      },
    });
    expect(await service().execute(mixed)).toMatchObject({
      state: 'review-required',
      issues: [{ code: 'incompatible-reference' }],
      summary: { committedWrites: { total: 0 } },
    });
    expect(
      (
        database.raw.prepare('SELECT COUNT(*) AS count FROM logical_sources').get() as {
          count: number;
        }
      ).count,
    ).toBe(0);
  });

  it('handles first import, identical reimport, rename, minimal change and absence without deletes', async () => {
    const persistence = service();
    const first = await persistence.execute(request());
    expect(first).toMatchObject({
      state: 'applied',
      summary: {
        committedWrites: {
          logicalSources: 1,
          sourceFileVersions: 1,
          importBatchVersions: 1,
          assessmentComponentVersions: 12,
          academicRecordVersions: 1,
          logicalSourceRecordAssociationVersions: 1,
        },
      },
    });

    const identical = await persistence.execute(request());
    expect(identical).toMatchObject({
      state: 'no-changes',
      summary: {
        committedWrites: {
          sourceFileVersions: 0,
          importBatchVersions: 1,
          assessmentComponentVersions: 0,
          academicRecordVersions: 0,
          logicalSourceRecordAssociationVersions: 0,
        },
      },
    });

    const renamed = await persistence.execute(request('a', 7, 'fixture-sintetica-renomeada.xlsx'));
    expect(renamed).toMatchObject({
      state: 'no-changes',
      summary: {
        committedWrites: {
          logicalSources: 0,
          sourceFileVersions: 0,
          importBatchVersions: 1,
        },
      },
    });

    const changed = await persistence.execute(request('b', 8));
    expect(changed).toMatchObject({
      state: 'applied',
      summary: {
        committedWrites: {
          sourceFileVersions: 1,
          importBatchVersions: 1,
          assessmentComponentVersions: 0,
          academicRecordVersions: 1,
          logicalSourceRecordAssociationVersions: 1,
        },
      },
    });

    const absent = await persistence.execute(request('c', null));
    expect(absent).toMatchObject({
      state: 'review-required',
      summary: { committedWrites: { total: 0 } },
    });
    expect(
      (
        database.raw.prepare('SELECT COUNT(*) AS count FROM source_file_versions').get() as {
          count: number;
        }
      ).count,
    ).toBe(2);
    expect(
      (
        database.raw.prepare('SELECT COUNT(*) AS count FROM academic_record_versions').get() as {
          count: number;
        }
      ).count,
    ).toBe(2);
  });

  it('fails closed with two compatible logical sources before planning/writes', async () => {
    const persistence = service();
    expect((await persistence.execute(request())).state).toBe('applied');
    database.raw
      .prepare(
        `INSERT INTO logical_sources (
         academic_year_id, logical_source_id, teacher_ref_kind, teacher_id, source_context, created_at
       ) VALUES (?, 'logical-source:ambiguous:second', 'teacher', ?, 'teacher-year-gradebook', ?)`,
      )
      .run(academicYearId, teacherId, instant);
    const before = (
      database.raw.prepare('SELECT COUNT(*) AS count FROM import_batch_versions').get() as {
        count: number;
      }
    ).count;
    const response = await persistence.execute(request('d', 9));
    expect(response).toMatchObject({
      state: 'review-required',
      issues: [{ code: 'ambiguous-logical-source' }],
    });
    expect(
      (
        database.raw.prepare('SELECT COUNT(*) AS count FROM import_batch_versions').get() as {
          count: number;
        }
      ).count,
    ).toBe(before);
  });

  it('returns conflict and rolls the new source/batch writes back for stale academic CAS', async () => {
    const initial = service();
    expect((await initial.execute(request())).state).toBe('applied');
    const delegate = new GradebookD1ImportBootstrapTransactionV2(database, { now: () => instant });
    const stale: ImportBootstrapTransactionPortV2 = {
      async runImportBootstrap(context, transactionRequest, operation) {
        database.raw
          .prepare(
            `UPDATE academic_record_streams SET current_version = 2
           WHERE academic_year_id = ? AND record_kind = 'grade-entry'`,
          )
          .run(academicYearId);
        return delegate.runImportBootstrap(context, transactionRequest, operation);
      },
    };
    const batchesBefore = (
      database.raw.prepare('SELECT COUNT(*) AS count FROM import_batch_versions').get() as {
        count: number;
      }
    ).count;
    const sourcesBefore = (
      database.raw.prepare('SELECT COUNT(*) AS count FROM source_file_versions').get() as {
        count: number;
      }
    ).count;
    expect(await service(stale).execute(request('e', 9))).toEqual({
      transportVersion: 2,
      state: 'conflict',
    });
    expect(
      (
        database.raw.prepare('SELECT COUNT(*) AS count FROM import_batch_versions').get() as {
          count: number;
        }
      ).count,
    ).toBe(batchesBefore);
    expect(
      (
        database.raw.prepare('SELECT COUNT(*) AS count FROM source_file_versions').get() as {
          count: number;
        }
      ).count,
    ).toBe(sourcesBefore);
  });

  it('executes the official bootstrap phases in order', async () => {
    const phases: string[] = [];
    const delegate = new GradebookD1ImportBootstrapTransactionV2(database, { now: () => instant });
    const ordered: ImportBootstrapTransactionPortV2 = {
      runImportBootstrap(context, transactionRequest, operation) {
        return delegate.runImportBootstrap(context, transactionRequest, (unitOfWork) =>
          operation(tracedUnitOfWork(unitOfWork, phases)),
        );
      },
    };
    expect(await service(ordered).execute(request())).toMatchObject({ state: 'applied' });
    expect(phases.filter((phase, index) => phase !== phases[index - 1])).toEqual([
      'logical-source',
      'source-file',
      'import-batch',
      'assessment-component',
      'academic-record',
      'logical-source-record',
    ]);
  });

  it('commits the complete import through the production-style atomic D1 batch path', async () => {
    const atomic: D1WriteDatabaseV1 & {
      batch(statements: readonly D1WriteStatementV1[]): Promise<readonly D1WriteRunResultV1[]>;
    } = {
      prepare: database.prepare.bind(database),
      exec: database.exec.bind(database),
      async batch(statements) {
        database.raw.exec('BEGIN IMMEDIATE');
        try {
          const results: D1WriteRunResultV1[] = [];
          for (const statement of statements) results.push(await statement.run());
          database.raw.exec('COMMIT');
          return results;
        } catch (cause) {
          database.raw.exec('ROLLBACK');
          throw cause;
        }
      },
    };
    let sequence = 0;
    const persistence = createGradebookImportPersistenceServiceV2({
      unitOfWork: createGradebookD1PersistenceUnitOfWorkV2(atomic, { now: () => instant }),
      transaction: new GradebookD1ImportBootstrapTransactionV2(atomic, { now: () => instant }),
      now: () => instant,
      createId: (kind) => `${kind}:atomic-integration-v2:${++sequence}`,
    });
    expect(await persistence.execute(request())).toMatchObject({
      state: 'applied',
      summary: { committedWrites: { total: 17 } },
    });
    for (const [table, count] of [
      ['logical_sources', 1],
      ['source_file_versions', 1],
      ['import_batch_versions', 1],
      ['academic_record_versions', 1],
      ['logical_source_record_versions', 1],
    ] as const) {
      expect(
        (database.raw.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number })
          .count,
      ).toBe(count);
    }
  });
});
