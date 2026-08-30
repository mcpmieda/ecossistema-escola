import {
  addinContextQuerySchema,
  addinContextResponseSchema,
  type AddinContextMapping,
  type AddinContextQuery,
  type AddinContextResponse,
} from '../../shared/banco-notas-addin-context';
import type { GradeField, GradeValue } from '../../shared/banco-notas-grade-events';
import {
  syncCommitRequestSchema,
  syncPreflightRequestSchema,
  syncResponseSchema,
  type SyncResponse,
} from '../../shared/banco-notas-sync';

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
  cellAddress: string;
  studentLabel: string;
  field: GradeField;
  before: GradeValue;
  beforeAbsent: boolean;
  after: GradeValue;
  afterAbsent: boolean;
  baselineEventId: string;
  baselineSequence: number;
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
  formulaAddresses: ReadonlySet<string> = new Set(),
): ChangeSummary {
  const changes: DetectedChange[] = [];
  const students = new Set<string>();
  let unknownBaselineFields = 0;
  for (const mapping of mappings) {
    if (!mapping.known) {
      unknownBaselineFields += 1;
      continue;
    }
    if (!mapping.baselineEventId || !mapping.baselineSequence) {
      unknownBaselineFields += 1;
      continue;
    }
    const current = normalizedGrade(currentValues.get(mapping.cellAddress));
    if (!sameGrade(mapping.knownValue, mapping.knownAbsent, current)) {
      if (formulaAddresses.has(mapping.cellAddress))
        throw new AddinWorkbookError('workbook_formula_change');
      students.add(mapping.studentLabel);
      changes.push({
        cellAddress: mapping.cellAddress,
        studentLabel: mapping.studentLabel,
        field: mapping.field,
        before: mapping.knownValue,
        beforeAbsent: mapping.knownAbsent,
        after: current.value,
        afterAbsent: current.absent,
        baselineEventId: mapping.baselineEventId,
        baselineSequence: mapping.baselineSequence,
      });
    }
  }
  return {
    changedFields: changes.length,
    affectedStudents: students.size,
    unknownBaselineFields,
    changes,
  };
}

export async function detectWorkbookChanges(
  contextResult: AddinContextResponse,
): Promise<ChangeSummary> {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const ranges = contextResult.mappings.map((mapping) => {
      const range = sheet.getRange(mapping.cellAddress);
      range.load(['values', 'formulas']);
      return { mapping, range };
    });
    await context.sync();
    const values = new Map<string, unknown>();
    const formulas = new Set<string>();
    ranges.forEach(({ mapping, range }) => {
      values.set(mapping.cellAddress, range.values[0]?.[0]);
      const formula = range.formulas[0]?.[0];
      if (typeof formula === 'string' && formula.startsWith('=')) formulas.add(mapping.cellAddress);
    });
    return compareWorkbookValues(contextResult.mappings, values, formulas);
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

async function syncCall(
  path: string,
  args: { accessToken: string; origin: string; body: unknown; fetcher?: typeof fetch },
): Promise<SyncResponse> {
  let response: Response;
  try {
    response = await (args.fetcher ?? fetch)(new URL(path, args.origin), {
      method: 'POST',
      headers: { Authorization: `Bearer ${args.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args.body),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new AddinContextApiError(0, 'network_unknown');
  }
  const payload = (await response.json().catch(() => ({}))) as SyncResponse & { error?: string };
  if (!response.ok) throw new AddinContextApiError(response.status, payload.error ?? 'sync_failed');
  return syncResponseSchema.parse(payload);
}
export function buildSyncPreflight(
  query: AddinContextQuery,
  changes: ChangeSummary,
  requestId = crypto.randomUUID(),
) {
  return syncPreflightRequestSchema.parse({
    schemaVersion: 1,
    requestId,
    workbook: query,
    changes: changes.changes.map((c) => ({
      cellAddress: c.cellAddress,
      field: c.field,
      baselineEventId: c.baselineEventId,
      baselineSequence: c.baselineSequence,
      valueAfter: c.after,
      isAbsent: c.afterAbsent,
    })),
  });
}
export async function preflightSync(args: {
  accessToken: string;
  origin: string;
  request: ReturnType<typeof buildSyncPreflight>;
  fetcher?: typeof fetch;
}) {
  return syncCall('/api/banco-notas/v1/addin/sync/preflight', { ...args, body: args.request });
}
export async function commitSync(args: {
  accessToken: string;
  origin: string;
  request: ReturnType<typeof buildSyncPreflight>;
  preflightFingerprint: string;
  fetcher?: typeof fetch;
}) {
  const body = syncCommitRequestSchema.parse({
    ...args.request,
    preflightFingerprint: args.preflightFingerprint,
  });
  return syncCall('/api/banco-notas/v1/addin/sync/commit', { ...args, body });
}
export async function querySyncOutcome(args: {
  accessToken: string;
  origin: string;
  requestId: string;
  fetcher?: typeof fetch;
}) {
  return syncCall('/api/banco-notas/v1/addin/sync/outcome', {
    ...args,
    body: { requestId: args.requestId },
  });
}
