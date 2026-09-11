import { describe, expect, it } from 'vitest';
import type {
  D1WriteDatabaseV1,
  D1WriteRunResultV1,
  D1WriteStatementV1,
  D1WriteValueV1,
} from '../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import { createBufferedRelationalImportDatabaseV11 } from '../../../server/gradebook/persistence/postgres/relational-import-write-buffer-v11';

type Row = Record<string, unknown>;

interface Execution {
  readonly kind: 'run' | 'first' | 'all' | 'exec';
  readonly query: string;
  readonly values: readonly D1WriteValueV1[];
}

interface FakeDatabase extends D1WriteDatabaseV1 {
  transaction<T>(operation: (database: D1WriteDatabaseV1) => Promise<T>): Promise<T>;
}

function fakeDatabase(options: { readonly groupedCountDelta?: number } = {}): {
  readonly database: FakeDatabase;
  readonly executions: Execution[];
} {
  const executions: Execution[] = [];

  const createStatement = (
    query: string,
    values: readonly D1WriteValueV1[] = [],
  ): D1WriteStatementV1 => ({
    bind(...nextValues: D1WriteValueV1[]) {
      return createStatement(query, nextValues);
    },
    async first<ResultRow extends Row>() {
      executions.push({ kind: 'first', query, values });
      return null as ResultRow | null;
    },
    async all<ResultRow extends Row>() {
      executions.push({ kind: 'all', query, values });
      return { results: [] as readonly ResultRow[] };
    },
    async run(): Promise<D1WriteRunResultV1> {
      executions.push({ kind: 'run', query, values });
      let changes = 1;
      if (query.includes('jsonb_to_recordset')) {
        const payload = values[0];
        if (typeof payload !== 'string') throw new Error('expected-json-payload');
        const parsed = JSON.parse(payload) as unknown[];
        changes = parsed.length + (options.groupedCountDelta ?? 0);
      }
      return { success: true, changes, meta: { changes } };
    },
  });

  const database: FakeDatabase = {
    prepare(query: string) {
      return createStatement(query);
    },
    async exec(query: string) {
      executions.push({ kind: 'exec', query, values: [] });
      return null;
    },
    async transaction<T>(operation: (transaction: D1WriteDatabaseV1) => Promise<T>) {
      return operation(database);
    },
  };

  return { database, executions };
}

const NOTE_HISTORY = `INSERT INTO gradebook.nota_historico
  (importacao_id, instrumento_id, aluno_id, valor_anterior, valor_novo)
  VALUES (?, ?, ?, ?, ?)`;
const NOTE_INSERT = `INSERT INTO gradebook.nota (instrumento_id, aluno_id, valor) VALUES (?, ?, ?)`;
const NOTE_UPDATE = `UPDATE gradebook.nota SET valor = ? WHERE instrumento_id = ? AND aluno_id = ?`;
const NOTE_DELETE = `DELETE FROM gradebook.nota WHERE instrumento_id = ? AND aluno_id = ?`;
const CLOSING_HISTORY = `INSERT INTO gradebook.fechamento_historico
  (importacao_id, oferta_id, aluno_id, campo, valor_anterior, valor_novo, estado_anterior, estado_novo)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
const CLOSING_INSERT = `INSERT INTO gradebook.fechamento
  (oferta_id, aluno_id, am1_fonte, am2_fonte, am3_fonte, rec1, rec2, rec3, rec_nc_mask, rec_rr_mask, u_fonte)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const CLOSING_UPDATE = `UPDATE gradebook.fechamento
  SET am1_fonte = ?, am2_fonte = ?, am3_fonte = ?, rec1 = ?, rec2 = ?, rec3 = ?, rec_nc_mask = ?, rec_rr_mask = ?, u_fonte = ?
  WHERE oferta_id = ? AND aluno_id = ?`;
const CLOSING_DELETE = `DELETE FROM gradebook.fechamento WHERE oferta_id = ? AND aluno_id = ?`;

function groupedExecutions(executions: readonly Execution[]): readonly Execution[] {
  return executions.filter(
    (execution) => execution.kind === 'run' && execution.query.includes('jsonb_to_recordset'),
  );
}

function parsedRows(execution: Execution): readonly Record<string, unknown>[] {
  const payload = execution.values[0];
  if (typeof payload !== 'string') throw new Error('missing-json-payload');
  return JSON.parse(payload) as Record<string, unknown>[];
}

describe('relational import write buffer v11', () => {
  it('groups repetitive note history and note mutations before the next read', async () => {
    const { database, executions } = fakeDatabase();
    const buffered = createBufferedRelationalImportDatabaseV11(database);

    await buffered.transaction(async (transaction) => {
      expect(
        await transaction.prepare(NOTE_HISTORY).bind(1, 10, 20, null, 5_000).run(),
      ).toMatchObject({ changes: 1 });
      await transaction.prepare(NOTE_INSERT).bind(10, 20, 5_000).run();
      await transaction.prepare(NOTE_HISTORY).bind(1, 11, 20, 4_000, 4_500).run();
      await transaction.prepare(NOTE_UPDATE).bind(4_500, 11, 20).run();
      await transaction.prepare(NOTE_HISTORY).bind(1, 12, 20, 3_000, null).run();
      await transaction.prepare(NOTE_DELETE).bind(12, 20).run();

      expect(executions).toHaveLength(0);
      await transaction.prepare('SELECT 1 AS ready').first<Row>();
    });

    const grouped = groupedExecutions(executions);
    expect(grouped).toHaveLength(4);
    const history = grouped.find((execution) => execution.query.includes('nota_historico'))!;
    const inserted = grouped.find((execution) => execution.query.includes('INSERT INTO gradebook.nota ('))!;
    const updated = grouped.find((execution) => execution.query.includes('UPDATE gradebook.nota AS'))!;
    const deleted = grouped.find((execution) => execution.query.includes('DELETE FROM gradebook.nota AS'))!;

    expect(parsedRows(history)).toHaveLength(3);
    expect(parsedRows(inserted)).toEqual([
      { instrumento_id: 10, aluno_id: 20, valor: 5_000 },
    ]);
    expect(parsedRows(updated)).toEqual([
      { instrumento_id: 11, aluno_id: 20, valor: 4_500 },
    ]);
    expect(parsedRows(deleted)).toEqual([{ instrumento_id: 12, aluno_id: 20 }]);
    expect(executions.at(-1)?.kind).toBe('first');
  });

  it('groups fechamento history and final mutations at transaction completion', async () => {
    const { database, executions } = fakeDatabase();
    const buffered = createBufferedRelationalImportDatabaseV11(database);

    await buffered.transaction(async (transaction) => {
      await transaction.prepare(CLOSING_HISTORY).bind(2, 30, 40, 1, null, 10_000, 0, 1).run();
      await transaction
        .prepare(CLOSING_INSERT)
        .bind(30, 40, 10_000, null, null, null, null, null, 0, 2, null)
        .run();
      await transaction.prepare(CLOSING_HISTORY).bind(2, 30, 41, 7, 55_000, 60_000, 1, 1).run();
      await transaction
        .prepare(CLOSING_UPDATE)
        .bind(20_000, 20_000, 20_000, null, null, null, 0, 0, 60_000, 30, 41)
        .run();
      await transaction.prepare(CLOSING_HISTORY).bind(2, 30, 42, 1, 5_000, null, 1, 0).run();
      await transaction.prepare(CLOSING_DELETE).bind(30, 42).run();
    });

    const grouped = groupedExecutions(executions);
    expect(grouped).toHaveLength(4);
    expect(
      parsedRows(grouped.find((execution) => execution.query.includes('fechamento_historico'))!),
    ).toHaveLength(3);
    expect(
      parsedRows(grouped.find((execution) => execution.query.includes('INSERT INTO gradebook.fechamento\n'))!),
    ).toEqual([expect.objectContaining({ rec_nc_mask: 0, rec_rr_mask: 2 })]);
    expect(
      parsedRows(grouped.find((execution) => execution.query.includes('UPDATE gradebook.fechamento AS'))!),
    ).toHaveLength(1);
    expect(
      parsedRows(grouped.find((execution) => execution.query.includes('DELETE FROM gradebook.fechamento AS'))!),
    ).toHaveLength(1);
  });

  it('fails the transaction when a grouped write affects a different row count', async () => {
    const { database } = fakeDatabase({ groupedCountDelta: -1 });
    const buffered = createBufferedRelationalImportDatabaseV11(database);

    await expect(
      buffered.transaction(async (transaction) => {
        await transaction.prepare(NOTE_HISTORY).bind(1, 10, 20, null, 5_000).run();
      }),
    ).rejects.toThrow(/write-count-mismatch:note-history/iu);
  });
});
