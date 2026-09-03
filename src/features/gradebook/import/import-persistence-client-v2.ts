import type {
  AcademicYearId,
  EnrollmentId,
  StudentId,
  TeachingAssignmentId,
} from '../../../../shared/gradebook-contracts/entities';
import {
  GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V2,
  GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V2,
  isGradebookImportPersistenceRequestV2,
  isGradebookImportPersistenceResponseV2,
  type GradebookImportPersistenceRequestV2,
  type GradebookImportPersistenceResponseV2,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v2';
import {
  SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2,
  SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2,
} from '../../../../shared/gradebook-contracts/source/source-contract-v2';
import type { BatchSuccess } from './import-batch';
import type { NoteValue } from './spreadsheet-recognizer';
import type {
  GradebookImportAssessmentDefinitionV1,
  GradebookImportAssessmentMaximumV1,
  GradebookImportAssessmentNameV1,
  GradebookImportRecognizedNoteV1,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v1';

const ENDPOINT = '/api/gradebook/import-persistence';

export interface ConfirmedImportStudentReferenceV2 {
  readonly studentId: StudentId;
  readonly enrollmentId: EnrollmentId;
}

export interface ConfirmedImportSheetReferencesV2 {
  readonly teachingAssignmentId: TeachingAssignmentId;
  readonly studentsByRow: Readonly<Record<number, ConfirmedImportStudentReferenceV2>>;
}

export interface ConfirmedImportReferencesV2 {
  readonly academicYearId: AcademicYearId;
  readonly sheetsByName: Readonly<Record<string, ConfirmedImportSheetReferencesV2>>;
}

function transportNote(value: NoteValue | null): GradebookImportRecognizedNoteV1 | null {
  if (!value) return null;
  switch (value.kind) {
    case 'formula':
      return {
        kind: value.kind,
        source: value.source,
        value: value.value,
        formula: value.formula ?? '',
      };
    case 'manual':
    case 'negative':
      return { kind: value.kind, source: value.source, value: value.value };
    case 'official-zero':
      return { kind: value.kind, source: 0.1, value: 0 };
    case 'legacy-zero':
      return { kind: value.kind, source: 0, value: 0 };
  }
}

function maximum(
  value: BatchSuccess['summary']['gradeSheets'][number]['assessmentDefinitions'][number]['maximumConfiguration'],
): GradebookImportAssessmentMaximumV1 {
  switch (value.state) {
    case 'missing-field':
      return { state: value.state };
    case 'numeric':
      return { state: value.state, rawValue: value.rawValue };
    case 'ambiguous-empty':
      return { state: value.state, rawValue: value.rawValue };
    case 'ambiguous-marker':
      return { state: value.state, rawValue: value.rawValue };
    case 'unrecognized':
      return { state: value.state, rawValue: value.rawValue };
  }
}

function assessmentName(
  value: Extract<
    BatchSuccess['summary']['gradeSheets'][number]['assessmentDefinitions'][number],
    { kind: 'qualitative-activity' }
  >['name'],
): GradebookImportAssessmentNameV1 {
  switch (value.state) {
    case 'missing-field':
      return { state: value.state };
    case 'text':
      return { state: value.state, rawValue: value.rawValue };
    case 'empty':
      return { state: value.state, rawValue: value.rawValue };
    case 'unrecognized':
      return { state: value.state, rawValue: value.rawValue };
  }
}

function assessmentDefinition(
  value: BatchSuccess['summary']['gradeSheets'][number]['assessmentDefinitions'][number],
): GradebookImportAssessmentDefinitionV1 {
  if (value.kind === 'quantitative-assessment')
    return {
      sourceSlot: value.sourceSlot,
      maximumConfiguration: maximum(value.maximumConfiguration),
    };
  return {
    sourceSlot: value.sourceSlot,
    maximumConfiguration: maximum(value.maximumConfiguration),
    name: assessmentName(value.name),
  };
}

export function createGradebookImportPersistenceRequestV2(
  result: BatchSuccess,
  confirmed: ConfirmedImportReferencesV2,
): GradebookImportPersistenceRequestV2 {
  const sheets = result.summary.gradeSheets.flatMap<
    GradebookImportPersistenceRequestV2['sheets'][number]
  >((sheet) => {
    if (sheet.stage === 'overview') return [];
    const references = confirmed.sheetsByName[sheet.name];
    if (!references?.teachingAssignmentId.trim())
      throw new TypeError('missing-teaching-assignment-reference');
    const common = {
      sourceSheetName: sheet.name,
      recognizedContext: {
        classGroupLabel: sheet.className,
        subjectLabel: sheet.discipline,
        disciplineIndex: sheet.disciplineIndex as `D${number}`,
      },
      teachingAssignmentId: references.teachingAssignmentId,
    };
    const studentReference = (row: number) => {
      const reference = references.studentsByRow[row];
      if (!reference?.studentId.trim() || !reference.enrollmentId.trim()) {
        throw new TypeError('missing-student-reference');
      }
      return reference;
    };
    if (sheet.stage === 'recovery')
      return [
        {
          ...common,
          kind: 'recovery' as const,
          students: sheet.students.map((student) => ({
            sourceRow: student.row,
            confirmedStudent: studentReference(student.row),
            recovery: {
              trimester1: transportNote(student.recovery?.trimester1 ?? null),
              trimester2: transportNote(student.recovery?.trimester2 ?? null),
              trimester3: transportNote(student.recovery?.trimester3 ?? null),
              totalAfterRecovery: transportNote(student.recovery?.totalAfterRecovery ?? null),
              originalTrimester1: transportNote(student.recovery?.originalTrimester1 ?? null),
              originalTrimester2: transportNote(student.recovery?.originalTrimester2 ?? null),
              originalTrimester3: transportNote(student.recovery?.originalTrimester3 ?? null),
              originalAnnual: transportNote(student.recovery?.originalAnnual ?? null),
              eligibleTrimester1: student.recovery?.eligibleTrimester1 ?? false,
              eligibleTrimester2: student.recovery?.eligibleTrimester2 ?? false,
              eligibleTrimester3: student.recovery?.eligibleTrimester3 ?? false,
            },
          })),
        },
      ];
    const term = Number(sheet.stage.at(-1)) as 1 | 2 | 3;
    return [
      {
        ...common,
        kind: 'term' as const,
        term,
        assessmentDefinitions: sheet.assessmentDefinitions.map(assessmentDefinition),
        students: sheet.students.map((student) => ({
          sourceRow: student.row,
          confirmedStudent: studentReference(student.row),
          assessmentValues: [
            ...SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2.map((slot, index) => ({
              sourceSlot: slot.sourceSlot,
              value: transportNote(student.quantitativeAssessments[index] ?? null),
            })),
            ...SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2.map((slot, index) => ({
              sourceSlot: slot.sourceSlot,
              value: transportNote(student.qualitative[index] ?? null),
            })),
          ].filter(
            (
              value,
            ): value is Exclude<typeof value, { value: null }> & {
              value: NonNullable<typeof value.value>;
            } => value.value !== null,
          ),
          aggregates: {
            quantitativeTotal: transportNote(student.quantitativeTotal),
            parallelAssessment: transportNote(student.parallel),
            qualitativeTotal: transportNote(student.qualitativeTotal),
            officialTermGrade: transportNote(student.official),
            annualAccumulatedTotal: transportNote(student.annual),
          },
        })),
      },
    ];
  });
  const request = {
    transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V2,
    operation: GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V2,
    manifest: {
      fileName: result.manifest.fileName,
      extension: result.manifest.extension,
      reportedMimeType: result.manifest.reportedMimeType,
      sizeBytes: result.manifest.sizeBytes,
      lastModifiedAt: result.manifest.lastModifiedAt,
      sha256: result.manifest.sha256,
      sourceContractVersion: 2,
      parserVersion: result.manifest.parserVersion,
      readAt: result.manifest.readAt,
    },
    recognizedSuggestions: { academicYear: null, teacherName: null },
    confirmedContext: { academicYearId: confirmed.academicYearId },
    sourceResolution: { mode: 'resolve-or-create' as const },
    sheets,
    diagnostics: [],
  };
  if (!isGradebookImportPersistenceRequestV2(request))
    throw new TypeError('invalid-import-persistence-request');
  return request;
}

export async function persistRecognizedGradebookFileV2(
  result: BatchSuccess,
  confirmed: ConfirmedImportReferencesV2,
  signal?: AbortSignal,
): Promise<GradebookImportPersistenceResponseV2> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createGradebookImportPersistenceRequestV2(result, confirmed)),
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!isGradebookImportPersistenceResponseV2(payload))
    throw new Error('Resposta de persistência incompatível.');
  return payload;
}
