import { useMemo, useState } from 'react';
import {
  importWorkbookBatch,
  validateBatchSize,
  type BatchFailure,
  type BatchProgress,
  type BatchSuccess,
} from './import-batch';
import { loadSheetJs } from './sheetjs-loader';

export function useImportBatch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BatchSuccess[]>([]);
  const [failures, setFailures] = useState<BatchFailure[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progress, setProgress] = useState<BatchProgress | null>(null);

  const selectedWorkbook = useMemo(
    () =>
      results.find((result) => result.id === selectedId)?.summary ?? results[0]?.summary ?? null,
    [results, selectedId],
  );

  const totals = useMemo(
    () => ({
      classes: results.reduce((sum, result) => sum + result.summary.classes.length, 0),
      students: results.reduce(
        (sum, result) =>
          sum +
          result.summary.classes.reduce((classSum, classroom) => classSum + classroom.students, 0),
        0,
      ),
      gradeSheets: results.reduce((sum, result) => sum + result.summary.gradeSheets.length, 0),
    }),
    [results],
  );

  async function handleFiles(fileList: FileList) {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const batchSizeError = validateBatchSize(files);
    if (batchSizeError) {
      setResults([]);
      setFailures([]);
      setSelectedId(null);
      setError(batchSizeError);
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);
    setFailures([]);
    setSelectedId(null);

    try {
      const xlsx = await loadSheetJs();
      const batch = await importWorkbookBatch(files, xlsx, setProgress);
      setResults(batch.successes);
      setFailures(batch.failures);
      setSelectedId(batch.successes[0]?.id ?? null);
      if (batch.successes.length === 0) {
        setError('Nenhuma das planilhas selecionadas pôde ser reconhecida.');
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível carregar o leitor de planilhas.',
      );
    } finally {
      setProgress(null);
      setLoading(false);
    }
  }

  return {
    error,
    failures,
    handleFiles,
    loading,
    progress,
    results,
    selectedId,
    selectedWorkbook,
    setSelectedId,
    totals,
  };
}
