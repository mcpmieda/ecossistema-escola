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
  collectGradebookImportDiagnosticsV1: () => [],
  blockingGradebookImportDiagnosticsV1: () => [],
  sourceUnavailableGradebookImportDiagnosticsV1: () => [],
  gradebookImportDiagnosticsAuditRequestV1: () => ({
    version: 1,
    academicYear: 2026,
    fileName: 'synthetic.xlsb',
    sha256: 'a'.repeat(64),
    diagnostics: [],
  }),
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
});

describe('Bounded per-file canonical queue (V9)', () => {
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
    expect(mocks.compact).toHaveBeenCalledTimes(18);
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
    expect(flow.persistence['file:1']?.state).toBe('processing');
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
    expect(flow.persistence['file:1']?.state).toBe('processing');
    expect(flow.persistence['file:2']?.state).toBe('processing');
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
