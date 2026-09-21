import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GradebookPostgresWritePortV1 } from '../../../server/gradebook/persistence/postgres/postgres-database-v1';
import {
  appendFixtureV2,
  snapshotFixtureV2,
  snapshotHarnessV2,
} from './relational-bulletin-snapshot-fixture-v2';

afterEach(() => vi.restoreAllMocks());

function expectNativePort(database: GradebookPostgresWritePortV1): void {
  for (const retired of ['prepare', 'bind', 'exec', 'batch']) {
    expect(retired in database).toBe(false);
  }
}

describe('native relational bulletin snapshot repository V2', () => {
  it('keeps native snapshot reads and explicit JSON writes on the owning transaction', async () => {
    const harness = snapshotHarnessV2();
    const { database, repository, calls } = harness;
    expectNativePort(database);
    const transaction = database.transaction.bind(database);
    vi.spyOn(database, 'transaction').mockImplementation((operation) =>
      transaction((tx) => {
        expectNativePort(tx);
        return operation(tx);
      }),
    );

    expect(await repository.getLatest('synthetic-series')).toBeNull();
    expect(await repository.get(snapshotFixtureV2().snapshotId, 1)).toBeNull();
    const start = calls.length;
    const input = appendFixtureV2();
    expect(await repository.append(input)).toEqual({ state: 'appended', snapshot: input.snapshot });
    expect(harness.events).toEqual(['begin', 'commit']);
    const appendCalls = calls.slice(start);
    expect(appendCalls).toHaveLength(6);
    expect(appendCalls.every((call) => call.channel === 'tx')).toBe(true);
    expect(appendCalls.slice(0, 3).map((call) => call.sql)).toEqual([
      'SELECT pg_advisory_xact_lock_shared(613,0)',
      'SELECT pg_advisory_xact_lock(613,$1::integer)',
      'SELECT student_portal.ensure_year_coordination_v1($1::smallint)',
    ]);
    const insert = appendCalls[4]!;
    expect(insert.sql).toContain('$10::jsonb, $11, $12::jsonb, $13::jsonb');
    expect(insert.parameters).toEqual([
      input.snapshot.snapshotId,
      1,
      input.seriesKey,
      2026,
      10,
      20,
      input.snapshot.emittedAt,
      input.issuerOid,
      input.snapshot.dataVersion,
      { __typed: JSON.stringify(input.snapshot.model.period), oid: 25 },
      'summary',
      { __typed: JSON.stringify(input.snapshot.presentation), oid: 25 },
      { __typed: JSON.stringify(input.snapshot), oid: 25 },
    ]);
    expect(appendCalls[5]?.sql).toContain('record_gradebook_change_v1');
    expect(harness.state().revisions).toBe(1);

    const latest = await repository.getLatest(input.seriesKey);
    expect(latest).toEqual(input.snapshot);
    expect(Object.isFrozen(latest)).toBe(true);
    expect(await repository.append(input)).toEqual({ state: 'version-conflict' });
    expect(harness.state().stored).toHaveLength(1);
    expect(harness.state().revisions).toBe(1);

    const next = appendFixtureV2(2);
    next.snapshot.model.period = { kind: 'annual' };
    expect(await repository.append(next)).toEqual({ state: 'appended', snapshot: next.snapshot });
    expect(await repository.get(input.snapshot.snapshotId, 1)).toEqual(input.snapshot);
    expect(await repository.getLatest(input.seriesKey)).toEqual(next.snapshot);
    expect(await repository.history({ year: 2026, classId: 10 })).toHaveLength(2);
    expect(calls.at(-1)?.parameters).toEqual([2026, 10, 100]);
    expect(
      await repository.history({ year: 2026, classId: 10, studentIds: [20, 20, 21] }),
    ).toHaveLength(2);
    expect(calls.at(-1)?.sql).toContain('b.aluno_id IN ($3, $4)');
    expect(calls.at(-1)?.sql).toContain('LIMIT $5');
    expect(calls.at(-1)?.parameters).toEqual([2026, 10, 20, 21, 100]);
  });

  it('preserves version conflicts and rolls back failed writes and revision updates', async () => {
    for (const invalid of ['previous-version', 'next-version', 'snapshot-id']) {
      const harness = snapshotHarnessV2({ initial: [snapshotFixtureV2()] });
      const input = appendFixtureV2(2);
      if (invalid === 'previous-version') input.expectedPreviousVersion = 0;
      if (invalid === 'next-version') input.snapshot.snapshotVersion = 3;
      if (invalid === 'snapshot-id')
        input.snapshot.snapshotId = '44444444-4444-4444-8444-444444444444';
      expect(await harness.repository.append(input)).toEqual({ state: 'version-conflict' });
      expect(harness.calls.some((call) => call.sql.startsWith('INSERT'))).toBe(false);
      expect(harness.state().stored).toHaveLength(1);
      expect(harness.state().revisions).toBe(0);
    }
    for (const insertCount of [0, 2, -1, Number.NaN]) {
      const harness = snapshotHarnessV2({ insertCount });
      await expect(harness.repository.append(appendFixtureV2())).rejects.toThrow(
        'relational-bulletin-snapshot-write-failed',
      );
      expect(harness.events).toEqual(['begin', 'rollback']);
      expect(harness.state()).toEqual({ stored: [], revisions: 0 });
    }
    const duplicate = snapshotHarnessV2({ insertError: '23505' });
    expect(await duplicate.repository.append(appendFixtureV2())).toEqual({
      state: 'version-conflict',
    });
    expect(duplicate.events).toEqual(['begin', 'rollback']);
    const denied = snapshotHarnessV2({ insertError: '42501' });
    await expect(denied.repository.append(appendFixtureV2())).rejects.toMatchObject({
      code: '42501',
    });
    expect(denied.database.lastFailure()).toMatchObject({ sqlState: '42501' });
    expect(denied.state()).toEqual({ stored: [], revisions: 0 });
    const revision = snapshotHarnessV2({ revisionFailure: true });
    await expect(revision.repository.append(appendFixtureV2())).rejects.toThrow(
      'synthetic-revision-failed',
    );
    expect(revision.events).toEqual(['begin', 'rollback']);
    expect(revision.state()).toEqual({ stored: [], revisions: 0 });
  });

  it('preserves request bounds and rejects inconsistent historical snapshot metadata', async () => {
    const harness = snapshotHarnessV2({ initial: [snapshotFixtureV2()] });
    expect(await harness.repository.history({ year: 2026, classId: 10, studentIds: [] })).toEqual(
      [],
    );
    await expect(
      harness.repository.history({
        year: 2026,
        classId: 10,
        studentIds: Array.from({ length: 51 }, (_, index) => index + 1),
      }),
    ).rejects.toThrow('relational-bulletin-history-too-large');
    await expect(
      harness.repository.append({ ...appendFixtureV2(), expectedPreviousVersion: -1 }),
    ).rejects.toThrow('relational-bulletin-snapshot-invalid-input');
    expect(harness.calls).toEqual([]);
    expect(harness.events).toEqual([]);
    harness.state().stored[0]!.data_version = 'inconsistent-synthetic-version';
    await expect(harness.repository.get(snapshotFixtureV2().snapshotId, 1)).rejects.toThrow(
      'relational-bulletin-snapshot-invalid-row',
    );
  });
});
