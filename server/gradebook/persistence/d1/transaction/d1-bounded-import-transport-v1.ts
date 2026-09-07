import type {
  D1WriteDatabaseV1,
  D1WriteRunResultV1,
  D1WriteStatementV1,
  D1WriteValueV1,
} from '../write/d1-write-adapter-v1';

/** Transport bounds, not academic limits. Large parameters stay in the existing staging tables. */
export const IMPORT_D1_TRANSPORT_BOUNDS_V1 = {
  directBatchBytes: 1_000_000,
  stagingBatchBytes: 1_000_000,
  stagedParameterBytes: 900_000,
  finalBatchBytes: 1_000_000,
  inlineParameterBytes: 4_096,
  maxStagedParameters: 512,
  stagingConcurrency: 5,
} as const;
const PURPOSE = 'atomic-parameters-v1';
const encoder = new TextEncoder();
const bytes = (value: string) => encoder.encode(value).byteLength;

function size(sql: string, params: readonly D1WriteValueV1[]): number {
  // Conservative JSON-wire upper bound: includes escaping and statement metadata.
  return bytes(JSON.stringify({ sql, params })) + 64;
}
function fail(): never {
  throw new Error('gradebook-import-transport-bound');
}

/** Substitute only anonymous SQL parameters, never question marks in literals/comments. */
export function replaceImportSqlParametersV1(
  sql: string,
  replacement: (index: number) => string,
): string {
  let out = '';
  let index = 0;
  let quote = '';
  let line = false;
  let block = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]!;
    const next = sql[i + 1];
    if (line) {
      out += c;
      if (c === '\n') line = false;
      continue;
    }
    if (block) {
      out += c;
      if (c === '*' && next === '/') {
        out += next;
        i++;
        block = false;
      }
      continue;
    }
    if (quote) {
      out += c;
      if (c === quote) {
        if (next === quote && quote !== ']') {
          out += next;
          i++;
        } else quote = '';
      }
      continue;
    }
    if (c === '-' && next === '-') {
      out += '--';
      i++;
      line = true;
      continue;
    }
    if (c === '/' && next === '*') {
      out += '/*';
      i++;
      block = true;
      continue;
    }
    if (c === "'" || c === '"' || c === '`' || c === '[') {
      quote = c === '[' ? ']' : c;
      out += c;
      continue;
    }
    if (c === '?') {
      if (next && /[0-9]/u.test(next)) return fail();
      out += replacement(index++);
    } else out += c;
  }
  if (quote || block) return fail();
  return out;
}

class CapturedImportStatementV1 implements D1WriteStatementV1 {
  constructor(
    readonly inner: D1WriteStatementV1,
    readonly sql: string,
    readonly params: readonly D1WriteValueV1[] = [],
  ) {}
  bind(...params: D1WriteValueV1[]): D1WriteStatementV1 {
    return new CapturedImportStatementV1(this.inner.bind(...params), this.sql, params);
  }
  first<Row extends Record<string, unknown>>() {
    return this.inner.first<Row>();
  }
  all<Row extends Record<string, unknown>>() {
    return this.inner.all<Row>();
  }
  run() {
    return this.inner.run();
  }
}

function checked(results: readonly D1WriteRunResultV1[], expected: number): void {
  if (results.length !== expected || results.some((result) => result.success === false)) fail();
}

async function runStagingWaveV1(
  statements: readonly D1WriteStatementV1[],
): Promise<void> {
  // Wait for every request already started in this bounded wave before cleanup.
  // Promise.all would reject early while sibling D1 writes could still be in flight.
  const settled = await Promise.all(
    statements.map(async (statement) => {
      try {
        return { state: 'fulfilled' as const, value: await statement.run() };
      } catch (cause) {
        return { state: 'rejected' as const, cause };
      }
    }),
  );
  const rejected = settled.find((result) => result.state === 'rejected');
  if (rejected?.state === 'rejected') throw rejected.cause;
  checked(
    settled.flatMap((result) => (result.state === 'fulfilled' ? [result.value] : [])),
    statements.length,
  );
}

/**
 * Writes ONLY temporary parameters before the atomic commit. All original mutations and changes()
 * guards remain in one D1 batch. Missing staging, stale CAS, FK or any SQL failure rolls it all back.
 * Never accepts SQL or a session ID from a client. No schema migration or additional service.
 */
export function boundedGradebookImportDatabaseV1(
  base: D1WriteDatabaseV1,
  academicYearId: string,
): D1WriteDatabaseV1 {
  if (!base.batch) return base;
  const limits = IMPORT_D1_TRANSPORT_BOUNDS_V1;
  return {
    prepare: (sql) => new CapturedImportStatementV1(base.prepare(sql), sql),
    exec: (sql) => base.exec(sql),
    async batch(statements) {
      const captured = statements.map((s) => {
        if (!(s instanceof CapturedImportStatementV1)) return fail();
        return s;
      });
      const total = captured.reduce((n, s) => n + size(s.sql, s.params), 2);
      if (total <= limits.directBatchBytes) return base.batch!(captured.map((s) => s.inner));

      const id = `atomic-values:${crypto.randomUUID()}`;
      // Server-generated opaque constant only; never interpolate source/user data in SQL.
      if (!/^atomic-values:[0-9a-f-]{36}$/u.test(id)) return fail();
      const payloads: string[] = [];
      const prepared = captured.map((statement) => {
        const inline: D1WriteValueV1[] = [];
        let seen = 0;
        const sql = replaceImportSqlParametersV1(statement.sql, (index) => {
          seen++;
          if (index >= statement.params.length) return fail();
          const value = statement.params[index]!;
          if (typeof value !== 'string' || bytes(value) <= limits.inlineParameterBytes) {
            inline.push(value);
            return '?';
          }
          // One JSON string per row. json_extract restores the exact bound TEXT value,
          // including quotes, newlines, Unicode and nested JSON; no lossy conversion.
          const payload = JSON.stringify([value]);
          if (bytes(payload) > limits.stagedParameterBytes) return fail();
          const chunk = payloads.length;
          payloads.push(payload);
          return `(SELECT json_extract(payload_json, '$[0]') FROM gradebook_import_stage_chunks WHERE session_id='${id}' AND chunk_index=${chunk})`;
        });
        if (seen !== statement.params.length) return fail();
        return { sql, params: inline };
      });
      if (payloads.length === 0 || payloads.length > limits.maxStagedParameters) return fail();
      const now = new Date().toISOString();
      const expiry = new Date(Date.now() + 3_600_000).toISOString();
      const guardSql = `SELECT CASE WHEN EXISTS (
        SELECT 1 FROM gradebook_import_stage_sessions s
        WHERE s.session_id=? AND s.academic_year_id=? AND s.state='preparing'
        AND s.expected_chunk_count=? AND s.expires_at>?
        AND json_extract(s.metadata_json, '$.purpose')='${PURPOSE}'
        AND (SELECT COUNT(*) FROM gradebook_import_stage_chunks c WHERE c.session_id=s.session_id)=s.expected_chunk_count
      ) THEN 1 ELSE json('gradebook_atomic_batch_guard_failure') END AS staging_guard`;
      const guardParams = [id, academicYearId, payloads.length, now];
      const deleteSql = 'DELETE FROM gradebook_import_stage_sessions WHERE session_id=?';
      const finalBytes = prepared.reduce(
        (n, s) => n + size(s.sql, s.params),
        size(guardSql, guardParams) + size(deleteSql, [id]) + 2,
      );
      if (finalBytes > limits.finalBatchBytes || prepared.some((s) => bytes(s.sql) > 90_000))
        return fail();
      // SQL and final-promotion bounds are validated before temporary writes.
      // Each staging upload is independently checked before it is sent.
      const final = [
        base.prepare(guardSql).bind(...guardParams),
        ...prepared.map((s) => base.prepare(s.sql).bind(...s.params)),
        base.prepare(deleteSql).bind(id),
      ];
      const cleanup = async () => {
        try {
          await base.prepare(deleteSql).bind(id).run();
        } catch {
          /* own bounded temporary data expires */
        }
      };
      try {
        // Reclaim ONLY expired sessions of this private transport purpose. Never touch
        // other import staging protocols or academic/history tables.
        await base
          .prepare(
            `DELETE FROM gradebook_import_stage_sessions WHERE session_id IN (SELECT session_id
          FROM gradebook_import_stage_sessions WHERE state='preparing'
          AND expires_at<=? AND json_extract(metadata_json, '$.purpose')=? ORDER BY expires_at LIMIT 1)`,
          )
          .bind(now, PURPOSE)
          .run();
        const initialized = await base
          .prepare(
            `INSERT INTO gradebook_import_stage_sessions
          (session_id,academic_year_id,source_sha256,expected_chunk_count,state,metadata_json,created_at,updated_at,expires_at)
          VALUES (?, ?, ?, ?, 'preparing', ?, ?, ?, ?)`,
          )
          .bind(
            id,
            academicYearId,
            '0'.repeat(64),
            payloads.length,
            JSON.stringify({ purpose: PURPOSE }),
            now,
            now,
            expiry,
          )
          .run();
        if (initialized.success === false) return fail();
        const uploadSql = `INSERT INTO gradebook_import_stage_chunks
          (session_id,chunk_index,chunk_hash,payload_json,incoming_keys_json,entity_write_count,academic_record_write_count,association_write_count,created_at)
          VALUES (?, ?, ?, ?, '[]', 0, 0, 0, ?)`;
        for (let start = 0; start < payloads.length; start += limits.stagingConcurrency) {
          const wave = payloads.slice(start, start + limits.stagingConcurrency).map((payload, offset) => {
            const index = start + offset;
            const params = [id, index, '0'.repeat(64), payload, now] as const;
            if (size(uploadSql, params) + 2 > limits.stagingBatchBytes) return fail();
            return base.prepare(uploadSql).bind(...params);
          });
          await runStagingWaveV1(wave);
        }
        // This is the only db.batch() after transport staging: every academic mutation and
        // every changes() guard still commits or rolls back together.
        const results = await base.batch!(final);
        checked(results, final.length);
        // Preserve the recorder's result cardinality; guards/cleanup are transport-private.
        return results.slice(1, -1);
      } catch (cause) {
        await cleanup();
        throw cause;
      }
    },
  };
}
