import postgres from 'postgres';
import type { PersistencePortV1 } from '../../../shared/student-portal-contracts/ports-v1';
import {
  createStudentPortalPostgresPersistenceV1,
  type StudentPortalPostgresSqlV1,
} from '../persistence/postgres-persistence-v1';

type PortalSqlClientV1 = StudentPortalPostgresSqlV1 & {
  end: (options: { timeout: number }) => Promise<void>;
};

export type PortalSqlClientFactoryV1 = (connectionString: string) => PortalSqlClientV1;
export type PortalSqlLifecycleSampleV1 = {
  openRoleMs: number;
  applicationMs: number;
  attempts: 1 | 2;
};
type PortalSqlLifecycleObserverV1 = (sample: PortalSqlLifecycleSampleV1) => void;

class PortalWrongRoleV1 extends Error {}

const createPortalSqlClientV1: PortalSqlClientFactoryV1 = (connectionString) =>
  postgres(connectionString, {
    max: 1,
    fetch_types: false,
    prepare: true,
    connect_timeout: 5,
    idle_timeout: 5,
    max_lifetime: 60,
    connection: {
      application_name: 'student-portal-v1',
      statement_timeout: 5000,
      lock_timeout: 1500,
      idle_in_transaction_session_timeout: 10000,
    },
    onnotice: () => undefined,
  }) as unknown as PortalSqlClientV1;

async function closePortalSqlClientV1(sql: PortalSqlClientV1 | undefined): Promise<void> {
  await sql?.end({ timeout: 1 }).catch(() => undefined);
}

/** Retry only connection establishment. The caller operation is never replayed. */
async function openPortalSqlClientV1(
  connectionString: string,
  createClient: PortalSqlClientFactoryV1,
): Promise<{ sql: PortalSqlClientV1; openRoleMs: number; attempts: 1 | 2 }> {
  const started = Date.now();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let sql: PortalSqlClientV1 | undefined;
    try {
      sql = createClient(connectionString);
      const identity = await sql.unsafe<{ role: string }>('SELECT current_user AS role');
      if (identity[0]?.role !== 'student_portal_app') throw new PortalWrongRoleV1();
      return {
        sql,
        openRoleMs: Math.max(0, Date.now() - started),
        attempts: (attempt + 1) as 1 | 2,
      };
    } catch (error) {
      await closePortalSqlClientV1(sql);
      if (error instanceof PortalWrongRoleV1 || attempt === 1) throw error;
    }
  }
  throw new Error('student-portal-database-unavailable');
}

/** One connection per invocation; Hyperdrive owns the shared origin pool. */
export async function withPortalSqlV1<T>(
  binding: Pick<Hyperdrive, 'connectionString'>,
  operation: (sql: StudentPortalPostgresSqlV1) => Promise<T>,
  createClient: PortalSqlClientFactoryV1 = createPortalSqlClientV1,
  observeLifecycle?: PortalSqlLifecycleObserverV1,
): Promise<T> {
  let sql: PortalSqlClientV1 | undefined;
  let opened: Awaited<ReturnType<typeof openPortalSqlClientV1>> | undefined;
  let applicationStarted = 0;
  try {
    opened = await openPortalSqlClientV1(binding.connectionString, createClient);
    sql = opened.sql;
    applicationStarted = Date.now();
    return await operation(sql);
  } catch {
    // Driver errors may include connection details or SQL values. Never export them.
    throw new Error('student-portal-database-unavailable');
  } finally {
    if (opened && applicationStarted > 0) {
      try {
        observeLifecycle?.({
          openRoleMs: opened.openRoleMs,
          applicationMs: Math.max(0, Date.now() - applicationStarted),
          attempts: opened.attempts,
        });
      } catch {
        // Observability is outside the database outcome.
      }
    }
    await closePortalSqlClientV1(sql);
  }
}

/** Existing persistence port delegates to the same connection/role/timeout lifecycle. */
export function withPortalPersistenceV1<T>(
  binding: Pick<Hyperdrive, 'connectionString'>,
  operation: (persistence: PersistencePortV1) => Promise<T>,
): Promise<T> {
  return withPortalSqlV1(binding, (sql) =>
    operation(createStudentPortalPostgresPersistenceV1(sql)),
  );
}
