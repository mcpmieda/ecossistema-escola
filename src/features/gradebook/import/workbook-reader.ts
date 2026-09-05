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

export function readWorkbookData(
  file: File,
  data: ArrayBuffer,
  xlsx: SheetJs,
  manifest: SourceFileManifestV1,
): WorkbookSummaryWithCanonicalRostersV6 {
  const parsed = xlsx.read(data, WORKBOOK_READ_OPTIONS);
  if (parsed.SheetNames.length === 0) {
    throw new Error('A planilha não contém abas reconhecíveis.');
  }

  const summary = recognizeWorkbook(file, parsed, xlsx, { fileSha256: manifest.sha256 });
  if (summary.gradeSheets.length === 0) {
    throw new Error('Nenhuma guia corresponde ao padrão de notas configurado.');
  }

  return {
    ...summary,
    canonicalRostersV6: recognizeCanonicalRostersV6(parsed, summary, xlsx),
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
