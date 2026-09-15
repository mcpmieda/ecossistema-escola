import postgres from 'postgres';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { authTransactionV1 } from '../../../server/student-portal/auth/transaction-v1';
import { PublicationServiceV1 } from '../../../server/student-portal/publication/publication-service-v1';
import { currentRevisionV1 } from '../../../server/student-portal/publication/state-v1';
import type { StudentPortalPostgresSqlV1 } from '../../../server/student-portal/persistence/postgres-persistence-v1';
import { installAdminReadFixtureV2, readApiV2, readContextV2, READ_ACTOR_V2, READ_CLASS_V2 } from './read-fixture-v2';

// Destructive synthetic fixture: reject every production or non-local target before opening SQL.
const target = new URL(process.env.PORTAL_TEST_DATABASE_URL ?? 'http://invalid');
if (target.protocol !== 'postgres:' || target.hostname !== '127.0.0.1'
  || target.pathname !== '/portal705_test' || target.search || target.hash)
  throw new Error('Publication reliability requires the disposable local portal705_test cluster.');
const databaseName = 'portal801_publication_' + crypto.randomUUID().replaceAll('-', '').slice(0, 12);
if (!/^portal801_publication_[a-f0-9]{12}$/u.test(databaseName)) throw new Error('Invalid disposable database name.');
const cluster = postgres(target.toString(), { max: 1, onnotice: () => undefined });
const clients: ReturnType<typeof postgres>[] = [];
let created = false;
let portal: StudentPortalPostgresSqlV1;
let peer: StudentPortalPostgresSqlV1;
const queries: { query: string; values: readonly unknown[] }[] = [];
function client(role?: string) {
  const url = new URL(target);
  url.pathname = '/' + databaseName;
  if (role) url.username = role;
  const sql = postgres(url.toString(), { max: 1, onnotice: () => undefined,
    connection: { lock_timeout: 250, statement_timeout: 5000 } });
  clients.push(sql);
  return sql;
}
function measured(sql: StudentPortalPostgresSqlV1): StudentPortalPostgresSqlV1 {
  return {
    unsafe: async (query, values) => {
      queries.push({ query, values: values ?? [] });
      return sql.unsafe(query, values);
    },
    begin: (run) => sql.begin((tx) => run({
      unsafe: async (query, values) => {
        queries.push({ query, values: values ?? [] });
        return tx.unsafe(query, values);
      },
    })),
  };
}
beforeAll(async () => {
  await cluster.unsafe('CREATE DATABASE ' + databaseName);
  created = true;
  const owner = client();
  await installAdminReadFixtureV2({ exec: (query) => owner.unsafe(query, [], { prepare: false }) },
    owner as unknown as StudentPortalPostgresSqlV1);
  portal = measured(client('student_portal_app') as unknown as StudentPortalPostgresSqlV1);
  peer = client('student_portal_app') as unknown as StudentPortalPostgresSqlV1;
});
afterAll(async () => {
  for (const sql of clients) await sql.end({ timeout: 2 });
  if (created) await cluster.unsafe('DROP DATABASE ' + databaseName);
  await cluster.end({ timeout: 2 });
});

async function withYearHeld(mode: 'shared' | 'exclusive', run: () => Promise<void>) {
  let release!: () => void;
  let entered!: () => void;
  let failed!: (error: unknown) => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const acquired = new Promise<void>((resolve, reject) => { entered = resolve; failed = reject; });
  const holding = authTransactionV1(peer, async () => { entered(); await gate; }, mode);
  void holding.catch(failed);
  try { await acquired; await run(); }
  finally { release(); await holding; }
}

it.each(['publication', 'settings'] as const)('allows the real admin %s query while another account holds a shared year', async (operation) => {
  await withYearHeld('shared', async () => {
    const result = await readApiV2(portal).query(readContextV2(), {
      contractVersion: 1, operation, scope: READ_CLASS_V2, page: { limit: 50 },
    });
    expect(result.state).toBe(operation);
  });
});
it('keeps writer/reset barriers effective for publication readers', async () => {
  await withYearHeld('exclusive', async () => {
    const result = await readApiV2(portal).query(readContextV2(), {
      contractVersion: 1, operation: 'publication', scope: READ_CLASS_V2, page: { limit: 50 },
    });
    expect(result.state).toBe('unavailable');
  });
});
it('keeps administrative publication exclusive, then locks a whole class in one ordered query', async () => {
  const service = new PublicationServiceV1(portal);
  const before = await service.read(READ_CLASS_V2);
  expect(before.count).toBe(105);
  const command = {
    contractVersion: 1, operation: 'publish', scope: READ_CLASS_V2, period: 'T1',
    expectedVersion: before.version, targetDataVersion: await currentRevisionV1(portal),
    idempotencyKey: crypto.randomUUID(),
  };
  await withYearHeld('shared', async () => {
    await expect(service.command(READ_ACTOR_V2, command)).rejects.toMatchObject({ code: '55P03' });
  });
  queries.length = 0;
  const committed = await service.command(READ_ACTOR_V2, command);
  const accountLocks = queries.filter(({ query }) => /SELECT id FROM student_portal\.account[\s\S]*FOR UPDATE/u.test(query));
  expect(accountLocks).toHaveLength(1);
  expect(accountLocks[0]!.query).toMatch(/ORDER BY id FOR UPDATE/u);
  expect(JSON.parse(String(accountLocks[0]!.values[0]))).toHaveLength(105);
  expect(Number((await portal.unsafe('SELECT count(*) AS count FROM student_portal.publication_job'))[0]!.count)).toBe(105);
  queries.length = 0;
  expect(await service.command(READ_ACTOR_V2, command)).toEqual(committed);
  expect(queries.some(({ query }) => /SELECT id FROM student_portal\.account[\s\S]*FOR UPDATE/u.test(query))).toBe(false);
  expect(Number((await portal.unsafe('SELECT count(*) AS count FROM student_portal.publication_job'))[0]!.count)).toBe(105);
  await expect(service.command(READ_ACTOR_V2, { ...command, period: 'T2' }))
    .rejects.toThrow('student-portal-publication-idempotency-conflict');
});
