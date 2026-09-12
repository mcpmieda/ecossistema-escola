import postgres from 'postgres';
import type { PersistencePortV1 } from '../../../shared/student-portal-contracts/ports-v1';
import {
  createStudentPortalPostgresPersistenceV1,
  type StudentPortalPostgresSqlV1,
} from '../persistence/postgres-persistence-v1';

/** One connection per invocation; Hyperdrive owns the shared origin pool. */
export async function withPortalPersistenceV1<T>(
  binding: Pick<Hyperdrive, 'connectionString'>,
  operation: (persistence: PersistencePortV1) => Promise<T>,
): Promise<T> {
  let sql: ReturnType<typeof postgres> | undefined;
  try {
    sql = postgres(binding.connectionString, {
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
    });
    const identity = await sql`SELECT current_user AS role`;
    if (identity[0]?.role !== 'student_portal_app') throw new Error('wrong-role');
    // The native driver contract is exercised by the PostgreSQL CI suite.
    const persistence = createStudentPortalPostgresPersistenceV1(sql as unknown as StudentPortalPostgresSqlV1);
    return await operation(persistence);
  } catch {
    // Driver errors may include connection details or SQL values. Never export them.
    throw new Error('student-portal-database-unavailable');
  } finally {
    await sql?.end({ timeout: 1 }).catch(() => undefined);
  }
}
