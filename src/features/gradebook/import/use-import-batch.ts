import { useEffect, useMemo, useRef, useState } from 'react';
import type { GradebookImportPersistenceResponseV5 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v5';
import type { GradebookImportPersistenceResponseV6 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import type {
  GradebookImportPersistenceRequestV9,
  GradebookImportPersistenceResponseV9,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v9';
import {
  countWorkbookOperationalClassesV1,
  importWorkbookBatch,
  validateBatchSize,
  type BatchFailureDetail,
  type BatchSuccess,
  type ImportWorkbookFileTimingV1,
} from './import-batch';
import { loadSheetJs, preloadSheetJs } from './sheetjs-loader';
import {
  createGradebookCanonicalImportRequestV9,
  unavailableCellsV9,
} from './canonical-import-v9';
import { persistGradebookCanonicalImportV9 } from './import-persistence-client-v9';
import type { MasterRelationRecognitionV9 } from './master-relation-v9';

export type ImportPersistenceStateV5 =
  | { readonly state: 'recognized' | 'ready' | 'persisting' }
  | { readonly state: 'completed'; readonly response: GradebookImportPersistenceResponseV5 }
  | { readonly state: 'failed'; readonly message: string };

export type ImportPersistenceResponseV6Compatible =
  | GradebookImportPersistenceResponseV6
  | GradebookImportPersistenceResponseV9;

export type ImportPersistenceStateV6 =
  | { readonly state: 'recognized' | 'processing' | 'persisting' | 'auth-required' }
  | { readonly state: 'completed'; readonly response: ImportPersistenceResponseV6Compatible }
  | { readonly state: 'failed' | 'confirmation-required'; readonly message: string };

export type ImportFlowProgressStageV6 =
  | 'preparing'
  | 'recognizing'
  | 'roster'
  | 'grades'
  | 'recovery'
  | 'compacting'
  | 'saving'
  | 'completed';

export interface ImportFlowProgressV6 {
  readonly current: number;
  readonly total: number;
  readonly fileName: string;
  readonly stage: ImportFlowProgressStageV6;
}

type ImportPersistenceRunResultV1 =
  | 'completed'
  | 'auth-required'
  | 'confirmation-required'
  | 'blocked';
type PreparedPersistenceV9 = {
  readonly result: BatchSuccess;
  readonly request: GradebookImportPersistenceRequestV9;
};

type SummaryWithRelationV9 = BatchSuccess['summary'] & {
  readonly masterRelationV9?: MasterRelationRecognitionV9;
};

export const GRADEBOOK_IMPORT_FILE_CONCURRENCY_V1 = 4;

function failureMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function nowMs(): number {
  return typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
}

function elapsedMs(startedAt: number): number {
  return Math.round((nowMs() - startedAt) * 10) / 10;
}

function diagnosticLine(prefix: string, value: unknown): string {
  return `${prefix} ${JSON.stringify(value)}`;
}

function isMasterRelationResult(result: BatchSuccess): boolean {
  return Boolean((result.summary as SummaryWithRelationV9).masterRelationV9);
}

export function isGradebookImportAuthorizationRequiredV1(
  response: ImportPersistenceResponseV6Compatible,
): boolean {
  return response.state === 'not-authorized';
}

export function selectPendingGradebookImportResultsV1(
  successes: readonly BatchSuccess[],
  persistence: Readonly<Record<string, ImportPersistenceStateV6>>,
): readonly BatchSuccess[] {
  return successes.filter((result) => {
    const state = persistence[result.id];
    return (
      state?.state === 'recognized' ||
      state?.state === 'auth-required' ||
      state?.state === 'confirmation-required'
    );
  });
}

export function useImportBatch() {
  const inFlight = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BatchSuccess[]>([]);
  const [failures, setFailures] = useState<BatchFailureDetail[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportFlowProgressV6 | null>(null);
  const [persistence, setPersistence] = useState<Record<string, ImportPersistenceStateV6>>({});
  const [timingDiagnostics, setTimingDiagnostics] = useState<string[]>([]);
  const [sourceValueWarnings, setSourceValueWarnings] = useState<Record<string, number>>({});

  useEffect(() => {
    preloadSheetJs();
  }, []);

  function appendTiming(prefix: string, value: unknown): void {
    const serialized = JSON.stringify(value);
    console.info(prefix, serialized);
    setTimingDiagnostics((current) => [...current.slice(-49), diagnosticLine(prefix, value)]);
  }

  const selectedResult = useMemo(
    () => results.find((result) => result.id === selectedId) ?? results[0] ?? null,
    [results, selectedId],
  );

  const totals = useMemo(
    () => ({
      classes: results.reduce((sum, result) => {
        const relation = (result.summary as SummaryWithRelationV9).masterRelationV9;
        return sum + (relation?.turmas.length ?? countWorkbookOperationalClassesV1(result.summary));
      }, 0),
      students: results.reduce((sum, result) => {
        const relation = (result.summary as SummaryWithRelationV9).masterRelationV9;
        return (
          sum +
          (relation
            ? relation.turmas.reduce((classSum, turma) => classSum + turma.alunos.length, 0)
            : result.summary.classes.reduce((classSum, classroom) => classSum + classroom.students, 0))
        );
      }, 0),
      gradeSheets: results.reduce((sum, result) => sum + result.summary.gradeSheets.length, 0),
    }),
    [results],
  );

  const authorizationRequired = useMemo(
    () => Object.values(persistence).some((value) => value.state === 'auth-required'),
    [persistence],
  );

  const pendingPersistenceCount = useMemo(
    () => selectPendingGradebookImportResultsV1(results, persistence).length,
    [results, persistence],
  );

  function markAuthorizationRequired(result: BatchSuccess): void {
    setPersistence((current) => ({ ...current, [result.id]: { state: 'auth-required' } }));
    setProgress(null);
  }

  function preparePersistenceRequest(result: BatchSuccess): PreparedPersistenceV9 | null {
    setPersistence((current) => ({ ...current, [result.id]: { state: 'processing' } }));
    const compactStartedAt = nowMs();
    try {
      const request = createGradebookCanonicalImportRequestV9(result, {
        onProgress: (value) => setProgress({ ...value, fileName: result.manifest.fileName }),
      });
      const unavailableCells = unavailableCellsV9(request);
      setSourceValueWarnings((current) => ({ ...current, [result.id]: unavailableCells }));
      appendTiming('[gradebook-import-browser-timing]', {
        version: 2,
        stage: 'canonical-file',
        operation: request.operation,
        unavailableCells,
        payloadBytes: new TextEncoder().encode(JSON.stringify(request)).byteLength,
        totalMs: elapsedMs(compactStartedAt),
        offerCount: request.operation === 'persist-notas' ? request.ofertas.length : 0,
        classCount: request.operation === 'persist-relacao' ? request.turmas.length : 0,
      });
      return { result, request };
    } catch (cause) {
      const message = failureMessage(cause, 'Não foi possível preparar esta planilha.');
      setPersistence((current) => ({ ...current, [result.id]: { state: 'failed', message } }));
      return null;
    }
  }

  async function persistPreparedSingle(
    prepared: PreparedPersistenceV9,
    index: number,
    total: number,
  ): Promise<ImportPersistenceRunResultV1> {
    const { result, request } = prepared;
    setPersistence((current) => ({ ...current, [result.id]: { state: 'persisting' } }));
    setProgress({ current: index, total, fileName: result.manifest.fileName, stage: 'saving' });
    const startedAt = nowMs();
    let response: GradebookImportPersistenceResponseV9;
    try {
      const persisted = await persistGradebookCanonicalImportV9(request);
      response = persisted.response;
      appendTiming('[gradebook-import-client-timing]', {
        version: 2,
        mode: 'canonical-v9',
        operation: request.operation,
        index,
        total,
        totalMs: elapsedMs(startedAt),
        serverMs: persisted.serverMs,
        state: response.state,
        attempts: 1,
      });
    } catch (cause) {
      const message = failureMessage(cause, 'Gravação sem confirmação.');
      setPersistence((current) => ({
        ...current,
        [result.id]: { state: 'confirmation-required', message },
      }));
      return 'confirmation-required';
    }
    if (isGradebookImportAuthorizationRequiredV1(response)) {
      markAuthorizationRequired(result);
      return 'auth-required';
    }
    if (response.state === 'unavailable') {
      const message = 'Não foi possível confirmar a gravação desta planilha.';
      setPersistence((current) => ({
        ...current,
        [result.id]: { state: 'confirmation-required', message },
      }));
      return 'confirmation-required';
    }
    setPersistence((current) => ({ ...current, [result.id]: { state: 'completed', response } }));
    return response.state === 'blocked' || response.state === 'conflict' || response.state === 'invalid-request'
      ? 'blocked'
      : 'completed';
  }

  async function persistPreparedFiles(prepared: readonly PreparedPersistenceV9[]): Promise<ImportPersistenceRunResultV1> {
    const ordered = [
      ...prepared.filter((value) => value.request.operation === 'persist-relacao'),
      ...prepared.filter((value) => value.request.operation === 'persist-notas'),
    ];
    const relations = ordered.filter((value) => value.request.operation === 'persist-relacao');
    let completed = 0;
    for (const value of relations) {
      const status = await persistPreparedSingle(value, completed, ordered.length);
      if (status !== 'completed') return status;
      completed++;
    }

    const notes = ordered.filter((value) => value.request.operation === 'persist-notas');
    let cursor = 0;
    let stop: ImportPersistenceRunResultV1 | null = null;
    const workers = Array.from(
      { length: Math.min(GRADEBOOK_IMPORT_FILE_CONCURRENCY_V1, notes.length) },
      async () => {
        while (stop === null) {
          const position = cursor++;
          const value = notes[position];
          if (!value) return;
          const status = await persistPreparedSingle(value, relations.length + position, ordered.length);
          if (status === 'auth-required' || status === 'confirmation-required') {
            stop = status;
            return;
          }
          completed++;
          setProgress({
            current: completed,
            total: ordered.length,
            fileName: value.result.manifest.fileName,
            stage: 'saving',
          });
        }
      },
    );
    await Promise.all(workers);
    return stop ?? 'completed';
  }

  async function persistRecognizedFiles(successes: readonly BatchSuccess[]): Promise<ImportPersistenceRunResultV1> {
    const prepared: PreparedPersistenceV9[] = [];
    let relationPreparationFailed = false;
    for (const result of successes) {
      const value = preparePersistenceRequest(result);
      if (value) prepared.push(value);
      else if (isMasterRelationResult(result)) relationPreparationFailed = true;
    }
    if (relationPreparationFailed) return 'blocked';
    if (prepared.length === 0) return 'completed';
    return persistPreparedFiles(prepared);
  }

  async function handleFiles(files: FileList | readonly File[]) {
    if (inFlight.current) return;
    const selected = Array.from(files);
    const sizeError = validateBatchSize(selected);
    if (sizeError) {
      setError(sizeError);
      return;
    }
    if (selected.length === 0) return;

    inFlight.current = true;
    setLoading(true);
    setError(null);
    setResults([]);
    setFailures([]);
    setSelectedId(null);
    setPersistence({});
    setProgress(null);
    setTimingDiagnostics([]);
    setSourceValueWarnings({});
    const batchStartedAt = nowMs();
    try {
      const xlsx = await loadSheetJs();
      const result = await importWorkbookBatch(
        selected,
        xlsx,
        (value) => setProgress({ ...value, fileName: value.fileName }),
        {
          captureValues: true,
          onFileTiming: (timing: ImportWorkbookFileTimingV1) =>
            appendTiming('[gradebook-import-browser-timing]', { version: 2, stage: 'recognition-file', ...timing }),
        },
      );
      setResults(result.successes);
      setFailures(result.failureDetails);
      setSelectedId(result.successes[0]?.id ?? null);
      setPersistence(
        Object.fromEntries(result.successes.map((success) => [success.id, { state: 'recognized' } as const])),
      );
      appendTiming('[gradebook-import-browser-timing]', {
        version: 2,
        stage: 'recognition-batch',
        totalMs: elapsedMs(batchStartedAt),
        fileCount: selected.length,
        recognizedCount: result.successes.length,
        failureCount: result.failureDetails.length,
      });
      if (result.successes.length === 0) {
        setError('Nenhuma planilha pôde ser reconhecida.');
        return;
      }
      const persistenceResult = await persistRecognizedFiles(result.successes);
      if (persistenceResult === 'completed') {
        setProgress({
          current: result.successes.length,
          total: result.successes.length,
          fileName: result.successes.at(-1)?.manifest.fileName ?? '',
          stage: 'completed',
        });
      } else if (persistenceResult === 'confirmation-required') {
        setError('A resposta de uma gravação ficou incerta. Retome somente os pendentes nesta aba.');
      } else if (persistenceResult === 'blocked') {
        setError('A Relação do lote foi bloqueada; as planilhas de notas desse lote não foram enviadas.');
      }
    } catch (cause) {
      setError(failureMessage(cause, 'Não foi possível concluir a importação.'));
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }

  async function resumePendingPersistence() {
    if (inFlight.current) return;
    const pending = selectPendingGradebookImportResultsV1(results, persistence);
    if (pending.length === 0) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const outcome = await persistRecognizedFiles(pending);
      if (outcome === 'completed') {
        setProgress({
          current: pending.length,
          total: pending.length,
          fileName: pending.at(-1)?.manifest.fileName ?? '',
          stage: 'completed',
        });
      } else if (outcome === 'confirmation-required') {
        setError('A resposta de uma gravação ficou incerta. Os pendentes continuam preservados nesta aba.');
      } else if (outcome === 'blocked') {
        setError('A Relação pendente continua bloqueada; as planilhas de notas não foram enviadas.');
      }
    } catch (cause) {
      setError(failureMessage(cause, 'Não foi possível retomar as importações pendentes.'));
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }

  return {
    authorizationRequired,
    error,
    failures,
    handleFiles,
    loading,
    pendingPersistenceCount,
    progress,
    persistence,
    results,
    resumePendingPersistence,
    selectedId,
    selectedResult,
    setSelectedId,
    timingDiagnostics,
    sourceValueWarnings,
    totals,
  };
}
