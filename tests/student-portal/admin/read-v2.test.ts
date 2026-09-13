import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll } from 'vitest';
import type { StudentPortalPostgresSqlV1 } from '../../../server/student-portal/persistence/postgres-persistence-v1';
import { installAdminReadFixtureV2 } from './read-fixture-v2';
import { adminReadCasesV2 } from './read-cases-v2';

let pg: PGlite;
let sql: StudentPortalPostgresSqlV1;
let calls = 0;
beforeAll(async () => {
  pg = new PGlite();
  const run = async <R extends Record<string, unknown>>(
    db: Pick<PGlite, 'query'>,
    query: string,
    parameters: readonly unknown[] = [],
  ) => {
    calls++;
    return (await db.query<R>(query, [...parameters])).rows;
  };
  sql = {
    unsafe: (query, parameters) => run(pg, query, parameters),
    begin: (callback) =>
      pg.transaction((tx) =>
        callback({ unsafe: (query, parameters) => run(tx, query, parameters) }),
      ),
  };
  await installAdminReadFixtureV2(pg, sql);
}, 30_000);
afterAll(async () => {
  await pg?.close();
});
adminReadCasesV2(() => ({
  sql,
  admin: sql,
  gradebook: sql,
  calls: () => calls,
  resetCalls: () => {
    calls = 0;
  },
}));
