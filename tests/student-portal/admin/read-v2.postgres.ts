import postgres from 'postgres';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { adminReadCasesV2 } from './read-cases-v2';
import {
  installAdminReadFixtureV2,
  readContextV2,
  READ_CLASS_V2,
  READ_TENANT_V2,
} from './read-fixture-v2';
import type { StudentPortalPostgresSqlV1 } from '../../../server/student-portal/persistence/postgres-persistence-v1';
import { portalAdminRpcV1 } from '../../../server/student-portal/composition/admin-v1';

// Never use a production URL or an existing database for the destructive fixture.
const target = new URL(process.env.PORTAL_TEST_DATABASE_URL ?? 'http://invalid');
if (
  target.protocol !== 'postgres:' ||
  target.hostname !== '127.0.0.1' ||
  target.pathname !== '/portal705_test' ||
  target.search ||
  target.hash
)
  throw new Error('The admin-read suite requires the disposable local portal705_test cluster.');
const databaseName = 'portal746_read_' + crypto.randomUUID().replaceAll('-', '').slice(0, 12);
if (!/^portal746_read_[a-f0-9]{12}$/u.test(databaseName))
  throw new Error('Invalid disposable database name.');
const cluster = postgres(target.toString(), { max: 1, onnotice: () => undefined });
const clients: ReturnType<typeof postgres>[] = [];
let created = false;
let admin: StudentPortalPostgresSqlV1;
let portal: StudentPortalPostgresSqlV1;
let gradebook: StudentPortalPostgresSqlV1;
let calls = 0;
function connection(role?: string) {
  const url = new URL(target);
  url.pathname = '/' + databaseName;
  if (role) url.username = role;
  return url.toString();
}
function client(role?: string) {
  const sql = postgres(connection(role), { max: 1, onnotice: () => undefined });
  clients.push(sql);
  return sql;
}
function measured(sql: StudentPortalPostgresSqlV1): StudentPortalPostgresSqlV1 {
  return {
    unsafe: async (query, values) => {
      calls++;
      return sql.unsafe(query, values);
    },
    begin: (run) =>
      sql.begin((tx) =>
        run({
          unsafe: async (query, values) => {
            calls++;
            return tx.unsafe(query, values);
          },
        }),
      ),
  };
}
beforeAll(async () => {
  await cluster.unsafe('CREATE DATABASE ' + databaseName);
  created = true;
  const owner = client();
  admin = owner as unknown as StudentPortalPostgresSqlV1;
  await installAdminReadFixtureV2(
    { exec: (query) => owner.unsafe(query, [], { prepare: false }) },
    admin,
  );
  portal = measured(client('student_portal_app') as unknown as StudentPortalPostgresSqlV1);
  gradebook = client('gradebook_app') as unknown as StudentPortalPostgresSqlV1;
});
afterAll(async () => {
  for (const sql of clients) await sql.end({ timeout: 2 });
  if (created) await cluster.unsafe('DROP DATABASE ' + databaseName);
  await cluster.end({ timeout: 2 });
});
adminReadCasesV2(() => ({
  sql: portal,
  admin,
  gradebook,
  calls: () => calls,
  resetCalls: () => {
    calls = 0;
  },
}));
it('uses the real private RPC composition, restricted role and read-only transaction ordering', async () => {
  const keys = JSON.stringify({ '1': Buffer.alloc(32, 7).toString('base64') });
  const result = await portalAdminRpcV1(
    {
      PORTAL_ENVIRONMENT: 'production',
      PORTAL_ORIGIN: 'https://aluno.escolaieda.com',
      PORTAL_ADMIN_TENANT_ID: READ_TENANT_V2,
      PORTAL_SERVING_ENABLED: 'true',
      PORTAL_DB: { connectionString: connection('student_portal_app') },
      QR_HMAC_KEYS: keys,
      PASSWORD_PEPPER: keys,
    },
    'query',
    readContextV2(),
    { contractVersion: 2, operation: 'accounts-read', scope: READ_CLASS_V2, page: { limit: 100 } },
  );
  expect(result).toMatchObject({ contractVersion: 2, state: 'accounts-read' });
  await expect(portal.unsafe('SELECT * FROM gradebook.aluno')).rejects.toThrow();
});
