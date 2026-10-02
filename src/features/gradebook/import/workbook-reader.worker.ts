import xlsx, { libraryEvaluationMs } from 'virtual:gradebook-sheetjs-worker-v1';
import { SHEETJS_VERSION_V1 } from './sheetjs-source-v1';
import { readWorkbookData, type WorkbookReadTimingV1 } from './workbook-reader';
import type { WorkbookWorkerTaskV1, WorkbookWorkerResponseV1 } from './workbook-worker-protocol-v1';

const scope = globalThis as unknown as {
  postMessage: (value: WorkbookWorkerResponseV1) => void;
  addEventListener: (
    name: 'message',
    listener: (event: MessageEvent<WorkbookWorkerTaskV1>) => void,
  ) => void;
};
if (xlsx.version !== SHEETJS_VERSION_V1) {
  scope.postMessage({ version: 1, kind: 'initialization-failed', security: true });
} else {
  scope.addEventListener('message', ({ data: task }) => {
    if (task.version !== 1 || task.kind !== 'read') return;
    const correlation = {
      version: 1 as const,
      generation: task.generation,
      sourceFileIndex: task.sourceFileIndex,
      taskId: task.taskId,
    };
    let timing: WorkbookReadTimingV1 | null = null;
    try {
      const summary = readWorkbookData(
        task.file,
        task.data,
        xlsx,
        task.manifest,
        (value) => {
          timing = value;
        },
        task.captureValues,
      );
      scope.postMessage({ ...correlation, kind: 'result', summary, timing });
    } catch (cause) {
      scope.postMessage({
        ...correlation,
        kind: 'failure',
        message: cause instanceof Error ? cause.message : 'Não foi possível reconhecer a planilha.',
        timing,
      });
    }
  });
  // Duration belongs to this context; the parent separately measures complete initialization.
  scope.postMessage({
    version: 1,
    kind: 'ready',
    libraryVersion: xlsx.version,
    libraryMs: libraryEvaluationMs,
  });
}
