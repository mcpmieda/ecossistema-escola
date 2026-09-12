import type {
  D1WriteDatabaseV1,
  D1WriteRunResultV1,
  D1WriteStatementV1,
  D1WriteValueV1,
} from '../d1/write/d1-write-adapter-v1';

type Row = Record<string, unknown>;

interface TransactionDatabaseV11 extends D1WriteDatabaseV1 {
  transaction<T>(operation: (database: D1WriteDatabaseV1) => Promise<T>): Promise<T>;
}

export interface BufferedRelationalImportDatabaseV11 extends D1WriteDatabaseV1 {
  transaction<T>(operation: (database: D1WriteDatabaseV1) => Promise<T>): Promise<T>;
  flush(): Promise<void>;
}

interface NoteHistoryRowV11 {
  readonly importacao_id: number;
  readonly instrumento_id: number;
  readonly aluno_id: number;
  readonly valor_anterior: number | null;
  readonly valor_novo: number | null;
}

interface NoteValueRowV11 {
  readonly instrumento_id: number;
  readonly aluno_id: number;
  readonly valor: number;
}

interface NoteKeyRowV11 {
  readonly instrumento_id: number;
  readonly aluno_id: number;
}

interface ClosingHistoryRowV11 {
  readonly importacao_id: number;
  readonly oferta_id: number;
  readonly aluno_id: number;
  readonly campo: number;
  readonly valor_anterior: number | null;
  readonly valor_novo: number | null;
  readonly estado_anterior: number;
  readonly estado_novo: number;
}

interface ClosingRowV11 {
  readonly oferta_id: number;
  readonly aluno_id: number;
  readonly am1_fonte: number | null;
  readonly am2_fonte: number | null;
  readonly am3_fonte: number | null;
  readonly rec1: number | null;
  readonly rec2: number | null;
  readonly rec3: number | null;
  readonly rec_nc_mask: number;
  readonly rec_rr_mask: number;
  readonly u_fonte: number | null;
}

interface ClosingKeyRowV11 {
  readonly oferta_id: number;
  readonly aluno_id: number;
}

interface BufferedWritesV11 {
  readonly noteHistory: NoteHistoryRowV11[];
  readonly noteInsert: NoteValueRowV11[];
  readonly noteUpdate: NoteValueRowV11[];
  readonly noteDelete: NoteKeyRowV11[];
  readonly closingHistory: ClosingHistoryRowV11[];
  readonly closingInsert: ClosingRowV11[];
  readonly closingUpdate: ClosingRowV11[];
  readonly closingDelete: ClosingKeyRowV11[];
}

function emptyBuffer(): BufferedWritesV11 {
  return {
    noteHistory: [],
    noteInsert: [],
    noteUpdate: [],
    noteDelete: [],
    closingHistory: [],
    closingInsert: [],
    closingUpdate: [],
    closingDelete: [],
  };
}

function transactionDatabase(database: D1WriteDatabaseV1): TransactionDatabaseV11 {
  if (
    !('transaction' in database) ||
    typeof (database as { transaction?: unknown }).transaction !== 'function'
  ) {
    throw new Error('gradebook-relational-import-requires-postgres');
  }
  return database as TransactionDatabaseV11;
}

function compactSql(query: string): string {
  return query.trim().replace(/\s+/gu, ' ').toLowerCase();
}

function integer(value: D1WriteValueV1, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`gradebook-import-buffer-invalid-${label}`);
  }
  return value;
}

function nullableInteger(value: D1WriteValueV1, label: string): number | null {
  if (value === null) return null;
  return integer(value, label);
}

function assertLength(values: readonly D1WriteValueV1[], expected: number, label: string): void {
  if (values.length !== expected) {
    throw new Error(`gradebook-import-buffer-invalid-${label}`);
  }
}

function resultChanges(result: D1WriteRunResultV1): number {
  const changes = result.meta?.changes ?? result.changes;
  if (typeof changes !== 'number' || !Number.isSafeInteger(changes) || changes < 0) {
    throw new Error('gradebook-import-buffer-invalid-change-count');
  }
  return changes;
}

function oneChange(): D1WriteRunResultV1 {
  return { success: true, changes: 1, meta: { changes: 1 } };
}

class BufferedStatementV11 implements D1WriteStatementV1 {
  constructor(
    private readonly owner: BufferedDatabaseV11,
    private readonly query: string,
    private readonly values: readonly D1WriteValueV1[] = [],
  ) {}

  bind(...values: D1WriteValueV1[]): D1WriteStatementV1 {
    return new BufferedStatementV11(this.owner, this.query, values);
  }

  async first<ResultRow extends Row>(): Promise<ResultRow | null> {
    await this.owner.flush();
    return this.owner.underlying
      .prepare(this.query)
      .bind(...this.values)
      .first<ResultRow>();
  }

  async all<ResultRow extends Row>(): Promise<{ readonly results: readonly ResultRow[] }> {
    await this.owner.flush();
    return this.owner.underlying
      .prepare(this.query)
      .bind(...this.values)
      .all<ResultRow>();
  }

  async run(): Promise<D1WriteRunResultV1> {
    if (this.owner.bufferRun(this.query, this.values)) return oneChange();
    await this.owner.flush();
    return this.owner.underlying
      .prepare(this.query)
      .bind(...this.values)
      .run();
  }
}

class BufferedDatabaseV11 implements BufferedRelationalImportDatabaseV11 {
  readonly underlying: D1WriteDatabaseV1;
  private pending: BufferedWritesV11 = emptyBuffer();

  constructor(
    database: D1WriteDatabaseV1,
    private readonly finalizers: Array<
      (database: D1WriteDatabaseV1) => Promise<void>
    > | null = null,
  ) {
    this.underlying = database;
  }

  prepare(query: string): D1WriteStatementV1 {
    return new BufferedStatementV11(this, query);
  }

  async exec(query: string): Promise<unknown> {
    await this.flush();
    return await this.underlying.exec(query);
  }

  afterImportFlush(operation: (database: D1WriteDatabaseV1) => Promise<void>): void {
    if (this.finalizers === null) throw new Error('import-finalizer-outside-transaction');
    this.finalizers.push(operation);
  }

  async transaction<T>(operation: (database: D1WriteDatabaseV1) => Promise<T>): Promise<T> {
    await this.flush();
    return transactionDatabase(this.underlying).transaction(async (transaction) => {
      const finalizers = this.finalizers ?? [];
      const nested = new BufferedDatabaseV11(transaction, finalizers);
      const result = await operation(nested);
      await nested.flush();
      if (this.finalizers === null) {
        for (const finalize of finalizers) await finalize(transaction);
      }
      return result;
    });
  }

  bufferRun(query: string, values: readonly D1WriteValueV1[]): boolean {
    const sql = compactSql(query);

    if (sql.startsWith('insert into gradebook.nota_historico ')) {
      assertLength(values, 5, 'note-history');
      this.pending.noteHistory.push({
        importacao_id: integer(values[0]!, 'import-id'),
        instrumento_id: integer(values[1]!, 'instrument-id'),
        aluno_id: integer(values[2]!, 'student-id'),
        valor_anterior: nullableInteger(values[3]!, 'previous-note'),
        valor_novo: nullableInteger(values[4]!, 'next-note'),
      });
      return true;
    }

    if (sql.startsWith('insert into gradebook.nota (instrumento_id, aluno_id, valor)')) {
      assertLength(values, 3, 'note-insert');
      this.pending.noteInsert.push({
        instrumento_id: integer(values[0]!, 'instrument-id'),
        aluno_id: integer(values[1]!, 'student-id'),
        valor: integer(values[2]!, 'note'),
      });
      return true;
    }

    if (sql.startsWith('update gradebook.nota set valor = ? ')) {
      assertLength(values, 3, 'note-update');
      this.pending.noteUpdate.push({
        instrumento_id: integer(values[1]!, 'instrument-id'),
        aluno_id: integer(values[2]!, 'student-id'),
        valor: integer(values[0]!, 'note'),
      });
      return true;
    }

    if (sql.startsWith('delete from gradebook.nota where instrumento_id = ? ')) {
      assertLength(values, 2, 'note-delete');
      this.pending.noteDelete.push({
        instrumento_id: integer(values[0]!, 'instrument-id'),
        aluno_id: integer(values[1]!, 'student-id'),
      });
      return true;
    }

    if (sql.startsWith('insert into gradebook.fechamento_historico ')) {
      assertLength(values, 8, 'closing-history');
      this.pending.closingHistory.push({
        importacao_id: integer(values[0]!, 'import-id'),
        oferta_id: integer(values[1]!, 'offer-id'),
        aluno_id: integer(values[2]!, 'student-id'),
        campo: integer(values[3]!, 'closing-field'),
        valor_anterior: nullableInteger(values[4]!, 'previous-closing'),
        valor_novo: nullableInteger(values[5]!, 'next-closing'),
        estado_anterior: integer(values[6]!, 'previous-state'),
        estado_novo: integer(values[7]!, 'next-state'),
      });
      return true;
    }

    if (sql.startsWith('insert into gradebook.fechamento (oferta_id, aluno_id,')) {
      assertLength(values, 11, 'closing-insert');
      this.pending.closingInsert.push(this.closingRow(values, false));
      return true;
    }

    if (sql.startsWith('update gradebook.fechamento set am1_fonte = ?')) {
      assertLength(values, 11, 'closing-update');
      this.pending.closingUpdate.push(this.closingRow(values, true));
      return true;
    }

    if (sql.startsWith('delete from gradebook.fechamento where oferta_id = ? ')) {
      assertLength(values, 2, 'closing-delete');
      this.pending.closingDelete.push({
        oferta_id: integer(values[0]!, 'offer-id'),
        aluno_id: integer(values[1]!, 'student-id'),
      });
      return true;
    }

    return false;
  }

  private closingRow(values: readonly D1WriteValueV1[], update: boolean): ClosingRowV11 {
    const offset = update ? 0 : 2;
    const ofertaIndex = update ? 9 : 0;
    const alunoIndex = update ? 10 : 1;
    return {
      oferta_id: integer(values[ofertaIndex]!, 'offer-id'),
      aluno_id: integer(values[alunoIndex]!, 'student-id'),
      am1_fonte: nullableInteger(values[offset]!, 'am1'),
      am2_fonte: nullableInteger(values[offset + 1]!, 'am2'),
      am3_fonte: nullableInteger(values[offset + 2]!, 'am3'),
      rec1: nullableInteger(values[offset + 3]!, 'rec1'),
      rec2: nullableInteger(values[offset + 4]!, 'rec2'),
      rec3: nullableInteger(values[offset + 5]!, 'rec3'),
      rec_nc_mask: integer(values[offset + 6]!, 'rec-mask'),
      rec_rr_mask: integer(values[offset + 7]!, 'rr-mask'),
      u_fonte: nullableInteger(values[offset + 8]!, 'u'),
    };
  }

  async flush(): Promise<void> {
    const current = this.pending;
    if (
      current.noteHistory.length === 0 &&
      current.noteInsert.length === 0 &&
      current.noteUpdate.length === 0 &&
      current.noteDelete.length === 0 &&
      current.closingHistory.length === 0 &&
      current.closingInsert.length === 0 &&
      current.closingUpdate.length === 0 &&
      current.closingDelete.length === 0
    ) {
      return;
    }

    await this.groupedRun(
      `INSERT INTO gradebook.nota_historico
       (importacao_id, instrumento_id, aluno_id, valor_anterior, valor_novo)
       SELECT importacao_id, instrumento_id, aluno_id, valor_anterior, valor_novo
       FROM jsonb_to_recordset(?::jsonb) AS incoming(
         importacao_id integer,
         instrumento_id integer,
         aluno_id integer,
         valor_anterior integer,
         valor_novo integer
       )`,
      current.noteHistory,
      'note-history',
    );
    await this.groupedRun(
      `DELETE FROM gradebook.nota AS current
       USING jsonb_to_recordset(?::jsonb) AS incoming(
         instrumento_id integer,
         aluno_id integer
       )
       WHERE current.instrumento_id = incoming.instrumento_id
         AND current.aluno_id = incoming.aluno_id`,
      current.noteDelete,
      'note-delete',
    );
    await this.groupedRun(
      `UPDATE gradebook.nota AS current
       SET valor = incoming.valor
       FROM jsonb_to_recordset(?::jsonb) AS incoming(
         instrumento_id integer,
         aluno_id integer,
         valor integer
       )
       WHERE current.instrumento_id = incoming.instrumento_id
         AND current.aluno_id = incoming.aluno_id`,
      current.noteUpdate,
      'note-update',
    );
    await this.groupedRun(
      `INSERT INTO gradebook.nota (instrumento_id, aluno_id, valor)
       SELECT instrumento_id, aluno_id, valor
       FROM jsonb_to_recordset(?::jsonb) AS incoming(
         instrumento_id integer,
         aluno_id integer,
         valor integer
       )`,
      current.noteInsert,
      'note-insert',
    );
    await this.groupedRun(
      `INSERT INTO gradebook.fechamento_historico
       (importacao_id, oferta_id, aluno_id, campo, valor_anterior, valor_novo, estado_anterior, estado_novo)
       SELECT importacao_id, oferta_id, aluno_id, campo, valor_anterior, valor_novo, estado_anterior, estado_novo
       FROM jsonb_to_recordset(?::jsonb) AS incoming(
         importacao_id integer,
         oferta_id integer,
         aluno_id integer,
         campo integer,
         valor_anterior integer,
         valor_novo integer,
         estado_anterior smallint,
         estado_novo smallint
       )`,
      current.closingHistory,
      'closing-history',
    );
    await this.groupedRun(
      `DELETE FROM gradebook.fechamento AS current
       USING jsonb_to_recordset(?::jsonb) AS incoming(
         oferta_id integer,
         aluno_id integer
       )
       WHERE current.oferta_id = incoming.oferta_id
         AND current.aluno_id = incoming.aluno_id`,
      current.closingDelete,
      'closing-delete',
    );
    await this.groupedRun(
      `UPDATE gradebook.fechamento AS current
       SET am1_fonte = incoming.am1_fonte,
           am2_fonte = incoming.am2_fonte,
           am3_fonte = incoming.am3_fonte,
           rec1 = incoming.rec1,
           rec2 = incoming.rec2,
           rec3 = incoming.rec3,
           rec_nc_mask = incoming.rec_nc_mask,
           rec_rr_mask = incoming.rec_rr_mask,
           u_fonte = incoming.u_fonte
       FROM jsonb_to_recordset(?::jsonb) AS incoming(
         oferta_id integer,
         aluno_id integer,
         am1_fonte integer,
         am2_fonte integer,
         am3_fonte integer,
         rec1 integer,
         rec2 integer,
         rec3 integer,
         rec_nc_mask smallint,
         rec_rr_mask smallint,
         u_fonte integer
       )
       WHERE current.oferta_id = incoming.oferta_id
         AND current.aluno_id = incoming.aluno_id`,
      current.closingUpdate,
      'closing-update',
    );
    await this.groupedRun(
      `INSERT INTO gradebook.fechamento
       (oferta_id, aluno_id, am1_fonte, am2_fonte, am3_fonte, rec1, rec2, rec3, rec_nc_mask, rec_rr_mask, u_fonte)
       SELECT oferta_id, aluno_id, am1_fonte, am2_fonte, am3_fonte, rec1, rec2, rec3, rec_nc_mask, rec_rr_mask, u_fonte
       FROM jsonb_to_recordset(?::jsonb) AS incoming(
         oferta_id integer,
         aluno_id integer,
         am1_fonte integer,
         am2_fonte integer,
         am3_fonte integer,
         rec1 integer,
         rec2 integer,
         rec3 integer,
         rec_nc_mask smallint,
         rec_rr_mask smallint,
         u_fonte integer
       )`,
      current.closingInsert,
      'closing-insert',
    );

    this.pending = emptyBuffer();
  }

  private async groupedRun(query: string, rows: readonly object[], label: string): Promise<void> {
    if (rows.length === 0) return;
    const result = await this.underlying.prepare(query).bind(JSON.stringify(rows)).run();
    if (resultChanges(result) !== rows.length) {
      throw new Error(`gradebook-import-buffer-write-count-mismatch:${label}`);
    }
  }
}

export function createBufferedRelationalImportDatabaseV11(
  database: D1WriteDatabaseV1,
): BufferedRelationalImportDatabaseV11 {
  return new BufferedDatabaseV11(database);
}
