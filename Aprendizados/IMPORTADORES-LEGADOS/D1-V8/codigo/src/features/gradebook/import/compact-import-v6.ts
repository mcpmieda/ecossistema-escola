import type { AcademicYearId } from '../../../../shared/gradebook-contracts/entities';
import type {
  GradebookImportAssessmentDefinitionV6,
  GradebookImportCompactCellV6,
  GradebookImportCourseV6,
  GradebookImportPersistenceRequestV6,
  GradebookImportRecoveryCellsV6,
  GradebookImportRosterV6,
  GradebookImportTermCellsV6,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import type { GradebookImportRecoveryApplicabilityObservationV3 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v3';
import type { GradebookImportResultCellObservationV4 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v4';
import {
  SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2,
  SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2,
  type SourceAssessmentDefinitionV2,
} from '../../../../shared/gradebook-contracts/source/source-contract-v2';
import type { BatchSuccess } from './import-batch';
import type {
  GradeSheetRecognition,
  NoteValue,
  StudentRecognition,
  WorkbookSummary,
} from './spreadsheet-recognizer';
import type {
  CanonicalRosterV6,
  WorkbookSummaryWithCanonicalRostersV6,
} from './canonical-roster-v6';

export type CompactImportProgressStageV6 = 'roster' | 'grades' | 'recovery' | 'compacting';

export interface CompactImportProgressV6 {
  readonly stage: CompactImportProgressStageV6;
  readonly current: number;
  readonly total: number;
}

export interface CompactImportContextV6 {
  readonly academicYearId: AcademicYearId;
  readonly teacherName: string;
}

export interface CompactImportRuntimeV6 {
  readonly onProgress?: (progress: CompactImportProgressV6) => void;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toUpperCase();
}

function summaryWithRosters(summary: WorkbookSummary): WorkbookSummaryWithCanonicalRostersV6 {
  const candidate = summary as WorkbookSummary & {
    readonly canonicalRostersV6?: readonly CanonicalRosterV6[];
  };
  if (!Array.isArray(candidate.canonicalRostersV6)) {
    throw new TypeError('canonical-roster-unavailable');
  }
  return candidate as WorkbookSummaryWithCanonicalRostersV6;
}

function compactNote(value: NoteValue | null): GradebookImportCompactCellV6 | undefined {
  if (!value) return undefined;
  if (value.kind === 'formula') {
    const formula = value.formula?.trim();
    if (!formula) throw new TypeError('formula-observation-invalid');
    return ['f', value.source, value.value, formula];
  }
  return value.source;
}

function compactResultObservation(
  value: GradebookImportResultCellObservationV4,
): GradebookImportCompactCellV6 | undefined {
  switch (value.classification) {
    case 'missing-field':
    case 'empty':
      return undefined;
    case 'manual-positive-number':
    case 'manual-negative-number':
    case 'manual-legacy-zero':
    case 'manual-official-zero-marker':
    case 'invalid-text':
      return value.rawValue === null ? undefined : value.rawValue;
    case 'formula-zero':
    case 'formula-nonzero':
      return ['f', value.rawValue, value.cachedValue, value.formula];
    case 'formula-error-or-missing-cache':
      return value.sourceError
        ? ['f', value.rawValue, null, value.formula, value.sourceError]
        : ['f', value.rawValue, null, value.formula];
  }
}

function compactApplicability(
  value: GradebookImportRecoveryApplicabilityObservationV3,
): GradebookImportCompactCellV6 | undefined {
  switch (value.classification) {
    case 'missing-field':
    case 'empty':
      return undefined;
    case 'numeric':
    case 'unrecognized':
      return value.rawValue === null ? undefined : value.rawValue;
    case 'formula':
      return ['f', value.rawValue, value.cachedValue, value.formula];
  }
}

function configuredMaximum(definition: SourceAssessmentDefinitionV2): number | null {
  const value = definition.maximumConfiguration;
  return value.state === 'numeric' && Number.isFinite(value.rawValue) && value.rawValue > 0
    ? value.rawValue
    : null;
}

function configuredQualitativeName(
  definition: Extract<SourceAssessmentDefinitionV2, { kind: 'qualitative-activity' }>,
): string | null {
  return definition.name.state === 'text' && definition.name.rawValue.trim().length > 0
    ? definition.name.rawValue.trim()
    : null;
}

function observedSlot(sheet: GradeSheetRecognition, index: number, quantitative: boolean): boolean {
  return sheet.students.some((student) =>
    quantitative
      ? student.quantitativeAssessments[index] !== null
      : student.qualitative[index] !== null,
  );
}

function compactDefinitions(sheet: GradeSheetRecognition): readonly GradebookImportAssessmentDefinitionV6[] {
  const result: GradebookImportAssessmentDefinitionV6[] = [];
  for (const definition of sheet.assessmentDefinitions) {
    if (definition.kind === 'quantitative-assessment') {
      const maximum = configuredMaximum(definition);
      if (maximum === null) throw new TypeError(`quantitative-definition-blocked:${definition.sourceSlot}`);
      result.push([definition.sourceSlot, maximum]);
      continue;
    }

    const slotIndex = SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2.findIndex(
      (slot) => slot.sourceSlot === definition.sourceSlot,
    );
    if (slotIndex < 0) throw new TypeError('qualitative-slot-invalid');
    const maximum = configuredMaximum(definition);
    const configuredName = configuredQualitativeName(definition);
    const hasGrade = observedSlot(sheet, slotIndex, false);
    if (maximum === null && configuredName === null && !hasGrade) continue;
    result.push([
      definition.sourceSlot,
      maximum,
      configuredName ?? `Atividade qualitativa ${definition.order}`,
    ]);
  }
  return result;
}

function termStudent(
  sheet: GradeSheetRecognition,
  roster: CanonicalRosterV6,
  position: number,
): StudentRecognition {
  const sourceRow = position + 4;
  const student = sheet.students.find((candidate) => candidate.row === sourceRow);
  const expected = roster.students[position - 1];
  if (!student || !expected || normalize(student.name) !== normalize(expected.name)) {
    throw new TypeError('term-roster-divergent');
  }
  return student;
}

function assignCell<T extends Record<string, GradebookImportCompactCellV6 | undefined>>(
  target: T,
  key: string,
  value: GradebookImportCompactCellV6 | undefined,
): void {
  if (value !== undefined) target[key as keyof T] = value as T[keyof T];
}

function termCells(
  sheet: GradeSheetRecognition,
  student: StudentRecognition,
  definitions: readonly GradebookImportAssessmentDefinitionV6[],
  term: 1 | 2 | 3,
): GradebookImportTermCellsV6 {
  const cells: Record<string, GradebookImportCompactCellV6 | undefined> = {};
  const included = new Set(definitions.map((definition) => definition[0]));
  for (const [index, slot] of SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2.entries()) {
    if (included.has(slot.sourceSlot)) {
      assignCell(cells, slot.sourceSlot, compactNote(student.quantitativeAssessments[index] ?? null));
    }
  }
  for (const [index, slot] of SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2.entries()) {
    if (included.has(slot.sourceSlot)) {
      assignCell(cells, slot.sourceSlot, compactNote(student.qualitative[index] ?? null));
    }
  }
  const observations = student.termResultObservations;
  if (!observations) throw new TypeError('term-result-observation-missing');
  assignCell(cells, 'T', compactResultObservation(observations.quantitativeTotal));
  assignCell(cells, 'Z', compactResultObservation(observations.parallelAssessment));
  assignCell(cells, 'AK', compactResultObservation(observations.qualitativeTotal));
  assignCell(cells, 'AM', compactResultObservation(observations.officialTermGrade));
  if (term === 3) {
    assignCell(cells, 'AN', compactResultObservation(observations.annualAccumulatedTotal));
  }
  return cells;
}

function recoveryCells(student: StudentRecognition): GradebookImportRecoveryCellsV6 {
  const recovery = student.recovery;
  if (!recovery) throw new TypeError('recovery-observation-missing');
  const values = recovery.resultObservations;
  const cells: Record<string, GradebookImportCompactCellV6 | undefined> = {};
  assignCell(cells, 'R', compactResultObservation(values.trimester1));
  assignCell(cells, 'S', compactResultObservation(values.trimester2));
  assignCell(cells, 'T', compactResultObservation(values.trimester3));
  assignCell(cells, 'U', compactResultObservation(values.totalAfterRecovery));
  assignCell(cells, 'X', compactResultObservation(values.originalTrimester1));
  assignCell(cells, 'Y', compactResultObservation(values.originalTrimester2));
  assignCell(cells, 'AA', compactResultObservation(values.originalTrimester3));
  assignCell(cells, 'AB', compactResultObservation(values.originalAnnual));
  assignCell(cells, 'AC', compactApplicability(recovery.applicabilityTrimester1));
  assignCell(cells, 'AD', compactApplicability(recovery.applicabilityTrimester2));
  assignCell(cells, 'AE', compactApplicability(recovery.applicabilityTrimester3));
  return cells;
}

function compactRoster(roster: CanonicalRosterV6): GradebookImportRosterV6 {
  return {
    classGroupLabel: roster.className,
    students: roster.students.map((student) =>
      student.status.trim().length > 0
        ? ([student.position, student.name, student.status.trim()] as const)
        : ([student.position, student.name] as const),
    ),
  };
}

function courseKey(sheet: GradeSheetRecognition): string {
  return JSON.stringify([
    normalize(sheet.className),
    normalize(sheet.discipline),
    sheet.disciplineIndex.toUpperCase(),
  ]);
}

function courseGroups(summary: WorkbookSummary): readonly GradeSheetRecognition[][] {
  const groups = new Map<string, GradeSheetRecognition[]>();
  for (const sheet of summary.gradeSheets) {
    if (sheet.stage === 'overview') continue;
    const key = courseKey(sheet);
    const current = groups.get(key) ?? [];
    current.push(sheet);
    groups.set(key, current);
  }
  return [...groups.values()];
}

function compactCourse(
  sheets: readonly GradeSheetRecognition[],
  roster: CanonicalRosterV6,
): GradebookImportCourseV6 {
  const termSheets = new Map(
    sheets
      .filter((sheet) => sheet.stage.startsWith('trimester-'))
      .map((sheet) => [Number(sheet.stage.at(-1)), sheet]),
  );
  if (termSheets.size !== 3) throw new TypeError('missing-trimester-sheet');
  const first = termSheets.get(1);
  if (!first) throw new TypeError('missing-trimester-sheet');

  const compactTerm = (term: 1 | 2 | 3): GradebookImportCourseV6['terms'][number] => {
    const sheet = termSheets.get(term);
    if (!sheet) throw new TypeError('missing-trimester-sheet');
    const definitions = compactDefinitions(sheet);
    return {
      term,
      sourceSheetName: sheet.name,
      assessmentDefinitions: definitions,
      rows: roster.students.map((source) => {
        const student = termStudent(sheet, roster, source.position);
        return [source.position, termCells(sheet, student, definitions, term)] as const;
      }),
    };
  };
  const terms = [compactTerm(1), compactTerm(2), compactTerm(3)] as const;

  const recoverySheet = sheets.find((sheet) => sheet.stage === 'recovery') ?? null;
  const byName = new Map<string, number>();
  for (const student of roster.students) {
    const key = normalize(student.name);
    if (byName.has(key)) throw new TypeError('duplicate-roster-name');
    byName.set(key, student.position);
  }
  const recovery = recoverySheet
    ? {
        sourceSheetName: recoverySheet.name,
        rows: recoverySheet.students
          .filter((student) => student.row >= 5 && student.row <= 50)
          .map((student) => {
            const position = byName.get(normalize(student.name));
            if (!position) throw new TypeError('unknown-recovery-student');
            return [position, student.row, recoveryCells(student)] as const;
          }),
      }
    : null;

  return {
    classGroupLabel: first.className,
    subjectLabel: first.discipline,
    disciplineIndex: first.disciplineIndex as `D${number}`,
    terms,
    recovery,
  };
}

export function createCompactGradebookImportPersistenceRequestV6(
  result: BatchSuccess,
  context: CompactImportContextV6,
  runtime: CompactImportRuntimeV6 = {},
): GradebookImportPersistenceRequestV6 {
  const summary = summaryWithRosters(result.summary);
  if (!Number.isSafeInteger(summary.academicYear)) throw new TypeError('academic-year-unavailable');
  const teacherName = context.teacherName.trim();
  if (!teacherName) throw new TypeError('teacher-name-unavailable');

  runtime.onProgress?.({ stage: 'roster', current: 0, total: summary.classes.length });
  const rosterByClass = new Map(summary.canonicalRostersV6.map((roster) => [normalize(roster.className), roster]));
  const requiredClasses = new Set(
    summary.gradeSheets
      .filter((sheet) => sheet.stage !== 'overview')
      .map((sheet) => normalize(sheet.className)),
  );
  if (rosterByClass.size !== requiredClasses.size || [...requiredClasses].some((key) => !rosterByClass.has(key))) {
    throw new TypeError('canonical-roster-unavailable');
  }
  const rosters = [...rosterByClass.values()].map((roster, index) => {
    runtime.onProgress?.({ stage: 'roster', current: index + 1, total: rosterByClass.size });
    return compactRoster(roster);
  });

  const groups = courseGroups(summary);
  runtime.onProgress?.({ stage: 'grades', current: 0, total: groups.length });
  const courses = groups.map((sheets, index) => {
    const first = sheets[0];
    if (!first) throw new TypeError('course-empty');
    const roster = rosterByClass.get(normalize(first.className));
    if (!roster) throw new TypeError('canonical-roster-unavailable');
    const course = compactCourse(sheets, roster);
    runtime.onProgress?.({ stage: 'grades', current: index + 1, total: groups.length });
    return course;
  });
  runtime.onProgress?.({ stage: 'recovery', current: groups.length, total: groups.length });
  runtime.onProgress?.({ stage: 'compacting', current: 1, total: 1 });

  return {
    transportVersion: 6,
    operation: 'persist-recognized-file',
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
    recognizedSuggestions: {
      academicYear: summary.academicYear as number,
      teacherName,
    },
    confirmedContext: { academicYearId: context.academicYearId },
    sourceResolution: { mode: 'resolve-or-create' },
    rosters,
    courses,
    diagnostics: [],
  };
}
