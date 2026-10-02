import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WorkbookWorkerClientV1,
  WorkbookWorkerSecurityErrorV1,
  workbookWorkerCapacityV1,
  WORKBOOK_WORKER_INITIALIZATION_TIMEOUT_V1,
  WORKBOOK_WORKER_TASK_TIMEOUT_V1,
  WORKBOOK_WORKER_INPUT_BUDGET_V1,
} from '../../../src/features/gradebook/import/workbook-worker-client-v1';
import type { WorkbookWorkerTaskV1 } from '../../../src/features/gradebook/import/workbook-worker-protocol-v1';
import {
  importWorkbookBatch,
  validateBatchSize,
  type BatchProgress,
  type ImportWorkbookFileTimingV1,
} from '../../../src/features/gradebook/import/import-batch';
import { createSourceFileManifest } from '../../../src/features/gradebook/import/file-manifest';
import {
  readWorkbookData,
  type WorkbookReadTimingV1,
} from '../../../src/features/gradebook/import/workbook-reader';
import { SHEETJS_VERSION_V1 } from '../../../src/features/gradebook/import/sheetjs-source-v1';
import { createGradebookCanonicalImportRequestV9 } from '../../../src/features/gradebook/import/canonical-import-v9';
import { collectGradebookImportDiagnosticsV1 } from '../../../src/features/gradebook/import/import-diagnostics-v1';
import {
  WORKBOOK_READER_EQUIVALENCE_CASES_V1,
  createFixtureSheetJsV1,
  syntheticResultV1,
  type WorkbookFixtureV1,
} from '../fixtures/workbook-reader-equivalence-v1';
import type { SheetJs } from '../../../src/features/gradebook/import/spreadsheet-recognizer';

type Listener = (event: { data?: unknown }) => void;
/** Functional lifecycle/transfer stand-in, never a parsing benchmark. The same
 * production reader processes H's synthetic objects on both sides of this test. */
class ControlledWorker {
  readonly listeners = new Map<string, Set<Listener>>();
  readonly tasks: WorkbookWorkerTaskV1[] = [];
  readonly transferLists: Transferable[][] = [];
  readonly terminate = vi.fn();
  onTask: ((task: WorkbookWorkerTaskV1) => void) | undefined;
  postError: Error | null = null;
  addEventListener(name: string, listener: Listener): void {
    const entries = this.listeners.get(name) ?? new Set<Listener>();
    entries.add(listener);
    this.listeners.set(name, entries);
  }
  removeEventListener(name: string, listener: Listener): void {
    this.listeners.get(name)?.delete(listener);
  }
  postMessage(task: WorkbookWorkerTaskV1, transfer: Transferable[]): void {
    if (this.postError) throw this.postError;
    this.transferLists.push(transfer);
    // Transfer just the original bytes. File objects are metadata references in
    // this stand-in; real File structured cloning is covered by browser execution.
    const received = { ...task, data: structuredClone(task.data, { transfer }) };
    this.tasks.push(received);
    this.onTask?.(received);
  }
  emit(value: unknown): void {
    for (const listener of this.listeners.get('message') ?? [])
      listener({ data: structuredClone(value) });
  }
  event(name: 'error' | 'messageerror'): void {
    for (const listener of this.listeners.get(name) ?? []) listener({});
  }
  ready(version = SHEETJS_VERSION_V1): void {
    this.emit({ version: 1, kind: 'ready', libraryVersion: version, libraryMs: 3 });
  }
  complete(task: WorkbookWorkerTaskV1, library: SheetJs): void {
    let timing: WorkbookReadTimingV1 | null = null;
    try {
      const summary = readWorkbookData(
        task.file,
        task.data,
        library,
        task.manifest,
        (value) => {
          timing = value;
        },
        task.captureValues,
      );
      this.emit({
        version: 1,
        kind: 'result',
        generation: task.generation,
        sourceFileIndex: task.sourceFileIndex,
        taskId: task.taskId,
        summary,
        timing,
      });
    } catch (cause) {
      this.emit({
        version: 1,
        kind: 'failure',
        generation: task.generation,
        sourceFileIndex: task.sourceFileIndex,
        taskId: task.taskId,
        message: cause instanceof Error ? cause.message : 'synthetic-content-error',
        timing,
      });
    }
  }
  listenerCount(): number {
    return [...this.listeners.values()].reduce((total, entries) => total + entries.size, 0);
  }
}

const fixedNow = () => new Date('2026-10-02T12:00:00.000Z');
const runtime = {
  now: fixedNow,
  digestSha256: async (data: ArrayBuffer) =>
    new Uint8Array(32).fill(new Uint8Array(data)[0] ?? 0).buffer,
  yieldBeforeRecognition: async () => undefined,
};
function file(index = 0, size = 1) {
  const arrayBuffer = vi.fn(async () => Uint8Array.of((index % 255) + 1).buffer);
  return {
    name: `SYNTHETIC-${index}.xlsx`,
    size,
    type: 'application/octet-stream',
    lastModified: 1_700_000_000_000 + index,
    arrayBuffer,
  } as unknown as File;
}
function libraryFor(workbook = WORKBOOK_READER_EQUIVALENCE_CASES_V1[0]!.workbook): SheetJs {
  return { ...createFixtureSheetJsV1(workbook), version: SHEETJS_VERSION_V1 };
}
const clients: WorkbookWorkerClientV1[] = [];
function fixture(options: { concurrency?: 1 | 2; workbook?: WorkbookFixtureV1 } = {}) {
  const workers: ControlledWorker[] = [];
  const library = libraryFor(options.workbook);
  const fallbackLibrary = vi.fn(async () => library);
  const onFallback = vi.fn(),
    onReady = vi.fn();
  const client = new WorkbookWorkerClientV1({
    generation: 42,
    concurrency: options.concurrency ?? 1,
    fallbackLibrary,
    onFallback,
    onReady,
    workerFactory: () => {
      const worker = new ControlledWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    },
  });
  clients.push(client);
  async function initialize() {
    const pending = client.initialize();
    workers.forEach((worker) => worker.ready());
    await pending;
  }
  return { client, workers, library, fallbackLibrary, onFallback, onReady, initialize };
}
async function readInput(selected = file(), sourceFileIndex = 6) {
  const data = await selected.arrayBuffer();
  const manifest = await createSourceFileManifest(selected, data, SHEETJS_VERSION_V1, runtime);
  return { selected, data, manifest, sourceFileIndex };
}
afterEach(() => {
  clients.splice(0).forEach((client) => client.close());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('bounded worker compatibility and lifecycle', () => {
  it.each([
    [undefined, undefined, 1],
    [8, undefined, 1],
    [undefined, 8, 1],
    [2, 8, 1],
    [8, 2, 1],
    [4, 4, 2],
    [64, 64, 2],
    [Infinity, 8, 1],
    [8, NaN, 1],
    ['8', 8, 1],
    [8, '8', 1],
  ])('caps capacity for declared threads %s / memory %s at %s', (threads, memory, expected) => {
    expect(workbookWorkerCapacityV1(threads, memory)).toBe(expected);
  });
  it('uses exactly the existing sparse reader when Worker is unavailable, without rereading bytes or sending requests', async () => {
    vi.stubGlobal('Worker', undefined);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const library = libraryFor();
    const fallbackLibrary = vi.fn(async () => library),
      onFallback = vi.fn();
    const client = new WorkbookWorkerClientV1({
      generation: 1,
      concurrency: 1,
      fallbackLibrary,
      onFallback,
    });
    clients.push(client);
    await client.initialize();
    const input = await readInput();
    const expected = readWorkbookData(
      input.selected,
      input.data,
      library,
      input.manifest,
      undefined,
      true,
    );
    expect(
      await client.read(input.selected, input.data, input.manifest, 6, true, () => undefined),
    ).toEqual(expected);
    expect(onFallback.mock.calls).toEqual([
      ['unavailable', null],
      ['unavailable', 6],
    ]);
    expect(fallbackLibrary).toHaveBeenCalledOnce();
    expect(input.selected.arrayBuffer).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('waits for every actual library ready before reading and reports bounded initialization separately', async () => {
    const f = fixture({ concurrency: 2 });
    let ready = false;
    const initializing = f.client.initialize().then(() => {
      ready = true;
    });
    f.workers[0]!.ready();
    await Promise.resolve();
    expect(ready).toBe(false);
    f.workers[1]!.ready();
    await initializing;
    expect(f.onReady).toHaveBeenCalledWith(expect.any(Number), 6, 2);
    expect(f.fallbackLibrary).not.toHaveBeenCalled();
    expect(f.workers).toHaveLength(2);
  });
  it.each(['version', 'security-message'])('never falls back around %s mismatch', async (mode) => {
    const f = fixture();
    const initializing = f.client.initialize();
    const rejected = expect(initializing).rejects.toBeInstanceOf(WorkbookWorkerSecurityErrorV1);
    if (mode === 'version') f.workers[0]!.ready('0.0.0');
    else f.workers[0]!.emit({ version: 1, kind: 'initialization-failed', security: true });
    await rejected;
    expect(f.fallbackLibrary).not.toHaveBeenCalled();
    expect(f.onFallback).not.toHaveBeenCalled();
    expect(f.workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(f.workers[0]!.listenerCount()).toBe(0);
  });
  it('uses a single initialization watchdog and clears all listeners before fallback', async () => {
    vi.useFakeTimers();
    const f = fixture({ concurrency: 2 });
    const initializing = f.client.initialize();
    f.workers[0]!.ready();
    await vi.advanceTimersByTimeAsync(WORKBOOK_WORKER_INITIALIZATION_TIMEOUT_V1);
    await initializing;
    expect(f.onFallback).toHaveBeenCalledExactlyOnceWith('initialization-timeout', null);
    expect(f.fallbackLibrary).toHaveBeenCalledOnce();
    expect(
      f.workers.every(
        (worker) => worker.terminate.mock.calls.length === 1 && worker.listenerCount() === 0,
      ),
    ).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['initializing', 'reading'])(
    'settles and removes every resource when closed while %s',
    async (stage) => {
      vi.useFakeTimers();
      const f = fixture();
      let pending: Promise<unknown>;
      let timing: ReturnType<typeof vi.fn<(timing: WorkbookReadTimingV1) => void>> | null = null;
      if (stage === 'initializing') pending = f.client.initialize();
      else {
        await f.initialize();
        const input = await readInput();
        timing = vi.fn<(timing: WorkbookReadTimingV1) => void>();
        pending = f.client.read(input.selected, input.data, input.manifest, 6, true, timing);
      }
      const oldListener = [...f.workers[0]!.listeners.get('message')!][0]!;
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      f.client.close();
      oldListener({
        data: { version: 1, kind: 'ready', libraryVersion: SHEETJS_VERSION_V1, libraryMs: 3 },
      });
      await rejected;
      expect(f.workers[0]!.listenerCount()).toBe(0);
      expect(f.workers[0]!.terminate).toHaveBeenCalledOnce();
      expect(f.fallbackLibrary).not.toHaveBeenCalled();
      expect(timing?.mock.calls ?? []).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});

describe('task correlation, transfer and bounded recovery', () => {
  it('transfers only the original buffer after the manifest, ignores bad/duplicate/obsolete replies, and preserves source position', async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.initialize();
    const input = await readInput(file(8), 6),
      timing = vi.fn();
    const expected = readWorkbookData(
      input.selected,
      input.data,
      f.library,
      input.manifest,
      undefined,
      true,
    );
    let settled = false;
    const reading = f.client
      .read(input.selected, input.data, input.manifest, 6, true, timing)
      .then((value) => {
        settled = true;
        return value;
      });
    const worker = f.workers[0]!,
      task = worker.tasks[0]!;
    expect(input.data.byteLength).toBe(0);
    expect(worker.transferLists[0]).toEqual([input.data]);
    expect(task.manifest).toEqual(input.manifest);
    expect(task.sourceFileIndex).toBe(6);
    expect(task.captureValues).toBe(true);
    const correlation = { version: 1, generation: 42, sourceFileIndex: 6, taskId: task.taskId };
    for (const value of [
      { ...correlation, kind: 'unknown-kind' },
      { ...correlation, kind: 'result', generation: 41, summary: expected },
      { ...correlation, kind: 'result', sourceFileIndex: 7, summary: expected },
      { ...correlation, kind: 'result', taskId: task.taskId + 1, summary: expected },
      { ...correlation, kind: 'result', version: 2, summary: expected },
    ])
      worker.emit(value);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
    worker.complete(task, f.library);
    expect(await reading).toEqual(expected);
    worker.complete(task, f.library);
    expect(timing).toHaveBeenCalledOnce();
    expect(f.fallbackLibrary).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not repeat a parser/content error and isolates a timing observer that throws from the same error', async () => {
    const f = fixture({ workbook: { SheetNames: [], Sheets: {} } });
    await f.initialize();
    const input = await readInput(),
      timing = vi.fn(() => {
        throw new Error('observer-error');
      });
    const reading = f.client.read(input.selected, input.data, input.manifest, 6, true, timing);
    const rejected = expect(reading).rejects.toThrow('A planilha não contém abas reconhecíveis.');
    f.workers[0]!.complete(f.workers[0]!.tasks[0]!, f.library);
    await rejected;
    expect(f.fallbackLibrary).not.toHaveBeenCalled();
    expect(input.selected.arrayBuffer).toHaveBeenCalledOnce();
    expect(timing).toHaveBeenCalledOnce();
  });
  it('isolates a throwing timing observer from a successfully recognized summary', async () => {
    const f = fixture();
    await f.initialize();
    const input = await readInput();
    const expected = readWorkbookData(
      input.selected,
      input.data,
      f.library,
      input.manifest,
      undefined,
      true,
    );
    const reading = f.client.read(input.selected, input.data, input.manifest, 6, true, () => {
      throw new Error('observer-error');
    });
    f.workers[0]!.complete(f.workers[0]!.tasks[0]!, f.library);
    expect(await reading).toEqual(expected);
    expect(f.fallbackLibrary).not.toHaveBeenCalled();
  });
  it.each(['error', 'messageerror', 'post-error', 'timeout'])(
    'recovers an unfinished detached file once after %s and ignores late replies',
    async (reason) => {
      vi.useFakeTimers();
      const f = fixture();
      await f.initialize();
      const worker = f.workers[0]!;
      if (reason === 'post-error') worker.postError = new Error('structured-clone-error');
      const input = await readInput();
      const expected = readWorkbookData(
        input.selected,
        input.data,
        f.library,
        input.manifest,
        undefined,
        true,
      );
      const timing = vi.fn();
      const oldListener = [...worker.listeners.get('message')!][0]!;
      const reading = f.client.read(input.selected, input.data, input.manifest, 6, true, timing);
      if (reason === 'timeout') await vi.advanceTimersByTimeAsync(WORKBOOK_WORKER_TASK_TIMEOUT_V1);
      else if (reason !== 'post-error') worker.event(reason as 'error' | 'messageerror');
      expect(await reading).toEqual(expected);
      expect(input.selected.arrayBuffer).toHaveBeenCalledTimes(reason === 'post-error' ? 1 : 2);
      expect(f.fallbackLibrary).toHaveBeenCalledOnce();
      expect(f.onFallback).toHaveBeenCalledExactlyOnceWith(
        reason === 'error' ? 'crash' : reason === 'timeout' ? 'task-timeout' : 'message-error',
        6,
      );
      oldListener({
        data: {
          version: 1,
          kind: 'result',
          generation: 42,
          sourceFileIndex: 6,
          taskId: 1,
          summary: expected,
          timing: null,
        },
      });
      expect(timing).toHaveBeenCalledOnce();
      expect(worker.listenerCount()).toBe(0);
      expect(worker.terminate).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it.each([
    'formula-caches',
    'holes-and-no-v',
    'formatted-text-fallback',
    'dimensions-fullref',
    'negative-grade',
    'invalid-text',
    'relation',
  ])('preserves cloned %s summary and canonical source states from H', async (id) => {
    const source = WORKBOOK_READER_EQUIVALENCE_CASES_V1.find((value) => value.id === id)!;
    const f = fixture({ workbook: source.workbook });
    await f.initialize();
    const input = await readInput();
    const expected = readWorkbookData(
      input.selected,
      input.data,
      f.library,
      input.manifest,
      undefined,
      true,
    );
    const reading = f.client.read(
      input.selected,
      input.data,
      input.manifest,
      6,
      true,
      () => undefined,
    );
    f.workers[0]!.complete(f.workers[0]!.tasks[0]!, f.library);
    const received = await reading;
    expect(received).toEqual(expected);
    const originalResult = syntheticResultV1(input.manifest, expected);
    const workerResult = syntheticResultV1(input.manifest, received);
    expect(collectGradebookImportDiagnosticsV1(workerResult)).toEqual(
      collectGradebookImportDiagnosticsV1(originalResult),
    );
    function canonical(result: typeof originalResult) {
      try {
        return { request: createGradebookCanonicalImportRequestV9(result) };
      } catch (cause) {
        return { error: cause instanceof Error ? cause.message : 'unexpected-error' };
      }
    }
    expect(canonical(workerResult)).toEqual(canonical(originalResult));
  });
  it('preserves captureValues=false independently from the productive true mode', async () => {
    const f = fixture();
    await f.initialize();
    const input = await readInput();
    const expected = readWorkbookData(
      input.selected,
      input.data,
      f.library,
      input.manifest,
      undefined,
      false,
    );
    const reading = f.client.read(
      input.selected,
      input.data,
      input.manifest,
      6,
      false,
      () => undefined,
    );
    f.workers[0]!.complete(f.workers[0]!.tasks[0]!, f.library);
    expect(await reading).toEqual(expected);
    expect(f.workers[0]!.tasks[0]!.captureValues).toBe(false);
  });
});

describe('ordered bounded product batch with the actual worker client', () => {
  it('does not publish completion progress after a fatal W2 failure, including a second input resolved later', async () => {
    const f = fixture({ concurrency: 2 });
    await f.initialize();
    const controller = new AbortController();
    const selected = [file(0), file(1), file(2)];
    let resolveLate!: (bytes: ArrayBuffer) => void;
    vi.mocked(selected[1]!.arrayBuffer).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLate = resolve;
        }),
    );
    const progress: BatchProgress[] = [],
      timings: ImportWorkbookFileTimingV1[] = [];
    const batch = importWorkbookBatch(
      selected,
      { version: SHEETJS_VERSION_V1 },
      (value) => progress.push(value),
      {
        ...runtime,
        localExecutor: f.client,
        signal: controller.signal,
        captureValues: true,
        onFileTiming: (timing) => timings.push(timing),
      },
    );
    const rejected = expect(batch).rejects.toMatchObject({ name: 'WorkbookWorkerSecurityErrorV1' });
    await vi.waitFor(() => expect(f.workers[0]!.tasks).toHaveLength(1));
    expect(selected[1]!.arrayBuffer).toHaveBeenCalledOnce();
    f.workers[0]!.emit({ version: 1, kind: 'initialization-failed', security: true });
    await rejected;
    const completionAtFailure = progress.filter((value) => value.stage === 'recognizing');
    // Deliberately do not abort this test's controller yet: the batch's own fatal
    // guard must suppress late progress even without relying on the hook's cleanup.
    f.workers[1]!.onTask = (task) => f.workers[1]!.complete(task, f.library);
    resolveLate(Uint8Array.of(2).buffer);
    // Drain the active input's promise chain, including its finally callback.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(completionAtFailure).toEqual([]);
    expect(progress.filter((value) => value.stage === 'recognizing')).toEqual([]);
    expect(f.workers[1]!.tasks).toEqual([]);
    expect(timings.some((value) => value.fileIndex === 1)).toBe(false);
    expect(selected[2]!.arrayBuffer).not.toHaveBeenCalled();
    expect(f.fallbackLibrary).not.toHaveBeenCalled();
    controller.abort();
  });
  it('reports the structural fallback at every later original source position while the surviving W2 slot is busy', async () => {
    const f = fixture({ concurrency: 2 });
    await f.initialize();
    const selected = [file(0), file(1), file(2), file(3)];
    const timings: ImportWorkbookFileTimingV1[] = [];
    const batch = importWorkbookBatch(selected, { version: SHEETJS_VERSION_V1 }, () => undefined, {
      ...runtime,
      localExecutor: f.client,
      captureValues: true,
      onFileTiming: (value) => timings.push(value),
    });
    await vi.waitFor(() =>
      expect(f.workers.every((worker) => worker.tasks.length === 1)).toBe(true),
    );
    f.workers[0]!.event('error');
    // The surviving worker remains busy with position 1, so positions 2/3 use
    // the same verified S0 fallback without transferring/rereading their input.
    await vi.waitFor(() => expect(timings.some((value) => value.fileIndex === 3)).toBe(true));
    expect(f.onFallback.mock.calls).toEqual([
      ['crash', 0],
      ['crash', 2],
      ['crash', 3],
    ]);
    f.workers[1]!.complete(f.workers[1]!.tasks[0]!, f.library);
    const result = await batch;
    expect(result.successes.map((value) => value.manifest.fileName)).toEqual(
      selected.map((value) => value.name),
    );
    expect(result.successes).toHaveLength(4);
    expect(result.failures).toEqual([]);
    expect(selected.map((value) => vi.mocked(value.arrayBuffer).mock.calls.length)).toEqual([
      2, 1, 1, 1,
    ]);
    expect(f.workers.map((worker) => worker.tasks.length)).toEqual([1, 1]);
    expect(f.fallbackLibrary).toHaveBeenCalledOnce();
    expect(f.workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(f.workers[0]!.listenerCount()).toBe(0);
    f.workers[0]!.complete(f.workers[0]!.tasks[0]!, f.library);
    expect(result.successes).toHaveLength(4);
    expect(f.onFallback).toHaveBeenCalledTimes(3);
  });
  it('recognizes two years and a Relation selected last before returning the same ordered canonical requests', async () => {
    const f = fixture({ concurrency: 2 });
    await f.initialize();
    const nextYear = structuredClone(WORKBOOK_READER_EQUIVALENCE_CASES_V1[0]!.workbook);
    nextYear.Sheets['CONFIGURAÇÃO']!.C2 = { t: 'n', v: 2027 };
    const relation = WORKBOOK_READER_EQUIVALENCE_CASES_V1.find(
      (value) => value.id === 'relation',
    )!.workbook;
    const libraries = [f.library, libraryFor(nextYear), libraryFor(relation)];
    const completion: number[] = [];
    for (const worker of f.workers)
      worker.onTask = (task) =>
        setTimeout(
          () => {
            completion.push(task.sourceFileIndex);
            worker.complete(task, libraries[task.sourceFileIndex]!);
          },
          task.sourceFileIndex === 0 ? 8 : 0,
        );
    const result = await importWorkbookBatch(
      [file(0), file(1), file(2)],
      { version: SHEETJS_VERSION_V1 },
      () => undefined,
      { ...runtime, localExecutor: f.client, captureValues: true },
    );
    expect(completion[0]).toBe(1);
    expect(result.failures).toEqual([]);
    const requests = result.successes.map((value) =>
      createGradebookCanonicalImportRequestV9(value),
    );
    expect(requests.map((value) => value.ano)).toEqual([2026, 2027, 2026]);
    expect(requests.map((value) => value.operation)).toEqual([
      'persist-notas',
      'persist-notas',
      'persist-relacao',
    ]);
    expect(result.successes.at(-1)?.summary).toHaveProperty('masterRelationV9');
  });
  it.each([18, 50])(
    'keeps %s files in original order under two active local inputs and produces real completion progress',
    async (count) => {
      const f = fixture({ concurrency: 2 });
      await f.initialize();
      const selected = Array.from({ length: count }, (_, index) => file(index));
      const progress: BatchProgress[] = [],
        timing: ImportWorkbookFileTimingV1[] = [];
      const localTiming = vi.fn();
      let active = 0,
        peak = 0;
      for (const worker of f.workers)
        worker.onTask = (task) => {
          active++;
          peak = Math.max(peak, active);
          // Adjacent source positions finish in reverse order to expose ordering mistakes.
          setTimeout(
            () => {
              active--;
              worker.complete(task, f.library);
            },
            task.sourceFileIndex % 2 ? 0 : 2,
          );
        };
      const result = await importWorkbookBatch(
        selected,
        { version: SHEETJS_VERSION_V1 },
        (value) => progress.push(value),
        {
          ...runtime,
          localExecutor: f.client,
          captureValues: true,
          onFileTiming: (value) => timing.push(value),
          onLocalTiming: localTiming,
        },
      );
      expect(result.successes.map((value) => value.manifest.fileName)).toEqual(
        selected.map((value) => value.name),
      );
      expect(result.batch.files.map((value) => value.sourceFile.fileName)).toEqual(
        selected.map((value) => value.name),
      );
      expect(result.failures).toEqual([]);
      expect(peak).toBe(2);
      expect(f.workers).toHaveLength(2);
      expect(selected.every((value) => vi.mocked(value.arrayBuffer).mock.calls.length === 1)).toBe(
        true,
      );
      expect(f.workers.flatMap((worker) => worker.tasks).every((task) => task.captureValues)).toBe(
        true,
      );
      expect(timing.map((value) => value.fileIndex).sort((a, b) => a - b)).toEqual(
        selected.map((_, index) => index),
      );
      const completed = progress.filter((value) => value.stage === 'recognizing');
      expect(completed.map((value) => value.current)).toEqual(
        selected.map((_, index) => index + 1),
      );
      expect(localTiming).toHaveBeenCalledExactlyOnceWith({
        maximumActiveLocalInputs: 2,
        maximumActiveInputBytes: 2,
        inputByteBudget: WORKBOOK_WORKER_INPUT_BUDGET_V1,
      });
      expect(
        validateBatchSize([...selected, ...Array.from({ length: 51 - count }, () => file())]),
      ).not.toBeNull();
    },
  );
  it('processes an input larger than the byte budget alone without rejecting it or reading later files early', async () => {
    const f = fixture({ concurrency: 2 });
    await f.initialize();
    const selected = [file(0, WORKBOOK_WORKER_INPUT_BUDGET_V1 + 1), file(1), file(2)];
    const localTiming = vi.fn();
    const resultPromise = importWorkbookBatch(
      selected,
      { version: SHEETJS_VERSION_V1 },
      () => undefined,
      { ...runtime, localExecutor: f.client, captureValues: true, onLocalTiming: localTiming },
    );
    await vi.waitFor(() => expect(f.workers[0]!.tasks).toHaveLength(1));
    expect(selected[1]!.arrayBuffer).not.toHaveBeenCalled();
    expect(selected[2]!.arrayBuffer).not.toHaveBeenCalled();
    f.workers[0]!.complete(f.workers[0]!.tasks[0]!, f.library);
    await vi.waitFor(() => expect(f.workers.flatMap((worker) => worker.tasks)).toHaveLength(3));
    for (const worker of f.workers) {
      const task = worker.tasks.at(-1)!;
      if (task.sourceFileIndex > 0) worker.complete(task, f.library);
    }
    const result = await resultPromise;
    expect(result.successes).toHaveLength(3);
    expect(result.failures).toEqual([]);
    expect(localTiming).toHaveBeenCalledExactlyOnceWith({
      maximumActiveLocalInputs: 2,
      maximumActiveInputBytes: WORKBOOK_WORKER_INPUT_BUDGET_V1 + 1,
      inputByteBudget: WORKBOOK_WORKER_INPUT_BUDGET_V1,
    });
  });
  it('keeps individual content failures and ordered diagnostics while successful files continue', async () => {
    const f = fixture({ concurrency: 2 });
    await f.initialize();
    const selected = [file(0), file(1), file(2)];
    for (const worker of f.workers)
      worker.onTask = (task) =>
        queueMicrotask(() => {
          worker.complete(
            task,
            task.sourceFileIndex === 1 ? libraryFor({ SheetNames: [], Sheets: {} }) : f.library,
          );
        });
    const result = await importWorkbookBatch(
      selected,
      { version: SHEETJS_VERSION_V1 },
      () => undefined,
      { ...runtime, localExecutor: f.client, captureValues: true },
    );
    expect(result.successes.map((value) => value.manifest.fileName)).toEqual([
      selected[0]!.name,
      selected[2]!.name,
    ]);
    expect(result.failureDetails).toMatchObject([
      {
        fileName: selected[1]!.name,
        stage: 'recognition',
        message: 'A planilha não contém abas reconhecíveis.',
      },
    ]);
    expect(result.batch.files.map((value) => value.status)).toEqual([
      'approved',
      'failed',
      'approved',
    ]);
    expect(f.fallbackLibrary).not.toHaveBeenCalled();
  });
  it.each(['abort', 'security'])(
    'rejects the complete batch on %s without constructing an ordinary file failure',
    async (kind) => {
      const f = fixture();
      await f.initialize();
      const controller = new AbortController();
      const selected = [file(0), file(1)];
      const batch = importWorkbookBatch(
        selected,
        { version: SHEETJS_VERSION_V1 },
        () => undefined,
        { ...runtime, localExecutor: f.client, signal: controller.signal, captureValues: true },
      );
      const rejection = expect(batch).rejects.toMatchObject({
        name: kind === 'abort' ? 'AbortError' : 'WorkbookWorkerSecurityErrorV1',
      });
      await vi.waitFor(() => expect(f.workers[0]!.tasks).toHaveLength(1));
      if (kind === 'abort') {
        controller.abort();
        f.client.close();
      } else f.workers[0]!.emit({ version: 1, kind: 'initialization-failed', security: true });
      await rejection;
      expect(selected[1]!.arrayBuffer).not.toHaveBeenCalled();
      expect(f.fallbackLibrary).not.toHaveBeenCalled();
    },
  );
});
