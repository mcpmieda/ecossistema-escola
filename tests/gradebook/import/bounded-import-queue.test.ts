import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GRADEBOOK_IMPORT_FILE_CONCURRENCY_V1,
  useImportBatch,
} from '../../../src/features/gradebook/import/use-import-batch';
import type { BatchSuccess } from '../../../src/features/gradebook/import/import-batch';
import type {
  GradebookImportPersistenceRequestV9,
  GradebookImportPersistenceResponseV9,
} from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v9';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  compact: vi.fn(),
  persist: vi.fn(),
  audit: vi.fn(),
  diagnostics: vi.fn(),
  blocking: vi.fn(),
  refreshYears: vi.fn(),
}));
vi.mock('../../../src/features/gradebook/import/sheetjs-loader', () => ({
  loadSheetJs: async () => ({}),
  preloadSheetJs: () => undefined,
}));
vi.mock('../../../src/features/gradebook/import/import-batch', () => ({
  importWorkbookBatch: mocks.read,
  countWorkbookOperationalClassesV1: () => 1,
  validateBatchSize: (files: readonly File[]) =>
    files.length > 50 ? 'Limite de 50 arquivos.' : null,
}));
vi.mock('../../../src/features/gradebook/import/canonical-import-v9', () => ({
  createGradebookCanonicalImportRequestV9: mocks.compact,
  unavailableCellsV9: () => 0,
}));
vi.mock('../../../src/features/gradebook/import/import-diagnostics-v1', () => ({
  collectGradebookImportDiagnosticsV1: mocks.diagnostics,
  blockingGradebookImportDiagnosticsV1: mocks.blocking,
  sourceUnavailableGradebookImportDiagnosticsV1: () => [],
  gradebookImportDiagnosticsAuditRequestV1: (
    result: BatchSuccess,
    diagnostics: readonly unknown[],
  ) => ({
    version: 1,
    academicYear: result.summary.academicYear ?? null,
    fileName: result.manifest.fileName,
    sha256: 'a'.repeat(64),
    diagnostics,
  }),
}));
vi.mock('../../../src/platform/gradebook-year-context', () => ({
  useGradebookYear: () => ({ refreshYears: mocks.refreshYears }),
}));
vi.mock('../../../src/features/gradebook/import/import-diagnostics-client-v1', () => ({
  persistGradebookImportDiagnosticsAuditV1: mocks.audit,
}));
vi.mock('../../../src/features/gradebook/import/import-persistence-client-v9', () => ({
  persistGradebookCanonicalImportV9: mocks.persist,
}));

const emptyWrites = {
  logicalSources: 0,
  sourceFileVersions: 0,
  importBatchVersions: 0,
  assessmentComponentVersions: 0,
  academicRecordVersions: 0,
  logicalSourceRecordAssociationVersions: 0,
  total: 0,
};
function confirmed(): {
  readonly response: GradebookImportPersistenceResponseV9;
  readonly serverMs: null;
} {
  return {
    response: {
      transportVersion: 9,
      state: 'no-changes',
      summary: {
        assessmentDefinitions: { total: 0, resolved: 0, blocked: 0 },
        assessmentComponents: { unchanged: 0, new: 0, changed: 0, blocked: 0 },
        academicRecords: {
          unchanged: 0,
          new: 0,
          changed: 0,
          missingFromNewSource: 0,
          blocked: 0,
        },
        plannedWrites: emptyWrites,
        committedWrites: emptyWrites,
      },
    },
    serverMs: null,
  };
}
function request(result: BatchSuccess): GradebookImportPersistenceRequestV9 {
  const term = (trimestre: 1 | 2 | 3) => ({
    trimestre,
    instrumentos: [[1, 10_000] as const],
    alunos: [[1, [null], null] as const],
  });
  return {
    transportVersion: 9,
    operation: 'persist-notas',
    manifest: {
      fileName: result.manifest.fileName,
      sha256: result.manifest.sha256,
      parserVersion: 'synthetic:canonical-v9',
    },
    ano: result.summary.academicYear ?? 2026,
    professor: 'Docente sintético',
    ofertas: [
      {
        turmaCodigo: '6A',
        disciplina: 'Componente sintético',
        trimestres: [term(1), term(2), term(3)],
        recuperacao: null,
      },
    ],
  };
}
function result(index: number, academicYear = 2026): BatchSuccess {
  return {
    id: `file:${index}`,
    manifest: {
      fileName: `sintetico-${index}.xlsb`,
      extension: 'xlsb',
      reportedMimeType: null,
      sizeBytes: 100,
      lastModifiedAt: null,
      sha256: index.toString(16).padStart(64, '0'),
      sourceContractVersion: 2,
      parserVersion: 'synthetic',
      readAt: '2026-09-01T00:00:00.000Z',
    },
    summary: {
      academicYear,
      teacherName: 'Docente sintético',
      classes: [{ students: 1 }],
      gradeSheets: [],
    },
  } as unknown as BatchSuccess;
}
function files(count: number): FileList {
  return Array.from(
    { length: count },
    (_, index) => new File(['synthetic'], `sintetico-${index}.xlsb`),
  ) as unknown as FileList;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}
async function startBatch(count: number): Promise<{ done: Promise<void> }> {
  let done!: Promise<void>;
  await act(async () => {
    done = flow.handleFiles(files(count));
    await Promise.resolve();
  });
  return { done };
}
async function yieldLocalPreparation(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}
function relationResult(index: number): BatchSuccess {
  const value = result(index);
  return {
    ...value,
    summary: { ...value.summary, masterRelationV9: { ano: 2026, turmas: [] } },
  } as unknown as BatchSuccess;
}
function relationRequest(value: BatchSuccess): GradebookImportPersistenceRequestV9 {
  return {
    transportVersion: 9,
    operation: 'persist-relacao',
    ano: 2026,
    manifest: {
      fileName: value.manifest.fileName,
      sha256: value.manifest.sha256,
      parserVersion: 'synthetic',
    },
    turmas: [],
  };
}
function lastBatchTiming(): Record<string, unknown> {
  return vi
    .mocked(console.info)
    .mock.calls.map((call) => JSON.parse(String(call[1])) as Record<string, unknown>)
    .filter((value) => value.stage === 'batch-complete')
    .at(-1)!;
}
let root: Root;
let host: HTMLDivElement;
let flow: ReturnType<typeof useImportBatch>;
let sequence: string[];
function Probe() {
  flow = useImportBatch();
  return null;
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  sequence = [];
  mocks.diagnostics.mockReturnValue([]);
  mocks.blocking.mockReturnValue([]);
  mocks.refreshYears.mockResolvedValue(undefined);
  mocks.read.mockImplementation(async (input: readonly File[]) => ({
    successes: input.map((_, index) => result(index)),
    failureDetails: [],
  }));
  mocks.compact.mockImplementation((input: BatchSuccess) => {
    sequence.push(`compact:${input.id}`);
    return request(input);
  });
  mocks.persist.mockImplementation(async (value: GradebookImportPersistenceRequestV9) => {
    sequence.push(`send:${value.manifest.fileName}`);
    await Promise.resolve();
    return confirmed();
  });
  mocks.audit.mockResolvedValue({ version: 1, state: 'recorded', affected: 0 });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(createElement(Probe));
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Bounded per-file canonical queue (V9)', () => {
  it('reports a comparable 18-file same-year fixture with injected local/audit/persistence costs', async () => {
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    mocks.compact.mockImplementation((value) => {
      clock += 3;
      return request(value);
    });
    mocks.audit.mockImplementation(async () => {
      clock += 80;
      return { version: 1, state: 'recorded', affected: 0 };
    });
    mocks.persist.mockImplementation(async (_request, _timing, onDispatch) => {
      onDispatch?.();
      clock += 5;
      return confirmed();
    });
    await act(async () => flow.handleFiles(files(18)));
    const measured = lastBatchTiming();
    expect(measured).toMatchObject({ confirmedRequests: 18, batchElapsedMs: 1584 });
    expect(flow.pendingPersistenceCount).toBe(0);
    expect(mocks.persist.mock.calls.map(([value]) => value.manifest.fileName)).toEqual(
      Array.from({ length: 18 }, (_, index) => `sintetico-${index}.xlsb`),
    );
    // This controlled clock proves scheduling under equal injected costs, not real network latency.
    console.log(
      JSON.stringify({
        scenario: 'M07-browser-controlled-clock',
        executions: 1,
        localCostMs: 3,
        auditCostMs: 80,
        persistenceCostMs: 5,
        ...measured,
      }),
    );
  });

  it('recognizes the entire selection before dispatch and overlaps only one local next item with the first write', async () => {
    vi.useFakeTimers();
    const recognition = deferred<{ successes: BatchSuccess[]; failureDetails: [] }>();
    const firstWrite = deferred<ReturnType<typeof confirmed>>();
    mocks.read.mockReturnValue(recognition.promise);
    mocks.audit.mockImplementation(async (value) => {
      sequence.push(`audit:${value.fileName}`);
      return { version: 1, state: 'recorded', affected: 0 };
    });
    mocks.persist.mockImplementation(async (value, _timing, onDispatch) => {
      onDispatch?.();
      sequence.push(`persist:${value.manifest.fileName}`);
      if (value.manifest.fileName === 'sintetico-0.xlsb') return firstWrite.promise;
      return confirmed();
    });
    const { done } = await startBatch(3);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.compact).not.toHaveBeenCalled();
    await act(async () => {
      recognition.resolve({ successes: [result(0), result(1), result(2)], failureDetails: [] });
    });
    expect(mocks.persist).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    await yieldLocalPreparation();
    expect(mocks.compact).toHaveBeenCalledTimes(2);
    expect(sequence).toContain('compact:file:1');
    expect(sequence).not.toContain('audit:sintetico-1.xlsb');
    expect(sequence).not.toContain('persist:sintetico-1.xlsb');
    expect(mocks.audit.mock.calls[0]![0].diagnostics).toEqual([]);
    await act(async () => {
      firstWrite.resolve(confirmed());
      await vi.runAllTimersAsync();
      await done;
    });
    expect(sequence.indexOf('persist:sintetico-0.xlsb')).toBeLessThan(
      sequence.indexOf('audit:sintetico-1.xlsb'),
    );
    expect(lastBatchTiming()).toMatchObject({
      maximumPreparedTeacherItems: 2,
      maximumPreparedRelations: 0,
      maximumActiveYearLanes: 1,
      confirmedRequests: 3,
    });
    expect(flow.diagnosticAuditFailures).toEqual({});
  });

  it('does not audit or write a prepared next item after the current write becomes uncertain and resumes only pendings', async () => {
    vi.useFakeTimers();
    const firstWrite = deferred<ReturnType<typeof confirmed>>();
    mocks.persist.mockReturnValueOnce(firstWrite.promise);
    const { done } = await startBatch(3);
    await yieldLocalPreparation();
    expect(mocks.compact).toHaveBeenCalledTimes(2);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    await act(async () => {
      firstWrite.resolve({
        response: { transportVersion: 9, state: 'unavailable' },
        serverMs: null,
      } as ReturnType<typeof confirmed>);
      await done;
    });
    expect(mocks.persist).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    expect(flow.persistence['file:0']?.state).toBe('confirmation-required');
    expect(flow.persistence['file:1']?.state).toBe('processing');
    expect(flow.persistence['file:2']?.state).toBe('recognized');
    mocks.persist.mockClear().mockResolvedValue(confirmed());
    await act(async () => {
      const resumed = flow.resumePendingPersistence();
      await vi.runAllTimersAsync();
      await resumed;
    });
    expect(mocks.persist).toHaveBeenCalledTimes(3);
    expect(flow.pendingPersistenceCount).toBe(0);
  });

  it('retains at most eight teacher preparations and four active years, serializing audit and persistence per year', async () => {
    vi.useFakeTimers();
    const values = Array.from({ length: 12 }, (_, index) =>
      result(index, 2026 + Math.floor(index / 2)),
    );
    mocks.read.mockResolvedValue({ successes: values, failureDetails: [] });
    const firstWrites = Array.from({ length: 4 }, () => deferred<ReturnType<typeof confirmed>>());
    const active = new Map<number, number>();
    let maximumSameYear = 0;
    const enter = (year: number) => {
      const count = (active.get(year) ?? 0) + 1;
      active.set(year, count);
      maximumSameYear = Math.max(maximumSameYear, count);
    };
    const leave = (year: number) => active.set(year, active.get(year)! - 1);
    mocks.audit.mockImplementation(async (value) => {
      enter(value.academicYear);
      await Promise.resolve();
      leave(value.academicYear);
      return { version: 1, state: 'recorded', affected: 0 };
    });
    mocks.persist.mockImplementation(async (value, _timing, onDispatch) => {
      onDispatch?.();
      enter(value.ano);
      if (
        value.ano < 2030 &&
        Number(value.manifest.fileName.split('-')[1]!.split('.')[0]) % 2 === 0
      )
        await firstWrites[value.ano - 2026]!.promise;
      leave(value.ano);
      return confirmed();
    });
    const { done } = await startBatch(12);
    await yieldLocalPreparation();
    expect(mocks.persist).toHaveBeenCalledTimes(4);
    expect(mocks.compact).toHaveBeenCalledTimes(8);
    expect(mocks.audit).toHaveBeenCalledTimes(4);
    expect(mocks.persist.mock.calls.map(([value]) => value.ano)).toEqual([2026, 2027, 2028, 2029]);
    await act(async () => {
      for (const write of firstWrites) write.resolve(confirmed());
      await vi.runAllTimersAsync();
      await done;
    });
    expect(mocks.persist).toHaveBeenCalledTimes(12);
    expect(maximumSameYear).toBe(1);
    expect(lastBatchTiming()).toMatchObject({
      maximumPreparedTeacherItems: 8,
      maximumPreparedItems: 8,
      maximumActiveYearLanes: 4,
      confirmedRequests: 12,
    });
    expect(flow.pendingPersistenceCount).toBe(0);
  });

  it('preflights every relation and blocks teachers if a later relation is invalid', async () => {
    const values = [result(0), relationResult(1), relationResult(2), result(3)];
    mocks.read.mockResolvedValue({ successes: values, failureDetails: [] });
    mocks.compact.mockImplementation((value) => {
      if (value.id === 'file:2') throw new Error('synthetic invalid relation');
      return value.id === 'file:1' ? relationRequest(value) : request(value);
    });
    await act(async () => flow.handleFiles(files(4)));
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.compact.mock.calls.map(([value]) => value.id)).toEqual(['file:1', 'file:2']);
    expect(mocks.audit).toHaveBeenCalledTimes(2);
    expect(mocks.audit.mock.calls[1]![0].diagnostics).toEqual([]);
    expect(flow.persistence['file:0']?.state).toBe('failed');
    expect(flow.persistence['file:3']?.state).toBe('failed');
    expect(mocks.refreshYears).not.toHaveBeenCalled();
  });

  it.each(['blocked', 'conflict', 'invalid-request', 'review-required'] as const)(
    'never releases teachers after a relation response %s without academic confirmation',
    async (state) => {
      mocks.read.mockResolvedValue({
        successes: [relationResult(0), result(1)],
        failureDetails: [],
      });
      mocks.compact.mockImplementation((value) =>
        value.id === 'file:0' ? relationRequest(value) : request(value),
      );
      mocks.persist.mockResolvedValue({
        response: { transportVersion: 9, state, reason: 'synthetic refusal' },
        serverMs: null,
      });
      await act(async () => flow.handleFiles(files(2)));
      expect(mocks.persist).toHaveBeenCalledTimes(1);
      expect(mocks.compact).toHaveBeenCalledTimes(1);
      expect(mocks.refreshYears).not.toHaveBeenCalled();
      expect(flow.persistence['file:1']?.state).toBe('failed');
      expect(lastBatchTiming()).toMatchObject({ confirmedRequests: 0, outcome: 'blocked' });
    },
  );

  it('confirms all relations with re-audit and refresh before preparing or sending teachers', async () => {
    const values = [result(0), relationResult(1), relationResult(2), result(3)];
    mocks.read.mockResolvedValue({ successes: values, failureDetails: [] });
    mocks.compact.mockImplementation((value) =>
      value.id === 'file:1' || value.id === 'file:2' ? relationRequest(value) : request(value),
    );
    const writes = [
      deferred<ReturnType<typeof confirmed>>(),
      deferred<ReturnType<typeof confirmed>>(),
    ];
    mocks.persist.mockImplementation(async (value) =>
      value.operation === 'persist-relacao'
        ? writes[Number(value.manifest.fileName.split('-')[1]!.split('.')[0]) - 1]!.promise
        : confirmed(),
    );
    const { done } = await startBatch(4);
    expect(mocks.persist).toHaveBeenCalledTimes(1);
    expect(mocks.compact.mock.calls.map(([value]) => value.id)).toEqual(['file:1', 'file:2']);
    await act(async () => {
      writes[0]!.resolve(confirmed());
    });
    expect(mocks.persist).toHaveBeenCalledTimes(2);
    expect(mocks.compact).toHaveBeenCalledTimes(2);
    expect(mocks.refreshYears).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledTimes(3);
    await act(async () => {
      writes[1]!.resolve(confirmed());
      await done;
    });
    expect(mocks.refreshYears).toHaveBeenCalledTimes(2);
    expect(mocks.persist.mock.calls.map(([value]) => value.operation)).toEqual([
      'persist-relacao',
      'persist-relacao',
      'persist-notas',
      'persist-notas',
    ]);
    expect(mocks.audit).toHaveBeenCalledTimes(6);
    expect(lastBatchTiming()).toMatchObject({
      maximumPreparedRelations: 2,
      maximumPreparedTeacherItems: 2,
    });
  });

  it('records blocked/local-failed/unknown-year observations and preserves separate audit failures', async () => {
    const unknown = {
      ...result(0),
      summary: { ...result(0).summary, academicYear: null },
    } as unknown as BatchSuccess;
    mocks.read.mockResolvedValue({
      successes: [result(1), unknown, result(2), result(3)],
      failureDetails: [],
    });
    const diagnostic = { severity: 'blocking-error', code: 'invalid-text', message: 'synthetic' };
    mocks.diagnostics.mockImplementation((value) => (value.id === 'file:2' ? [diagnostic] : []));
    mocks.blocking.mockImplementation((diagnostics) =>
      diagnostics.filter((value: typeof diagnostic) => value.severity === 'blocking-error'),
    );
    mocks.compact.mockImplementation((value) => {
      if (value.id === 'file:3') throw new Error('synthetic canonical failure');
      return request(value);
    });
    mocks.audit.mockImplementation(async (value) =>
      value.fileName === 'sintetico-1.xlsb'
        ? { version: 1, state: 'unavailable' }
        : { version: 1, state: 'recorded', affected: 0 },
    );
    await act(async () => flow.handleFiles(files(4)));
    expect(mocks.audit.mock.calls.map(([value]) => value.fileName)).toEqual([
      'sintetico-0.xlsb',
      'sintetico-1.xlsb',
      'sintetico-2.xlsb',
      'sintetico-3.xlsb',
    ]);
    expect(mocks.audit.mock.calls[0]![0].academicYear).toBeNull();
    expect(mocks.audit.mock.calls[2]![0].diagnostics).toEqual([diagnostic]);
    expect(mocks.persist).toHaveBeenCalledTimes(1);
    expect(flow.persistence['file:0']?.state).toBe('failed');
    expect(flow.persistence['file:1']?.state).toBe('completed');
    expect(flow.persistence['file:2']?.state).toBe('failed');
    expect(flow.persistence['file:3']?.state).toBe('failed');
    expect(Object.keys(flow.diagnosticAuditFailures)).toEqual(['file:1']);
  });

  it('stops on authorization from audit without a false receipt or academic POST', async () => {
    mocks.audit.mockResolvedValue({ version: 1, state: 'not-authorized' });
    await act(async () => flow.handleFiles(files(3)));
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(flow.persistence['file:0']?.state).toBe('auth-required');
    expect(flow.pendingPersistenceCount).toBe(3);
    expect(flow.diagnosticAuditFailures['file:0']).toBeTruthy();
  });

  it('keeps audit network failure visible while preserving the existing independent academic write policy', async () => {
    mocks.audit.mockRejectedValue(new TypeError('synthetic audit lost reply'));
    await act(async () => flow.handleFiles(files(1)));
    expect(mocks.persist).toHaveBeenCalledTimes(1);
    expect(flow.persistence['file:0']?.state).toBe('completed');
    expect(flow.diagnosticAuditFailures['file:0']).toBeTruthy();
    const timings = vi
      .mocked(console.info)
      .mock.calls.map((call) => JSON.parse(String(call[1])) as Record<string, unknown>);
    expect(timings.find((value) => value.stage === 'audit-request')).toMatchObject({
      outcome: 'failed',
    });
  });

  it('drains started writes, prioritizes uncertainty over authorization, and never sends prepared followers', async () => {
    vi.useFakeTimers();
    const values = [
      result(0, 2026),
      result(1, 2027),
      result(2, 2028),
      result(3, 2026),
      result(4, 2027),
    ];
    mocks.read.mockResolvedValue({ successes: values, failureDetails: [] });
    const replies = Array.from({ length: 3 }, () =>
      deferred<{ response: GradebookImportPersistenceResponseV9; serverMs: null }>(),
    );
    mocks.persist.mockImplementation(
      (value) => replies[Number(value.manifest.fileName.split('-')[1]!.split('.')[0])]!.promise,
    );
    const { done } = await startBatch(5);
    await yieldLocalPreparation();
    expect(mocks.persist).toHaveBeenCalledTimes(3);
    await act(async () => {
      replies[0]!.resolve({
        response: { transportVersion: 9, state: 'not-authorized' },
        serverMs: null,
      });
    });
    expect(flow.loading).toBe(true);
    await act(async () => {
      replies[2]!.resolve(confirmed());
    });
    expect(flow.persistence['file:2']?.state).toBe('completed');
    expect(flow.loading).toBe(true);
    await act(async () => {
      replies[1]!.resolve({
        response: { transportVersion: 9, state: 'unavailable' },
        serverMs: null,
      });
      await done;
    });
    expect(mocks.persist).toHaveBeenCalledTimes(3);
    expect(mocks.audit).toHaveBeenCalledTimes(3);
    expect(flow.persistence['file:0']?.state).toBe('auth-required');
    expect(flow.persistence['file:1']?.state).toBe('confirmation-required');
    expect(flow.pendingPersistenceCount).toBe(4);
    expect(flow.error).toContain('incerta');
    mocks.persist.mockClear().mockResolvedValue(confirmed());
    await act(async () => {
      const resumed = flow.resumePendingPersistence();
      await vi.runAllTimersAsync();
      await resumed;
    });
    expect(mocks.persist).toHaveBeenCalledTimes(4);
    expect(
      mocks.persist.mock.calls.some(([value]) => value.manifest.fileName === 'sintetico-2.xlsb'),
    ).toBe(false);
  });

  it('ignores late responses after unmount and does not populate a newly mounted selection', async () => {
    vi.useFakeTimers();
    const oldReply = deferred<{ response: GradebookImportPersistenceResponseV9; serverMs: null }>();
    mocks.persist.mockReturnValueOnce(oldReply.promise);
    const { done: oldDone } = await startBatch(3);
    await yieldLocalPreparation();
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(createElement(Probe)));
    mocks.read.mockResolvedValue({ successes: [result(50)], failureDetails: [] });
    mocks.persist.mockResolvedValue(confirmed());
    await act(async () => flow.handleFiles(files(1)));
    const logs = vi.mocked(console.info).mock.calls.length;
    await act(async () => {
      oldReply.resolve({ response: { transportVersion: 9, state: 'unavailable' }, serverMs: null });
      await oldDone;
    });
    expect(flow.results.map((value) => value.id)).toEqual(['file:50']);
    expect(Object.keys(flow.persistence)).toEqual(['file:50']);
    expect(flow.persistence['file:50']?.state).toBe('completed');
    expect(flow.error).toBeNull();
    expect(flow.loading).toBe(false);
    expect(vi.mocked(console.info).mock.calls).toHaveLength(logs);
    expect(mocks.persist).toHaveBeenCalledTimes(2);
  });

  it('separates audit network time from canonical build and records academic POST/confirmation milestones', async () => {
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    mocks.audit.mockImplementation(async () => {
      clock += 80;
      return { version: 1, state: 'recorded', affected: 0 };
    });
    mocks.compact.mockImplementation((input: BatchSuccess) => {
      clock += 3;
      return request(input);
    });
    mocks.persist.mockImplementation(async (_value, onTiming, onDispatch) => {
      onDispatch?.();
      clock += 5;
      onTiming?.({
        serializationMs: 0,
        payloadBytes: 100,
        persistRequestMs: 5,
        outcome: 'no-changes',
      });
      return confirmed();
    });
    await act(async () => flow.handleFiles(files(1)));
    const timings = vi
      .mocked(console.info)
      .mock.calls.map((call) => JSON.parse(String(call[1])) as Record<string, unknown>);
    expect(timings.find((value) => value.stage === 'audit-request')).toMatchObject({
      auditRequestMs: 80,
      outcome: 'recorded',
    });
    expect(timings.find((value) => value.stage === 'canonical-file')).toMatchObject({
      version: 2,
      diagnosticLocalMs: 0,
      canonicalBuildMs: 3,
      totalMs: 83,
    });
    expect(timings.find((value) => value.stage === 'persistence-dispatch')).toMatchObject({
      queueWaitMs: 0,
    });
    expect(timings.find((value) => value.stage === 'batch-complete')).toMatchObject({
      firstPersistenceStartedMs: 83,
      firstConfirmedPersistenceMs: 88,
      batchElapsedMs: 88,
      maximumPreparedItems: 1,
      maximumActiveYearLanes: 1,
      confirmedRequests: 1,
    });
  });

  it('preserves confirmed persistence when the optional browser logger fails', async () => {
    vi.mocked(console.info).mockImplementation(() => {
      throw new Error('synthetic-logger-failed');
    });
    await act(async () => flow.handleFiles(files(1)));
    expect(Object.values(flow.persistence).every((value) => value.state === 'completed')).toBe(
      true,
    );
    expect(flow.error).toBeNull();
  });

  it('treats server no-changes as a completed identical reimport without academic writes', async () => {
    await act(async () => flow.handleFiles(files(18)));
    expect(mocks.compact).toHaveBeenCalledTimes(18);
    expect(mocks.persist).toHaveBeenCalledTimes(18);
    expect(Object.values(flow.persistence)).toHaveLength(18);
    expect(Object.values(flow.persistence).every((state) => state.state === 'completed')).toBe(
      true,
    );
    expect(
      Object.values(flow.persistence).every(
        (state) => state.state !== 'completed' || state.response.state === 'no-changes',
      ),
    ).toBe(true);
    expect(flow.pendingPersistenceCount).toBe(0);
  });

  it('re-audits a Relação only after its first materialization is confirmed', async () => {
    const base = result(0);
    const relation = {
      ...base,
      summary: { ...base.summary, masterRelationV9: { turmas: [] } },
    } as BatchSuccess;
    mocks.read.mockResolvedValue({ successes: [relation], failureDetails: [] });
    mocks.compact.mockImplementationOnce((input: BatchSuccess) => ({
      transportVersion: 9,
      operation: 'persist-relacao',
      manifest: {
        fileName: input.manifest.fileName,
        sha256: input.manifest.sha256,
        parserVersion: 'synthetic:canonical-v9',
      },
      ano: input.summary.academicYear ?? 2026,
      turmas: [],
    }));
    await act(async () => flow.handleFiles(files(1)));
    expect(mocks.persist).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledTimes(2);
    expect(mocks.audit.mock.invocationCallOrder[1]!).toBeGreaterThan(
      mocks.persist.mock.invocationCallOrder[0]!,
    );
    expect(flow.persistence['file:0']?.state).toBe('completed');
  });

  it.each([false, true])(
    'preserves an applied relation receipt after re-audit403 and resumes only its follow-up plus pending teachers (relationOnly=%s)',
    async (relationOnly) => {
      const values = relationOnly ? [relationResult(0)] : [relationResult(0), result(1)];
      mocks.read.mockResolvedValue({ successes: values, failureDetails: [] });
      mocks.compact.mockImplementation((value) =>
        value.id === 'file:0' ? relationRequest(value) : request(value),
      );
      mocks.audit
        .mockResolvedValueOnce({ version: 1, state: 'recorded', affected: 0 })
        .mockResolvedValueOnce({ version: 1, state: 'not-authorized' });
      const applied = {
        ...confirmed(),
        response: { ...confirmed().response, state: 'applied' as const },
      };
      mocks.persist.mockResolvedValue(applied);
      await act(async () => flow.handleFiles(files(values.length)));
      expect(flow.persistence['file:0']).toMatchObject({
        state: 'completed',
        response: { state: 'applied' },
      });
      expect(flow.authorizationRequired).toBe(true);
      expect(flow.diagnosticAuditFailures['file:0']).toBeTruthy();
      expect(mocks.persist).toHaveBeenCalledTimes(1);
      expect(mocks.refreshYears).not.toHaveBeenCalled();
      expect(flow.pendingPersistenceCount).toBe(values.length);
      mocks.persist.mockClear().mockResolvedValue(confirmed());
      mocks.audit.mockResolvedValue({ version: 1, state: 'recorded', affected: 0 });
      await act(async () => flow.resumePendingPersistence());
      expect(mocks.persist).toHaveBeenCalledTimes(relationOnly ? 0 : 1);
      expect(mocks.persist.mock.calls.every(([value]) => value.operation === 'persist-notas')).toBe(
        true,
      );
      expect(mocks.refreshYears).toHaveBeenCalledWith(2026);
      if (!relationOnly)
        expect(mocks.refreshYears.mock.invocationCallOrder[0]!).toBeLessThan(
          mocks.persist.mock.invocationCallOrder[0]!,
        );
      expect(flow.persistence['file:0']).toMatchObject({
        state: 'completed',
        response: { state: 'applied' },
      });
      expect(flow.authorizationRequired).toBe(false);
      expect(flow.pendingPersistenceCount).toBe(0);
      expect(flow.diagnosticAuditFailures['file:0']).toBeUndefined();
      if (relationOnly)
        expect(lastBatchTiming()).toMatchObject({
          firstPersistenceStartedMs: null,
          firstConfirmedPersistenceMs: null,
          confirmedRequests: 0,
        });
    },
  );

  it.each([1, 18, 50])(
    'imports %i same-year selected files sequentially with per-file canonicalization',
    async (count) => {
      let active = 0;
      let maximum = 0;
      mocks.persist.mockImplementation(async () => {
        active++;
        maximum = Math.max(maximum, active);
        sequence.push('send');
        await new Promise((resolve) => setTimeout(resolve, 0));
        active--;
        return confirmed();
      });
      await act(async () => flow.handleFiles(files(count)));
      expect(mocks.persist).toHaveBeenCalledTimes(count);
      expect(mocks.persist.mock.calls.every(([value]) => value.transportVersion === 9)).toBe(true);
      expect(maximum).toBe(1);
      expect(sequence.filter((value) => value.startsWith('compact:'))).toHaveLength(count);
      expect(sequence.filter((value) => value === 'send')).toHaveLength(count);
      expect(Object.values(flow.persistence).every((state) => state.state === 'completed')).toBe(
        true,
      );
      expect(flow.pendingPersistenceCount).toBe(0);
    },
  );

  it('allows different academic years to use separate bounded lanes', async () => {
    mocks.read.mockResolvedValue({
      successes: [result(0, 2026), result(1, 2027), result(2, 2026), result(3, 2027)],
      failureDetails: [],
    });
    const activeByYear = new Map<number, number>();
    let totalActive = 0;
    let maximumTotal = 0;
    let maximumSameYear = 0;
    mocks.persist.mockImplementation(async (value: GradebookImportPersistenceRequestV9) => {
      const sameYear = (activeByYear.get(value.ano) ?? 0) + 1;
      activeByYear.set(value.ano, sameYear);
      totalActive++;
      maximumTotal = Math.max(maximumTotal, totalActive);
      maximumSameYear = Math.max(maximumSameYear, sameYear);
      await new Promise((resolve) => setTimeout(resolve, 0));
      activeByYear.set(value.ano, sameYear - 1);
      totalActive--;
      return confirmed();
    });

    await act(async () => flow.handleFiles(files(4)));

    expect(maximumSameYear).toBe(1);
    expect(maximumTotal).toBe(2);
    expect(maximumTotal).toBeLessThanOrEqual(GRADEBOOK_IMPORT_FILE_CONCURRENCY_V1);
    expect(flow.pendingPersistenceCount).toBe(0);
  });

  it('preserves confirmed files, pauses an uncertain commit, and resumes only the pending selection', async () => {
    let attempts = 0;
    mocks.persist.mockImplementation(async () => {
      if (++attempts === 3) throw new TypeError('synthetic lost reply');
      return confirmed();
    });
    await act(async () => flow.handleFiles(files(18)));
    const firstWaveCalls = mocks.persist.mock.calls.length;
    expect(firstWaveCalls).toBe(3);
    expect(firstWaveCalls).toBeLessThan(18);
    expect(flow.persistence['file:0']?.state).toBe('completed');
    expect(flow.persistence['file:1']?.state).toBe('completed');
    expect(flow.persistence['file:2']?.state).toBe('confirmation-required');
    expect(flow.pendingPersistenceCount).toBe(19 - firstWaveCalls);
    expect(flow.progress).toBeNull();
    expect(mocks.compact).toHaveBeenCalledTimes(firstWaveCalls);
    const pendingBeforeResume = flow.pendingPersistenceCount;
    mocks.persist.mockClear();
    mocks.persist.mockResolvedValue(confirmed());
    await act(async () => flow.resumePendingPersistence());
    expect(mocks.persist).toHaveBeenCalledTimes(pendingBeforeResume);
    expect(mocks.persist.mock.calls[0]![0].manifest.fileName).toBe('sintetico-2.xlsb');
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(flow.pendingPersistenceCount).toBe(0);
  });

  it('pauses at session expiry without sending the unscheduled rest', async () => {
    let calls = 0;
    mocks.persist.mockImplementation(async () =>
      ++calls === 2
        ? { response: { transportVersion: 9, state: 'not-authorized' }, serverMs: null }
        : confirmed(),
    );
    await act(async () => flow.handleFiles(files(18)));
    const firstWaveCalls = mocks.persist.mock.calls.length;
    expect(firstWaveCalls).toBe(2);
    expect(firstWaveCalls).toBeLessThan(18);
    expect(flow.authorizationRequired).toBe(true);
    expect(flow.pendingPersistenceCount).toBe(19 - firstWaveCalls);
    expect(flow.persistence['file:0']?.state).toBe('completed');
    expect(flow.persistence['file:1']?.state).toBe('auth-required');
    expect(flow.progress).toBeNull();
  });

  it('retains prepared files after an unavailable response and permits an explicit retry', async () => {
    mocks.persist.mockResolvedValueOnce({
      response: { transportVersion: 9, state: 'unavailable' },
      serverMs: null,
    });
    await act(async () => flow.handleFiles(files(18)));
    const firstWaveCalls = mocks.persist.mock.calls.length;
    expect(firstWaveCalls).toBe(1);
    expect(firstWaveCalls).toBeLessThan(18);
    expect(flow.pendingPersistenceCount).toBe(18);
    expect(flow.persistence['file:0']?.state).toBe('confirmation-required');
    expect(flow.persistence['file:1']?.state).toBe('recognized');
    expect(flow.progress).toBeNull();
    const pendingBeforeResume = flow.pendingPersistenceCount;
    mocks.persist.mockClear();
    mocks.persist.mockResolvedValue(confirmed());
    await act(async () => flow.resumePendingPersistence());
    expect(mocks.persist).toHaveBeenCalledTimes(pendingBeforeResume);
    expect(flow.pendingPersistenceCount).toBe(0);
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });

  it('isolates a local validation failure instead of aborting unrelated valid teacher files', async () => {
    mocks.compact.mockImplementation((input: BatchSuccess) => {
      if (input.id === 'file:1') throw new Error('synthetic invalid file');
      return request(input);
    });
    await act(async () => flow.handleFiles(files(3)));
    expect(mocks.persist).toHaveBeenCalledTimes(2);
    expect(flow.persistence['file:1']?.state).toBe('failed');
    expect(flow.persistence['file:2']?.state).toBe('completed');
  });

  it('prevents two same-tick selections from starting concurrent imports', async () => {
    await act(async () => {
      await Promise.all([flow.handleFiles(files(3)), flow.handleFiles(files(3))]);
    });
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(mocks.persist).toHaveBeenCalledTimes(3);
  });

  it('keeps all selected files pending when the first server response is unavailable', async () => {
    mocks.persist.mockResolvedValue({
      response: { transportVersion: 9, state: 'unavailable' },
      serverMs: null,
    });
    await act(async () => flow.handleFiles(files(3)));
    expect(mocks.persist).toHaveBeenCalledTimes(1);
    expect(flow.pendingPersistenceCount).toBe(3);
    expect(flow.persistence['file:0']?.state).toBe('confirmation-required');
    expect(flow.persistence['file:1']?.state).toBe('recognized');
    expect(flow.persistence['file:2']?.state).toBe('recognized');
    expect(flow.progress).toBeNull();
  });

  it('does not discard a resumable selection when a new selection exceeds 50 files', async () => {
    mocks.persist.mockRejectedValueOnce(new TypeError('synthetic lost reply'));
    await act(async () => flow.handleFiles(files(3)));
    expect(mocks.persist).toHaveBeenCalledTimes(1);
    await act(async () => flow.handleFiles(files(51)));
    expect(flow.results).toHaveLength(3);
    expect(flow.pendingPersistenceCount).toBe(3);
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
});
