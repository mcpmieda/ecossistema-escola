import {
  genericModelInstanceSchema,
  type GenericModelInstance,
} from '../../shared/banco-notas-generic-model';
import {
  genericWorkbookPresentationSchema,
  genericWorkbookPresentationSourceSchema,
  type GenericWorkbookPresentation,
  type GenericWorkbookPresentationSource,
} from '../../shared/banco-notas-workbook-presentation';

const invalidExcelSheetCharacters = new Set(['\\', '/', '*', '?', ':', '[', ']']);
const RESERVED_SHEET_NAME = '_banconotas';
const MAX_SHEET_NAME_LENGTH = 31;

function normalizeSheetNamePart(value: string): string {
  const sanitized = [...value]
    .map((character) => (invalidExcelSheetCharacters.has(character) ? ' ' : character))
    .join('')
    .replace(/\s+/gu, ' ')
    .trim();
  return sanitized || 'Planilha';
}

function truncate(value: string, maximumLength: number): string {
  return value.length <= maximumLength ? value : value.slice(0, maximumLength).trimEnd();
}

function uniqueSheetName(baseInput: string, usedNames: Set<string>): string {
  let base = truncate(normalizeSheetNamePart(baseInput), MAX_SHEET_NAME_LENGTH);
  if (base.toLocaleLowerCase('en-US') === RESERVED_SHEET_NAME) base = 'Planilha Banco';

  for (let attempt = 1; attempt <= 10_000; attempt += 1) {
    const suffix = attempt === 1 ? '' : ` (${attempt})`;
    const candidate = `${truncate(base, MAX_SHEET_NAME_LENGTH - suffix.length)}${suffix}`;
    const normalized = candidate.toLocaleLowerCase('en-US');
    if (normalized !== RESERVED_SHEET_NAME && !usedNames.has(normalized)) {
      usedNames.add(normalized);
      return candidate;
    }
  }
  throw new Error('xlsx_sheet_name_space_exhausted');
}

function validateSourceAgainstInstance(
  instance: GenericModelInstance,
  source: GenericWorkbookPresentationSource,
): void {
  if (source.modelId !== instance.modelId)
    throw new Error('xlsx_presentation_source_model_mismatch');
  if (source.schoolYear !== instance.schoolYear)
    throw new Error('xlsx_presentation_source_year_mismatch');

  const layoutFields = new Set(instance.layout.gradeColumns.map((item) => item.field));
  const sourceFields = new Set(source.gradeHeaders.map((item) => item.field));
  if (
    layoutFields.size !== sourceFields.size ||
    [...layoutFields].some((field) => !sourceFields.has(field))
  ) {
    throw new Error('xlsx_presentation_source_fields_do_not_match_layout');
  }

  const gradeColumns = new Set(instance.layout.gradeColumns.map((item) => item.column));
  if (gradeColumns.has(source.studentPositionColumn)) {
    throw new Error('xlsx_position_column_collides_with_grade_layout');
  }
  if (gradeColumns.has(source.studentNameColumn)) {
    throw new Error('xlsx_student_column_collides_with_grade_layout');
  }

  const expectedSheets = new Set(instance.mappings.map((mapping) => mapping.sheetKey));
  const sourceSheets = new Set(source.sheets.map((sheet) => sheet.sheetKey));
  if (
    expectedSheets.size !== sourceSheets.size ||
    [...expectedSheets].some((sheetKey) => !sourceSheets.has(sheetKey))
  ) {
    throw new Error('xlsx_presentation_source_sheets_do_not_match_instance');
  }

  const sourceBySheet = new Map(source.sheets.map((sheet) => [sheet.sheetKey, sheet]));
  const referencedRows = new Set<string>();
  for (const mapping of instance.mappings) {
    const sheet = sourceBySheet.get(mapping.sheetKey);
    const row = sheet?.rows.find(
      (candidate) => candidate.studentPosition === mapping.studentPosition,
    );
    if (!row || row.gradeKey !== mapping.gradeKey) {
      throw new Error('xlsx_presentation_source_roster_does_not_match_mapping');
    }
    referencedRows.add(`${mapping.sheetKey}::${mapping.studentPosition}`);
  }

  for (const sheet of source.sheets) {
    for (const row of sheet.rows) {
      if (!referencedRows.has(`${sheet.sheetKey}::${row.studentPosition}`)) {
        throw new Error('xlsx_presentation_source_contains_unmapped_roster_row');
      }
    }
  }
}

export function buildGenericWorkbookPresentation(args: {
  instance: GenericModelInstance;
  source: GenericWorkbookPresentationSource;
}): GenericWorkbookPresentation {
  const instance = genericModelInstanceSchema.parse(args.instance);
  const source = genericWorkbookPresentationSourceSchema.parse(args.source);
  validateSourceAgainstInstance(instance, source);

  const usedNames = new Set<string>();
  const sheets = source.sheets
    .slice()
    .sort((left, right) => left.sheetKey.localeCompare(right.sheetKey))
    .map((sheet) => ({
      ...sheet,
      displayName: uniqueSheetName(
        `${sheet.classDisplayName} - ${sheet.componentDisplayName}`,
        usedNames,
      ),
      rows: sheet.rows
        .slice()
        .sort((left, right) => left.studentPosition - right.studentPosition),
    }));

  return genericWorkbookPresentationSchema.parse({
    ...source,
    sheets,
  });
}
