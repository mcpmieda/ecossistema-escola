import type { SourceFileManifestV1 } from '../../../../shared/gradebook-contracts/imports/import-contract-v1';
import { createSourceFileManifest } from './file-manifest';
import { recognizeWorkbook, type SheetJs } from './spreadsheet-recognizer';
import {
  recognizeCanonicalRostersV6,
  type WorkbookSummaryWithCanonicalRostersV6,
} from './canonical-roster-v6';

export const WORKBOOK_READ_OPTIONS = {
  type: 'array',
  cellDates: true,
  cellFormula: true,
  cellNF: true,
  cellStyles: true,
} as const;

export interface WorkbookReadTimingV1 {
  readonly totalMs: number;
  readonly xlsxReadMs: number;
  readonly recognizeWorkbookMs: number;
  readonly canonicalRostersMs: number;
}

function nowMs(): number {
  return typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
}

function elapsedMs(startedAt: number): number {
  return Math.round((nowMs() - startedAt) * 10) / 10;
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
  const parsed = xlsx.read(data, WORKBOOK_READ_OPTIONS);
  const xlsxReadMs = elapsedMs(readStartedAt);
  if (parsed.SheetNames.length === 0) {
    throw new Error('A planilha não contém abas reconhecíveis.');
  }

  const recognizeStartedAt = nowMs();
  const summary = recognizeWorkbook(file, parsed, xlsx, { fileSha256: manifest.sha256 });
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
