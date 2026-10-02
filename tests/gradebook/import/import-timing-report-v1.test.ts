import { describe, expect, it } from 'vitest';
import {
  ImportTimingReportV1,
  sanitizeImportTimingEventV1,
} from '../../../src/features/gradebook/import/import-timing-report-v1';

describe('bounded essential import timing report (G1)', () => {
  it.each([18, 50])(
    'preserves %i original positions and summaries after over 500 events',
    (count) => {
      const report = new ImportTimingReportV1();
      report.begin(
        1,
        'initial',
        Array.from({ length: count }, (_, i) => i),
      );
      report.record(1, { stage: 'recognition-batch', totalMs: 12, recognizedCount: count });
      for (let index = 0; index < count; index++) {
        report.record(1, { stage: 'recognition-file', sourceFileIndex: index, fileReadMs: 1 });
        report.record(1, { stage: 'academic-dispatch', sourceFileIndex: index });
        report.record(1, { stage: 'persist-request', sourceFileIndex: index, persistRequestMs: 2 });
      }
      for (let i = 0; i < 501; i++)
        report.record(1, {
          stage: 'audit-request',
          sourceFileIndex: i % count,
          phase: 'initial-observation',
          outcome: 'recorded',
        });
      report.record(1, { stage: 'batch-complete', confirmedRequests: count, outcome: 'completed' });
      const snapshot = report.snapshot();
      expect(snapshot.runs).toHaveLength(1);
      const run = snapshot.runs[0]!;
      expect(run.files).toHaveLength(count);
      expect(
        run.files.every(
          (file, i) => file.sourceFileIndex === i && file.recognition?.fileReadMs === 1,
        ),
      ).toBe(true);
      expect(run.recognition).toMatchObject({ recognizedCount: count });
      expect(run.final).toMatchObject({ confirmedRequests: count });
      expect(run.recentEvents).toHaveLength(50);
      expect(run.discardedEvents).toBe(3 * count + 503 - 50);
      expect(run.coverage).toMatchObject({
        selectedPositions: count,
        recognitionMeasured: count,
        httpMeasured: count,
      });
      // A caller cannot mutate stored primitives through a detached snapshot.
      run.files[0]!.recognition!.fileReadMs = 999;
      expect(report.snapshot().runs[0]!.files[0]!.recognition!.fileReadMs).toBe(1);
    },
  );

  it('retains only initial and latest resume, rejects late generations, and replaces a new batch', () => {
    const report = new ImportTimingReportV1();
    report.begin(1, 'initial', [0, 1]);
    report.record(1, { stage: 'recognition-batch' });
    report.record(1, { stage: 'batch-complete', outcome: 'auth-required' });
    for (let i = 2; i <= 5; i++) {
      report.begin(i, 'resume', [1]);
      report.record(i, { stage: 'batch-complete', outcome: 'confirmation-required' });
    }
    expect(report.record(2, { stage: 'audit-request', sourceFileIndex: 0 })).toBeNull();
    const snapshot = report.snapshot();
    expect(snapshot.runs.map((run) => run.runOrdinal)).toEqual([1, 5]);
    expect(snapshot.retention.omittedResumes).toBe(3);
    expect(snapshot.runs[1]).toMatchObject({
      status: 'paused',
      recognitionStatus: 'not-performed',
      recognition: null,
    });
    expect(snapshot.runs[1]!.files.map((file) => file.sourceFileIndex)).toEqual([1]);
    report.begin(6, 'initial', [0]);
    expect(report.record(5, { stage: 'recognition-file', sourceFileIndex: 0 })).toBeNull();
    expect(report.snapshot().runs.map((run) => run.runOrdinal)).toEqual([6]);
    expect(report.snapshot().retention.omittedResumes).toBe(0);
    report.clear();
    expect(report.snapshot().runs).toHaveLength(0);
  });

  it('allowlists primitives, finite nonnegative numbers and fixed categories only', () => {
    const sentinel = 'PRIVATE-SYNTHETIC-SENTINEL';
    const value = sanitizeImportTimingEventV1({
      stage: 'persist-request',
      outcome: sentinel,
      fileName: sentinel,
      sha256: sentinel,
      request: { professor: sentinel },
      response: sentinel,
      error: sentinel,
      alunoId: sentinel,
      token: sentinel,
      persistRequestMs: Infinity,
      serverMs: -1,
      payloadBytes: NaN,
      serializationMs: undefined,
      localPreparationMs: 0,
      offerCount: 2,
      unavailableCells: 3,
    });
    expect(JSON.stringify(value)).not.toContain(sentinel);
    expect(value).toEqual({
      stage: 'persist-request',
      persistRequestMs: null,
      serverMs: null,
      payloadBytes: null,
      serializationMs: null,
      localPreparationMs: 0,
      offerCount: 2,
      unavailableCells: 3,
    });
  });

  it('distinguishes unfinished/paused/failed academic state from missing measurements and tail loss', () => {
    const report = new ImportTimingReportV1();
    report.begin(1, 'initial', [0, 1]);
    expect(report.snapshot().runs[0]).toMatchObject({ status: 'in-progress', final: null });
    report.record(1, {
      stage: 'recognition-file',
      sourceFileIndex: 0,
      outcome: 'failed',
      failureStage: 'file-read',
      fileReadMs: 4,
      manifestMs: null,
    });
    report.failure(1);
    report.record(1, {
      stage: 'batch-complete',
      outcome: 'failed',
      firstPersistenceStartedMs: null,
    });
    const run = report.snapshot().runs[0]!;
    expect(run.status).toBe('finished');
    expect(run.final!.outcome).toBe('failed');
    expect(run.files[0]!.dispatch).toBeNull();
    expect(run.files[0]!.http).toBeNull();
    expect(run.files[1]!.recognition).toBeNull();
    expect(run.coverage.measurementStatus).toBe('partial');
    expect(run.discardedEvents).toBe(0);
    expect(run.diagnosticFailures).toBe(1);
  });

  it('bounds even malformed participant input and serializes the complete report only on request', () => {
    const report = new ImportTimingReportV1();
    report.begin(
      1,
      'initial',
      Array.from({ length: 1000 }, (_, i) => i),
    );
    report.record(1, { stage: 'recognition-batch', recognizedCount: 50 });
    expect(report.snapshot().runs[0]!.files).toHaveLength(50);
    expect(report.exportText()).toBe(JSON.stringify(report.snapshot(), null, 2));
  });
});
