import type { SheetJs } from './spreadsheet-recognizer';
import { loadSheetJs } from './sheetjs-loader';
import { SHEETJS_VERSION_V1 } from './sheetjs-source-v1';
import { readWorkbookData, type WorkbookReadTimingV1 } from './workbook-reader';
import type { SourceFileManifestV1 } from '../../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  WorkbookLocalExecutorV1,
  WorkbookLocalReadResultV1,
  WorkbookWorkerFallbackV1,
  WorkbookWorkerResponseV1,
  WorkbookWorkerTaskV1,
} from './workbook-worker-protocol-v1';

export const WORKBOOK_WORKER_INPUT_BUDGET_V1 = 16 * 1024 * 1024;
export const WORKBOOK_WORKER_INITIALIZATION_TIMEOUT_V1 = 15_000;
export const WORKBOOK_WORKER_TASK_TIMEOUT_V1 = 300_000;

export function workbookWorkerCapacityV1(threads: unknown, memoryGiB: unknown): 1 | 2 {
  return typeof threads === 'number' &&
    Number.isFinite(threads) &&
    threads >= 4 &&
    typeof memoryGiB === 'number' &&
    Number.isFinite(memoryGiB) &&
    memoryGiB >= 4
    ? 2
    : 1;
}

interface Pending {
  task: WorkbookWorkerTaskV1;
  resolve: (result: WorkbookLocalReadResultV1) => void;
  reject: (cause: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}
interface Slot {
  worker: Worker;
  pending: Pending | null;
  stop: () => void;
  ready: Promise<void>;
  cancel: (cause: unknown) => void;
}
class WorkerInfrastructureError extends Error {
  constructor(readonly reason: WorkbookWorkerFallbackV1) {
    super(reason);
  }
}
export class WorkbookWorkerSecurityErrorV1 extends Error {
  constructor() {
    super('A versão ou integridade do leitor de planilhas é incompatível.');
    this.name = 'WorkbookWorkerSecurityErrorV1';
  }
}

export interface WorkbookWorkerClientOptionsV1 {
  readonly generation: number;
  readonly concurrency: 1 | 2;
  readonly workerFactory?: () => Worker;
  readonly fallbackLibrary?: () => Promise<SheetJs>;
  readonly onFallback?: (reason: WorkbookWorkerFallbackV1, sourceFileIndex: number | null) => void;
  readonly onReady?: (
    initializationMs: number,
    libraryEvaluationMs: number,
    workers: number,
  ) => void;
}

/** Owns only local jobs. Academic dispatch and retry remain in the existing coordinator. */
export class WorkbookWorkerClientV1 implements WorkbookLocalExecutorV1 {
  readonly concurrency: 1 | 2;
  readonly inputByteBudget = WORKBOOK_WORKER_INPUT_BUDGET_V1;
  private slots: Slot[] = [];
  private closed = false;
  private taskId = 0;
  private fallbackReason: WorkbookWorkerFallbackV1 | null = null;
  private fallbackReadyLibrary: SheetJs | null = null;
  constructor(private readonly options: WorkbookWorkerClientOptionsV1) {
    this.concurrency = options.concurrency;
  }

  async initialize(): Promise<void> {
    const startedAt = performance.now();
    if (!this.options.workerFactory && typeof Worker !== 'function') {
      this.fallbackReason = 'unavailable';
      this.observeFallback('unavailable', null);
      await this.prepareFallback();
      return;
    }
    let evaluationMs = 0;
    try {
      for (let index = 0; index < this.concurrency; index++) {
        this.checkOpen();
        const worker =
          this.options.workerFactory?.() ??
          new Worker(new URL('./workbook-reader.worker.ts', import.meta.url), { type: 'module' });
        const slot = { worker, pending: null } as Slot;
        let readySettled = false;
        let resolveReady: () => void;
        let rejectReady: (cause: unknown) => void;
        slot.ready = new Promise<void>((resolve, reject) => {
          resolveReady = resolve;
          rejectReady = reject;
        });
        void slot.ready.catch(() => undefined);
        const initTimer = setTimeout(
          () => fail(new WorkerInfrastructureError('initialization-timeout')),
          WORKBOOK_WORKER_INITIALIZATION_TIMEOUT_V1,
        );
        const fail = (cause: unknown): void => {
          clearTimeout(initTimer);
          if (!readySettled) {
            readySettled = true;
            rejectReady(cause);
          }
          const pending = slot.pending;
          slot.pending = null;
          if (pending) {
            clearTimeout(pending.timer);
            pending.reject(cause);
          }
          slot.stop();
          this.slots = this.slots.filter((value) => value !== slot);
        };
        slot.cancel = fail;
        const message = ({ data }: MessageEvent<WorkbookWorkerResponseV1>): void => {
          if (this.closed || data?.version !== 1) return;
          if (data.kind === 'initialization-failed') {
            fail(
              data.security
                ? new WorkbookWorkerSecurityErrorV1()
                : new WorkerInfrastructureError('initialization'),
            );
            return;
          }
          if (data.kind === 'ready') {
            if (readySettled) return;
            if (data.libraryVersion !== SHEETJS_VERSION_V1) {
              fail(new WorkbookWorkerSecurityErrorV1());
              return;
            }
            evaluationMs +=
              Number.isFinite(data.libraryMs) && data.libraryMs >= 0 ? data.libraryMs : 0;
            readySettled = true;
            clearTimeout(initTimer);
            resolveReady();
            return;
          }
          const pending = slot.pending;
          if (
            !pending ||
            data.generation !== this.options.generation ||
            data.sourceFileIndex !== pending.task.sourceFileIndex ||
            data.taskId !== pending.task.taskId
          )
            return;
          if (data.kind !== 'result' && data.kind !== 'failure') return;
          slot.pending = null;
          clearTimeout(pending.timer);
          if (data.kind === 'result')
            pending.resolve({ summary: data.summary, timing: data.timing });
          else if (data.kind === 'failure')
            pending.reject(Object.assign(new Error(data.message), { workbookTiming: data.timing }));
        };
        const error = (): void => fail(new WorkerInfrastructureError('crash'));
        const messageError = (): void => fail(new WorkerInfrastructureError('message-error'));
        slot.stop = () => {
          clearTimeout(initTimer);
          worker.removeEventListener('message', message);
          worker.removeEventListener('error', error);
          worker.removeEventListener('messageerror', messageError);
          worker.terminate();
        };
        worker.addEventListener('message', message);
        worker.addEventListener('error', error);
        worker.addEventListener('messageerror', messageError);
        this.slots.push(slot);
      }
      // Attach to every ready promise before waiting; no orphan rejection from a failed slot.
      await Promise.all(this.slots.map((slot) => slot.ready));
      this.checkOpen();
      try {
        this.options.onReady?.(performance.now() - startedAt, evaluationMs, this.slots.length);
      } catch {
        /* Optional timing. */
      }
    } catch (cause) {
      this.stopSlots();
      this.checkOpen();
      if (cause instanceof WorkbookWorkerSecurityErrorV1) throw cause;
      this.fallbackReason =
        cause instanceof WorkerInfrastructureError ? cause.reason : 'initialization';
      this.observeFallback(this.fallbackReason, null);
      await this.prepareFallback();
    }
  }

  async read(
    file: File,
    data: ArrayBuffer,
    manifest: SourceFileManifestV1,
    sourceFileIndex: number,
    captureValues: boolean,
    onTiming: (timing: WorkbookReadTimingV1) => void,
  ): Promise<WorkbookLocalReadResultV1['summary']> {
    this.checkOpen();
    const slot = this.slots.find((value) => value.pending === null);
    if (!slot) {
      this.observeFallback(this.fallbackReason ?? 'unavailable', sourceFileIndex);
      return this.fallback(file, data, manifest, captureValues, onTiming);
    }
    const task: WorkbookWorkerTaskV1 = {
      version: 1,
      kind: 'read',
      generation: this.options.generation,
      sourceFileIndex,
      taskId: ++this.taskId,
      file,
      data,
      manifest,
      captureValues,
    };
    try {
      const result = await new Promise<WorkbookLocalReadResultV1>((resolve, reject) => {
        const timer = setTimeout(() => {
          slot.pending = null;
          slot.stop();
          this.slots = this.slots.filter((value) => value !== slot);
          reject(new WorkerInfrastructureError('task-timeout'));
        }, WORKBOOK_WORKER_TASK_TIMEOUT_V1);
        slot.pending = { task, resolve, reject, timer };
        try {
          slot.worker.postMessage(task, [data]);
        } catch {
          clearTimeout(timer);
          slot.pending = null;
          slot.stop();
          this.slots = this.slots.filter((value) => value !== slot);
          reject(new WorkerInfrastructureError('message-error'));
        }
      });
      this.checkOpen();
      if (result.timing) {
        try {
          onTiming(result.timing);
        } catch {
          /* Optional timing. */
        }
      }
      return result.summary;
    } catch (cause) {
      this.checkOpen();
      if (!(cause instanceof WorkerInfrastructureError)) {
        const timing = (cause as { workbookTiming?: WorkbookReadTimingV1 | null })?.workbookTiming;
        if (timing) {
          try {
            onTiming(timing);
          } catch {
            /* Optional timing. */
          }
        }
        throw cause;
      }
      this.fallbackReason = cause.reason;
      this.observeFallback(cause.reason, sourceFileIndex);
      // The transferred buffer is detached. Only this unfinished file is reread once.
      const bytes = data.byteLength === 0 ? await file.arrayBuffer() : data;
      return this.fallback(file, bytes, manifest, captureValues, onTiming);
    }
  }

  close(): void {
    this.closed = true;
    this.stopSlots();
  }
  private stopSlots(): void {
    for (const slot of [...this.slots])
      slot.cancel(new DOMException('Leitura cancelada.', 'AbortError'));
    this.slots = [];
  }
  private checkOpen(): void {
    if (this.closed) throw new DOMException('Leitura cancelada.', 'AbortError');
  }
  private observeFallback(reason: WorkbookWorkerFallbackV1, index: number | null): void {
    try {
      this.options.onFallback?.(reason, index);
    } catch {
      /* Optional timing. */
    }
  }
  private async fallback(
    file: File,
    data: ArrayBuffer,
    manifest: SourceFileManifestV1,
    captureValues: boolean,
    onTiming: (timing: WorkbookReadTimingV1) => void,
  ): Promise<WorkbookLocalReadResultV1['summary']> {
    this.checkOpen();
    const xlsx = this.fallbackReadyLibrary ?? (await this.prepareFallback());
    this.checkOpen();
    if (xlsx.version !== SHEETJS_VERSION_V1) throw new WorkbookWorkerSecurityErrorV1();
    return readWorkbookData(file, data, xlsx, manifest, onTiming, captureValues);
  }
  private async prepareFallback(): Promise<SheetJs> {
    const library = await (this.options.fallbackLibrary?.() ?? loadSheetJs());
    this.checkOpen();
    if (library.version !== SHEETJS_VERSION_V1) throw new WorkbookWorkerSecurityErrorV1();
    this.fallbackReadyLibrary = library;
    return library;
  }
}
