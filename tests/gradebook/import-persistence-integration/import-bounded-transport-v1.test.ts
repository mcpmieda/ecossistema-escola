import { describe, it, expect } from 'vitest';
import {
  boundedGradebookImportDatabaseV1,
  replaceImportSqlParametersV1,
  IMPORT_D1_TRANSPORT_BOUNDS_V1,
} from '../../../server/gradebook/persistence/d1/transaction/d1-bounded-import-transport-v1';
import { GradebookD1AtomicBatchRecorderV1 } from '../../../server/gradebook/persistence/d1/transaction/d1-batch-promotion-transaction-v1';
import { seededValuesDatabaseV8, AtomicMeasuredDatabaseV8 } from './values-v8-test-support';
import { academicYearId } from '../persistence/d1-transaction/d1-write-test-support';

async function setup() {
  const base = await seededValuesDatabaseV8();
  base.raw.exec(
    'CREATE TABLE synthetic_values (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, version INTEGER NOT NULL)',
  );
  const measured = new AtomicMeasuredDatabaseV8(base);
  const bounded = boundedGradebookImportDatabaseV1(measured, academicYearId);
  const recorder = new GradebookD1AtomicBatchRecorderV1(bounded as Required<typeof bounded>);
  const payloads = Array.from({ length: 6 }, (_, index) =>
    JSON.stringify([
      {
        id: index,
        payload: `quote" slash\\ newline\n ? 漢 ${index} ` + 'synthetic'.repeat(20_000),
      },
    ]),
  );
  for (const payload of payloads)
    recorder.recordMutation(
      bounded
        .prepare(
          "INSERT INTO synthetic_values SELECT json_extract(value,'$.id'),json_extract(value,'$.payload'),1 FROM json_each(?)",
        )
        .bind(payload),
      1,
    );
  return { base, measured, bounded, recorder, payloads };
}
const countSQL = 'SELECT COUNT(*) AS n FROM synthetic_values';
const tempSQL = 'SELECT COUNT(*) AS n FROM gradebook_import_stage_sessions';

describe('Bounded D1 transport with a single final academic transaction', () => {
  it('keeps every call under the global byte bound and reconstructs exact UTF-8 values', async () => {
    const { base, measured, recorder, payloads } = await setup();
    try {
      await recorder.commit();
      expect(measured.calls.length).toBeGreaterThan(1);
      expect(
        measured.calls.every(
          (call) => call.bytes <= IMPORT_D1_TRANSPORT_BOUNDS_V1.stagingBatchBytes,
        ),
      ).toBe(true);
      expect(
        measured.calls.filter((call) =>
          call.sql.some((sql) => sql.startsWith('INSERT INTO synthetic_values')),
        ),
      ).toHaveLength(1);
      expect(base.raw.prepare('SELECT id,payload FROM synthetic_values ORDER BY id').all()).toEqual(
        payloads.map((p) => JSON.parse(p)[0]),
      );
      expect(base.raw.prepare(tempSQL).get()).toEqual({ n: 0 });
      expect(
        base.raw.prepare('SELECT COUNT(*) AS n FROM gradebook_import_stage_chunks').get(),
      ).toEqual({ n: 0 });
    } finally {
      base.raw.close();
    }
  });
  it('leaves official values unchanged when upload fails between staged batches', async () => {
    const { base, measured, recorder } = await setup();
    try {
      let uploads = 0;
      measured.beforeBatch = (items) => {
        if (items[0]?.sql.includes('INSERT INTO gradebook_import_stage_chunks') && ++uploads === 2)
          throw new Error('synthetic upload lost');
      };
      await expect(recorder.commit()).rejects.toThrow();
      expect(base.raw.prepare(countSQL).get()).toEqual({ n: 0 });
      expect(base.raw.prepare(tempSQL).get()).toEqual({ n: 0 });
    } finally {
      base.raw.close();
    }
  });
  it('does not promote a missing staged chunk and removes only its own temporary session', async () => {
    const { base, measured, recorder } = await setup();
    try {
      measured.beforeBatch = (items) => {
        if (items[0]?.sql.includes('AS staging_guard'))
          base.raw.exec('DELETE FROM gradebook_import_stage_chunks WHERE chunk_index=0');
      };
      await expect(recorder.commit()).rejects.toThrow();
      expect(base.raw.prepare(countSQL).get()).toEqual({ n: 0 });
      expect(base.raw.prepare(tempSQL).get()).toEqual({ n: 0 });
    } finally {
      base.raw.close();
    }
  });
  it('rolls back all file mutations if a later constraint fails', async () => {
    const { base, bounded, recorder } = await setup();
    try {
      recorder.recordMutation(
        bounded.prepare('INSERT INTO synthetic_values VALUES (0,?,1)').bind('duplicate'),
        1,
      );
      await expect(recorder.commit()).rejects.toThrow();
      expect(base.raw.prepare(countSQL).get()).toEqual({ n: 0 });
      expect(base.raw.prepare(tempSQL).get()).toEqual({ n: 0 });
    } finally {
      base.raw.close();
    }
  });
  it('retains CAS and rolls back earlier writes when an expected version is stale', async () => {
    const { base, bounded, recorder } = await setup();
    try {
      base.raw.exec("INSERT INTO synthetic_values VALUES (99,'existing',2)");
      recorder.recordMutation(
        bounded
          .prepare('UPDATE synthetic_values SET payload=? WHERE id=99 AND version=1')
          .bind('must not win'),
        1,
      );
      await expect(recorder.commit()).rejects.toThrow();
      expect(base.raw.prepare(countSQL).get()).toEqual({ n: 1 });
      expect(
        base.raw.prepare('SELECT payload,version FROM synthetic_values WHERE id=99').get(),
      ).toEqual({ payload: 'existing', version: 2 });
    } finally {
      base.raw.close();
    }
  });
  it('does not replay the final commit after a lost confirmation', async () => {
    const { base, measured, recorder } = await setup();
    try {
      measured.afterBatch = (items) => {
        if (items[0]?.sql.includes('AS staging_guard'))
          throw new Error('synthetic lost response after commit');
      };
      await expect(recorder.commit()).rejects.toThrow();
      expect(base.raw.prepare(countSQL).get()).toEqual({ n: 6 });
      expect(
        measured.calls.filter((call) => call.sql[0]?.includes('AS staging_guard')),
      ).toHaveLength(1);
      expect(base.raw.prepare(tempSQL).get()).toEqual({ n: 0 });
    } finally {
      base.raw.close();
    }
  });
  it('rejects an oversized parameter before sending an academic batch', async () => {
    const { base, measured, bounded } = await setup();
    try {
      await expect(
        bounded.batch!([
          bounded
            .prepare('INSERT INTO synthetic_values VALUES (0,?,1)')
            .bind('x'.repeat(1_100_000)),
        ]),
      ).rejects.toThrow('gradebook-import-transport-bound');
      expect(measured.calls).toHaveLength(0);
      expect(base.raw.prepare(countSQL).get()).toEqual({ n: 0 });
      expect(base.raw.prepare(tempSQL).get()).toEqual({ n: 0 });
    } finally {
      base.raw.close();
    }
  });
  it('reclaims at most one expired transport session and never deletes a different purpose', async () => {
    const { base, recorder } = await setup();
    try {
      const insert = base.raw.prepare(`INSERT INTO gradebook_import_stage_sessions
        (session_id,academic_year_id,source_sha256,expected_chunk_count,state,metadata_json,created_at,updated_at,expires_at)
        VALUES (?, ?, ?, 1, 'preparing', ?, ?, ?, ?)`);
      for (const [id, purpose, expires] of [
        ['old-1', 'atomic-parameters-v1', '2020-01-01T00:00:00Z'],
        ['old-2', 'atomic-parameters-v1', '2020-01-02T00:00:00Z'],
        ['other-protocol', 'other-purpose', '2020-01-01T00:00:00Z'],
        ['not-expired', 'atomic-parameters-v1', '2099-01-01T00:00:00Z'],
      ] as const)
        insert.run(
          id,
          academicYearId,
          '0'.repeat(64),
          JSON.stringify({ purpose }),
          '2020-01-01T00:00:00Z',
          '2020-01-01T00:00:00Z',
          expires,
        );
      await recorder.commit();
      expect(
        base.raw
          .prepare('SELECT session_id FROM gradebook_import_stage_sessions ORDER BY session_id')
          .all(),
      ).toEqual([
        { session_id: 'not-expired' },
        { session_id: 'old-2' },
        { session_id: 'other-protocol' },
      ]);
      expect(base.raw.prepare(countSQL).get()).toEqual({ n: 6 });
    } finally {
      base.raw.close();
    }
  });
  it('substitutes placeholders without touching quoted question marks and SQL comments', () => {
    const source = 'SELECT \'?\', "?", `?`, [??], ? -- ?\n, ? /* ? */';
    expect(replaceImportSqlParametersV1(source, (index) => `PARAM_${index}`)).toBe(
      'SELECT \'?\', "?", `?`, [??], PARAM_0 -- ?\n, PARAM_1 /* ? */',
    );
    expect(() => replaceImportSqlParametersV1('SELECT ?2', () => '?')).toThrow();
    expect(() => replaceImportSqlParametersV1("SELECT 'unclosed", () => '?')).toThrow();
  });
});
