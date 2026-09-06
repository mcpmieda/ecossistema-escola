import { useEffect, useMemo, useState } from 'react';
import type { AcademicYearId } from '../../../../shared/gradebook-contracts/entities';
import { OPERATIONAL_WORKSPACE_TRANSPORT_VERSION_V1 } from '../../../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v1';
import type { GradebookImportPersistenceResponseV5 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v5';
import {
  isGradebookImportPersistenceRequestV6,
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
import { persistCompactGradebookFileV6 } from './import-persistence-client-v6';
import { persistCompactGradebookFileStagedV1 } from './import-staging-client-v1';
import { requestOperationalWorkspaceV1 } from '../operational-workspace/operational-workspace-client';

export type ImportPersistenceStateV5 =
  | { readonly state: 'recognized' | 'ready' | 'persisting' }
  | { readonly state: 'completed'; readonly response: GradebookImportPersistenceResponseV5 }
  | { readonly state: 'failed'; readonly message: string };

export type ImportPersistenceStateV6 =
  | { readonly state: 'recognized' | 'processing' | 'persisting' | 'auth-required' }
  | { readonly state: 'completed'; readonly response: GradebookImportPersistenceResponseV6 }
  | { readonly state: 'failed'; readonly message: string };

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
type ImportPersistenceRunResultV1 = 'completed' | 'auth-required';

function failureMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function nowMs(): number {
  return typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
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
    return state?.state === 'recognized' || state?.state === 'auth-required';
  });
}

export function useImportBatch() {
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

  async function persistRecognizedFiles(
    successes: readonly BatchSuccess[],
    bootstrapPromise: Promise<ImportBootstrapOutcomeV1>,
  ): Promise<ImportPersistenceRunResultV1> {
    const bootstrapOutcome = await bootstrapPromise;
    if (bootstrapOutcome.state === 'rejected') {
      throw bootstrapOutcome.cause instanceof Error
        ? bootstrapOutcome.cause
        : new Error('Não foi possível consultar os anos letivos cadastrados.');
    }
    const bootstrap = bootstrapOutcome.response;
    if (bootstrap.state === 'not-authorized') {
      const firstPending = successes[0];
      if (firstPending) markAuthorizationRequired(firstPending);
      return 'auth-required';
    }
    if (bootstrap.state !== 'ready' || !('availableAcademicYears' in bootstrap)) {
      throw new Error('Não foi possível consultar os anos letivos cadastrados.');
    }

    for (const [index, result] of successes.entries()) {
      setPersistence((current) => ({ ...current, [result.id]: { state: 'processing' } }));
      try {
        const recognizedYear = result.summary.academicYear;
        const year = bootstrap.availableAcademicYears.find(
          (option) => option.label === String(recognizedYear),
        );
        if (!year) throw new Error('Ano letivo reconhecido ainda não está cadastrado.');
        const teacherName = result.summary.teacherName?.trim();
        if (!teacherName) throw new Error('Professor não reconhecido em CONFIGURAÇÃO!A2.');

        const compactStartedAt = nowMs();
        const request = createCompactGradebookImportPersistenceRequestV6(
          result,
          { academicYearId: year.id as AcademicYearId, teacherName },
          {
            onProgress: (value) =>
              setProgress({
                current: value.current,
                total: value.total,
                fileName: result.manifest.fileName,
                stage: value.stage,
              }),
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
        setPersistence((current) => ({ ...current, [result.id]: { state: 'persisting' } }));
        setProgress({
          current: 0,
          total: 1,
          fileName: result.manifest.fileName,
          stage: 'saving',
        });

        const directStartedAt = nowMs();
        let response = await persistCompactGradebookFileV6(request);
        appendTiming('[gradebook-import-client-timing]', {
          version: 1,
          mode: 'direct',
          totalMs: elapsedMs(directStartedAt),
          state: response.state,
        });

        if (isGradebookImportAuthorizationRequiredV1(response)) {
          markAuthorizationRequired(result);
          return 'auth-required';
        }

        if (needsStagingFallbackV1(response)) {
          response = await persistCompactGradebookFileStagedV1(
            request,
            ({ prepared, total }) => {
              setProgress({
                current: prepared,
                total,
                fileName: result.manifest.fileName,
                stage: 'saving',
              });
            },
            (timing) => appendTiming('[gradebook-import-client-timing]', timing),
          );
          if (isGradebookImportAuthorizationRequiredV1(response)) {
            markAuthorizationRequired(result);
            return 'auth-required';
          }
        }

        setPersistence((current) => ({ ...current, [result.id]: { state: 'completed', response } }));
        setProgress({
          current: index + 1,
          total: successes.length,
          fileName: result.manifest.fileName,
          stage: 'completed',
        });
      } catch (cause) {
        setPersistence((current) => ({
          ...current,
          [result.id]: {
            state: 'failed',
            message: failureMessage(cause, 'Persistência indisponível.'),
          },
        }));
      }
    }
    return 'completed';
  }

  async function resumePendingPersistence(): Promise<void> {
    const pending = selectPendingGradebookImportResultsV1(results, persistence);
    if (pending.length === 0 || loading) return;

    setLoading(true);
    setError(null);
    setProgress(null);
    try {
      await persistRecognizedFiles(pending, startImportBootstrapV1());
    } catch (cause) {
      const message = failureMessage(cause, 'Não foi possível retomar a persistência.');
      setError(message);
      setPersistence((current) =>
        Object.fromEntries(
          Object.entries(current).map(([id, state]) => [
            id,
            state.state === 'processing' || state.state === 'persisting'
              ? { state: 'failed', message }
              : state,
          ]),
        ),
      );
    } finally {
      setProgress(null);
      setLoading(false);
    }
  }

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
      setPersistence((current) =>
        Object.fromEntries(
          Object.entries(current).map(([id, state]) => [
            id,
            state.state === 'completed' || state.state === 'failed' || state.state === 'auth-required'
              ? state
              : { state: 'failed', message },
          ]),
        ),
      );
    } finally {
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
