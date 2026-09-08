import { useEffect, useMemo, useRef, useState } from 'react';
import type { AcademicYearId } from '../../../../shared/gradebook-contracts/entities';
import { OPERATIONAL_WORKSPACE_TRANSPORT_VERSION_V1 } from '../../../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v1';
import type { GradebookImportPersistenceResponseV5 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v5';
import { type GradebookImportPersistenceResponseV6 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
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
  createGradebookValuesSnapshotV8,
  gradebookValuesParserVersionV8,
} from './compact-import-v8';
import {
  isGradebookImportPersistenceRequestV8,
  type GradebookImportPersistenceRequestV8,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v8';
import { persistGradebookValuesSnapshotV8 } from './import-persistence-client-v8';
import { inspectGradebookImportKnownContentV1 } from './import-known-content-client-v1';
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
  readonly request: GradebookImportPersistenceRequestV8;
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

function knownNoChangesResponseV1(): GradebookImportPersistenceResponseV6 {
  const stateCounts = { unchanged: 0, new: 0, changed: 0, blocked: 0 } as const;
  const recordCounts = { ...stateCounts, missingFromNewSource: 0 } as const;
  const writes = {
    logicalSources: 0,
    sourceFileVersions: 0,
    importBatchVersions: 0,
    assessmentComponentVersions: 0,
    academicRecordVersions: 0,
    logicalSourceRecordAssociationVersions: 0,
    total: 0,
  } as const;
  return {
    transportVersion: 6,
    state: 'no-changes',
    summary: {
      assessmentDefinitions: { total: 0, resolved: 0, blocked: 0 },
      assessmentComponents: stateCounts,
      academicRecords: recordCounts,
      plannedWrites: writes,
      committedWrites: writes,
    },
  };
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
    const request = createGradebookValuesSnapshotV8(
      result,
      { academicYearId: year.id as AcademicYearId, teacherName },
      {
        onProgress: (value) => setProgress({ ...value, fileName: result.manifest.fileName }),
      },
    );
    let unavailableCells = 0;
    for (const course of request.courses) {
      for (const term of course.terms)
        for (const [, cells] of term.rows)
          unavailableCells += Object.values(cells).filter(Array.isArray).length;
      for (const [, , cells] of course.recovery?.rows ?? [])
        unavailableCells += Object.values(cells).filter(Array.isArray).length;
    }
    setSourceValueWarnings((current) => ({ ...current, [result.id]: unavailableCells }));
    appendTiming('[gradebook-import-browser-timing]', {
      version: 1,
      stage: 'compact-file',
      unavailableCells,
      payloadBytes: new TextEncoder().encode(JSON.stringify(request)).byteLength,
      totalMs: elapsedMs(compactStartedAt),
      courseCount: request.courses.length,
      rosterCount: request.rosters.length,
    });
    if (!isGradebookImportPersistenceRequestV8(request)) {
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
    let response: GradebookImportPersistenceResponseV6;
    try {
      const result = await persistGradebookValuesSnapshotV8(request, (diagnostic) =>
        appendTiming('[gradebook-import-server-failure]', diagnostic),
      );
      response = result.response;
      appendTiming('[gradebook-import-client-timing]', {
        version: 1,
        mode: 'values-v8',
        index,
        total,
        totalMs: elapsedMs(startedAt),
        serverMs: result.serverMs,
        state: response.state,
        attempts: 1,
      });
    } catch (cause) {
      appendTiming('[gradebook-import-client-timing]', {
        version: 1,
        mode: 'values-v8',
        index,
        total,
        totalMs: elapsedMs(startedAt),
        state: 'transport-failed',
      });
      throw cause;
    }
    if (isGradebookImportAuthorizationRequiredV1(response)) {
      markAuthorizationRequired(result);
      return 'auth-required';
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

    const knownStartedAt = nowMs();
    const candidates = successes.flatMap((result) => {
      const year = bootstrap.availableAcademicYears.find(
        (option) => option.label === String(result.summary.academicYear),
      );
      if (!year) return [];
      return [
        {
          result,
          observation: {
            academicYearId: year.id,
            fileName: result.manifest.fileName,
            extension: result.manifest.extension,
            reportedMimeType: result.manifest.reportedMimeType,
            sizeBytes: result.manifest.sizeBytes,
            lastModifiedAt: result.manifest.lastModifiedAt,
            sha256: result.manifest.sha256,
            sourceContractVersion: result.manifest.sourceContractVersion,
            parserVersion: gradebookValuesParserVersionV8(result.manifest.parserVersion),
          },
        },
      ];
    });
    const inspection =
      candidates.length === 0
        ? ({ transportVersion: 1, state: 'unavailable' } as const)
        : await inspectGradebookImportKnownContentV1(
            candidates.map(({ observation }) => observation),
          );
    appendTiming('[gradebook-import-known-content-timing]', {
      version: 1,
      totalMs: elapsedMs(knownStartedAt),
      itemCount: candidates.length,
      state: inspection.state,
      knownCount: inspection.state === 'ready' ? inspection.known.filter(Boolean).length : 0,
    });
    if (inspection.state === 'not-authorized') {
      const first = successes[0];
      if (first) markAuthorizationRequired(first);
      return 'auth-required';
    }
    const knownIds = new Set<string>();
    if (inspection.state === 'ready' && inspection.known.length === candidates.length) {
      candidates.forEach(({ result }, index) => {
        if (inspection.known[index]) knownIds.add(result.id);
      });
      if (knownIds.size > 0) {
        const noChanges = knownNoChangesResponseV1();
        setPersistence((current) => ({
          ...current,
          ...Object.fromEntries(
            [...knownIds].map((id) => [id, { state: 'completed', response: noChanges } as const]),
          ),
        }));
      }
    }
    const pending = successes.filter((result) => !knownIds.has(result.id));

    // Keep only a small bounded window in memory and in flight. Every file remains
    // independently atomic; after an uncertain reply no new work is scheduled, while
    // requests already in flight are allowed to report their confirmed outcome.
    let completedCount = knownIds.size;
    const runOne = async (
      result: BatchSuccess,
      index: number,
    ): Promise<ImportPersistenceRunResultV1> => {
      let prepared: PreparedPersistenceV7;
      try {
        prepared = preparePersistenceRequest(result, bootstrap.availableAcademicYears);
      } catch (cause) {
        const message = failureMessage(cause, 'Não foi possível preparar esta planilha.');
        setPersistence((current) => ({ ...current, [result.id]: { state: 'failed', message } }));
        setError(
          'Uma ou mais planilhas não puderam ser preparadas. Consulte o estado de cada arquivo.',
        );
        completedCount++;
        return 'completed';
      }
      try {
        const state = await persistPreparedSingle(prepared, index, successes.length);
        if (state !== 'completed') return state;
        completedCount++;
        setProgress({
          current: completedCount,
          total: successes.length,
          fileName: result.manifest.fileName,
          stage: 'saving',
        });
        return 'completed';
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
    };
    for (let start = 0; start < pending.length; start += GRADEBOOK_IMPORT_FILE_CONCURRENCY_V1) {
      const window = pending.slice(start, start + GRADEBOOK_IMPORT_FILE_CONCURRENCY_V1);
      const outcomes = await Promise.all(
        window.map((result) => runOne(result, successes.indexOf(result))),
      );
      if (outcomes.includes('auth-required')) return 'auth-required';
      if (outcomes.includes('confirmation-required')) return 'confirmation-required';
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
    setSourceValueWarnings({});

    const bootstrapPromise = startImportBootstrapV1();

    try {
      const recognitionStartedAt = nowMs();
      const sheetJsStartedAt = nowMs();
      const xlsx = await loadSheetJs();
      const sheetJsLoadMs = elapsedMs(sheetJsStartedAt);
      const fileTimings: ImportWorkbookFileTimingV1[] = [];
      const batchStartedAt = nowMs();
      const batch = await importWorkbookBatch(files, xlsx, () => undefined, {
        captureValues: true,
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
    sourceValueWarnings,
    totals,
  };
}
