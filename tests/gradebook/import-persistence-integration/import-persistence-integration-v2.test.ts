import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  ClassGroupId,
  EnrollmentId,
  SchoolId,
  StudentId,
  SubjectId,
  TeacherId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import type {
  GradebookImportPersistenceRequestV4,
  GradebookImportResultCellObservationV4,
} from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v4';
import {
  SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2,
  SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2,
} from '../../../shared/gradebook-contracts/source/source-contract-v2';
import { createGradebookImportPersistenceServiceV4 } from '../../../server/gradebook/application/import/import-persistence-service-v2';
import { materializeAssessmentDefinitionsV3 } from '../../../src/features/gradebook/import/assessment-definition-materializer-v3';
import { createGradebookD1PersistenceUnitOfWorkV2 } from '../../../server/gradebook/persistence/d1/composition/d1-persistence-unit-of-work-v1';
import { createGradebookD1ImportAnnualStateSourceV1 } from '../../../server/gradebook/persistence/d1/imports/d1-import-annual-state-source-v1';
import { GradebookD1ImportBootstrapTransactionV2 } from '../../../server/gradebook/persistence/d1/transaction/d1-import-bootstrap-transaction-v2';
import type {
  ImportBootstrapTransactionPortV2,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import type { AcademicEntityRecordV1 } from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type {
  D1WriteDatabaseV1,
  D1WriteRunResultV1,
  D1WriteStatementV1,
  D1WriteValueV1,
} from '../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import { ACADEMIC_CONTEXT_2026_IDENTITY_V1 } from '../../../src/gradebook-domain/context/academic-context-2026-v1';
import {
  academicYearId,
  instant,
  openMigratedDatabase,
  type SqliteD1Database,
} from '../persistence/d1-transaction/d1-write-test-support';

const schoolId = 'school:import-integration-v4' as SchoolId;
const teacherId = 'teacher:import-integration-v4' as TeacherId;
const classGroupId = 'class-group:import-integration-v4' as ClassGroupId;
const subjectId = 'subject:import-integration-v4' as SubjectId;
const assignmentId = 'teaching-assignment:import-integration-v4' as TeachingAssignmentId;
const studentId = 'student:import-integration-v4' as StudentId;
const enrollmentId = 'enrollment:import-integration-v4' as EnrollmentId;
let database: SqliteD1Database;

beforeEach(async () => {
  database = await openMigratedDatabase();
  const unit = createGradebookD1PersistenceUnitOfWorkV2(database, { now: () => instant });
  const context = { academicYearId };
  const entities: AcademicEntityRecordV1[] = [
    {
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
    },
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

function positive(value: number): GradebookImportResultCellObservationV4 {
  return { classification: 'manual-positive-number', rawValue: value };
}

const empty = { classification: 'empty', rawValue: '' } as const;
const missing = { classification: 'missing-field' } as const;

function request(
  hash = 'a',
  grade: number | null = 7,
  fileName = 'fixture-sintetica.xlsx',
): GradebookImportPersistenceRequestV4 {
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
    transportVersion: 4,
    operation: 'persist-recognized-file',
    manifest: {
      fileName,
      extension: 'xlsx',
      reportedMimeType: null,
      sizeBytes: 128,
      lastModifiedAt: null,
      sha256: hash.repeat(64),
      sourceContractVersion: 2,
      parserVersion: 'synthetic-v4',
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
              quantitativeTotal: positive(10),
              parallelAssessment: empty,
              qualitativeTotal: positive(12),
              officialTermGrade: positive(22),
              annualAccumulatedTotal: missing,
            },
          },
        ],
      },
    ],
    diagnostics: [],
  };
}

function service(transaction?: ImportBootstrapTransactionPortV2, useSourceContractV3 = false) {
  let sequence = 0;
  const unitOfWork = createGradebookD1PersistenceUnitOfWorkV2(database, { now: () => instant });
  return createGradebookImportPersistenceServiceV4(
    {
      unitOfWork,
      transaction:
        transaction ??
        new GradebookD1ImportBootstrapTransactionV2(database, { now: () => instant }),
      annualStateSource: createGradebookD1ImportAnnualStateSourceV1(database),
      now: () => instant,
      createId: (kind) => `${kind}:integration-v4:${++sequence}`,
    },
    useSourceContractV3
      ? { materializeAssessmentDefinitions: materializeAssessmentDefinitionsV3 }
      : undefined,
  );
}

function withoutConfiguredQualitativeMaximum(
  value = request(),
): GradebookImportPersistenceRequestV4 {
  return {
    ...value,
    sheets: value.sheets.map((sheet) =>
      sheet.kind === 'term'
        ? {
            ...sheet,
            assessmentDefinitions: sheet.assessmentDefinitions.map((definition) =>
              'name' in definition
                ? {
                    ...definition,
                    maximumConfiguration: {
                      state: 'ambiguous-marker' as const,
                      rawValue: '*' as const,
                    },
                  }
                : definition,
            ),
          }
        : sheet,
    ),
  };
}

class TaggedStatement implements D1WriteStatementV1 {
  constructor(
    readonly tag: 'academic-record' | 'association' | 'association-read' | 'other',
    private readonly delegate: D1WriteStatementV1,
    private readonly onFirst?: (tag: TaggedStatement['tag']) => void,
  ) {}

  bind(...values: D1WriteValueV1[]): D1WriteStatementV1 {
    return new TaggedStatement(this.tag, this.delegate.bind(...values), this.onFirst);
  }

  first<Row extends Record<string, unknown>>(): Promise<Row | null> {
    this.onFirst?.(this.tag);
    return this.delegate.first<Row>();
  }

  all<Row extends Record<string, unknown>>(): Promise<{ readonly results: readonly Row[] }> {
    return this.delegate.all<Row>();
  }

  run(): Promise<D1WriteRunResultV1> {
    return this.delegate.run();
  }
}

function queryTag(query: string): TaggedStatement['tag'] {
  const normalized = query.replace(/\s+/gu, ' ').trim().toLowerCase();
  if (normalized.includes('insert into academic_record_versions')) return 'academic-record';
  if (normalized.includes('insert into logical_source_record_versions')) return 'association';
  if (normalized.includes('from logical_source_record_streams')) return 'association-read';
  return 'other';
}

function physicalOrderDatabase(
  order: TaggedStatement['tag'][],
  reads: TaggedStatement['tag'][] = [],
): D1WriteDatabaseV1 & {
  batch(statements: readonly D1WriteStatementV1[]): Promise<readonly D1WriteRunResultV1[]>;
} {
  return {
    prepare(query) {
      return new TaggedStatement(queryTag(query), database.prepare(query), (tag) => reads.push(tag));
    },
    exec: database.exec.bind(database),
    async batch(statements) {
      order.push(
        ...statements.flatMap((statement) =>
          statement instanceof TaggedStatement ? [statement.tag] : [],
        ),
      );
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
}

describe('Import persistence integration V4', () => {
  it('SourceContract V3 resolves a file containing only applicable and not-applicable slots', async () => {
    const response = await service(undefined, true).execute(withoutConfiguredQualitativeMaximum());

    expect(response).toMatchObject({
      state: 'applied',
      summary: {
        assessmentDefinitions: { total: 12, resolved: 12, blocked: 0 },
        assessmentComponents: { new: 2, blocked: 0 },
        committedWrites: { assessmentComponentVersions: 2 },
      },
    });
  });

  it('SourceContract V3 keeps a nonnumeric maximum with student value blocked and atomic', async () => {
    const candidate = withoutConfiguredQualitativeMaximum(request('b'));
    const firstSheet = candidate.sheets[0];
    if (!firstSheet || firstSheet.kind !== 'term') throw new Error('missing-synthetic-term');
    const firstStudent = firstSheet.students[0];
    if (!firstStudent) throw new Error('missing-synthetic-student');
    const conflicting = {
      ...candidate,
      sheets: [
        {
          ...firstSheet,
          students: [
            {
              ...firstStudent,
              assessmentValues: [
                ...firstStudent.assessmentValues,
                {
                  sourceSlot: 'AA' as const,
                  value: { kind: 'manual' as const, source: 1, value: 1 },
                },
              ],
            },
          ],
        },
      ],
    };

    expect(await service(undefined, true).execute(conflicting)).toMatchObject({
      state: 'blocked',
      summary: {
        assessmentDefinitions: { total: 12, resolved: 11, blocked: 1 },
        committedWrites: { total: 0 },
      },
      issues: [{ code: 'blocked-definition' }],
    });
    expect(
      (
        database.raw.prepare('SELECT COUNT(*) AS count FROM import_batch_versions').get() as {
          count: number;
        }
      ).count,
    ).toBe(0);
  });

  it('revalidates opaque references and rejects incompatible teacher context before writes', async () => {
    const incompatible = structuredClone(request()) as GradebookImportPersistenceRequestV4;
    const firstSheet = incompatible.sheets[0];
    if (!firstSheet) throw new Error('missing synthetic sheet');
    const firstStudent = firstSheet.students[0];
    if (!firstStudent) throw new Error('missing synthetic student');
    (firstStudent.confirmedStudent as { enrollmentId: EnrollmentId }).enrollmentId =
      'enrollment:not-compatible' as EnrollmentId;
    expect(await service().execute(incompatible)).toMatchObject({
      transportVersion: 4,
      state: 'review-required',
      issues: [{ code: 'incompatible-reference' }],
      summary: { committedWrites: { total: 0 } },
    });

    const otherTeacherId = 'teacher:import-integration-v4:other' as TeacherId;
    const otherAssignmentId =
      'teaching-assignment:import-integration-v4:other' as TeachingAssignmentId;
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
    const mixed = structuredClone(request()) as GradebookImportPersistenceRequestV4;
    (mixed.sheets as GradebookImportPersistenceRequestV4['sheets'][number][]).push({
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
      summary: { committedWrites: { total: 0 } },
    });
    expect(
      (database.raw.prepare('SELECT COUNT(*) AS count FROM logical_sources').get() as { count: number })
        .count,
    ).toBe(0);
  });

  it('keeps reimport idempotent, rename stable, minimal change scoped and absence non-destructive', async () => {
    const persistence = service();
    expect(await persistence.execute(request())).toMatchObject({
      state: 'applied',
      summary: {
        committedWrites: {
          logicalSources: 1,
          sourceFileVersions: 1,
          assessmentComponentVersions: 12,
          academicRecordVersions: 2,
          logicalSourceRecordAssociationVersions: 2,
        },
      },
    });
    expect(await persistence.execute(request())).toMatchObject({
      state: 'no-changes',
      summary: {
        committedWrites: {
          sourceFileVersions: 0,
          assessmentComponentVersions: 0,
          academicRecordVersions: 0,
          logicalSourceRecordAssociationVersions: 0,
        },
      },
    });
    expect(await persistence.execute(request('a', 7, 'fixture-sintetica-renomeada.xlsx'))).toMatchObject({
      state: 'no-changes',
      summary: { committedWrites: { logicalSources: 0, sourceFileVersions: 0 } },
    });
    expect(await persistence.execute(request('b', 8))).toMatchObject({
      state: 'applied',
      summary: {
        committedWrites: {
          sourceFileVersions: 1,
          assessmentComponentVersions: 0,
          academicRecordVersions: 1,
        },
      },
    });
    expect(await persistence.execute(request('c', null))).toMatchObject({
      state: 'review-required',
      summary: { committedWrites: { total: 0 } },
    });
    expect(
      (database.raw.prepare('SELECT COUNT(*) AS count FROM source_file_versions').get() as { count: number })
        .count,
    ).toBe(2);
    expect(
      (database.raw.prepare('SELECT COUNT(*) AS count FROM academic_record_versions').get() as { count: number })
        .count,
    ).toBe(3);
  });

  it('fails closed on ambiguous logical source and stale CAS without partial batch/source writes', async () => {
    const persistence = service();
    expect((await persistence.execute(request())).state).toBe('applied');
    database.raw
      .prepare(
        `INSERT INTO logical_sources (
         academic_year_id, logical_source_id, teacher_ref_kind, teacher_id, source_context, created_at
       ) VALUES (?, 'logical-source:ambiguous:second', 'teacher', ?, 'teacher-year-gradebook', ?)`,
      )
      .run(academicYearId, teacherId, instant);
    const batchesBeforeAmbiguous = (
      database.raw.prepare('SELECT COUNT(*) AS count FROM import_batch_versions').get() as { count: number }
    ).count;
    expect(await persistence.execute(request('d', 9))).toMatchObject({
      state: 'review-required',
      issues: [{ code: 'ambiguous-logical-source' }],
    });
    expect(
      (database.raw.prepare('SELECT COUNT(*) AS count FROM import_batch_versions').get() as { count: number })
        .count,
    ).toBe(batchesBeforeAmbiguous);

    database.raw
      .prepare("DELETE FROM logical_sources WHERE logical_source_id='logical-source:ambiguous:second'")
      .run();
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
      database.raw.prepare('SELECT COUNT(*) AS count FROM import_batch_versions').get() as { count: number }
    ).count;
    const sourcesBefore = (
      database.raw.prepare('SELECT COUNT(*) AS count FROM source_file_versions').get() as { count: number }
    ).count;
    expect(await service(stale).execute(request('e', 9))).toEqual({ transportVersion: 4, state: 'conflict' });
    expect(
      (database.raw.prepare('SELECT COUNT(*) AS count FROM import_batch_versions').get() as { count: number })
        .count,
    ).toBe(batchesBefore);
    expect(
      (database.raw.prepare('SELECT COUNT(*) AS count FROM source_file_versions').get() as { count: number })
        .count,
    ).toBe(sourcesBefore);
  });

  it('physically batches every AcademicRecord before any source-record association', async () => {
    const order: TaggedStatement['tag'][] = [];
    const reads: TaggedStatement['tag'][] = [];
    const atomic = physicalOrderDatabase(order, reads);
    let sequence = 0;
    const persistence = createGradebookImportPersistenceServiceV4({
      unitOfWork: createGradebookD1PersistenceUnitOfWorkV2(atomic, { now: () => instant }),
      transaction: new GradebookD1ImportBootstrapTransactionV2(atomic, { now: () => instant }),
      annualStateSource: createGradebookD1ImportAnnualStateSourceV1(atomic),
      now: () => instant,
      createId: (kind) => `${kind}:physical-order-v4:${++sequence}`,
    });
    expect(await persistence.execute(request())).toMatchObject({
      transportVersion: 4,
      state: 'applied',
      summary: { committedWrites: { total: 19 } },
    });

    const academicPositions = order.flatMap((tag, index) => (tag === 'academic-record' ? [index] : []));
    const associationPositions = order.flatMap((tag, index) => (tag === 'association' ? [index] : []));
    expect(academicPositions).toHaveLength(2);
    expect(associationPositions).toHaveLength(2);
    expect(Math.max(...academicPositions)).toBeLessThan(Math.min(...associationPositions));
    expect(reads.filter((tag) => tag === 'association-read')).toHaveLength(2);
    expect(
      (database.raw.prepare('SELECT COUNT(*) AS count FROM academic_record_versions').get() as { count: number })
        .count,
    ).toBe(2);
    expect(
      (database.raw.prepare('SELECT COUNT(*) AS count FROM logical_source_record_versions').get() as { count: number })
        .count,
    ).toBe(2);
  });
});
