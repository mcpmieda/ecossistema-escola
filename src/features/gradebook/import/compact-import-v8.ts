import type { GradebookImportCompactCellV6 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import type {
  GradebookImportPersistenceRequestV8,
  GradebookSnapshotCellV8,
  GradebookSnapshotCellsV8,
  GradebookSnapshotCourseV8,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v8';
import {
  normalizeSnapshotScalarV5,
  SOURCE_VALUES_POLICY_V5,
} from '../../../../shared/gradebook-contracts/source/source-values-contract-v5';
import {
  createCompactGradebookImportPersistenceRequestV6,
  type CompactImportContextV6,
  type CompactImportRuntimeV6,
} from './compact-import-v6';
import type { BatchSuccess } from './import-batch';

/** Materialized values only. A missing formula cache remains an explicit unavailable marker. */
export function normalizeSnapshotCellV8(
  value: GradebookSnapshotCellV8 | undefined,
  flag = false,
): GradebookSnapshotCellV8 | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return ['u'];
  const normalized = normalizeSnapshotScalarV5(value as number | string | boolean);
  return normalized === null || (!flag && normalized === 0) ? undefined : normalized;
}
function legacyCell(
  value: GradebookImportCompactCellV6 | undefined,
): GradebookSnapshotCellV8 | undefined {
  if (!Array.isArray(value)) return value as number | string | boolean | undefined;
  return value[2] === null ? ['u'] : value[2];
}

export function createGradebookValuesSnapshotV8(
  result: BatchSuccess,
  context: CompactImportContextV6,
  runtime: CompactImportRuntimeV6 = {},
): GradebookImportPersistenceRequestV8 {
  // Reuse the existing layout, roster identity and configured-slot validation. Its
  // intermediate formula strings never leave this function in the values protocol.
  const original = createCompactGradebookImportPersistenceRequestV6(result, context, runtime);
  const sheets = new Map(result.summary.gradeSheets.map((sheet) => [sheet.name, sheet]));
  const rowCells = (
    name: string,
    row: number,
    keys: readonly string[],
    fallback: Readonly<Record<string, GradebookImportCompactCellV6 | undefined>>,
    recovery: boolean,
  ): GradebookSnapshotCellsV8 => {
    const captured = sheets.get(name)?.snapshotCellsV8;
    const cells: Record<string, GradebookSnapshotCellV8> = {};
    for (const key of keys) {
      const raw = captured ? captured[`${key}${row}`] : legacyCell(fallback[key]);
      const value = normalizeSnapshotCellV8(raw, recovery && ['AC', 'AD', 'AE'].includes(key));
      if (value !== undefined) cells[key] = value;
    }
    return cells;
  };
  const courses: GradebookSnapshotCourseV8[] = original.courses.map((course) => ({
    ...course,
    terms: course.terms.map((term) => ({
      ...term,
      rows: term.rows.map(
        ([position, values]) =>
          [
            position,
            rowCells(
              term.sourceSheetName,
              position + 4,
              [
                ...term.assessmentDefinitions.map((d) => d[0]),
                'T',
                'Z',
                'AK',
                'AM',
                ...(term.term === 3 ? ['AN'] : []),
              ],
              values,
              false,
            ),
          ] as const,
      ),
    })) as unknown as GradebookSnapshotCourseV8['terms'],
    recovery: course.recovery
      ? {
          ...course.recovery,
          rows: course.recovery.rows.map(
            ([position, row, values]) =>
              [
                position,
                row,
                rowCells(
                  course.recovery!.sourceSheetName,
                  row,
                  ['R', 'S', 'T', 'U', 'X', 'Y', 'AA', 'AB', 'AC', 'AD', 'AE'],
                  values,
                  true,
                ),
              ] as const,
          ),
        }
      : null,
  }));
  return {
    ...original,
    transportVersion: 8,
    valuePolicy: SOURCE_VALUES_POLICY_V5,
    manifest: {
      ...original.manifest,
      parserVersion: gradebookValuesParserVersionV8(original.manifest.parserVersion),
    },
    courses,
  };
}

export function gradebookValuesParserVersionV8(parserVersion: string): string {
  return `${parserVersion.slice(0, 100)}:values-v2`;
}
