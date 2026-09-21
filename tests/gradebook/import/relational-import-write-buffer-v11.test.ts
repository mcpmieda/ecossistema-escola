import { describe, expect, it } from 'vitest';
import { createBufferedRelationalImportDatabaseV11, type BufferedRelationalImportDatabaseV11 } from '../../../server/gradebook/persistence/postgres/relational-import-write-buffer-v11';
import { createGradebookPostgresDatabaseFromSqlV1, type GradebookPostgresWritePortV1 } from '../../../server/gradebook/persistence/postgres/postgres-database-v1';
import { postgresJsonTextV1, type GradebookPostgresValueV1 } from '../../../server/gradebook/persistence/postgres/postgres-values-v1';

type Row = Record<string, unknown>;
type FinalizingBuffer = BufferedRelationalImportDatabaseV11 & {
  afterImportFlush(operation: (database: GradebookPostgresWritePortV1) => Promise<void>): void;
};

interface Execution {
  readonly kind: 'execute' | 'query';
  readonly query: string;
  readonly values: readonly GradebookPostgresValueV1[];
}

interface FakeDatabase extends GradebookPostgresWritePortV1 {
  transaction<T>(operation: (database: GradebookPostgresWritePortV1) => Promise<T>): Promise<T>;
}

function fakeDatabase(options: { readonly groupedCountDelta?: number } = {}): {
  readonly database: FakeDatabase;
  readonly executions: Execution[];
} {
  const executions: Execution[] = [];

  const database: FakeDatabase = {
    async query<ResultRow extends Row>(query: string, values: readonly GradebookPostgresValueV1[]) {
      executions.push({ kind: 'query', query, values });
      return [] as ResultRow[];
    },
    async executeNative<ResultRow extends Row>(query: string, values: readonly GradebookPostgresValueV1[]) {
      executions.push({ kind: 'execute', query, values });
      let changes = 1;
      if (query.includes('jsonb_to_recordset')) {
        const payload = values[0];
        if (payload === null || typeof payload !== 'object') throw new Error('expected-json-payload');
        const parsed = JSON.parse(payload.jsonText) as unknown[];
        changes = parsed.length + (options.groupedCountDelta ?? 0);
      }
      return { rows: [] as ResultRow[], changes };
    },
    async transaction<T>(operation: (transaction: GradebookPostgresWritePortV1) => Promise<T>) {
      return operation(database);
    },
  };

  return { database, executions };
}

const NOTE_HISTORY = `INSERT INTO gradebook.nota_historico
  (importacao_id, instrumento_id, aluno_id, valor_anterior, valor_novo)
  VALUES ($1, $2, $3, $4, $5)`;
const INSTRUMENT_HISTORY = `INSERT INTO gradebook.instrumento_historico
  (importacao_id, instrumento_id, maximo_anterior, maximo_novo, descricao_anterior, descricao_nova)
  VALUES ($1, $2, $3, $4, $5, $6)`;
const NOTE_INSERT = `INSERT INTO gradebook.nota (instrumento_id, aluno_id, valor) VALUES ($1, $2, $3)`;
const NOTE_UPDATE = `UPDATE gradebook.nota SET valor = $1 WHERE instrumento_id = $2 AND aluno_id = $3`;
const NOTE_DELETE = `DELETE FROM gradebook.nota WHERE instrumento_id = $1 AND aluno_id = $2`;
const CLOSING_HISTORY = `INSERT INTO gradebook.fechamento_historico
  (importacao_id, oferta_id, aluno_id, campo, valor_anterior, valor_novo, estado_anterior, estado_novo)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
const CLOSING_INSERT = `INSERT INTO gradebook.fechamento
  (oferta_id, aluno_id, am1_fonte, am2_fonte, am3_fonte, rec1, rec2, rec3, rec_nc_mask, rec_rr_mask, u_fonte)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`;
const CLOSING_UPDATE = `UPDATE gradebook.fechamento
  SET am1_fonte = $1, am2_fonte = $2, am3_fonte = $3, rec1 = $4, rec2 = $5, rec3 = $6, rec_nc_mask = $7, rec_rr_mask = $8, u_fonte = $9
  WHERE oferta_id = $10 AND aluno_id = $11`;
const CLOSING_DELETE = `DELETE FROM gradebook.fechamento WHERE oferta_id = $1 AND aluno_id = $2`;

function groupedExecutions(executions: readonly Execution[]): readonly Execution[] {
  return executions.filter(
    (execution) => execution.kind === 'execute' && execution.query.includes('jsonb_to_recordset'),
  );
}

function parsedRows(execution: Execution): readonly Record<string, unknown>[] {
  const payload = execution.values[0];
  if (payload === null || typeof payload !== 'object') throw new Error('missing-json-payload');
  return JSON.parse(payload.jsonText) as Record<string, unknown>[];
}

describe('relational import write buffer v11', () => {
  it('forwards native reads after flushing on the same transaction connection', async () => {
    const calls: { sql: string; values: readonly unknown[] }[] = [];
    let applied = 0;
    const database = createGradebookPostgresDatabaseFromSqlV1({
      async unsafe() { throw new Error('buffer-native-read-escaped-transaction'); },
      async begin(operation) {
        return operation({
          typed: (value, oid) => ({ value, oid }),
          async unsafe(sql, values = []) {
            calls.push({ sql, values });
            if (sql.startsWith(`INSERT`)) applied++;
            return Object.assign(sql.startsWith(`SELECT`) ? [{ applied }] : [], { count: 1 });
          },
        });
      },
    });
    const rows = await createBufferedRelationalImportDatabaseV11(database).transaction(async (tx) => {
      await tx.executeNative(NOTE_INSERT, [10, 20, 5000]);
      expect(calls).toHaveLength(0);
      return tx.query(`SELECT $1::integer AS applied`, [1]);
    });
    expect(rows).toEqual([{ applied: 1 }]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ values: [{ value: '[{"instrumento_id":10,"aluno_id":20,"valor":5000}]', oid: 25 }] });
    expect(calls[1]).toEqual({ sql: `SELECT $1::integer AS applied`, values: [1] });
  });

  it('groups only current note mutations before the next read', async () => {
    const { database, executions } = fakeDatabase();
    const buffered = createBufferedRelationalImportDatabaseV11(database);

    await buffered.transaction(async (transaction) => {
      await transaction.executeNative(NOTE_INSERT, [10, 20, 5_000]);
      await transaction.executeNative(NOTE_UPDATE, [4_500, 11, 20]);
      await transaction.executeNative(NOTE_DELETE, [12, 20]);

      expect(executions).toHaveLength(0);
      await transaction.query(`SELECT 1 AS ready`, []);
    });

    const grouped = groupedExecutions(executions);
    expect(grouped).toHaveLength(3);
    expect(grouped.map(({ query }) => query.split('\n')[0])).toEqual([
      'DELETE FROM gradebook.nota AS current',
      'UPDATE gradebook.nota AS current',
      'INSERT INTO gradebook.nota (instrumento_id, aluno_id, valor)',
    ]);
    const inserted = grouped.find((execution) => execution.query.includes(`INSERT INTO gradebook.nota (`))!;
    const updated = grouped.find((execution) => execution.query.includes(`UPDATE gradebook.nota AS`))!;
    const deleted = grouped.find((execution) => execution.query.includes(`DELETE FROM gradebook.nota AS`))!;

    expect(parsedRows(inserted)).toEqual([
      { instrumento_id: 10, aluno_id: 20, valor: 5_000 },
    ]);
    expect(parsedRows(updated)).toEqual([
      { instrumento_id: 11, aluno_id: 20, valor: 4_500 },
    ]);
    expect(parsedRows(deleted)).toEqual([{ instrumento_id: 12, aluno_id: 20 }]);
    expect(executions.at(-1)?.kind).toBe('query');
  });

  it.each([
    [NOTE_HISTORY, [1, 10, 20, null, 5_000]],
    [INSTRUMENT_HISTORY, [1, 10, 5_000, 6_000, 'ANTERIOR', 'ATUAL']],
  ] as const)('rejects retired granular history writes before SQL: %s', async (query, values) => {
    const { database, executions } = fakeDatabase();
    const buffered = createBufferedRelationalImportDatabaseV11(database);
    await expect(
      buffered.transaction(async (transaction) => {
        await transaction.executeNative(query, [...values]);
      }),
    ).rejects.toThrow('gradebook-import-granular-history-retired');
    expect(executions).toHaveLength(0);
  });

  it('groups fechamento history and final mutations at transaction completion', async () => {
    const { database, executions } = fakeDatabase();
    const buffered = createBufferedRelationalImportDatabaseV11(database);

    await buffered.transaction(async (transaction) => {
      await transaction.executeNative(CLOSING_HISTORY, [2, 30, 40, 1, null, 10_000, 0, 1]);
      await transaction.executeNative(CLOSING_INSERT, [30, 40, 10_000, null, null, null, null, null, 0, 2, null]);
      await transaction.executeNative(CLOSING_HISTORY, [2, 30, 41, 7, 55_000, 60_000, 1, 1]);
      await transaction.executeNative(CLOSING_UPDATE, [20_000, 20_000, 20_000, null, null, null, 0, 0, 60_000, 30, 41]);
      await transaction.executeNative(CLOSING_HISTORY, [2, 30, 42, 1, 5_000, null, 1, 0]);
      await transaction.executeNative(CLOSING_DELETE, [30, 42]);
    });

    const grouped = groupedExecutions(executions);
    expect(grouped).toHaveLength(4);
    expect(grouped.map(({ query }) => query.split('\n')[0])).toEqual([
      'INSERT INTO gradebook.fechamento_historico',
      'DELETE FROM gradebook.fechamento AS current',
      'UPDATE gradebook.fechamento AS current',
      'INSERT INTO gradebook.fechamento',
    ]);
    expect(
      parsedRows(grouped.find((execution) => execution.query.includes('fechamento_historico'))!),
    ).toHaveLength(3);
    expect(
      parsedRows(grouped.find((execution) => execution.query.includes(`INSERT INTO gradebook.fechamento
`))!),
    ).toEqual([expect.objectContaining({ rec_nc_mask: 0, rec_rr_mask: 2 })]);
    expect(
      parsedRows(grouped.find((execution) => execution.query.includes(`UPDATE gradebook.fechamento AS`))!),
    ).toHaveLength(1);
    expect(
      parsedRows(grouped.find((execution) => execution.query.includes(`DELETE FROM gradebook.fechamento AS`))!),
    ).toHaveLength(1);
  });

  it('fails the transaction when a grouped current-state write affects a different row count', async () => {
    const { database } = fakeDatabase({ groupedCountDelta: -1 });
    const buffered = createBufferedRelationalImportDatabaseV11(database);

    await expect(
      buffered.transaction(async (transaction) => {
        await transaction.executeNative(NOTE_INSERT, [10, 20, 5_000]);
      }),
    ).rejects.toThrow(/write-count-mismatch:note-insert/iu);
  });

  it('exposes only native operations and preserves delegated SQL, values, rows and counts', async () => {
    const calls: { query: string; values: readonly GradebookPostgresValueV1[] }[] = [];
    const result = { rows: [{ id: 42 }], changes: 7 };
    const port: GradebookPostgresWritePortV1 = {
      async query() { throw new Error('unexpected-read'); },
      async executeNative<ResultRow extends Row>(query: string, values: readonly GradebookPostgresValueV1[]) {
        calls.push({ query, values });
        return { ...result, rows: result.rows as unknown as ResultRow[] };
      },
    };
    const buffered = createBufferedRelationalImportDatabaseV11(port);
    expect('prepare' in buffered).toBe(false);
    expect('exec' in buffered).toBe(false);
    const text = '  INSERT INTO gradebook.importacao (hash) VALUES ($1) RETURNING id  ';
    const values = [postgresJsonTextV1('{"synthetic":true}')];
    expect(await buffered.executeNative(text, values)).toEqual(result);
    expect(calls).toEqual([{ query: text, values }]);
    expect(calls[0]?.values).toBe(values);
    await expect(buffered.transaction(async () => undefined)).rejects.toThrow('gradebook-relational-import-requires-postgres');
  });

  it('flushes before an unbuffered whole-instrument deletion and before any native query', async () => {
    const { database, executions } = fakeDatabase();
    const buffered = createBufferedRelationalImportDatabaseV11(database);
    await buffered.transaction(async tx => {
      expect(await tx.executeNative(NOTE_INSERT, [1, 2, null])).toEqual({ rows: [], changes: 1 });
      expect(await tx.executeNative('DELETE FROM gradebook.nota WHERE instrumento_id = $1', [99])).toEqual({ rows: [], changes: 1 });
      expect(executions).toHaveLength(2);
      expect(executions[1]).toEqual({ kind: 'execute', query: 'DELETE FROM gradebook.nota WHERE instrumento_id = $1', values: [99] });
      await tx.executeNative(NOTE_INSERT, [3, 4, 5000]);
      await tx.query(NOTE_DELETE, [88, 77]);
      expect(executions).toHaveLength(4);
      expect(executions[3]).toEqual({ kind: 'query', query: NOTE_DELETE, values: [88, 77] });
    });
    expect(groupedExecutions(executions).map(parsedRows)).toEqual([
      [{ instrumento_id: 1, aluno_id: 2, valor: null }],
      [{ instrumento_id: 3, aluno_id: 4, valor: 5000 }],
    ]);
  });

  it('flushes nested writes before running finalizers once on the physical transaction', async () => {
    const events: string[] = [];
    const database = createGradebookPostgresDatabaseFromSqlV1({
      unsafe: async () => { throw new Error('escaped-pool'); },
      async begin(operation) {
        events.push('begin');
        const result = await operation({ unsafe: async text => {
          events.push(text.includes('jsonb_to_recordset') ? 'flush' : text);
          return Object.assign([], { count: 1 });
        } });
        events.push('commit');
        return result;
      },
    });
    const buffered = createBufferedRelationalImportDatabaseV11(database) as FinalizingBuffer;
    expect(() => buffered.afterImportFlush(async () => undefined)).toThrow('import-finalizer-outside-transaction');
    const value = await buffered.transaction(async tx => {
      const nested = tx as FinalizingBuffer;
      nested.afterImportFlush(async physical => {
        expect(physical).not.toBe(tx);
        await physical.query('SELECT 1 AS finalized', []);
      });
      await nested.transaction(async inner => {
        (inner as FinalizingBuffer).afterImportFlush(async physical => {
          await physical.query('SELECT 2 AS finalized', []);
        });
        await inner.executeNative(NOTE_INSERT, [10, 20, 5000]);
      });
      expect(events).toEqual(['begin', 'flush']);
      await tx.executeNative(NOTE_INSERT, [11, 20, 4000]);
      return 'result';
    });
    expect(value).toBe('result');
    expect(events).toEqual(['begin', 'flush', 'flush', 'SELECT 1 AS finalized', 'SELECT 2 AS finalized', 'commit']);
  });

  it.each([
    [NOTE_INSERT, [1, 2], 'note-insert'],
    [NOTE_INSERT, [1.5, 2, null], 'instrument-id'],
    [NOTE_UPDATE, [postgresJsonTextV1('1'), 1, 2], 'note'],
    [CLOSING_INSERT, [1, 2, null, null, null, null, null, null, null, 0, null], 'rec-mask'],
    [CLOSING_UPDATE, [null, null, null, null, null, null, 0, '2', null, 1, 2], 'rr-mask'],
  ] as const)('rejects invalid buffer arguments before SQL: %s %j', async (query, values, label) => {
    const { database, executions } = fakeDatabase();
    await expect(createBufferedRelationalImportDatabaseV11(database).executeNative(query, values))
      .rejects.toThrow(`gradebook-import-buffer-invalid-${label}`);
    expect(executions).toEqual([]);
  });

  it.each([-2, 0.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid native affected counts: %s', async delta => {
    const { database } = fakeDatabase({ groupedCountDelta: delta });
    const buffered = createBufferedRelationalImportDatabaseV11(database);
    await buffered.executeNative(NOTE_INSERT, [1, 2, 5000]);
    await expect(buffered.flush()).rejects.toThrow('gradebook-import-buffer-invalid-change-count');
  });

  it('does not clear pending rows before a successful flush', async () => {
    const options = { groupedCountDelta: -1 };
    const { database, executions } = fakeDatabase(options);
    const buffered = createBufferedRelationalImportDatabaseV11(database);
    await buffered.executeNative(NOTE_INSERT, [1, 2, 5000]);
    await expect(buffered.flush()).rejects.toThrow('write-count-mismatch:note-insert');
    options.groupedCountDelta = 0;
    await buffered.flush();
    await buffered.flush();
    expect(executions).toHaveLength(2);
    expect(executions[0]).toEqual(executions[1]);
  });

  it('preserves driver errors and lastFailure without reading or finalizing after failed flush', async () => {
    const failure = Object.assign(new Error('permission denied'), { code: '42501' });
    const events: string[] = [];
    const database = createGradebookPostgresDatabaseFromSqlV1({
      unsafe: async () => { throw new Error('escaped-pool'); },
      async begin(operation) {
        try {
          return await operation({ unsafe: async text => {
            events.push(text.split('\n')[0]!);
            throw failure;
          } });
        } catch (error) { events.push('rollback'); throw error; }
      },
    });
    await expect(createBufferedRelationalImportDatabaseV11(database).transaction(async tx => {
      (tx as FinalizingBuffer).afterImportFlush(async () => { events.push('finalized'); });
      await tx.executeNative(NOTE_INSERT, [1, 2, 5000]);
      await tx.query('SELECT 1 AS ready', []);
    })).rejects.toBe(failure);
    expect(events).toEqual(['INSERT INTO gradebook.nota (instrumento_id, aluno_id, valor)', 'rollback']);
    expect(database.lastFailure()).toEqual({ operation: 'INSERT', relation: 'nota', errorType: 'Error', sqlState: '42501', category: 'permission' });
  });
});
