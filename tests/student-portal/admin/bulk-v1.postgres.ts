import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { BulkAdminV1 } from '../../../server/student-portal/admin/bulk-v1';
import { QrServiceV1 } from '../../../server/student-portal/auth/qr-service-v1';
import { PortalCryptoV1 } from '../../../server/student-portal/crypto/crypto-v1';
import type {
  StudentPortalPostgresQueryV1,
  StudentPortalPostgresSqlV1,
} from '../../../server/student-portal/persistence/postgres-persistence-v1';
import { installResetSchemaFixtureV1 } from '../year-reset/schema-fixture';
import { ACADEMIC_FIXTURE_SQL_V1 } from '../academic/academic-fixture-v1';

const target = new URL(process.env.PORTAL_TEST_DATABASE_URL ?? 'http://invalid');
if (
  target.protocol !== 'postgres:' ||
  target.hostname !== '127.0.0.1' ||
  target.pathname !== '/portal705_test' ||
  target.search ||
  target.hash
)
  throw new Error('Bulk regressions require disposable local PostgreSQL.');
const name = 'portal1102bulk_' + crypto.randomUUID().replaceAll('-', '').slice(0, 12);
const cluster = postgres(target.toString(), { max: 1, onnotice: () => undefined });
const clients: ReturnType<typeof postgres>[] = [];
let created = false;
let owner: ReturnType<typeof postgres>;
let peer: ReturnType<typeof postgres>;
let app: ReturnType<typeof postgres>;
let sql: StudentPortalPostgresSqlV1;
let bulk: BulkAdminV1;
let timeOffset = 0;
const context = {
  actorId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  requestId: '33333333-3333-4333-8333-333333333333',
  authenticatedAt: new Date().toISOString(),
  capability: 'platform.settings.write' as const,
};
const query = {
  contractVersion: 1,
  operation: 'bulk-preview',
  action: 'block',
  scope: { kind: 'school', academicYear: 2026 },
  page: { limit: 100 },
} as const;
const cryptography = new PortalCryptoV1(
  new Map([[1, new Uint8Array(32).fill(7)]]),
  new Map([[1, new Uint8Array(32).fill(8)]]),
);
const secret = 'synthetic-native-bulk-key-'.repeat(4);
function client(role?: string, max = 1) {
  const url = new URL(target);
  url.pathname = '/' + name;
  if (role) url.username = role;
  const connection = postgres(url.toString(), {
    max,
    onnotice: () => undefined,
    connection: { lock_timeout: 5000, statement_timeout: 10000 },
  });
  clients.push(connection);
  return connection;
}
function wrap(connection: ReturnType<typeof postgres>): StudentPortalPostgresSqlV1 {
  const run = async <R extends Record<string, unknown>>(
    tx: StudentPortalPostgresQueryV1,
    statement: string,
    parameters?: readonly unknown[],
  ) => {
    const rows = await tx.unsafe<R>(statement, parameters);
    return timeOffset && statement === 'SELECT statement_timestamp() AS now'
      ? ([{ now: new Date(Date.now() + timeOffset) }] as unknown as R[])
      : rows;
  };
  const base = connection as unknown as StudentPortalPostgresSqlV1;
  return {
    unsafe: (statement, parameters) => run(base, statement, parameters),
    begin: (operation) =>
      base.begin((tx) =>
        operation({ unsafe: (statement, parameters) => run(tx, statement, parameters) }),
      ),
  };
}
async function input(action: 'block' | 'qr-regenerate' = 'block') {
  const preview = await bulk.preview(context, { ...query, action });
  const item = preview.items[0]!;
  return {
    contractVersion: 1,
    operation: 'bulk-execute',
    action,
    proof: preview.proof,
    accountId: item.accountId,
    expectedVersion: item.version,
    idempotencyKey: crypto.randomUUID(),
    confirmed: true,
  };
}
beforeAll(async () => {
  await cluster.unsafe('CREATE DATABASE ' + name);
  created = true;
  owner = client();
  peer = client();
  await owner.unsafe(
    readFileSync('migrations/gradebook-simplified/0001_current_schema.sql', 'utf8'),
    [],
    { prepare: false },
  );
  await installResetSchemaFixtureV1({
    exec: (statement) => owner.unsafe(statement, [], { prepare: false }),
  });
  await owner.unsafe(ACADEMIC_FIXTURE_SQL_V1, [], { prepare: false });
  app = client('student_portal_app', 3);
  sql = wrap(app);
  bulk = new BulkAdminV1(sql, secret, new QrServiceV1(sql, cryptography, 1));
}, 30_000);
beforeEach(async () => {
  timeOffset = 0;
  await owner.unsafe(
    `TRUNCATE student_portal.audit_event,student_portal.operation_receipt,student_portal.qr_credential;
    UPDATE student_portal.account SET gradebook_student_id=l.gradebook_student_id,closed_at=NULL,eligibility='eligible',blocked=false,version=0,auth_state='active'
      FROM student_portal.link_closure l WHERE l.account_id=student_portal.account.id;
    DELETE FROM student_portal.link_closure;
    UPDATE student_portal.account SET blocked=false,version=0,auth_state='active';
    UPDATE gradebook.vinculo SET turma_id=910001;`,
    [],
    { prepare: false },
  );
});
afterAll(async () => {
  for (const connection of clients) await connection.end({ timeout: 2 });
  if (created) await cluster.unsafe('DROP DATABASE ' + name);
  await cluster.end({ timeout: 2 });
});

it('checks CAS after a transfer under the native academic lock', async () => {
  const command = await input();
  let release!: () => void;
  let locked!: () => void;
  const ready = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const transfer = peer.begin(async (tx) => {
    await tx.unsafe('SELECT pg_advisory_xact_lock(613,2026)');
    await tx.unsafe(
      'UPDATE gradebook.vinculo SET turma_id=910002 WHERE aluno_id=(SELECT gradebook_student_id FROM student_portal.account WHERE id=$1)',
      [command.accountId],
    );
    locked();
    await hold;
  });
  await ready;
  const execution = bulk.execute(context, command);
  release();
  await transfer;
  await expect(execution).rejects.toThrow('scope-conflict');
  expect(
    (
      await owner.unsafe(
        'SELECT blocked,version::integer FROM student_portal.account WHERE id=$1',
        [command.accountId],
      )
    )[0],
  ).toEqual({ blocked: false, version: 0 });
});

it('serializes concurrent exact retries into one mutation and one successful audit', async () => {
  const command = await input();
  const [first, retry] = await Promise.all([
    bulk.execute(context, command),
    bulk.execute(context, command),
  ]);
  expect(first).toEqual(retry);
  expect(
    (
      await owner.unsafe(
        "SELECT count(*)::integer AS count FROM student_portal.audit_event WHERE kind='blocked' AND result='success'",
      )
    )[0]!.count,
  ).toBe(1);
});

it('allows only one distinct concurrent intention for the preview CAS', async () => {
  const first = await input();
  const results = await Promise.allSettled([
    bulk.execute(context, first),
    bulk.execute(context, { ...first, idempotencyKey: crypto.randomUUID() }),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  expect(
    (
      await owner.unsafe('SELECT version::integer FROM student_portal.account WHERE id=$1', [
        first.accountId,
      ])
    )[0]!.version,
  ).toBe(1);
});

it('recovers a lost response after proof expiry and refuses replay after 25 hours without another reset', async () => {
  const command = await input('qr-regenerate');
  const first = await bulk.execute(context, command);
  timeOffset = 6 * 60_000;
  expect(await bulk.execute(context, command)).toEqual(first);
  timeOffset = 25 * 3_600_000;
  await expect(bulk.execute(context, command)).rejects.toThrow('preview-conflict');
  expect(
    (
      await owner.unsafe(
        'SELECT count(*)::integer AS count FROM student_portal.qr_credential WHERE account_id=$1',
        [command.accountId],
      )
    )[0]!.count,
  ).toBe(1);
});

it('returns only the original receipt after account closure, never a credential or new mutation', async () => {
  const command = await input('qr-regenerate');
  const first = await bulk.execute(context, command);
  // Preserve the old link in the existing closure table, as the production lifecycle does.
  await owner.unsafe(
    `INSERT INTO student_portal.link_closure(account_id,academic_year,gradebook_student_id,closed_at,version)
    SELECT id,academic_year,gradebook_student_id,statement_timestamp(),version+1 FROM student_portal.account WHERE id=$1`,
    [command.accountId],
  );
  await owner.unsafe(
    "UPDATE student_portal.account SET gradebook_student_id=NULL,closed_at=statement_timestamp(),eligibility='unlinked',version=version+1 WHERE id=$1",
    [command.accountId],
  );
  timeOffset = 6 * 60_000;
  expect(await bulk.execute(context, command)).toEqual(first);
  expect(Object.keys(first)).not.toContain('qr');
  await expect(
    bulk.execute(context, { ...command, idempotencyKey: crypto.randomUUID() }),
  ).rejects.toThrow('forbidden');
});
