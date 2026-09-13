import { z } from 'zod';
import type { StudentPortalPostgresQueryV1, StudentPortalPostgresSqlV1 } from '../persistence/postgres-persistence-v1';

const count = z.number().int().nonnegative().safe();
export const portalMetricV1 = z.object({
  event: z.literal('student-portal-operation-v1'),
  operation: z.enum(['auth', 'self', 'admin-query', 'admin-command', 'cleanup', 'publication']),
  outcome: z.enum(['ok', 'denied', 'unavailable']),
  elapsedMs: count, queries: count, rows: count, lockTimeouts: count, statementTimeouts: count,
}).strict();
export type PortalMetricV1 = z.infer<typeof portalMetricV1>;

/** Capture numeric aggregates only, never SQL, parameters, IDs, URLs or driver error messages. */
export function measurePortalSqlV1(sql: StudentPortalPostgresSqlV1) {
  const started = Date.now();
  const counters = { queries: 0, rows: 0, lockTimeouts: 0, statementTimeouts: 0 };
  const wrap = (tx: StudentPortalPostgresQueryV1): StudentPortalPostgresQueryV1 => ({
    unsafe: async <R extends Record<string, unknown>>(query: string, parameters?: readonly unknown[]) => {
      counters.queries++;
      try {
        const rows = await tx.unsafe<R>(query, parameters);
        counters.rows += rows.length;
        return rows;
      } catch (error) {
        // SQLSTATE is a bounded classifier. No other error property leaves this function.
        const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : null;
        if (code === '55P03') counters.lockTimeouts++;
        if (code === '57014') counters.statementTimeouts++;
        throw error;
      }
    },
  });
  return {
    sql: { ...wrap(sql), begin: <T>(op: (tx: StudentPortalPostgresQueryV1) => Promise<T>) => sql.begin((tx) => op(wrap(tx))) } satisfies StudentPortalPostgresSqlV1,
    snapshot: (operation: PortalMetricV1['operation'], outcome: PortalMetricV1['outcome']): PortalMetricV1 =>
      portalMetricV1.parse({ event: 'student-portal-operation-v1', operation, outcome, elapsedMs: Math.max(0, Date.now() - started), ...counters }),
  };
}

/** Logging failure cannot turn a committed command into an apparent retryable database failure. */
export function emitPortalMetricV1(metric: PortalMetricV1, sink: (value: PortalMetricV1) => void = console.info): void {
  const parsed = portalMetricV1.safeParse(metric);
  if (!parsed.success) return;
  try { sink(parsed.data); } catch { /* Telemetry is outside the commit outcome. */ }
}
