import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ScopedPublicationServiceV2 } from '../../../server/student-portal/publication/scoped-publication-service-v2';
import { SelfProjectionReaderV1 } from '../../../server/student-portal/publication/self-projection-reader-v1';
import { PublicationServiceV1 } from '../../../server/student-portal/publication/publication-service-v1';
import { PublicationJobsV1 } from '../../../server/student-portal/jobs/publication-jobs-v1';
import { AcademicStudentReaderPostgresV1 } from '../../../server/student-portal/academic/academic-reader-v1';
import { currentRevisionV1 } from '../../../server/student-portal/publication/state-v1';
import { scopedPublicationEnabledV2 } from '../../../server/student-portal/publication/scoped-source-v2';
import { PolicyServiceV1 } from '../../../server/student-portal/policies/policy-service-v1';
import { initialPolicyDefaultsV1 } from '../../../server/student-portal/policies/defaults-v1';
import { withAuditSqlV1 } from '../../../server/student-portal/observability/audit-context-v1';
import { PortalAdminApiV1 } from '../../../server/student-portal/admin/api-v1';
import { PortalCryptoV1 } from '../../../server/student-portal/crypto/crypto-v1';
import { accountTransactionV1, accessContextV1 } from '../../../server/student-portal/auth/transaction-v1';
import { createSessionV1 } from '../../../server/student-portal/auth/session-service-v1';
import { servePortalSelfV1 } from '../../../server/student-portal/composition/self-v1';
import { portalAdminRpcV1 } from '../../../server/student-portal/composition/admin-v1';
import { SESSION_COOKIE_V1 } from '../../../shared/student-portal-contracts/auth-v1';
import { selfResponseV1 } from '../../../shared/student-portal-contracts/self-v1';
import type { StudentPortalPostgresSqlV1 } from '../../../server/student-portal/persistence/postgres-persistence-v1';
import type { ScopeV1 } from '../../../shared/student-portal-contracts/core-v1';
import { installAdminReadFixtureV2, readAccountIdV2, readContextV2, READ_ACTOR_V2, READ_TENANT_V2, READ_CLASS_V2, READ_SCHOOL_V2 } from './read-fixture-v2';

// Destructive synthetic fixture: validate the disposable database before opening any connection.
const target = new URL(process.env.PORTAL_TEST_DATABASE_URL ?? 'http://invalid');
if (target.protocol !== 'postgres:' || target.hostname !== '127.0.0.1' || target.pathname !== '/portal705_test' || target.search || target.hash)
  throw new Error('Atomic publication requires the disposable local portal705_test cluster.');
const databaseName = 'portal803_atomic_' + crypto.randomUUID().replaceAll('-', '').slice(0, 12);
if (!/^portal803_atomic_[a-f0-9]{12}$/u.test(databaseName)) throw new Error('Invalid disposable database name.');
const cluster = postgres(target.toString(), { max: 1, onnotice: () => undefined });
const clients: ReturnType<typeof postgres>[] = [];
let created = false;
let owner: ReturnType<typeof postgres>;
let admin: StudentPortalPostgresSqlV1;
let portal: StudentPortalPostgresSqlV1;
let peer: StudentPortalPostgresSqlV1;
let disabledAtInstall = false;
let failReceipt = false;
const queries: string[] = [];
const own = readAccountIdV2(1);
const ownScope = { kind: 'account', academicYear: 2026, accountId: own } as const;
const cryptography = new PortalCryptoV1(new Map([[1, new Uint8Array(32).fill(7)]]), new Map([[1, new Uint8Array(32).fill(8)]]));
function connection(role?: string) {
  const url = new URL(target);
  url.pathname = '/' + databaseName;
  if (role) url.username = role;
  return url.toString();
}
function client(role?: string) {
  const sql = postgres(connection(role), { max: 1, onnotice: () => undefined,
    connection: { lock_timeout: 250, statement_timeout: 5000 } });
  clients.push(sql);
  return sql;
}
function measured(sql: StudentPortalPostgresSqlV1): StudentPortalPostgresSqlV1 {
  const query = <R extends Record<string, unknown>>(tx: Pick<StudentPortalPostgresSqlV1, 'unsafe'>, text: string, values?: readonly unknown[]) => {
    queries.push(text);
    if (failReceipt && text.includes('INSERT INTO student_portal.operation_receipt')) throw new Error('synthetic receipt interruption');
    return tx.unsafe<R>(text, values);
  };
  return { unsafe: (text, values) => query(sql, text, values), begin: (run) => sql.begin((tx) => run({ unsafe: (text, values) => query(tx, text, values) })) };
}
const calendar = {
  ...initialPolicyDefaultsV1().calendar, enrollmentStartsAt: '2026-01-01T00:00:00Z', yearStartsAt: '2026-01-02T00:00:00Z',
  t1EndsAt: '2026-04-01T00:00:00Z', t2StartsAt: '2026-04-02T00:00:00Z', t2EndsAt: '2026-07-01T00:00:00Z',
  t3StartsAt: '2026-07-02T00:00:00Z', t3EndsAt: '2026-11-01T00:00:00Z', recoveriesStartAt: '2026-11-02T00:00:00Z',
  yearEndsAt: '2026-12-31T23:59:59Z',
};
async function policy(value: Record<string, unknown>) {
  const service = new PolicyServiceV1(portal);
  const current = await service.read(READ_SCHOOL_V2);
  return service.mutate(READ_ACTOR_V2, { contractVersion: 1, operation: 'settings-set', scope: READ_SCHOOL_V2,
    expectedVersion: current.version, idempotencyKey: crypto.randomUUID(), acknowledgeImmediateEffect: true, value });
}
async function preparedChange(value: number, bumps = 1) {
  await admin.begin(async (tx) => {
    await tx.unsafe('SELECT pg_advisory_xact_lock(613,2026)');
    await tx.unsafe('UPDATE gradebook.fechamento SET am1_fonte=$1 WHERE oferta_id=803001 AND aluno_id=746001', [value]);
    for (let index = 0; index < bumps; index++)
      await tx.unsafe('UPDATE student_portal.academic_revision SET academic_counter=academic_counter+1 WHERE academic_year=2026');
  });
  return currentRevisionV1(portal);
}
async function command(scope: ScopeV1 = READ_SCHOOL_V2, operation: 'publish' | 'publish-update' | 'unpublish' = 'publish', period = 'T1') {
  const state = await new ScopedPublicationServiceV2(portal).read(scope);
  return { contractVersion: 1, operation, scope, period, expectedVersion: state.version, idempotencyKey: crypto.randomUUID(),
    ...(operation === 'unpublish' ? { confirmed: true } : { targetDataVersion: state.dataVersion }) };
}
async function release(scope: ScopeV1 = READ_SCHOOL_V2, operation: 'publish' | 'publish-update' | 'unpublish' = 'publish', period = 'T1') {
  return new ScopedPublicationServiceV2(portal).command(READ_ACTOR_V2, await command(scope, operation, period));
}
const self = (account = own) => new SelfProjectionReaderV1(portal, true).read(account, crypto.randomUUID());
const score = async () => (await self())?.subjects[0]?.periods.find((item) => item.period === 'T1')?.final;
const count = async (table: string) => Number((await owner.unsafe('SELECT count(*) AS n FROM student_portal.' + table))[0]!.n);
async function legacyRelease() {
  await owner.unsafe('UPDATE student_portal.publication_control_v2 SET enabled=false');
  const service = new PublicationServiceV1(portal);
  const state = await service.read(ownScope);
  await service.command(READ_ACTOR_V2, { contractVersion: 1, operation: 'publish', scope: ownScope, period: 'T1',
    expectedVersion: state.version, targetDataVersion: await currentRevisionV1(portal), idempotencyKey: crypto.randomUUID() });
}

beforeAll(async () => {
  await cluster.unsafe('CREATE DATABASE ' + databaseName);
  created = true;
  owner = client();
  admin = owner as unknown as StudentPortalPostgresSqlV1;
  await installAdminReadFixtureV2({ exec: (sql) => owner.unsafe(sql, [], { prepare: false }) }, admin);
  await owner.unsafe(`INSERT INTO gradebook.professor(id,ano,nome) VALUES(803001,2026,'SYNTHETIC PRIVATE TEACHER');
    INSERT INTO gradebook.disciplina(id,ano,nome) VALUES(803001,2026,'MATEMATICA');
    INSERT INTO gradebook.oferta(id,ano,turma_id,professor_id,disciplina_id) VALUES(803001,2026,746001,803001,803001);
    INSERT INTO gradebook.instrumento(id,oferta_id,trimestre,slot,maximo,descricao)
      SELECT 803000+(t-1)*20+s,803001,t,s,CASE WHEN s=11 THEN CASE WHEN t=3 THEN 22000 ELSE 16500 END
        ELSE CASE WHEN t=3 THEN 9000 ELSE 6750 END END,'SYNTHETIC ASSESSMENT '||s
      FROM generate_series(1,3) t CROSS JOIN (VALUES(1),(2),(11)) slots(s);
    INSERT INTO gradebook.nota(instrumento_id,aluno_id,valor) SELECT 803001,746000+n,CASE WHEN n=1 THEN 0 ELSE 1000+n END FROM generate_series(1,106) n;
    INSERT INTO gradebook.fechamento(oferta_id,aluno_id,am1_fonte) SELECT 803001,746000+n,8000+n FROM generate_series(1,106) n;
    UPDATE student_portal.account SET auth_state='active' WHERE closed_at IS NULL;
    SELECT * FROM student_portal.synchronize_profiles_v1(false);`, [], { prepare: false });
  for (const migration of ['0008_atomic_publication_v2.sql', '0009_publication_cutover_guard_v2.sql'])
    await owner.unsafe(readFileSync('migrations/student-portal/' + migration, 'utf8'), [], { prepare: false });
  portal = measured(client('student_portal_app') as unknown as StudentPortalPostgresSqlV1);
  peer = client('student_portal_app') as unknown as StudentPortalPostgresSqlV1;
  disabledAtInstall = !await scopedPublicationEnabledV2(portal);
}, 30_000);
beforeEach(async () => {
  failReceipt = false;
  await owner.unsafe(`UPDATE student_portal.publication_control_v2 SET enabled=false;
    DELETE FROM student_portal.publication_release_v2;
    DELETE FROM student_portal.publication_auto_approval_v2;
    DELETE FROM student_portal.publication_job;
    DELETE FROM student_portal.publication;
    DELETE FROM student_portal.published_projection;
    DELETE FROM student_portal.operation_receipt;
    DELETE FROM student_portal.audit_event;
    DELETE FROM student_portal.session;
    DELETE FROM student_portal.setting WHERE scope_kind<>'school';
    UPDATE student_portal.setting SET value_json='false'::jsonb WHERE field_key='autoUpdate';
    UPDATE gradebook.vinculo SET turma_id=746001,situacao=NULL WHERE aluno_id=746001;
    UPDATE student_portal.account SET blocked=false WHERE id='74600000-0000-4000-8000-000000000001';
    SELECT * FROM student_portal.synchronize_profiles_v1(false);`, [], { prepare: false });
  await preparedChange(8001);
  await policy({ accessEnabled: true, showPartials: true, allowedPeriods: ['T1', 'T2'], autoUpdate: false, calendar });
  await owner.unsafe('SELECT student_portal.activate_scoped_publication_v2()');
  queries.length = 0;
});
afterAll(async () => {
  for (const sql of clients) await sql.end({ timeout: 2 });
  if (created) await cluster.unsafe('DROP DATABASE ' + databaseName);
  await cluster.end({ timeout: 2 });
});

it('installs closed and prepares students independently of account creation', async () => {
  expect(disabledAtInstall).toBe(true);
  const prepared = await owner.unsafe('SELECT count(DISTINCT student_id) AS n FROM student_portal.publication_source_v2');
  expect(Number(prepared[0]!.n)).toBe(106);
  expect((await new ScopedPublicationServiceV2(portal).read(READ_SCHOOL_V2)).count).toBe(106);
  expect(await count('publication_release_v2')).toBe(0);
  expect((await self())?.state).toBe('no-publication');
});
it('publishes in one scoped row and serves individual grades immediately, without running cron', async () => {
  const input = await command();
  queries.length = 0;
  const start = performance.now();
  await new ScopedPublicationServiceV2(portal).command(READ_ACTOR_V2, input);
  const elapsed = performance.now() - start;
  const calls = queries.length;
  expect(calls).toBeLessThanOrEqual(10);
  expect(queries.some((sql) => sql.includes('pg_advisory_xact_lock'))).toBe(false);
  expect(queries.some((sql) => /student_portal\.account[\s\S]*FOR UPDATE/u.test(sql))).toBe(false);
  expect(await count('publication_release_v2')).toBe(1);
  expect(await count('publication_job')).toBe(0);
  expect(await score()).toMatchObject({ kind: 'score', value: 8.001 });
  expect((await self())?.subjects[0]?.periods[0]?.partials?.[0]?.mark).toMatchObject({ kind: 'score', value: 0 });
  expect((await self(readAccountIdV2(2)))?.subjects[0]?.periods[0]?.final).toMatchObject({ value: 8.002 });
  expect(JSON.stringify(await self())).not.toContain('PRIVATE TEACHER');
  console.log('P803_SYNTHETIC_RELEASE', JSON.stringify({ students: 106, queries: calls, elapsedMs: elapsed, jobs: 0 }));
});
it('replays identical intent after a lost reply without another release or audit record', async () => {
  const service = new ScopedPublicationServiceV2(portal);
  const input = await command();
  const first = await service.command(READ_ACTOR_V2, input);
  expect(await service.command(READ_ACTOR_V2, input)).toEqual(first);
  expect(await count('publication_release_v2')).toBe(1);
  const audits = await owner.unsafe("SELECT count(*) AS n FROM student_portal.audit_event WHERE kind='published'");
  expect(Number(audits[0]!.n)).toBe(1);
  await expect(service.command(READ_ACTOR_V2, { ...input, period: 'T2' })).rejects.toThrow('idempotency-conflict');
});
it('rolls the release, control version and audit back if receipt persistence fails', async () => {
  const service = new ScopedPublicationServiceV2(portal);
  const input = await command();
  failReceipt = true;
  await expect(service.command(READ_ACTOR_V2, input)).rejects.toThrow('synthetic receipt interruption');
  failReceipt = false;
  expect(await count('publication_release_v2')).toBe(0);
  expect((await service.read(READ_SCHOOL_V2)).version).toBe(input.expectedVersion);
  expect((await self())?.state).toBe('no-publication');
  await service.command(READ_ACTOR_V2, input);
  expect((await self())?.state).toBe('ready');
});
it('keeps the exact approved edition with auto-update OFF and publishes the new edition explicitly', async () => {
  await release();
  await preparedChange(9000);
  expect(await score()).toMatchObject({ value: 8.001 });
  expect((await new ScopedPublicationServiceV2(portal).read(ownScope)).items[0]?.state).toBe('update-pending');
  await release(READ_SCHOOL_V2, 'publish-update');
  expect(await score()).toMatchObject({ value: 9 });
});
it('auto-updates only approved periods and freezes the last automatic edition when turned OFF', async () => {
  await release();
  await policy({ autoUpdate: true });
  await preparedChange(10000);
  expect(await score()).toMatchObject({ value: 10 });
  expect((await self())?.subjects[0]?.periods.map((item) => item.period)).toEqual(['T1']);
  await policy({ autoUpdate: false });
  await preparedChange(11000);
  expect(await score()).toMatchObject({ value: 10 });
});
it('withdraws a scope immediately and honors a later deliberate scoped release', async () => {
  await release();
  await release(ownScope, 'unpublish');
  expect((await self())?.state).toBe('no-publication');
  expect((await self(readAccountIdV2(2)))?.state).toBe('ready');
  await release(READ_CLASS_V2);
  expect((await self())?.state).toBe('ready');
  await release(READ_SCHOOL_V2, 'unpublish');
  expect((await self())?.state).toBe('no-publication');
  expect((await self(readAccountIdV2(2)))?.state).toBe('no-publication');
});
it('preserves database and source atomicity on rollback and captures only the final revision of one commit', async () => {
  const before = await currentRevisionV1(portal);
  const oldCount = await count('publication_source_v2');
  await expect(admin.begin(async (tx) => {
    await tx.unsafe('UPDATE gradebook.fechamento SET am1_fonte=12000 WHERE oferta_id=803001 AND aluno_id=746001');
    await tx.unsafe('UPDATE student_portal.academic_revision SET academic_counter=academic_counter+1 WHERE academic_year=2026');
    throw new Error('synthetic transaction abort');
  })).rejects.toThrow('synthetic transaction abort');
  expect(await currentRevisionV1(portal)).toBe(before);
  expect(await count('publication_source_v2')).toBe(oldCount);
  const next = await preparedChange(13000, 3);
  expect(await count('publication_source_v2')).toBe(oldCount + 1);
  const head = await owner.unsafe("SELECT generation||':'||revision::text AS revision FROM student_portal.publication_source_head_v2");
  expect(head[0]!.revision).toBe(next);
  await preparedChange(13000);
  expect(await count('publication_source_v2')).toBe(oldCount + 1);
});
it('uses exactly the existing canonical academic engine for the prepared source', async () => {
  const revision = await currentRevisionV1(portal);
  const reader = new AcademicStudentReaderPostgresV1(portal);
  const link = { academicYear: 2026 as const, studentId: 746001 };
  const expected = await reader.readPublicationSourceInTransaction(portal, link, revision);
  const raw = await owner.unsafe('SELECT payload_json FROM student_portal.publication_source_v2 WHERE student_id=746001 ORDER BY revision DESC LIMIT 1');
  const actual = reader.projectPreparedSourceV2(link, revision, { ...raw[0]!.payload_json, account_id: own, data_version: revision });
  expect(actual?.student).toEqual(expected?.student);
  expect(actual?.finalAuthority).toEqual(expected?.finalAuthority);
});
it('does not reuse an approved source from the previous class after a transfer', async () => {
  await release();
  await admin.begin(async (tx) => {
    await tx.unsafe('UPDATE gradebook.vinculo SET turma_id=746002 WHERE aluno_id=746001');
    await tx.unsafe('UPDATE student_portal.academic_revision SET academic_counter=academic_counter+1 WHERE academic_year=2026');
    await tx.unsafe('SELECT * FROM student_portal.synchronize_profiles_v1(false)');
  });
  expect((await self())?.state).toBe('no-publication');
});
it('denies blocked accounts and private snapshot writes even when a school release exists', async () => {
  await release();
  await owner.unsafe('UPDATE student_portal.account SET blocked=true WHERE id=$1::uuid', [own]);
  expect(await self()).toBeNull();
  await expect(portal.unsafe('UPDATE student_portal.publication_source_v2 SET period_mask=63 WHERE false')).rejects.toThrow();
  await expect(portal.unsafe('UPDATE student_portal.publication_control_v2 SET enabled=false')).rejects.toThrow();
  await expect(portal.unsafe('SELECT student_portal.activate_scoped_publication_v2()')).rejects.toThrow();
  const permissions = await owner.unsafe("SELECT has_schema_privilege('anon','student_portal','USAGE') AS anon,has_schema_privilege('authenticated','student_portal','USAGE') AS authenticated");
  expect(permissions[0]).toMatchObject({ anon: false, authenticated: false });
});
it('runs the real administrative facade with its audit wrapper and without a nested isolation upgrade', async () => {
  const api = new PortalAdminApiV1(withAuditSqlV1(portal, null), { tenantId: READ_TENANT_V2, cursorSecret: 'synthetic-scoped-803-'.repeat(4),
    cryptoPort: cryptography, qrKeyVersion: 1, pepperVersion: 1, scopedPublication: true, scopedPublicationCapable: true });
  expect((await api.query(readContextV2(), { contractVersion: 1, operation: 'publication', scope: READ_SCHOOL_V2, page: {} })).state).toBe('publication');
  expect((await api.command({ ...readContextV2(), capability: 'platform.settings.write' }, await command())).state).toBe('committed');
  expect((await self())?.state).toBe('ready');
});
it('rejects a legacy command that waited across cutover instead of recreating account jobs', async () => {
  await expect(new PublicationServiceV1(portal, true).command(READ_ACTOR_V2, await command())).rejects.toThrow('cutover-conflict');
  expect(await count('publication_job')).toBe(0);
});
it('does not wait on the academic year or another account while publishing prepared data', async () => {
  const input = await command();
  let releaseLock!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => { releaseLock = resolve; });
  const acquired = new Promise<void>((resolve) => { entered = resolve; });
  const holding = peer.begin(async (tx) => {
    await tx.unsafe('SELECT pg_advisory_xact_lock(613,2026)');
    await tx.unsafe('SELECT id FROM student_portal.account WHERE id=$1::uuid FOR UPDATE', [own]);
    entered(); await gate;
  });
  try {
    await acquired;
    await expect(new ScopedPublicationServiceV2(portal).command(READ_ACTOR_V2, input)).resolves.toHaveProperty('operationId');
    expect((await new ScopedPublicationServiceV2(portal).read(READ_SCHOOL_V2)).items[0]?.state).toBe('published');
  } finally { releaseLock(); await holding; }
});
it('adopts an exact pending legacy approval at cutover without creating another publication', async () => {
  await legacyRelease();
  expect(await count('publication_job')).toBe(1);
  const switched = await owner.unsafe('SELECT student_portal.activate_scoped_publication_v2() AS result');
  expect(switched[0]!.result).toMatchObject({ state: 'active', adoptedPendingPeriods: 1 });
  expect(await score()).toMatchObject({ value: 8.001 });
  expect(await new PublicationJobsV1(portal).claim()).toBeNull();
});
it('refuses to substitute current grades for an old pending source during cutover', async () => {
  await legacyRelease();
  await preparedChange(9000);
  await expect(owner.unsafe('SELECT student_portal.activate_scoped_publication_v2()')).rejects.toThrow('pending-source-conflict');
  expect(await scopedPublicationEnabledV2(portal)).toBe(false);
  expect(await count('publication_release_v2')).toBe(0);
});
it('preserves an exact historical legacy projection when that source predates the new store', async () => {
  await legacyRelease();
  const jobs = new PublicationJobsV1(portal);
  const job = await jobs.claim();
  expect(job).not.toBeNull();
  expect(await jobs.perform(job!)).toBe('done');
  const next = await preparedChange(9000);
  await owner.unsafe('DELETE FROM student_portal.publication_source_v2 WHERE student_id=746001 AND revision<$1::numeric', [next.split(':')[1]!]);
  await owner.unsafe('SELECT student_portal.activate_scoped_publication_v2()');
  expect(await score()).toMatchObject({ value: 8.001 });
  await release(ownScope, 'unpublish');
  expect((await self())?.state).toBe('no-publication');
  await release(ownScope);
  expect(await score()).toMatchObject({ value: 9 });
});
it('serves an actual opaque session through the new HTTP and private administrative compositions', async () => {
  const session = await accountTransactionV1(portal, async (tx, store) => {
    await store.lockAccounts([own]);
    const context = await accessContextV1(portal, tx, store, own);
    if (!context) throw new Error('Synthetic session context unavailable');
    return createSessionV1(store, context, cryptography, false, crypto.randomUUID());
  });
  const env = { PORTAL_ENVIRONMENT: 'production', PORTAL_ORIGIN: 'https://aluno.escolaieda.com', PORTAL_ADMIN_TENANT_ID: READ_TENANT_V2,
    PORTAL_SERVING_ENABLED: 'true', PORTAL_PUBLICATION_MODE: 'scoped-v2', PORTAL_DB: { connectionString: connection('student_portal_app') },
    PASSWORD_PEPPER: JSON.stringify({ '1': Buffer.alloc(32, 7).toString('base64') }), QR_HMAC_KEYS: JSON.stringify({ '1': Buffer.alloc(32, 8).toString('base64') }) };
  const read = () => servePortalSelfV1(new Request(env.PORTAL_ORIGIN + '/api/student/me', {
    headers: { cookie: `${SESSION_COOKIE_V1.name}=${session.token}`, origin: env.PORTAL_ORIGIN },
  }), env);
  expect(await (await read()).json()).toMatchObject({ state: 'no-publication' });
  const result = await portalAdminRpcV1(env, 'command', { ...readContextV2(), capability: 'platform.settings.write' }, await command());
  expect(result.state).toBe('committed');
  const response = await read();
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toContain('no-store');
  const data = selfResponseV1.parse(await response.json());
  expect(data.state).toBe('ready');
  expect(data.profile.accountId).toBe(own);
  expect(data.subjects[0]?.periods[0]?.final).toMatchObject({ value: 8.001 });
  await release(READ_SCHOOL_V2, 'unpublish');
  expect(await (await read()).json()).toMatchObject({ state: 'no-publication' });
  await owner.unsafe('UPDATE student_portal.session SET revoked_at=statement_timestamp() WHERE account_id=$1::uuid', [own]);
  expect((await read()).status).toBe(401);
});
it('fences obsolete writers in SQL while preserving lifecycle deletion and modern releases', async () => {
  await expect(portal.unsafe('UPDATE student_portal.publication SET version=version WHERE false')).rejects.toThrow('scoped-cutover-conflict');
  await expect(portal.unsafe('UPDATE student_portal.published_projection SET updated_at=updated_at WHERE false')).rejects.toThrow('scoped-cutover-conflict');
  await expect(portal.unsafe('INSERT INTO student_portal.publication_job SELECT * FROM student_portal.publication_job WHERE false')).rejects.toThrow('scoped-cutover-conflict');
  await expect(portal.unsafe('DELETE FROM student_portal.published_projection WHERE false')).resolves.toBeDefined();
  await release();
  expect(await score()).toMatchObject({ value: 8.001 });
});

// This last scenario uses a separate synthetic cohort; no real database or student is involved.
describe('synthetic cohort load', () => {
  beforeAll(async () => {
  await owner.unsafe(`INSERT INTO gradebook.aluno(id,ano,nome)
      SELECT 804000+n,2026,'SYNTHETIC LOAD STUDENT '||n FROM generate_series(1,400) n;
    INSERT INTO gradebook.vinculo(ano,turma_id,numero,aluno_id)
      SELECT 2026,746010,n,804000+n FROM generate_series(1,400) n;
    INSERT INTO student_portal.account(id,gradebook_student_id,auth_state,eligibility)
      SELECT ('80300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,804000+n,'active','eligible' FROM generate_series(1,400) n;
    INSERT INTO gradebook.disciplina(id,ano,nome) SELECT 804000+n,2026,'SYNTHETIC SUBJECT '||n FROM generate_series(1,10) n;
    INSERT INTO gradebook.oferta(id,ano,turma_id,professor_id,disciplina_id)
      SELECT 804000+n,2026,746010,803001,804000+n FROM generate_series(1,10) n;
    INSERT INTO gradebook.instrumento(id,oferta_id,trimestre,slot,maximo,descricao)
      SELECT 804000+o*100+t*20+s,804000+o,t,s,
        CASE WHEN s>=11 THEN CASE WHEN t=3 THEN 2200 ELSE 1650 END ELSE CASE WHEN t=3 THEN 9000 ELSE 6750 END END,
        'SYNTHETIC LOAD ASSESSMENT '||s FROM generate_series(1,10) o CROSS JOIN generate_series(1,3) t
        CROSS JOIN (VALUES(1),(2),(3),(11),(12),(13),(14),(15),(16),(17),(18),(19),(20)) slots(s);`, [], { prepare: false });
  // Seed construction is not the measured release. Keep each fixture insertion bounded,
  // without disabling foreign keys, preparation triggers or the five-second runtime budget.
  for (let offer = 804001; offer <= 804010; offer++) {
    for (let first = 1; first <= 400; first += 100) {
      await owner.unsafe(`INSERT INTO gradebook.nota(instrumento_id,aluno_id,valor)
        SELECT i.id,804000+n,1000 FROM gradebook.instrumento i CROSS JOIN generate_series($2::integer,$3::integer) n WHERE i.oferta_id=$1`, [offer, first, first + 99]);
    }
  }
  await owner.unsafe(`INSERT INTO gradebook.fechamento(oferta_id,aluno_id,am1_fonte)
    SELECT 804000+o,804000+n,8000 FROM generate_series(1,10) o CROSS JOIN generate_series(1,400) n`);
  await owner.unsafe('SELECT * FROM student_portal.synchronize_profiles_v1(false)');
  }, 90_000);
  it('releases 400 students with 10 subjects and 156000 marks without per-account publication work', async () => {
  const preparing = performance.now();
  await owner.unsafe('UPDATE student_portal.academic_revision SET academic_counter=academic_counter+1 WHERE academic_year=2026');
  const preparationMs = performance.now() - preparing;
  const scope = { kind: 'class', academicYear: 2026, classId: 746010 } as const;
  const service = new ScopedPublicationServiceV2(portal);
  expect((await service.read(scope)).count).toBe(400);
  const input = await command(scope);
  queries.length = 0;
  const start = performance.now();
  await service.command(READ_ACTOR_V2, input);
  const releaseMs = performance.now() - start;
  const calls = queries.length;
  expect(calls).toBeLessThanOrEqual(10);
  expect(await count('publication_release_v2')).toBe(1);
  expect(await count('publication_job')).toBe(0);
  const startedRead = performance.now();
  const data = await self('80300000-0000-4000-8000-000000000001');
  const readMs = performance.now() - startedRead;
  expect(data?.subjects).toHaveLength(10);
  expect(data?.subjects.every((subject) => subject.periods.length === 1 && subject.periods[0]?.period === 'T1')).toBe(true);
  console.log('P803_SYNTHETIC_LOAD', JSON.stringify({ students: 400, subjects: 10, marks: 156000,
    preparationMs, releaseMs, readMs, queries: calls, jobs: 0 }));
}, 30_000);
});
