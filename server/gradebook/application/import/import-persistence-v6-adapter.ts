import {
  SNAPSHOT_UNAVAILABLE_INTERNAL_V5,
  normalizeSnapshotScalarV5,
  type SnapshotObservationV5,
} from '../../../../shared/gradebook-contracts/source/source-values-contract-v5';
import type {
  GradebookImportAssessmentDefinitionV1,
  GradebookImportRecognizedNoteV1,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v1';
import type { GradebookImportRecoveryApplicabilityObservationV3 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v3';
import type { GradebookImportResultCellObservationV4 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v4';
import type {
  GradebookImportPersistenceRequestV5,
  GradebookImportSourceStudentV5,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v5';
import type {
  GradebookImportCompactCellV6,
  GradebookImportCompactFormulaCellV6,
  GradebookImportPersistenceRequestV6,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import {
  SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2,
  SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2,
} from '../../../../shared/gradebook-contracts/source/source-contract-v2';

function isFormula(
  value: GradebookImportCompactCellV6,
): value is GradebookImportCompactFormulaCellV6 {
  return Array.isArray(value) && value[0] === 'f';
}

function resultObservation(
  value: GradebookImportCompactCellV6 | undefined,
  snapshotValues = false,
): GradebookImportResultCellObservationV4 {
  if (snapshotValues) {
    if (value === SNAPSHOT_UNAVAILABLE_INTERNAL_V5)
      return {
        classification: 'empty',
        rawValue: null,
        snapshotState: 'unavailable',
      } as GradebookImportResultCellObservationV4 & SnapshotObservationV5;
    const scalar =
      value === undefined ? null : normalizeSnapshotScalarV5(value as number | string | boolean);
    return {
      ...resultObservation(scalar === null || scalar === 0 ? undefined : scalar),
      snapshotState: 'value',
    } as GradebookImportResultCellObservationV4 & SnapshotObservationV5;
  }
  if (value === undefined) return { classification: 'empty', rawValue: null };
  if (isFormula(value)) {
    const [, rawValue, cachedValue, formula] = value;
    const sourceError = value.length === 5 ? value[4] : null;
    if (cachedValue === null) {
      return {
        classification: 'formula-error-or-missing-cache',
        rawValue,
        formula,
        cachedValue: null,
        sourceError,
      };
    }
    return cachedValue === 0
      ? { classification: 'formula-zero', rawValue, formula, cachedValue: 0 }
      : { classification: 'formula-nonzero', rawValue, formula, cachedValue };
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return { classification: 'invalid-text', rawValue: String(value) };
  }
  if (value === 0.1) return { classification: 'manual-official-zero-marker', rawValue: 0.1 };
  if (value === 0) return { classification: 'manual-legacy-zero', rawValue: 0 };
  return value < 0
    ? { classification: 'manual-negative-number', rawValue: value }
    : { classification: 'manual-positive-number', rawValue: value };
}

function recognizedNote(
  value: GradebookImportCompactCellV6 | undefined,
  snapshotValues = false,
): GradebookImportRecognizedNoteV1 | null | 'invalid' {
  if (snapshotValues) {
    if (value === SNAPSHOT_UNAVAILABLE_INTERNAL_V5)
      return {
        kind: 'manual',
        source: 0,
        value: 0,
        snapshotState: 'unavailable',
      } as GradebookImportRecognizedNoteV1 & SnapshotObservationV5;
    const scalar =
      value === undefined ? null : normalizeSnapshotScalarV5(value as number | string | boolean);
    if (scalar === null || scalar === 0) return null;
    const note = recognizedNote(scalar);
    return note && note !== 'invalid'
      ? ({ ...note, snapshotState: 'value' } as GradebookImportRecognizedNoteV1 &
          SnapshotObservationV5)
      : note;
  }
  if (value === undefined) return null;
  if (isFormula(value)) {
    const [, , cachedValue, formula] = value;
    if (cachedValue === null || cachedValue === 0) return null;
    return { kind: 'formula', source: cachedValue, value: cachedValue, formula };
  }
  if (typeof value !== 'number') return 'invalid';
  if (value === 0.1) return { kind: 'official-zero', source: 0.1, value: 0 };
  if (value === 0) return { kind: 'legacy-zero', source: 0, value: 0 };
  if (value < 0) return { kind: 'negative', source: value, value };
  return { kind: 'manual', source: value, value };
}

function applicability(
  value: GradebookImportCompactCellV6 | undefined,
): GradebookImportRecoveryApplicabilityObservationV3 {
  if (value === undefined) return { classification: 'empty', rawValue: null };
  if (isFormula(value)) {
    const [, rawValue, cachedValue, formula] = value;
    return { classification: 'formula', rawValue, formula, cachedValue };
  }
  if (typeof value === 'number') return { classification: 'numeric', rawValue: value };
  return { classification: 'unrecognized', rawValue: value };
}

function definition(
  value: GradebookImportPersistenceRequestV6['courses'][number]['terms'][number]['assessmentDefinitions'][number],
): GradebookImportAssessmentDefinitionV1 {
  const [sourceSlot, maximum] = value;
  const maximumConfiguration =
    maximum === null
      ? ({ state: 'ambiguous-empty', rawValue: null } as const)
      : ({ state: 'numeric', rawValue: maximum } as const);
  if (SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2.some((slot) => slot.sourceSlot === sourceSlot)) {
    if (maximum === null) throw new TypeError('quantitative-definition-invalid');
    return { sourceSlot: sourceSlot as 'R' | 'S', maximumConfiguration };
  }
  const name = value.length === 3 ? value[2] : null;
  return {
    sourceSlot: sourceSlot as (typeof SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2)[number]['sourceSlot'],
    maximumConfiguration,
    name: name === null ? { state: 'missing-field' } : { state: 'text', rawValue: name },
  };
}

export function expandGradebookImportPersistenceRequestV6(
  request: GradebookImportPersistenceRequestV6,
  snapshotValues = false,
): GradebookImportPersistenceRequestV5 | null {
  try {
    const rosterByClass = new Map(
      request.rosters.map((roster) => [
        roster.classGroupLabel.trim().toUpperCase(),
        new Map<number, GradebookImportSourceStudentV5>(
          roster.students.map((student) => [
            student[0],
            { position: student[0], label: student[1] },
          ]),
        ),
      ]),
    );
    const sheets: GradebookImportPersistenceRequestV5['sheets'][number][] = [];

    for (const course of request.courses) {
      const roster = rosterByClass.get(course.classGroupLabel.trim().toUpperCase());
      if (!roster) return null;
      const recognizedContext = {
        classGroupLabel: course.classGroupLabel,
        subjectLabel: course.subjectLabel,
        disciplineIndex: course.disciplineIndex,
      };

      for (const term of course.terms) {
        const assessmentDefinitions = term.assessmentDefinitions.map(definition);
        const definitionSlots = new Set(
          term.assessmentDefinitions.map((candidate) => candidate[0]),
        );
        const students = [];
        for (const row of term.rows) {
          const sourceStudent = roster.get(row[0]);
          if (!sourceStudent) return null;
          const assessmentValues = [];
          for (const slot of [
            ...SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2,
            ...SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2,
          ]) {
            if (!definitionSlots.has(slot.sourceSlot)) continue;
            const note = recognizedNote(row[1][slot.sourceSlot], snapshotValues);
            if (note === 'invalid') return null;
            if (note) assessmentValues.push({ sourceSlot: slot.sourceSlot, value: note });
          }
          students.push({
            sourceRow: row[0] + 4,
            sourceStudent,
            assessmentValues,
            aggregates: {
              quantitativeTotal: resultObservation(row[1].T, snapshotValues),
              parallelAssessment: resultObservation(row[1].Z, snapshotValues),
              qualitativeTotal: resultObservation(row[1].AK, snapshotValues),
              officialTermGrade: resultObservation(row[1].AM, snapshotValues),
              annualAccumulatedTotal: resultObservation(
                term.term === 3 ? row[1].AN : undefined,
                snapshotValues,
              ),
            },
          });
        }
        sheets.push({
          kind: 'term',
          sourceSheetName: term.sourceSheetName,
          term: term.term,
          recognizedContext,
          assessmentDefinitions,
          students,
        });
      }

      if (course.recovery) {
        const students = [];
        for (const row of course.recovery.rows) {
          const sourceStudent = roster.get(row[0]);
          if (!sourceStudent) return null;
          const values = row[2];
          students.push({
            sourceRow: row[1],
            sourceStudent,
            recovery: {
              trimester1: resultObservation(values.R, snapshotValues),
              trimester2: resultObservation(values.S, snapshotValues),
              trimester3: resultObservation(values.T, snapshotValues),
              totalAfterRecovery: resultObservation(values.U, snapshotValues),
              originalTrimester1: resultObservation(values.X, snapshotValues),
              originalTrimester2: resultObservation(values.Y, snapshotValues),
              originalTrimester3: resultObservation(values.AA, snapshotValues),
              originalAnnual: resultObservation(values.AB, snapshotValues),
              applicabilityTrimester1: applicability(values.AC),
              applicabilityTrimester2: applicability(values.AD),
              applicabilityTrimester3: applicability(values.AE),
            },
          });
        }
        sheets.push({
          kind: 'recovery',
          sourceSheetName: course.recovery.sourceSheetName,
          recognizedContext,
          students,
        });
      }
    }

    return {
      transportVersion: 5,
      operation: request.operation,
      manifest: request.manifest,
      recognizedSuggestions: request.recognizedSuggestions,
      confirmedContext: request.confirmedContext,
      sourceResolution: request.sourceResolution,
      sheets,
      diagnostics: [],
    };
  } catch {
    return null;
  }
}
