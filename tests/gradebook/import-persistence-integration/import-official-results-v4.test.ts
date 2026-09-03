import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  AssessmentComponentId,
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
import { createGradebookD1PersistenceUnitOfWorkV2 } from '../../../server/gradebook/persistence/d1/composition/d1-persistence-unit-of-work-v1';
import { createGradebookD1ImportAnnualStateSourceV1 } from '../../../server/gradebook/persistence/d1/imports/d1-import-annual-state-source-v1';
import { GradebookD1ImportBootstrapTransactionV2 } from '../../../server/gradebook/persistence/d1/transaction/d1-import-bootstrap-transaction-v2';
import type { AcademicEntityRecordV1 } from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import { ACADEMIC_CONTEXT_2026_IDENTITY_V1 } from '../../../src/gradebook-domain/context/academic-context-2026-v1';
import {
  academicYearId,
  instant,
  openMigratedDatabase,
  type SqliteD1Database,
} from '../persistence/d1-transaction/d1-write-test-support';

const schoolId = 'school:official-results-v4' as SchoolId;
const teacherId = 'teacher:official-results-v4' as TeacherId;
const classGroupId = 'class-group:official-results-v4' as ClassGroupId;
const subjectId = 'subject:official-results-v4' as SubjectId;
const assignmentId = 'teaching-assignment:official-results-v4' as TeachingAssignmentId;
const studentId = 'student:official-results-v4' as StudentId;
const enrollmentId = 'enrollment:official-results-v4' as EnrollmentId;
let database: SqliteD1Database;

beforeEach(async () => {
  database = await openMigratedDatabase();
  const unit = createGradebookD1PersistenceUnitOfWorkV2(database, { now: () => instant });
  const context = { academicYearId };
  const records: AcademicEntityRecordV1[] = [
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
  for (const record of records) {
    expect(
      (await unit.entities.appendVersion(context, record, { expectedVersion: null })).status,
    ).toBe('written');
  }
});

afterEach(() => database.raw.close());

function positive(value: number): GradebookImportResultCellObservationV4 {
  return { classification: 'manual-positive-number', rawValue: value };
}

const empty = { classification: 'empty', rawValue: '' } as const;

function definitions() {
  return [
    ...SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2.map((slot) => ({
      sourceSlot: slot.sourceSlot,
      maximumConfiguration: { state: 'numeric' as const, rawValue: 10 },
    })),
    ...SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2.map((slot) => ({
      sourceSlot: slot.sourceSlot,
      maximumConfiguration: { state: 'numeric' as const, rawValue: 1 },
      name: { state: 'text' as const, rawValue: `Atividade ${slot.sourceSlot}` },
    })),
  ];
}

function termSheet(
  term: 1 | 2 | 3,
  quantitative: number,
  qualitative: number,
  official: number,
  annual: number,
): GradebookImportPersistenceRequestV4['sheets'][number] {
  return {
    kind: 'term',
    sourceSheetName: `6S${term}ºD1`,
    term,
    recognizedContext: {
      classGroupLabel: '6S',
      subjectLabel: 'Componente sintético',
      disciplineIndex: 'D1',
    },
    teachingAssignmentId: assignmentId,
    assessmentDefinitions: definitions(),
    students: [
      {
        sourceRow: 5,
        confirmedStudent: { studentId, enrollmentId },
        assessmentValues: [{ sourceSlot: 'R', value: { kind: 'manual', source: 5, value: 5 } }],
        aggregates: {
          quantitativeTotal: positive(quantitative),
          parallelAssessment: empty,
          qualitativeTotal: positive(qualitative),
          officialTermGrade: positive(official),
          annualAccumulatedTotal: positive(annual),
        },
      },
    ],
  };
}

function completeRequest(hash = 'f'): GradebookImportPersistenceRequestV4 {
  return {
    transportVersion: 4,
    operation: 'persist-recognized-file',
    manifest: {
      fileName: 'resultado-oficial-sintetico.xlsx',
      extension: 'xlsx',
      reportedMimeType: null,
      sizeBytes: 256,
      lastModifiedAt: null,
      sha256: hash.repeat(64),
      sourceContractVersion: 2,
      parserVersion: 'synthetic-v4',
      readAt: instant,
    },
    recognizedSuggestions: { academicYear: 2026, teacherName: 'Docente sintético' },
    confirmedContext: { academicYearId },
    sourceResolution: { mode: 'resolve-or-create' },
    sheets: [
      termSheet(1, 10, 10, 20, 20),
      termSheet(2, 10, 10, 20, 40),
      termSheet(3, 12, 13, 25, 65),
      {
        kind: 'recovery',
        sourceSheetName: '6SRECD1',
        recognizedContext: {
          classGroupLabel: '6S',
          subjectLabel: 'Componente sintético',
          disciplineIndex: 'D1',
        },
        teachingAssignmentId: assignmentId,
        students: [
          {
            sourceRow: 5,
            confirmedStudent: { studentId, enrollmentId },
            recovery: {
              trimester1: empty,
              trimester2: empty,
              trimester3: empty,
              totalAfterRecovery: empty,
              originalTrimester1: positive(20),
              originalTrimester2: positive(20),
              originalTrimester3: positive(25),
              originalAnnual: positive(65),
              applicabilityTrimester1: { classification: 'numeric', rawValue: 0 },
              applicabilityTrimester2: { classification: 'numeric', rawValue: 0 },
              applicabilityTrimester3: { classification: 'numeric', rawValue: 0 },
            },
          },
        ],
      },
    ],
    diagnostics: [],
  };
}

function service() {
  let sequence = 0;
  const unitOfWork = createGradebookD1PersistenceUnitOfWorkV2(database, { now: () => instant });
  return createGradebookImportPersistenceServiceV4({
    unitOfWork,
    transaction: new GradebookD1ImportBootstrapTransactionV2(database, { now: () => instant }),
    annualStateSource: createGradebookD1ImportAnnualStateSourceV1(database),
    now: () => instant,
    createId: (kind) => `${kind}:official-results-v4:${++sequence}`,
  });
}

function recordCount(kind: string): number {
  return (
    database.raw
      .prepare('SELECT COUNT(*) AS count FROM academic_record_streams WHERE record_kind = ?')
      .get(kind) as { count: number }
  ).count;
}

describe('Import persistence official results V4', () => {
  it('persists and recovers GradeEntry, TermResult, FinalRecovery and AnnualResult after reinstantiation', async () => {
    const response = await service().execute(completeRequest());
    expect(response).toMatchObject({ transportVersion: 4, state: 'applied' });
    expect(recordCount('grade-entry')).toBe(3);
    expect(recordCount('term-result')).toBe(3);
    expect(recordCount('final-recovery')).toBe(3);
    expect(recordCount('annual-result')).toBe(1);

    const reloaded = createGradebookD1PersistenceUnitOfWorkV2(database, { now: () => instant });
    const context = { academicYearId };
    const term = await reloaded.academicRecords.getCurrent(context, {
      kind: 'term-result',
      studentId,
      enrollmentId,
      teachingAssignmentId: assignmentId,
      term: 1,
    });
    expect(term?.value).toMatchObject({
      kind: 'term-result',
      value: {
        authorityMode: 'imported-source',
        officialGrade: {
          imported: { value: { state: 'numeric', value: 20 } },
          calculated: { value: { state: 'numeric', value: 20 } },
        },
      },
    });

    const recovery = await reloaded.academicRecords.getCurrent(context, {
      kind: 'final-recovery',
      studentId,
      enrollmentId,
      teachingAssignmentId: assignmentId,
      recoveredTerm: 1,
    });
    expect(recovery?.value).toMatchObject({
      kind: 'final-recovery',
      value: { authorityMode: 'imported-source', recoveredTerm: 1 },
    });

    const annual = await reloaded.academicRecords.getCurrent(context, {
      kind: 'annual-result',
      studentId,
      enrollmentId,
      teachingAssignmentId: assignmentId,
    });
    expect(annual?.value).toMatchObject({
      kind: 'annual-result',
      value: {
        authorityMode: 'imported-source',
        originalTotal: { imported: { value: { state: 'numeric', value: 65 } } },
        postRecoveryTotal: { imported: { value: { state: 'numeric', value: 65 } } },
        coverage: { state: 'complete' },
      },
    });

    const gradeRow = database.raw
      .prepare(
        "SELECT assessment_component_id FROM academic_record_streams WHERE record_kind='grade-entry' ORDER BY assessment_component_id LIMIT 1",
      )
      .get() as { assessment_component_id: string };
    const grade = await reloaded.academicRecords.getCurrent(context, {
      kind: 'grade-entry',
      studentId,
      enrollmentId,
      assessmentComponentId: gradeRow.assessment_component_id as AssessmentComponentId,
    });
    expect(grade?.value.kind).toBe('grade-entry');
  });

  it('persists an annual result fail-closed when the official curriculum has an unresolved assignment', async () => {
    const secondSubjectId = 'subject:official-results-v4:2' as SubjectId;
    const secondAssignmentId =
      'teaching-assignment:official-results-v4:2' as TeachingAssignmentId;
    const unit = createGradebookD1PersistenceUnitOfWorkV2(database, { now: () => instant });
    for (const record of [
      {
        kind: 'subject',
        value: {
          id: secondSubjectId,
          code: 'SYN2',
          displayName: 'Outro componente sintético',
          shortName: 'SYN2',
          status: 'active',
        },
      },
      {
        kind: 'teaching-assignment',
        value: {
          id: secondAssignmentId,
          academicYearId,
          teacherId,
          classGroupId,
          subjectId: secondSubjectId,
          sourceDisciplineIndex: 'D2',
          effectivePeriod: {},
          confirmationOrigin: 'user-confirmed',
        },
      },
    ] as const satisfies readonly AcademicEntityRecordV1[]) {
      expect(
        (await unit.entities.appendVersion({ academicYearId }, record, { expectedVersion: null }))
          .status,
      ).toBe('written');
    }

    expect(await service().execute(completeRequest('e'))).toMatchObject({ state: 'applied' });
    const row = database.raw
      .prepare(
        "SELECT payload_json FROM academic_record_versions WHERE record_kind='annual-result' ORDER BY version DESC LIMIT 1",
      )
      .get() as { payload_json: string };
    const payload = JSON.parse(row.payload_json) as {
      value: { coverage: { state: string }; academicState: { imported: { state: string } } };
    };
    expect(payload.value.coverage.state).toBe('insufficient-data');
    expect(payload.value.academicState.imported.state).toBe('insufficient-data');
  });
});
