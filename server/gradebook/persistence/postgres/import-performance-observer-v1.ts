import type { GradebookPostgresWritePortV1 } from './postgres-database-v1';

export type ImportFlushReasonV1 = 'read-boundary' | 'non-buffered-write' | 'transaction-end';
export type ImportGroupCategoryV1 =
  | 'note-delete'
  | 'note-update'
  | 'note-insert'
  | 'closing-history'
  | 'closing-delete'
  | 'closing-update'
  | 'closing-insert';
type SqlCategoryV1 = 'read' | 'write' | 'coordination' | 'finalizer' | 'other';
type TransactionOutcomeV1 = 'committed' | 'rejected' | 'unknown';
type TransactionPortV1 = GradebookPostgresWritePortV1 & {
  transaction<T>(operation: (database: GradebookPostgresWritePortV1) => Promise<T>): Promise<T>;
};

export function importPerformanceNowV1(): number {
  return typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
}

function duration(started: number): number {
  return Math.max(0, Math.round((importPerformanceNowV1() - started) * 10) / 10);
}

// Only fixed operation categories leave this module. Unknown SQL stays "other".
function category(query: string): SqlCategoryV1 {
  const sql = query.trim().replace(/\s+/gu, ' ').toLowerCase();
  if (
    /^select (?:pg_advisory_xact_lock(?:_shared)?|student_portal\.ensure_year_coordination_v1)\(/u.test(
      sql,
    )
  )
    return 'coordination';
  if (
    /^select .*\bfrom student_portal\.(?:record_gradebook_change_v1|synchronize_gradebook_profiles_v1)\(/u.test(
      sql,
    )
  )
    return 'finalizer';
  if (
    /^(?:insert into|update|delete from) gradebook\.(?:ano_letivo|turma|aluno|vinculo|vinculo_historico|professor|disciplina|oferta|instrumento|nota|fechamento|fechamento_historico|importacao|conselho_decisao|conselho_votacao)\b/u.test(
      sql,
    )
  )
    return 'write';
  if (
    /^select /u.test(sql) &&
    !/\b(?:student_portal\.[a-z_]+\(|pg_[a-z_]+\()/u.test(sql) &&
    /\bfrom gradebook\.(?:ano_letivo|turma|aluno|vinculo|professor|disciplina|oferta|instrumento|nota|fechamento|conselho_decisao|conselho_votacao)\b/u.test(
      sql,
    )
  )
    return 'read';
  return 'other';
}

/** One observer per authorized request, below V11's buffer; no parameters/results retained. */
export function createImportPerformanceObserverV1() {
  const metrics = {
    sqlCalls: 0,
    sqlReadCalls: 0,
    sqlWriteCalls: 0,
    sqlOtherCalls: 0,
    sqlFailedCalls: 0,
    rowsRead: 0,
    coordinationCallMs: 0,
    transactionMs: null as number | null,
    transactionOutcome: null as TransactionOutcomeV1 | null,
    bufferedLogicalMutations: 0,
    flushesWithWork: 0,
    flushReasonCounts: { 'read-boundary': 0, 'non-buffered-write': 0, 'transaction-end': 0 },
    groupedStatements: 0,
    groupedStatementsCompleted: 0,
    groupedStatementsFailed: 0,
    groupRows: 0,
    maximumGroupRows: 0,
    groupBytes: 0,
    maximumGroupBytes: 0,
    finalizerMs: null as number | null,
  };
  const groupCounts: Record<ImportGroupCategoryV1, number> = {
    'note-delete': 0,
    'note-update': 0,
    'note-insert': 0,
    'closing-history': 0,
    'closing-delete': 0,
    'closing-update': 0,
    'closing-insert': 0,
  };

  async function observeSql<T>(
    sql: string,
    operation: () => Promise<T>,
    rowCount: (result: T) => number,
  ): Promise<T> {
    const kind = category(sql);
    metrics.sqlCalls++;
    if (kind === 'read') metrics.sqlReadCalls++;
    else if (kind === 'write' || kind === 'finalizer') metrics.sqlWriteCalls++;
    else metrics.sqlOtherCalls++;
    const started = importPerformanceNowV1();
    try {
      const result = await operation();
      if (kind === 'read') metrics.rowsRead += rowCount(result);
      return result;
    } catch (cause) {
      metrics.sqlFailedCalls++;
      throw cause;
    } finally {
      if (kind === 'coordination') metrics.coordinationCallMs += duration(started);
    }
  }

  function wrap<T extends GradebookPostgresWritePortV1>(database: T, depth = 0): T {
    const query: GradebookPostgresWritePortV1['query'] = (sql, values) =>
      observeSql(
        sql,
        () => database.query(sql, values),
        (result) => result.length,
      );
    const executeNative: GradebookPostgresWritePortV1['executeNative'] = (sql, values) =>
      observeSql(
        sql,
        () => database.executeNative(sql, values),
        (result) => result.rows.length,
      );
    const transaction: TransactionPortV1['transaction'] = async (operation) => {
      const started = importPerformanceNowV1();
      let callbackCompleted = false;
      try {
        const result = await (database as unknown as TransactionPortV1).transaction(async (tx) => {
          const result = await operation(wrap(tx, depth + 1));
          callbackCompleted = true;
          return result;
        });
        if (depth === 0) metrics.transactionOutcome = 'committed';
        return result;
      } catch (cause) {
        if (depth === 0) metrics.transactionOutcome = callbackCompleted ? 'unknown' : 'rejected';
        throw cause;
      } finally {
        if (depth === 0) metrics.transactionMs = (metrics.transactionMs ?? 0) + duration(started);
      }
    };
    return new Proxy(database, {
      get(target, property) {
        if (property === 'query') return query;
        if (property === 'executeNative') return executeNative;
        if (property === 'transaction' && typeof Reflect.get(target, property) === 'function')
          return transaction;
        const value: unknown = Reflect.get(target, property, target);
        // Preserve close, lastFailure and any adapter method with its original receiver.
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  return {
    wrap,
    bufferedMutation() {
      metrics.bufferedLogicalMutations++;
    },
    flush(reason: ImportFlushReasonV1) {
      metrics.flushesWithWork++;
      metrics.flushReasonCounts[reason]++;
    },
    groupStarted(label: ImportGroupCategoryV1, rows: number, bytes: number) {
      metrics.groupedStatements++;
      groupCounts[label]++;
      metrics.groupRows += rows;
      metrics.groupBytes += bytes;
      metrics.maximumGroupRows = Math.max(metrics.maximumGroupRows, rows);
      metrics.maximumGroupBytes = Math.max(metrics.maximumGroupBytes, bytes);
    },
    groupFinished(success: boolean) {
      if (success) metrics.groupedStatementsCompleted++;
      else metrics.groupedStatementsFailed++;
    },
    finalizerElapsed(started: number) {
      metrics.finalizerMs = (metrics.finalizerMs ?? 0) + duration(started);
    },
    snapshot() {
      return {
        ...metrics,
        flushReasonCounts: { ...metrics.flushReasonCounts },
        groupCounts: { ...groupCounts },
      };
    },
  };
}

export type ImportPerformanceObserverV1 = ReturnType<typeof createImportPerformanceObserverV1>;

/** A logger failure after commit must never change the academic response. */
export function emitImportPerformanceV1(
  summary: object,
  logger: (value: string) => void = (value) => console.info(value),
): void {
  try {
    logger(
      JSON.stringify({ event: 'gradebook_import_performance', metricsVersion: 1, ...summary }),
    );
  } catch {
    /* Optional telemetry has no authority over academic persistence. */
  }
}
