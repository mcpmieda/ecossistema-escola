import { useEffect, useMemo, useRef, useState } from 'react';
import type { AcademicYearId } from '../../../../shared/gradebook-contracts/entities';
import { OPERATIONAL_WORKSPACE_TRANSPORT_VERSION_V1 } from '../../../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v1';
import type { GradebookImportPersistenceResponseV5 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v5';
import {
  isGradebookImportPersistenceRequestV6,
  type GradebookImportPersistenceRequestV6,
  type GradebookImportPersistenceResponseV6,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import {
  countWorkbookOperationalClassesV1,
  importWorkbookBatch,
  validateBatchSize,
  type BatchFailureDetail,
  type BatchSuccess,
  type ImportWorkbookFileTimingV1,
} from './import-batch';
import { loadSheetJs, preloadSheetJs } from './sheetjs-loader';
import { createCompactGradebookImportPersistenceRequestV6 } from './compact-import-v6';
import {
  GradebookImportBatchTransportErrorV7,
  persistCompactGradebookBatchV7,
} from './import-persistence-client-v7';
import { persistCompactGradebookFileStagedV1 } from './import-staging-client-v1';
import { requestOperationalWorkspaceV1 } from '../operational-workspace/operational-workspace-client';

export type ImportPersistenceStateV5 =
  | { readonly state: 'recognized' | 'ready' | 'persisting' }
  | { readonly state: 'completed'; readonly response: GradebookImportPersistenceResponseV5 }
  | { readonly state: 'failed'; readonly message: string };

export type ImportPersistenceStateV6 =
  | { readonly state: 'recognized' | 'processing' | 'persisting' | 'auth-required' }
  | { readonly state: 'completed'; readonly response: GradebookImportPersistenceResponseV6 }
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

type ImportBootstrapResponseV1 = Awaited<ReturnType<typeof requestOperationalWorkspaceV1>>;
type ImportBootstrapOutcomeV1 =
  | { readonly state: 'fulfilled'; readonly response: ImportBootstrapResponseV1 }
  | { readonly state: 'rejected'; readonly cause: unknown };
type ImportPersistenceRunResultV1 = 'completed' | 'auth-required' | 'confirmation-required';
type PreparedPersistenceV7 = {
  readonly result: BatchSuccess;
  readonly request: GradebookImportPersistenceRequestV6;
};

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

function startImportBootstrapV1(): Promise<ImportBootstrapOutcomeV1> {
  return requestOperationalWorkspaceV1({
    contractVersion: OPERATIONAL_WORKSPACE_TRANSPORT_VERSION_V1,
    operation: 'bootstrap',
  }).then(
    (response) => ({ state: 'fulfilled', response }),
    (cause: unknown) => ({ state: 'rejected', cause }),
  );
}

function needsStagingFallbackV1(response: GradebookImportPersistenceResponseV6): boolean {
  return (
    response.state === 'invalid-request' &&
    'reason' in response &&
    response.reason === 'payload-too-large'
  );
}

export function isGradebookImportAuthorizationRequiredV1(
  response: GradebookImportPersistenceResponseV6,
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
      classes: results.reduce(
        (sum, result) => sum + countWorkbookOperationalClassesV1(result.summary),
        0,
      ),
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

  function preparePersistenceRequest(
    result: BatchSuccess,
    availableAcademicYears: readonly { readonly id: string; readonly label: string }[],
  ): PreparedPersistenceV7 {
    setPersistence((current) => ({ ...current, [result.id]: { state: 'processing' } }));
    const year = availableAcademicYears.find(
      (option) => option.label === String(result.summary.academicYear),
    );
    if (!year) throw new Error('Ano letivo reconhecido ainda não está cadastrado.');
    const teacherName = result.summary.teacherName?.trim();
    if (!teacherName) throw new Error('Professor não reconhecido em CONFIGURAÇÃO!A2.');

    const compactStartedAt = nowMs();
    const request = createCompactGradebookImportPersistenceRequestV6(
      result,
      { academicYearId: year.id as AcademicYearId, teacherName },
      {
        onProgress: (value) => setProgress({ ...value, fileName: result.manifest.fileName }),
      },
    );
    appendTiming('[gradebook-import-browser-timing]', {
      version: 1,
      stage: 'compact-file',
      totalMs: elapsedMs(compactStartedAt),
      courseCount: request.courses.length,
      rosterCount: request.rosters.length,
    });
    if (!isGradebookImportPersistenceRequestV6(request)) {
      throw new Error('Pacote acadêmico compacto não passou na validação local.');
    }
    return { result, request };
  }

  async function persistPreparedSingle(
    { result, request }: PreparedPersistenceV7,
    index: number,
    total: number,
  ): Promise<ImportPersistenceRunResultV1> {
    setPersistence((current) => ({ ...current, [result.id]: { state: 'persisting' } }));
    setProgress({ current: index, total, fileName: result.manifest.fileName, stage: 'saving' });
    const startedAt = nowMs();
    let batch: Awaited<ReturnType<typeof persistCompactGradebookBatchV7>>;
    try {
      // One file per HTTP request. V7 retains the server's narrow D1 retry policy;
      // a transport failure is never automatically replayed by this queue.
      batch = await persistCompactGradebookBatchV7([request], undefined, (diagnostic) => {
        appendTiming('[gradebook-import-server-failure]', diagnostic);
      });
    } catch (cause) {
      appendTiming('[gradebook-import-client-timing]', {
        version: 1,
        mode: 'file-v7',
        index,
        total,
        totalMs: elapsedMs(startedAt),
        state: 'transport-failed',
        failure:
          cause instanceof GradebookImportBatchTransportErrorV7
            ? { httpStatus: cause.status, contentKind: cause.contentKind }
            : { kind: 'request-failed' },
      });
      throw cause;
    }
    appendTiming('[gradebook-import-client-timing]', {
      version: 1,
      mode: 'file-v7',
      index,
      total,
      totalMs: elapsedMs(startedAt),
      state: batch.state,
      items:
        'items' in batch
          ? batch.items.map((item) => ({
              attempts: item.attempts,
              totalMs: item.totalMs,
              state: item.response.state,
              failureCategory: item.failureCategory,
            }))
          : [],
    });
    if (batch.state === 'not-authorized') {
      markAuthorizationRequired(result);
      return 'auth-required';
    }
    if (batch.state === 'unavailable')
      throw new Error('Persistência temporariamente indisponível.');
    let response: GradebookImportPersistenceResponseV6;
    if (batch.state === 'invalid-request') {
      response = { transportVersion: 6, state: 'invalid-request', reason: batch.reason };
    } else {
      const item = batch.items[0];
      if (batch.items.length !== 1 || item?.index !== 0) {
        throw new Error('Resposta incompleta ao confirmar a planilha.');
      }
      response = item.response;
    }
    if (isGradebookImportAuthorizationRequiredV1(response)) {
      markAuthorizationRequired(result);
      return 'auth-required';
    }
    if (needsStagingFallbackV1(response)) {
      response = await persistCompactGradebookFileStagedV1(
        request,
        () =>
          setProgress({
            current: index,
            total,
            fileName: result.manifest.fileName,
            stage: 'saving',
          }),
        (timing) => appendTiming('[gradebook-import-client-timing]', timing),
      );
      if (isGradebookImportAuthorizationRequiredV1(response)) {
        markAuthorizationRequired(result);
        return 'auth-required';
      }
    }
    if (response.state === 'unavailable') {
      throw new Error('Não foi possível confirmar a gravação desta planilha.');
    }
    setPersistence((current) => ({ ...current, [result.id]: { state: 'completed', response } }));
    setProgress({ current: index + 1, total, fileName: result.manifest.fileName, stage: 'saving' });
    return 'completed';
  }

  async function persistRecognizedFiles(
    successes: readonly BatchSuccess[],
    bootstrapPromise: Promise<ImportBootstrapOutcomeV1>,
  ): Promise<ImportPersistenceRunResultV1> {
    const outcome = await bootstrapPromise;
    if (outcome.state === 'rejected') {
      throw new Error('Não foi possível consultar os anos letivos. Retome os pendentes nesta aba.');
    }
    const bootstrap = outcome.response;
    if (bootstrap.state === 'not-authorized') {
      const first = successes[0];
      if (first) markAuthorizationRequired(first);
      return 'auth-required';
    }
    if (bootstrap.state !== 'ready' || !('availableAcademicYears' in bootstrap)) {
      throw new Error('Não foi possível consultar os anos letivos cadastrados.');
    }

    // Compact lazily: do not retain 18/50 expanded request packages or submit
    // the entire selection in one Worker invocation. Completed files stay put.
    for (const [index, result] of successes.entries()) {
      let prepared: PreparedPersistenceV7;
      try {
        prepared = preparePersistenceRequest(result, bootstrap.availableAcademicYears);
      } catch (cause) {
        const message = failureMessage(cause, 'Não foi possível preparar esta planilha.');
        setPersistence((current) => ({ ...current, [result.id]: { state: 'failed', message } }));
        setError(
          'Uma ou mais planilhas não puderam ser preparadas. Consulte o estado de cada arquivo.',
        );
        continue;
      }
      try {
        const state = await persistPreparedSingle(prepared, index, successes.length);
        if (state !== 'completed') return state;
      } catch (cause) {
        const message = failureMessage(cause, 'Não foi possível confirmar a gravação.');
        setPersistence((current) => ({
          ...current,
          [result.id]: { state: 'confirmation-required', message },
        }));
        setError(
          `${message} O lote foi pausado; os arquivos confirmados foram preservados. Retome os pendentes nesta aba.`,
        );
        return 'confirmation-required';
      }
    }
    setProgress({
      current: successes.length,
      total: successes.length,
      fileName: '',
      stage: 'completed',
    });
    return 'completed';
  }

  async function resumePendingPersistence(): Promise<void> {
    const pending = selectPendingGradebookImportResultsV1(results, persistence);
    if (pending.length === 0 || inFlight.current) return;
    inFlight.current = true;

    setLoading(true);
    setError(null);
    setProgress(null);
    try {
      await persistRecognizedFiles(pending, startImportBootstrapV1());
    } catch (cause) {
      const message = failureMessage(cause, 'Não foi possível retomar a persistência.');
      setError(message);
    } finally {
      inFlight.current = false;
      setProgress(null);
      setLoading(false);
    }
  }

  async function handleFiles(fileList: FileList) {
    if (inFlight.current) return;
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const batchSizeError = validateBatchSize(files);
    if (batchSizeError) {
      // An invalid new selection must not discard a resumable current selection.
      setError(batchSizeError);
      return;
    }

    inFlight.current = true;
    setLoading(true);
    setError(null);
    setResults([]);
    setFailures([]);
    setSelectedId(null);
    setPersistence({});
    setTimingDiagnostics([]);

    const bootstrapPromise = startImportBootstrapV1();

    try {
      const recognitionStartedAt = nowMs();
      const sheetJsStartedAt = nowMs();
      const xlsx = await loadSheetJs();
      const sheetJsLoadMs = elapsedMs(sheetJsStartedAt);
      const fileTimings: ImportWorkbookFileTimingV1[] = [];
      const batchStartedAt = nowMs();
      const batch = await importWorkbookBatch(files, xlsx, () => undefined, {
        onStageProgress: (value) => setProgress(value),
        onFileTiming: (value) => fileTimings.push(value),
      });
      const batchMs = elapsedMs(batchStartedAt);
      for (const timing of fileTimings) {
        appendTiming('[gradebook-import-browser-timing]', {
          version: 1,
          stage: 'recognition-file',
          ...timing,
        });
      }
      appendTiming('[gradebook-import-browser-timing]', {
        version: 1,
        stage: 'recognition-batch',
        totalMs: elapsedMs(recognitionStartedAt),
        sheetJsLoadMs,
        batchMs,
        fileCount: files.length,
        recognizedCount: batch.successes.length,
        failureCount: batch.failureDetails.length,
      });
      setResults(batch.successes);
      setPersistence(
        Object.fromEntries(batch.successes.map((result) => [result.id, { state: 'recognized' }])),
      );
      setFailures(batch.failureDetails);
      setSelectedId(batch.successes[0]?.id ?? null);
      if (batch.successes.length === 0) {
        setError('Nenhuma das planilhas selecionadas pôde ser reconhecida.');
        return;
      }
      await persistRecognizedFiles(batch.successes, bootstrapPromise);
    } catch (cause) {
      const message = failureMessage(cause, 'Não foi possível concluir o processamento local.');
      setError(message);
    } finally {
      inFlight.current = false;
      setProgress(null);
      setLoading(false);
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
    persistenceBusy: Object.values(persistence).some(
      (value) => value.state === 'processing' || value.state === 'persisting',
    ),
    results,
    resumePendingPersistence,
    selectedId,
    selectedResult,
    setSelectedId,
    timingDiagnostics,
    totals,
  };
}
