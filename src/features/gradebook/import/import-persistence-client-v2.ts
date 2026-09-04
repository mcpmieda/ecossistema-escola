import type {
  AcademicYearId,
  EnrollmentId,
  StudentId,
  TeachingAssignmentId,
} from '../../../../shared/gradebook-contracts/entities';
import {
  GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V4,
  GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V4,
  isGradebookImportPersistenceRequestV4,
  isGradebookImportPersistenceResponseV4,
  type GradebookImportPersistenceRequestV4,
  type GradebookImportPersistenceResponseV4,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v4';
import {
  asGradebookImportPersistenceResponseV5,
  GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V5,
  GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V5,
  isGradebookImportPersistenceRequestV5,
  isGradebookImportPersistenceResponseV5,
  type GradebookImportPersistenceRequestV5,
  type GradebookImportPersistenceResponseV5,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v5';
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
export const IMPORT_PERSISTENCE_REQUEST_TIMEOUT_MS = 45_000;
const IMPORT_PERSISTENCE_REQUEST_ATTEMPTS = 2;

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

export interface ConfirmedImportContextV5 {
  readonly academicYearId: AcademicYearId;
  readonly teacherName: string;
}

export type OfficialRosterInspectionV5 =
  | { readonly status: 'ready'; readonly classes: number; readonly students: number }
  | {
      readonly status: 'review-required';
      readonly reason:
        | 'missing-trimester-roster'
        | 'divergent-trimester-roster'
        | 'divergent-class-roster'
        | 'unknown-recovery-student';
    };

function normalizedLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toUpperCase();
}

function rosterSignature(
  students: readonly BatchSuccess['summary']['gradeSheets'][number]['students'][number][],
): string {
  return JSON.stringify(
    students.map((student) => [Number(student.number), normalizedLabel(student.name)]),
  );
}

export function inspectOfficialRosterV5(result: BatchSuccess): OfficialRosterInspectionV5 {
  const termSheets = result.summary.gradeSheets.filter(
    (sheet) =>
      sheet.stage === 'trimester-1' ||
      sheet.stage === 'trimester-2' ||
      sheet.stage === 'trimester-3',
  );
  const groups = new Map<string, typeof termSheets>();
  for (const sheet of termSheets) {
    const key = JSON.stringify([
      normalizedLabel(sheet.className),
      normalizedLabel(sheet.discipline),
      sheet.disciplineIndex,
    ]);
    const current = groups.get(key) ?? [];
    current.push(sheet);
    groups.set(key, current);
  }
  if (groups.size === 0) return { status: 'review-required', reason: 'missing-trimester-roster' };

  const classRosters = new Map<string, { signature: string; names: Map<string, number> }>();
  for (const sheets of groups.values()) {
    const byTerm = new Map(sheets.map((sheet) => [sheet.stage, sheet]));
    if (
      sheets.length !== 3 ||
      byTerm.size !== 3 ||
      !byTerm.has('trimester-1') ||
      !byTerm.has('trimester-2') ||
      !byTerm.has('trimester-3')
    ) {
      return { status: 'review-required', reason: 'missing-trimester-roster' };
    }
    const first = byTerm.get('trimester-1')!;
    if (
      new Set(first.students.map((student) => Number(student.number))).size !==
      first.students.length
    ) {
      return { status: 'review-required', reason: 'divergent-trimester-roster' };
    }
    const signature = rosterSignature(first.students);
    if (
      rosterSignature(byTerm.get('trimester-2')!.students) !== signature ||
      rosterSignature(byTerm.get('trimester-3')!.students) !== signature
    ) {
      return { status: 'review-required', reason: 'divergent-trimester-roster' };
    }
    const classKey = normalizedLabel(first.className);
    const known = classRosters.get(classKey);
    if (known && known.signature !== signature) {
      return { status: 'review-required', reason: 'divergent-class-roster' };
    }
    if (!known) {
      const names = new Map<string, number>();
      for (const student of first.students) {
        const name = normalizedLabel(student.name);
        names.set(name, (names.get(name) ?? 0) + 1);
      }
      classRosters.set(classKey, { signature, names });
    }
  }

  for (const sheet of result.summary.gradeSheets.filter((value) => value.stage === 'recovery')) {
    const roster = classRosters.get(normalizedLabel(sheet.className));
    if (!roster) return { status: 'review-required', reason: 'unknown-recovery-student' };
    for (const student of sheet.students) {
      if (roster.names.get(normalizedLabel(student.name)) !== 1) {
        return { status: 'review-required', reason: 'unknown-recovery-student' };
      }
    }
  }

  const students = [...classRosters.values()].reduce(
    (total, roster) => total + (JSON.parse(roster.signature) as unknown[]).length,
    0,
  );
  return { status: 'ready', classes: classRosters.size, students };
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

export function createGradebookImportPersistenceRequestV4(
  result: BatchSuccess,
  confirmed: ConfirmedImportReferencesV2,
): GradebookImportPersistenceRequestV4 {
  const sheets = result.summary.gradeSheets.flatMap<
    GradebookImportPersistenceRequestV4['sheets'][number]
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
          students: sheet.students.map((student) => {
            const recovery = student.recovery;
            if (!recovery) throw new TypeError('missing-recovery-observation');
            return {
              sourceRow: student.row,
              confirmedStudent: studentReference(student.row),
              recovery: {
                ...recovery.resultObservations,
                applicabilityTrimester1: recovery.applicabilityTrimester1,
                applicabilityTrimester2: recovery.applicabilityTrimester2,
                applicabilityTrimester3: recovery.applicabilityTrimester3,
              },
            };
          }),
        },
      ];
    const term = Number(sheet.stage.at(-1)) as 1 | 2 | 3;
    return [
      {
        ...common,
        kind: 'term' as const,
        term,
        assessmentDefinitions: sheet.assessmentDefinitions.map(assessmentDefinition),
        students: sheet.students.map((student) => {
          if (!student.termResultObservations)
            throw new TypeError('missing-term-result-observations');
          return {
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
            aggregates: student.termResultObservations,
          };
        }),
      },
    ];
  });
  const request = {
    transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V4,
    operation: GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V4,
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
  if (!isGradebookImportPersistenceRequestV4(request))
    throw new TypeError('invalid-import-persistence-request');
  return request;
}

export async function persistRecognizedGradebookFileV4(
  result: BatchSuccess,
  confirmed: ConfirmedImportReferencesV2,
  signal?: AbortSignal,
): Promise<GradebookImportPersistenceResponseV4> {
  const body = JSON.stringify(createGradebookImportPersistenceRequestV4(result, confirmed));
  let lastFailure: unknown = null;

  for (let attempt = 0; attempt < IMPORT_PERSISTENCE_REQUEST_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) throw signal.reason;
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeout = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, IMPORT_PERSISTENCE_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!isGradebookImportPersistenceResponseV4(payload)) {
        throw new Error('Resposta de persistência incompatível.');
      }
      return payload;
    } catch (cause) {
      lastFailure = cause;
      if (signal?.aborted) throw signal.reason;
      const retryable = timedOut || cause instanceof TypeError;
      if (!retryable || attempt + 1 === IMPORT_PERSISTENCE_REQUEST_ATTEMPTS) break;
    } finally {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  if (
    lastFailure instanceof Error &&
    lastFailure.message === 'Resposta de persistência incompatível.'
  ) {
    throw lastFailure;
  }
  throw new Error(
    'A persistência não respondeu no tempo esperado após uma retomada segura. Recarregue a tela para consultar o estado oficial.',
  );
}

export function createGradebookImportPersistenceRequestV5(
  result: BatchSuccess,
  confirmed: ConfirmedImportContextV5,
): GradebookImportPersistenceRequestV5 {
  const roster = inspectOfficialRosterV5(result);
  if (roster.status !== 'ready') throw new TypeError(roster.reason);
  const academicYear = result.summary.academicYear;
  if (
    !Number.isSafeInteger(academicYear) ||
    Number(academicYear) < 2000 ||
    Number(academicYear) > 9999
  ) {
    throw new TypeError('missing-academic-year-suggestion');
  }
  const teacherName = confirmed.teacherName.trim();
  if (!teacherName) throw new TypeError('missing-teacher-name');

  const sheets = result.summary.gradeSheets.flatMap<
    GradebookImportPersistenceRequestV5['sheets'][number]
  >((sheet) => {
    if (sheet.stage === 'overview') return [];
    const common = {
      sourceSheetName: sheet.name,
      recognizedContext: {
        classGroupLabel: sheet.className,
        subjectLabel: sheet.discipline,
        disciplineIndex: sheet.disciplineIndex as `D${number}`,
      },
    };
    const sourceStudent = (student: (typeof sheet.students)[number]) => ({
      position: Number(student.number),
      label: student.name,
    });
    if (sheet.stage === 'recovery') {
      return [
        {
          ...common,
          kind: 'recovery' as const,
          students: sheet.students.map((student) => {
            const recovery = student.recovery;
            if (!recovery) throw new TypeError('missing-recovery-observation');
            return {
              sourceRow: student.row,
              sourceStudent: sourceStudent(student),
              recovery: {
                ...recovery.resultObservations,
                applicabilityTrimester1: recovery.applicabilityTrimester1,
                applicabilityTrimester2: recovery.applicabilityTrimester2,
                applicabilityTrimester3: recovery.applicabilityTrimester3,
              },
            };
          }),
        },
      ];
    }
    const term = Number(sheet.stage.at(-1)) as 1 | 2 | 3;
    return [
      {
        ...common,
        kind: 'term' as const,
        term,
        assessmentDefinitions: sheet.assessmentDefinitions.map(assessmentDefinition),
        students: sheet.students.map((student) => {
          if (!student.termResultObservations) {
            throw new TypeError('missing-term-result-observations');
          }
          return {
            sourceRow: student.row,
            sourceStudent: sourceStudent(student),
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
            aggregates: student.termResultObservations,
          };
        }),
      },
    ];
  });
  const request = {
    transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V5,
    operation: GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V5,
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
    recognizedSuggestions: { academicYear, teacherName },
    confirmedContext: { academicYearId: confirmed.academicYearId },
    sourceResolution: { mode: 'resolve-or-create' as const },
    sheets,
    diagnostics: [],
  };
  if (!isGradebookImportPersistenceRequestV5(request)) {
    throw new TypeError('invalid-import-persistence-request');
  }
  return request;
}

export function normalizeGradebookImportPersistenceResponseV5(
  value: unknown,
): GradebookImportPersistenceResponseV5 | null {
  if (isGradebookImportPersistenceResponseV5(value)) return value;
  if (!isGradebookImportPersistenceResponseV4(value)) return null;
  if (
    value.state !== 'not-authorized' &&
    value.state !== 'unavailable' &&
    value.state !== 'invalid-request'
  ) {
    return null;
  }
  return asGradebookImportPersistenceResponseV5(value);
}

export async function persistRecognizedGradebookFileV5(
  result: BatchSuccess,
  confirmed: ConfirmedImportContextV5,
  signal?: AbortSignal,
): Promise<GradebookImportPersistenceResponseV5> {
  const body = JSON.stringify(createGradebookImportPersistenceRequestV5(result, confirmed));
  let lastFailure: unknown = null;

  for (let attempt = 0; attempt < IMPORT_PERSISTENCE_REQUEST_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) throw signal.reason;
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeout = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, IMPORT_PERSISTENCE_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      const compatible = normalizeGradebookImportPersistenceResponseV5(payload);
      if (compatible === null) {
        throw new Error('Resposta de persistência incompatível.');
      }
      return compatible;
    } catch (cause) {
      lastFailure = cause;
      if (signal?.aborted) throw signal.reason;
      const retryable = timedOut || cause instanceof TypeError;
      if (!retryable || attempt + 1 === IMPORT_PERSISTENCE_REQUEST_ATTEMPTS) break;
    } finally {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  if (
    lastFailure instanceof Error &&
    lastFailure.message === 'Resposta de persistência incompatível.'
  ) {
    throw lastFailure;
  }
  throw new Error(
    'A persistência não respondeu no tempo esperado após uma retomada segura. Recarregue a tela para consultar o estado oficial.',
  );
}
