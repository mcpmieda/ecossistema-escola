import { useMemo, useState } from 'react';
import type { AcademicYearId } from '../../../../shared/gradebook-contracts/entities';
import { OPERATIONAL_WORKSPACE_TRANSPORT_VERSION_V1 } from '../../../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v1';
import type { GradebookImportPersistenceResponseV5 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v5';
import {
  isGradebookImportPersistenceRequestV6,
  type GradebookImportPersistenceResponseV6,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import {
  importWorkbookBatch,
  validateBatchSize,
  type BatchFailureDetail,
  type BatchSuccess,
} from './import-batch';
import { loadSheetJs } from './sheetjs-loader';
import { createCompactGradebookImportPersistenceRequestV6 } from './compact-import-v6';
import { persistCompactGradebookFileV6 } from './import-persistence-client-v6';
import { requestOperationalWorkspaceV1 } from '../operational-workspace/operational-workspace-client';

/** Historical type retained for the frozen V5 confirmation surface/tests. */
export type ImportPersistenceStateV5 =
  | { readonly state: 'recognized' | 'ready' | 'persisting' }
  | { readonly state: 'completed'; readonly response: GradebookImportPersistenceResponseV5 }
  | { readonly state: 'failed'; readonly message: string };

export type ImportPersistenceStateV6 =
  | { readonly state: 'recognized' | 'processing' | 'persisting' }
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

function failureMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

export function useImportBatch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BatchSuccess[]>([]);
  const [failures, setFailures] = useState<BatchFailureDetail[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportFlowProgressV6 | null>(null);
  const [persistence, setPersistence] = useState<Record<string, ImportPersistenceStateV6>>({});

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

  async function persistRecognizedFiles(successes: readonly BatchSuccess[]): Promise<void> {
    const bootstrap = await requestOperationalWorkspaceV1({
      contractVersion: OPERATIONAL_WORKSPACE_TRANSPORT_VERSION_V1,
      operation: 'bootstrap',
    });
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
        if (!isGradebookImportPersistenceRequestV6(request)) {
          throw new Error('Pacote acadêmico compacto não passou na validação local.');
        }
        setPersistence((current) => ({ ...current, [result.id]: { state: 'persisting' } }));
        setProgress({
          current: index + 1,
          total: successes.length,
          fileName: result.manifest.fileName,
          stage: 'saving',
        });
        const response = await persistCompactGradebookFileV6(request);
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

    try {
      const xlsx = await loadSheetJs();
      const batch = await importWorkbookBatch(files, xlsx, () => undefined, {
        onStageProgress: (value) => setProgress(value),
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
      await persistRecognizedFiles(batch.successes);
    } catch (cause) {
      const message = failureMessage(cause, 'Não foi possível concluir o processamento local.');
      setError(message);
      setPersistence((current) =>
        Object.fromEntries(
          Object.entries(current).map(([id, state]) => [
            id,
            state.state === 'completed' || state.state === 'failed'
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
    error,
    failures,
    handleFiles,
    loading,
    progress,
    persistence,
    persistenceBusy: Object.values(persistence).some(
      (value) => value.state === 'processing' || value.state === 'persisting',
    ),
    results,
    selectedId,
    selectedResult,
    setSelectedId,
    totals,
  };
}
