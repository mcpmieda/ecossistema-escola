import type { SourceFileManifestV1 } from '../../../../shared/gradebook-contracts/imports/import-contract-v1';
import { createSourceFileManifest } from './file-manifest';
import {
  recognizeWorkbook,
  type SheetJs,
  type Workbook,
} from './spreadsheet-recognizer';
import {
  recognizeCanonicalRostersV6,
  type WorkbookSummaryWithCanonicalRostersV6,
} from './canonical-roster-v6';

export const WORKBOOK_READ_OPTIONS = {
  type: 'array',
  cellFormula: true,
  cellText: true,
  cellDates: false,
  cellNF: false,
  cellStyles: false,
  cellHTML: false,
  sheetRows: 50,
  dense: true,
} as const;

export const WORKBOOK_SHEET_SCAN_OPTIONS = {
  type: 'array',
  bookSheets: true,
} as const;

export interface WorkbookReadTimingV1 {
  readonly totalMs: number;
  readonly xlsxReadMs: number;
  readonly sheetScanMs: number;
  readonly sheetParseMs: number;
  readonly totalSheetCount: number;
  readonly selectedSheetCount: number;
  readonly selectiveSheetParse: boolean;
  readonly recognizeWorkbookMs: number;
  readonly canonicalRostersMs: number;
}

type DenseCellV1 = {
  readonly v?: unknown;
  readonly w?: string;
  readonly f?: string;
};

type DenseWorksheetDataV1 = readonly (
  | readonly (DenseCellV1 | undefined)[]
  | undefined
)[];

type DenseWorksheetCarrierV1 = {
  readonly '!data'?: DenseWorksheetDataV1;
  readonly [key: string]: unknown;
};

interface WorkbookParseResultV1 {
  readonly workbook: ReturnType<SheetJs['read']>;
  readonly sheetScanMs: number;
  readonly sheetParseMs: number;
  readonly totalSheetCount: number;
  readonly selectedSheetCount: number;
  readonly selectiveSheetParse: boolean;
}

const denseAddressCacheV1 = new Map<
  string,
  { readonly rowIndex: number; readonly columnIndex: number } | null
>();

function nowMs(): number {
  return typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
}

function elapsedMs(startedAt: number): number {
  return Math.round((nowMs() - startedAt) * 10) / 10;
}

function denseAddressV1(
  address: string,
): { readonly rowIndex: number; readonly columnIndex: number } | null {
  const cached = denseAddressCacheV1.get(address);
  if (cached !== undefined) return cached;

  const match = address.match(/^\$?([A-Z]+)\$?(\d+)$/iu);
  if (!match?.[1] || !match[2]) {
    denseAddressCacheV1.set(address, null);
    return null;
  }

  let column = 0;
  for (const character of match[1].toUpperCase()) {
    column = column * 26 + character.charCodeAt(0) - 64;
  }
  const row = Number(match[2]);
  const resolved =
    Number.isSafeInteger(row) && row > 0 && column > 0
      ? { rowIndex: row - 1, columnIndex: column - 1 }
      : null;
  denseAddressCacheV1.set(address, resolved);
  return resolved;
}

function sparseAddressCompatibleWorksheetV1<T extends object>(sheet: T): T {
  const data = (sheet as unknown as DenseWorksheetCarrierV1)['!data'];
  if (!Array.isArray(data)) return sheet;

  return new Proxy(sheet, {
    get(target, property, receiver) {
      if (typeof property === 'string' && !Reflect.has(target, property)) {
        const location = denseAddressV1(property);
        if (location) return data[location.rowIndex]?.[location.columnIndex];
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

function sparseAddressCompatibleWorkbookV1(
  workbook: ReturnType<SheetJs['read']>,
): ReturnType<SheetJs['read']> {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (sheet) workbook.Sheets[name] = sparseAddressCompatibleWorksheetV1(sheet);
  }
  return workbook;
}

function recognitionSheetNamesV1(
  file: File,
  sheetNames: readonly string[],
  xlsx: SheetJs,
  manifest: SourceFileManifestV1,
): readonly string[] {
  const sheets = Object.fromEntries(sheetNames.map((name) => [name, {}])) as Workbook['Sheets'];
  const nameOnlySummary = recognizeWorkbook(
    file,
    { SheetNames: [...sheetNames], Sheets: sheets },
    xlsx,
    { fileSha256: manifest.sha256 },
  );
  const requiredNames = new Set([
    ...nameOnlySummary.gradeSheets.map((sheet) => sheet.name),
    ...nameOnlySummary.auxiliarySheets,
  ]);
  return sheetNames.filter((name) => requiredNames.has(name));
}

function parseWorkbookV1(
  file: File,
  data: ArrayBuffer,
  xlsx: SheetJs,
  manifest: SourceFileManifestV1,
): WorkbookParseResultV1 {
  let sheetScanMs = 0;
  let totalSheetCount = 0;
  let selectedSheetCount = 0;
  let scanSucceeded = false;
  const scanStartedAt = nowMs();

  try {
    const scan = xlsx.read(data, WORKBOOK_SHEET_SCAN_OPTIONS);
    sheetScanMs = elapsedMs(scanStartedAt);
    scanSucceeded = true;
    const allSheetNames = [...scan.SheetNames];
    totalSheetCount = allSheetNames.length;
    const selectedSheetNames = recognitionSheetNamesV1(file, allSheetNames, xlsx, manifest);
    selectedSheetCount = selectedSheetNames.length;

    if (selectedSheetNames.length > 0 && selectedSheetNames.length < allSheetNames.length) {
      const parseStartedAt = nowMs();
      const parsed = xlsx.read(data, {
        ...WORKBOOK_READ_OPTIONS,
        sheets: selectedSheetNames,
      });
      const sheetParseMs = elapsedMs(parseStartedAt);
      if (selectedSheetNames.some((name) => !parsed.Sheets[name])) {
        throw new Error('selective-sheet-parse-incomplete');
      }
      parsed.SheetNames = allSheetNames;
      return {
        workbook: sparseAddressCompatibleWorkbookV1(parsed),
        sheetScanMs,
        sheetParseMs,
        totalSheetCount,
        selectedSheetCount,
        selectiveSheetParse: true,
      };
    }
  } catch {
    if (sheetScanMs === 0) sheetScanMs = elapsedMs(scanStartedAt);
  }

  const parseStartedAt = nowMs();
  const parsed = sparseAddressCompatibleWorkbookV1(xlsx.read(data, WORKBOOK_READ_OPTIONS));
  const sheetParseMs = elapsedMs(parseStartedAt);
  if (!scanSucceeded || totalSheetCount === 0) {
    totalSheetCount = parsed.SheetNames.length;
    selectedSheetCount = parsed.SheetNames.length;
  }
  return {
    workbook: parsed,
    sheetScanMs,
    sheetParseMs,
    totalSheetCount,
    selectedSheetCount,
    selectiveSheetParse: false,
  };
}

function originalWorksheetDimensions(
  sheet: ReturnType<SheetJs['read']>['Sheets'][string] | undefined,
  xlsx: SheetJs,
): { readonly range: string; readonly rows: number; readonly columns: number } | null {
  const range = sheet?.['!fullref'];
  if (typeof range !== 'string' || range.length === 0) return null;
  try {
    const decoded = xlsx.utils.decode_range(range);
    return {
      range,
      rows: decoded.e.r - decoded.s.r + 1,
      columns: decoded.e.c - decoded.s.c + 1,
    };
  } catch {
    return null;
  }
}

function preserveOriginalWorksheetDimensions(
  summary: ReturnType<typeof recognizeWorkbook>,
  parsed: ReturnType<SheetJs['read']>,
  xlsx: SheetJs,
): ReturnType<typeof recognizeWorkbook> {
  const dimensions = new Map(
    parsed.SheetNames.flatMap((name) => {
      const value = originalWorksheetDimensions(parsed.Sheets[name], xlsx);
      return value ? [[name, value] as const] : [];
    }),
  );
  if (dimensions.size === 0) return summary;
  return {
    ...summary,
    sheets: summary.sheets.map((sheet) => ({ ...sheet, ...dimensions.get(sheet.name) })),
    gradeSheets: summary.gradeSheets.map((sheet) => ({
      ...sheet,
      ...dimensions.get(sheet.name),
    })),
  };
}

export function readWorkbookData(
  file: File,
  data: ArrayBuffer,
  xlsx: SheetJs,
  manifest: SourceFileManifestV1,
  onTiming?: (timing: WorkbookReadTimingV1) => void,
): WorkbookSummaryWithCanonicalRostersV6 {
  const totalStartedAt = nowMs();
  const readStartedAt = nowMs();
  const parsedResult = parseWorkbookV1(file, data, xlsx, manifest);
  const parsed = parsedResult.workbook;
  const xlsxReadMs = elapsedMs(readStartedAt);
  if (parsed.SheetNames.length === 0) {
    throw new Error('A planilha não contém abas reconhecíveis.');
  }

  const recognizeStartedAt = nowMs();
  const recognized = recognizeWorkbook(file, parsed, xlsx, { fileSha256: manifest.sha256 });
  const summary = preserveOriginalWorksheetDimensions(recognized, parsed, xlsx);
  const recognizeWorkbookMs = elapsedMs(recognizeStartedAt);
  if (summary.gradeSheets.length === 0) {
    throw new Error('Nenhuma guia corresponde ao padrão de notas configurado.');
  }

  const rostersStartedAt = nowMs();
  const canonicalRostersV6 = recognizeCanonicalRostersV6(parsed, summary, xlsx);
  const canonicalRostersMs = elapsedMs(rostersStartedAt);
  onTiming?.({
    totalMs: elapsedMs(totalStartedAt),
    xlsxReadMs,
    sheetScanMs: parsedResult.sheetScanMs,
    sheetParseMs: parsedResult.sheetParseMs,
    totalSheetCount: parsedResult.totalSheetCount,
    selectedSheetCount: parsedResult.selectedSheetCount,
    selectiveSheetParse: parsedResult.selectiveSheetParse,
    recognizeWorkbookMs,
    canonicalRostersMs,
  });

  return {
    ...summary,
    canonicalRostersV6,
  };
}

export async function readWorkbook(
  file: File,
  xlsx: SheetJs,
): Promise<WorkbookSummaryWithCanonicalRostersV6> {
  const data = await file.arrayBuffer();
  const manifest = await createSourceFileManifest(file, data, xlsx.version);
  return readWorkbookData(file, data, xlsx, manifest);
}
