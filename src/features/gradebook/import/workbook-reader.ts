import { recognizeWorkbook, type SheetJs, type WorkbookSummary } from './spreadsheet-recognizer';

export const WORKBOOK_READ_OPTIONS = {
  type: 'array',
  cellDates: true,
  cellFormula: true,
  cellNF: true,
  cellStyles: true,
} as const;

export function readWorkbookData(file: File, data: ArrayBuffer, xlsx: SheetJs): WorkbookSummary {
  const parsed = xlsx.read(data, WORKBOOK_READ_OPTIONS);
  if (parsed.SheetNames.length === 0) {
    throw new Error('A planilha não contém abas reconhecíveis.');
  }

  const summary = recognizeWorkbook(file, parsed, xlsx);
  if (summary.gradeSheets.length === 0) {
    throw new Error('Nenhuma guia corresponde ao padrão de notas configurado.');
  }

  return summary;
}

export async function readWorkbook(file: File, xlsx: SheetJs): Promise<WorkbookSummary> {
  return readWorkbookData(file, await file.arrayBuffer(), xlsx);
}
