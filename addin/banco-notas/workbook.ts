import {
  addinContextQuerySchema,
  addinContextResponseSchema,
  type AddinContextMapping,
  type AddinContextQuery,
  type AddinContextResponse,
} from '../../shared/banco-notas-addin-context';
import type { GradeField, GradeValue } from '../../shared/banco-notas-grade-events';

const metadataSheetName = '_BancoNotas';

export class AddinWorkbookError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'AddinWorkbookError';
  }
}

export class AddinContextApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'AddinContextApiError';
  }
}

type CellValue = string | number | boolean;

export type WorkbookInspection = {
  query: AddinContextQuery;
  activeSheetName: string;
};

export type DetectedChange = {
  studentLabel: string;
  field: GradeField;
  before: GradeValue;
  beforeAbsent: boolean;
  after: GradeValue;
  afterAbsent: boolean;
};

export type ChangeSummary = {
  changedFields: number;
  affectedStudents: number;
  unknownBaselineFields: number;
  changes: DetectedChange[];
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function number(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(text(value));
  if (!Number.isFinite(parsed)) throw new AddinWorkbookError('workbook_metadata_invalid');
  return parsed;
}

export function parseWorkbookMetadata(
  rows: readonly (readonly CellValue[])[],
  activeSheetName: string,
): WorkbookInspection {
  const metadata = new Map<string, CellValue>();
  for (const row of rows.slice(1, 10)) {
    if (row[0] !== undefined && row[1] !== undefined) metadata.set(text(row[0]), row[1]);
  }
  const mapping = rows
    .slice(12)
    .find(
      (row) =>
        text(row[1]).toLocaleLowerCase('pt-BR') === activeSheetName.toLocaleLowerCase('pt-BR'),
    );
  if (!mapping?.[0]) throw new AddinWorkbookError('workbook_sheet_not_mapped');

  try {
    return {
      activeSheetName,
      query: addinContextQuerySchema.parse({
        workbookModelId: text(metadata.get('modelId')),
        sourceHash: text(metadata.get('sourceHash')),
        relationshipSnapshotId: text(metadata.get('relationshipSnapshotId')),
        definitionVersion: text(metadata.get('definitionVersion')),
        layoutVersion: text(metadata.get('layoutVersion')),
        mappingVersion: number(metadata.get('mappingVersion')),
        schoolYear: number(metadata.get('schoolYear')),
        sheetKey: text(mapping[0]),
      }),
    };
  } catch (error) {
    if (error instanceof AddinWorkbookError) throw error;
    throw new AddinWorkbookError('workbook_metadata_invalid');
  }
}

export async function inspectActiveWorkbook(): Promise<WorkbookInspection> {
  return Excel.run(async (context) => {
    const metadata = context.workbook.worksheets.getItemOrNullObject(metadataSheetName);
    const activeSheet = context.workbook.worksheets.getActiveWorksheet();
    metadata.load('isNullObject');
    activeSheet.load('name');
    await context.sync();
    if (metadata.isNullObject) throw new AddinWorkbookError('workbook_metadata_missing');

    const usedRange = metadata.getUsedRangeOrNullObject(true);
    usedRange.load(['isNullObject', 'values']);
    await context.sync();
    if (usedRange.isNullObject) throw new AddinWorkbookError('workbook_metadata_missing');
    return parseWorkbookMetadata(usedRange.values as CellValue[][], activeSheet.name);
  });
}

function normalizedGrade(value: unknown): { value: GradeValue; absent: boolean } {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
    return { value: null, absent: true };
  }
  if (typeof value === 'number' && Number.isFinite(value)) return { value, absent: false };
  const normalized = String(value).trim().slice(0, 120);
  return { value: normalized || null, absent: !normalized };
}

function sameGrade(
  knownValue: GradeValue,
  knownAbsent: boolean,
  current: { value: GradeValue; absent: boolean },
): boolean {
  if (knownAbsent !== current.absent) return false;
  if (knownAbsent) return true;
  return knownValue === current.value;
}

export function compareWorkbookValues(
  mappings: readonly AddinContextMapping[],
  currentValues: ReadonlyMap<string, unknown>,
): ChangeSummary {
  const changes: DetectedChange[] = [];
  const students = new Set<string>();
  let unknownBaselineFields = 0;
  for (const mapping of mappings) {
    if (!mapping.known) {
      unknownBaselineFields += 1;
      continue;
    }
    const current = normalizedGrade(currentValues.get(mapping.cellAddress));
    if (!sameGrade(mapping.knownValue, mapping.knownAbsent, current)) {
      students.add(mapping.studentLabel);
      changes.push({
        studentLabel: mapping.studentLabel,
        field: mapping.field,
        before: mapping.knownValue,
        beforeAbsent: mapping.knownAbsent,
        after: current.value,
        afterAbsent: current.absent,
      });
    }
  }
  return {
    changedFields: changes.length,
    affectedStudents: students.size,
    unknownBaselineFields,
    changes: changes.slice(0, 25),
  };
}

export async function detectWorkbookChanges(
  contextResult: AddinContextResponse,
): Promise<ChangeSummary> {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const ranges = contextResult.mappings.map((mapping) => {
      const range = sheet.getRange(mapping.cellAddress);
      range.load('values');
      return { mapping, range };
    });
    await context.sync();
    const values = new Map<string, unknown>();
    ranges.forEach(({ mapping, range }) => values.set(mapping.cellAddress, range.values[0]?.[0]));
    return compareWorkbookValues(contextResult.mappings, values);
  });
}

export async function fetchAddinContext(args: {
  accessToken: string;
  query: AddinContextQuery;
  origin: string;
  fetcher?: typeof fetch;
}): Promise<AddinContextResponse> {
  const endpoint = new URL('/api/banco-notas/v1/addin/context', args.origin);
  Object.entries(args.query).forEach(([key, value]) =>
    endpoint.searchParams.set(key, String(value)),
  );
  let response: Response;
  try {
    response = await (args.fetcher ?? fetch)(endpoint, {
      method: 'GET',
      headers: { Authorization: `Bearer ${args.accessToken}` },
      cache: 'no-store',
    });
  } catch {
    throw new AddinContextApiError(0, 'network_unavailable');
  }
  const payload = (await response.json().catch(() => ({}))) as { error?: unknown };
  if (!response.ok) {
    throw new AddinContextApiError(
      response.status,
      typeof payload.error === 'string' ? payload.error : 'addin_context_failed',
    );
  }
  return addinContextResponseSchema.parse(payload);
}
