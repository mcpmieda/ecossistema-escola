import {
  ACCEPTED_EXTENSIONS,
  fileExtension,
  type SheetJs,
  type WorkbookSummary,
} from './spreadsheet-recognizer';
import { readWorkbook } from './workbook-reader';

export const MAX_NOTES_IMPORT_FILES = 50;

export type BatchSuccess = {
  id: string;
  summary: WorkbookSummary;
};

export type BatchFailure = {
  fileName: string;
  message: string;
};

export type BatchProgress = {
  current: number;
  total: number;
  fileName: string;
};

export type BatchResult = {
  successes: BatchSuccess[];
  failures: BatchFailure[];
};

export function validateBatchSize(files: File[]): string | null {
  return files.length > MAX_NOTES_IMPORT_FILES
    ? `Selecione no máximo ${MAX_NOTES_IMPORT_FILES} planilhas por lote.`
    : null;
}

function workbookId(file: File, index: number): string {
  return `${file.name}:${file.size}:${file.lastModified}:${index}`;
}

export async function importWorkbookBatch(
  files: File[],
  xlsx: SheetJs,
  onProgress: (progress: BatchProgress) => void,
): Promise<BatchResult> {
  const successes: BatchSuccess[] = [];
  const failures: BatchFailure[] = [];

  for (const [index, file] of files.entries()) {
    onProgress({ current: index + 1, total: files.length, fileName: file.name });

    const extension = fileExtension(file.name);
    if (!ACCEPTED_EXTENSIONS.includes(extension as (typeof ACCEPTED_EXTENSIONS)[number])) {
      failures.push({ fileName: file.name, message: 'Formato não suportado.' });
      continue;
    }

    try {
      const summary = await readWorkbook(file, xlsx);
      successes.push({ id: workbookId(file, index), summary });
    } catch (cause) {
      failures.push({
        fileName: file.name,
        message: cause instanceof Error ? cause.message : 'Não foi possível reconhecer a planilha.',
      });
    }
  }

  return { successes, failures };
}
