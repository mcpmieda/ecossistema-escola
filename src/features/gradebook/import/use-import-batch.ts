import { useMemo, useRef, useState } from 'react';
import {
  importWorkbookBatch,
  validateBatchSize,
  type BatchFailureDetail,
  type BatchProgress,
  type BatchSuccess,
} from './import-batch';
import { loadSheetJs } from './sheetjs-loader';
import {
  persistRecognizedGradebookFileV5,
  type ConfirmedImportContextV5,
} from './import-persistence-client-v2';
import type { GradebookImportPersistenceResponseV5 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v5';

export type ImportPersistenceStateV5 =
  | { readonly state: 'recognized' | 'ready' | 'persisting' }
  | { readonly state: 'completed'; readonly response: GradebookImportPersistenceResponseV5 }
  | { readonly state: 'failed'; readonly message: string };

export function useImportBatch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BatchSuccess[]>([]);
  const [failures, setFailures] = useState<BatchFailureDetail[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [persistence, setPersistence] = useState<Record<string, ImportPersistenceStateV5>>({});
  const persistenceLock = useRef(false);

  const selectedResult = useMemo(
    () => results.find((result) => result.id === selectedId) ?? results[0] ?? null,
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
    setPersistence({});

    try {
      const xlsx = await loadSheetJs();
      const batch = await importWorkbookBatch(files, xlsx, () => undefined, {
        onStageProgress: setProgress,
      });
      setResults(batch.successes);
      setPersistence(
        Object.fromEntries(batch.successes.map((result) => [result.id, { state: 'recognized' }])),
      );
      setFailures(batch.failureDetails);
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

  function markReady(id: string, ready: boolean) {
    setPersistence((current) => ({ ...current, [id]: { state: ready ? 'ready' : 'recognized' } }));
  }

  async function persist(result: BatchSuccess, references: ConfirmedImportContextV5) {
    if (persistenceLock.current) return;
    persistenceLock.current = true;
    setPersistence((current) => ({ ...current, [result.id]: { state: 'persisting' } }));
    try {
      const response = await persistRecognizedGradebookFileV5(result, references);
      setPersistence((current) => ({ ...current, [result.id]: { state: 'completed', response } }));
    } catch (cause) {
      setPersistence((current) => ({
        ...current,
        [result.id]: {
          state: 'failed',
          message: cause instanceof Error ? cause.message : 'Persistência indisponível.',
        },
      }));
    } finally {
      persistenceLock.current = false;
    }
  }

  return {
    error,
    failures,
    handleFiles,
    loading,
    progress,
    persistence,
    persistenceBusy: Object.values(persistence).some((value) => value.state === 'persisting'),
    persist,
    markReady,
    results,
    selectedId,
    selectedResult,
    setSelectedId,
    totals,
  };
}
