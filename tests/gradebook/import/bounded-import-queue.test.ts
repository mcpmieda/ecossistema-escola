import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GRADEBOOK_IMPORT_FILE_CONCURRENCY_V1,
  useImportBatch,
} from '../../../src/features/gradebook/import/use-import-batch';
import type { BatchSuccess } from '../../../src/features/gradebook/import/import-batch';
import type { GradebookImportPersistenceRequestV8 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v8';
import { SOURCE_VALUES_POLICY_V5 } from '../../../shared/gradebook-contracts/source/source-values-contract-v5';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  compact: vi.fn(),
  persist: vi.fn(),
  bootstrap: vi.fn(),
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
vi.mock('../../../src/features/gradebook/import/compact-import-v8', () => ({
  createGradebookValuesSnapshotV8: mocks.compact,
}));
vi.mock('../../../src/features/gradebook/import/import-persistence-client-v8', () => ({
  persistGradebookValuesSnapshotV8: mocks.persist,
}));
vi.mock(
  '../../../src/features/gradebook/operational-workspace/operational-workspace-client',
  () => ({ requestOperationalWorkspaceV1: mocks.bootstrap }),
);

const emptyWrites = {
  logicalSources: 0,
  sourceFileVersions: 0,
  importBatchVersions: 1,
  assessmentComponentVersions: 0,
  academicRecordVersions: 0,
  logicalSourceRecordAssociationVersions: 0,
  total: 1,
};
function confirmed() {
  return {
    response: {
      transportVersion: 6,
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
function request(result: BatchSuccess): GradebookImportPersistenceRequestV8 {
  const term = (value: 1 | 2 | 3) => ({
    term: value,
    sourceSheetName: `6A${value}ºD1`,
    assessmentDefinitions: [
      ['R', 10],
      ['S', 10],
    ] as const,
    rows: [[1, {}]] as const,
  });
  return {
    transportVersion: 8,
    valuePolicy: SOURCE_VALUES_POLICY_V5,
    operation: 'persist-recognized-file',
    manifest: { ...result.manifest, sourceContractVersion: 2 },
    recognizedSuggestions: { academicYear: 2026, teacherName: 'Docente sintético' },
    confirmedContext: { academicYearId: 'year:synthetic' as never },
    sourceResolution: { mode: 'resolve-or-create' },
    rosters: [{ classGroupLabel: '6A', students: [[1, 'Estudante sintético']] }],
    courses: [
      {
        classGroupLabel: '6A',
        subjectLabel: 'Componente sintético',
        disciplineIndex: 'D1',
        terms: [term(1), term(2), term(3)],
        recovery: null,
      },
    ],
    diagnostics: [],
  };
}
function result(index: number): BatchSuccess {
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
      academicYear: 2026,
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
  mocks.bootstrap.mockResolvedValue({
    state: 'ready',
    availableAcademicYears: [{ id: 'year:synthetic', label: '2026' }],
  });
  mocks.read.mockImplementation(async (input: readonly File[]) => ({
    successes: input.map((_, index) => result(index)),
    failureDetails: [],
  }));
  mocks.compact.mockImplementation((input: BatchSuccess) => {
    sequence.push(`compact:${input.id}`);
    return request(input);
  });
  mocks.persist.mockImplementation(async (value: GradebookImportPersistenceRequestV8) => {
    sequence.push(`send:${value.manifest.fileName}`);
    await Promise.resolve();
    return confirmed();
  });
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
});

describe('Bounded per-file value snapshot queue (#551/#561)', () => {
  it.each([1, 18, 50])(
    'imports %i selected files with bounded concurrency and per-file compaction',
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
      expect(mocks.persist.mock.calls.every(([value]) => value.transportVersion === 8)).toBe(true);
      expect(maximum).toBe(Math.min(count, GRADEBOOK_IMPORT_FILE_CONCURRENCY_V1));
      expect(sequence.filter((value) => value.startsWith('compact:'))).toHaveLength(count);
      expect(sequence.filter((value) => value === 'send')).toHaveLength(count);
      expect(Object.values(flow.persistence).every((state) => state.state === 'completed')).toBe(
        true,
      );
      expect(flow.pendingPersistenceCount).toBe(0);
    },
  );

  it('preserves confirmed files, pauses an uncertain commit, and resumes only the pending selection', async () => {
    let attempts = 0;
    mocks.persist.mockImplementation(async () => {
      if (++attempts === 3) throw new TypeError('synthetic lost reply');
      return confirmed();
    });
    await act(async () => flow.handleFiles(files(18)));
    expect(mocks.persist).toHaveBeenCalledTimes(4);
    expect(flow.persistence['file:0']?.state).toBe('completed');
    expect(flow.persistence['file:1']?.state).toBe('completed');
    expect(flow.persistence['file:2']?.state).toBe('confirmation-required');
    expect(flow.persistence['file:3']?.state).toBe('completed');
    expect(flow.persistence['file:4']?.state).toBe('recognized');
    expect(flow.pendingPersistenceCount).toBe(15);
    expect(mocks.compact).toHaveBeenCalledTimes(4);
    mocks.persist.mockClear();
    mocks.persist.mockResolvedValue(confirmed());
    await act(async () => flow.resumePendingPersistence());
    expect(mocks.persist).toHaveBeenCalledTimes(15);
    expect(mocks.persist.mock.calls[0]![0].manifest.fileName).toBe('sintetico-2.xlsb');
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(flow.pendingPersistenceCount).toBe(0);
  });

  it('pauses at session expiry without sending or compacting the rest', async () => {
    let calls = 0;
    mocks.persist.mockImplementation(async () =>
      ++calls === 2
        ? { response: { transportVersion: 6, state: 'not-authorized' }, serverMs: null }
        : confirmed(),
    );
    await act(async () => flow.handleFiles(files(18)));
    expect(mocks.persist).toHaveBeenCalledTimes(4);
    expect(mocks.compact).toHaveBeenCalledTimes(4);
    expect(flow.authorizationRequired).toBe(true);
    expect(flow.pendingPersistenceCount).toBe(15);
    expect(flow.persistence['file:0']?.state).toBe('completed');
    expect(flow.persistence['file:1']?.state).toBe('auth-required');
  });

  it('retains all recognized files after a bootstrap outage and permits an explicit retry', async () => {
    mocks.bootstrap.mockRejectedValueOnce(new TypeError('synthetic bootstrap outage'));
    await act(async () => flow.handleFiles(files(18)));
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(flow.pendingPersistenceCount).toBe(18);
    await act(async () => flow.resumePendingPersistence());
    expect(flow.pendingPersistenceCount).toBe(0);
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });

  it('isolates a local validation failure instead of aborting unrelated valid files', async () => {
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

  it('includes the safe server failure diagnostic in the copyable log and stays paused', async () => {
    const diagnostic = {
      version: 1,
      events: [{ phase: 'd1', code: 'd1-unique', operation: 'batch' }],
    };
    mocks.persist.mockImplementation(async (_request, onFailure) => {
      onFailure(diagnostic);
      return { response: { transportVersion: 6, state: 'unavailable' }, serverMs: null };
    });
    await act(async () => flow.handleFiles(files(3)));
    expect(mocks.persist).toHaveBeenCalledTimes(3);
    expect(flow.pendingPersistenceCount).toBe(3);
    expect(flow.persistence['file:0']?.state).toBe('confirmation-required');
    expect(flow.timingDiagnostics).toContain(
      `[gradebook-import-server-failure] ${JSON.stringify(diagnostic)}`,
    );
  });

  it('does not discard a resumable selection when a new selection exceeds 50 files', async () => {
    mocks.persist.mockRejectedValueOnce(new TypeError('synthetic lost reply'));
    await act(async () => flow.handleFiles(files(3)));
    expect(mocks.persist).toHaveBeenCalledTimes(3);
    await act(async () => flow.handleFiles(files(51)));
    expect(flow.results).toHaveLength(3);
    expect(flow.pendingPersistenceCount).toBe(1);
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
});
