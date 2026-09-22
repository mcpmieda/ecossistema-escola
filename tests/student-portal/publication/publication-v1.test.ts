import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PublicationServiceV1 } from '../../../server/student-portal/publication/publication-service-v1';
import { SelfProjectionReaderV1 } from '../../../server/student-portal/publication/self-projection-reader-v1';
import { PublicationJobsV1 } from '../../../server/student-portal/jobs/publication-jobs-v1';
import { PublicationReconcilerV1 } from '../../../server/student-portal/jobs/reconcile-v1';
import { PolicyServiceV1 } from '../../../server/student-portal/policies/policy-service-v1';
import { dataVectorV1, parseDataVectorV1 } from '../../../server/student-portal/publication/state-v1';
import type { StudentPortalPostgresSqlV1 } from '../../../server/student-portal/persistence/postgres-persistence-v1';
import { installResetSchemaFixtureV1 } from '../year-reset/schema-fixture';
import { ACADEMIC_FIXTURE_SQL_V1 } from '../academic/academic-fixture-v1';
import type { EffectiveSettingsV1 } from '../../../shared/student-portal-contracts/policy-v1';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const SCHOOL = { kind: 'school', academicYear: 2026 } as const;
let pg: PGlite;
let sql: StudentPortalPostgresSqlV1;
let service: PublicationServiceV1;
let reader: SelfProjectionReaderV1;
let jobs: PublicationJobsV1;
let reconcile: PublicationReconcilerV1;
let policy: PolicyServiceV1;
let accountId: string;
let failSwap = false;
const scope = () => ({ kind: 'account', academicYear: 2026, accountId } as const);
async function revision(): Promise<string> {
  return String((await pg.query<{ revision: string }>("SELECT academic_generation||':'||academic_counter::text AS revision FROM student_portal.academic_revision WHERE academic_year=2026")).rows[0]!.revision);
}
async function change(cause = 'marks') {
  await pg.query('SELECT * FROM student_portal.record_gradebook_change_v1($1::uuid,2026::smallint,$2,true,ARRAY[910001],statement_timestamp())', [crypto.randomUUID(), cause]);
  await pg.exec('SELECT * FROM student_portal.synchronize_profiles_v1(false)');
}
async function settings(value: Partial<EffectiveSettingsV1['value']>) {
  const current = await policy.read(SCHOOL);
  return policy.mutate(ACTOR, { contractVersion: 1, operation: 'settings-set', scope: SCHOOL, value,
    expectedVersion: current.version, acknowledgeImmediateEffect: true, idempotencyKey: crypto.randomUUID() });
}
async function input(operation = 'publish', period = 'T1') {
  return { contractVersion: 1, operation, scope: scope(), period, expectedVersion: (await service.read(scope())).version,
    idempotencyKey: crypto.randomUUID(), ...(operation === 'unpublish' ? { confirmed: true } : { targetDataVersion: await revision() }) };
}
async function publish(period = 'T1', operation = 'publish') {
  await service.command(ACTOR, await input(operation, period));
  return jobs.run(25);
}
const self = () => reader.read(accountId, crypto.randomUUID());
const valueOf = (response: Awaited<ReturnType<typeof self>>, period = 'T1') => response?.subjects.find((subject) => subject.label === 'MATEMATICA')?.periods.find((item) => item.period === period)?.final;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(readFileSync('migrations/gradebook-simplified/0001_current_schema.sql', 'utf8'));
  await installResetSchemaFixtureV1(pg);
  await pg.exec(ACADEMIC_FIXTURE_SQL_V1);
  accountId = (await pg.query<{ id: string }>('SELECT id FROM student_portal.account WHERE gradebook_student_id=910001')).rows[0]!.id;
  const run = async <R extends Record<string, unknown>>(target: Pick<PGlite, 'query'>, query: string, parameters: readonly unknown[] = []) => {
    if (failSwap && query.includes('INSERT INTO student_portal.published_projection')) throw new Error('synthetic-swap-failure');
    return (await target.query<R>(query, [...parameters])).rows;
  };
  sql = { unsafe: (query, parameters) => run(pg, query, parameters), begin: (operation) => pg.transaction((tx) => operation({ unsafe: (query, parameters) => run(tx, query, parameters) })) };
  service = new PublicationServiceV1(sql);
  reader = new SelfProjectionReaderV1(sql);
  jobs = new PublicationJobsV1(sql);
  reconcile = new PublicationReconcilerV1(sql);
  policy = new PolicyServiceV1(sql);
}, 30_000);
beforeEach(async () => {
  failSwap = false;
  await pg.exec(`TRUNCATE student_portal.setting,student_portal.publication,student_portal.published_projection,
    student_portal.publication_job,student_portal.audit_event,student_portal.operation_receipt;
    UPDATE student_portal.account SET auth_state='active',blocked=false,eligibility='eligible',version=0;
    UPDATE gradebook.vinculo SET turma_id=910001,situacao=NULL;
    UPDATE gradebook.nota SET valor=CASE WHEN (SELECT slot FROM gradebook.instrumento WHERE id=instrumento_id)=1 THEN 0 ELSE 1000 END;
    UPDATE gradebook.fechamento SET rec_nc_mask=0,rec_rr_mask=0,am1_fonte=CASE WHEN oferta_id=910001 THEN 25000 ELSE 24000 END,am2_fonte=20000,am3_fonte=0,
      u_fonte=CASE WHEN oferta_id=910001 THEN 99000 ELSE NULL END;
    UPDATE gradebook.instrumento SET maximo=CASE WHEN slot=11 THEN CASE WHEN trimestre=3 THEN 22000 ELSE 16500 END ELSE CASE WHEN trimestre=3 THEN 9000 ELSE 6750 END END;
    DELETE FROM gradebook.conselho_decisao;`);
  await change();
  await policy.initializeDefaults();
  const current = await policy.read(SCHOOL);
  const base = Math.floor(Date.now() / 1000) * 1000 - 60 * 86400_000;
  const at = (days: number) => new Date(base + days * 86400_000).toISOString();
  await settings({ accessEnabled: true, allowedPeriods: ['T1', 'T2', 'T3', 'REC1', 'REC2', 'REC3'], calendar: { ...current.value.calendar,
    yearStartsAt: at(0), t1EndsAt: at(1), t2EndsAt: at(2), t3EndsAt: at(3), recoveriesStartAt: at(4), yearEndsAt: at(90), finalDisclosureAt: at(5),
    disclosure: { mode: 'single', at: at(5), periods: ['T1', 'T2', 'T3', 'REC1', 'REC2', 'REC3'] } } });
}, 30_000);
afterAll(async () => { await pg?.close(); });

describe('durable publication and authorized self snapshots', () => {
  it('reconciles availability without publishing a new period and stores only approved fields after an explicit command', async () => {
    expect((await reconcile.run()).failed).toBe(0);
    await jobs.run(25);
    expect(await self()).toMatchObject({ state: 'no-publication', subjects: [] });
    expect((await service.read(scope())).items[0]).toMatchObject({ state: 'available' });
    expect((await publish()).done).toBe(1);
    const result = await self();
    expect(valueOf(result)).toMatchObject({ kind: 'score', value: 25 });
    expect(result!.subjects.every((subject) => subject.periods.length === 1 && subject.periods[0]!.period === 'T1' && !('partials' in subject.periods[0]!))).toBe(true);
    const stored = JSON.stringify((await pg.query('SELECT payload_json FROM student_portal.published_projection WHERE account_id=$1', [accountId])).rows);
    expect(stored).not.toMatch(/PRIVATE TEACHER|ACADEMIC OTHER|officialAnnual|sourceAm|assessmentId/);
    expect(result!.profile.result).toBe('in-progress');
  });

  it('keeps exact old data with auto-update OFF, including policy changes, and updates only the explicitly approved period', async () => {
    await publish('T1');
    await publish('T2');
    const before = await self();
    await pg.exec('UPDATE gradebook.fechamento SET am1_fonte=29000,am2_fonte=28000 WHERE oferta_id=910001');
    await change();
    await reconcile.run();
    await jobs.run(25);
    expect(valueOf(await self())).toEqual(valueOf(before));
    await settings({ showPartials: true });
    await reconcile.run();
    await jobs.run(25);
    expect(valueOf(await self())).toEqual(valueOf(before));
    expect(valueOf(await self(), 'T2')).toMatchObject({ value: 20 });
    expect((await service.read(scope())).items[0]).toMatchObject({ state: 'update-pending' });
    await publish('T1', 'publish-update');
    const after = await self();
    expect(valueOf(after)).toMatchObject({ value: 29 });
    expect(valueOf(after, 'T2')).toMatchObject({ value: 20 });
    const vector = parseDataVectorV1(after!.revisions.dataVersion);
    expect(vector[0]).not.toBe(vector[1]);
    expect(dataVectorV1(vector)).toBe(after!.revisions.dataVersion);
  });

  it('auto-updates already published periods only and accepts each transactional producer cause', async () => {
    await settings({ autoUpdate: true });
    await publish('T1');
    for (const cause of ['marks', 'relation', 'council', 'academic-policy']) {
      await pg.exec('UPDATE gradebook.fechamento SET am1_fonte=29000 WHERE oferta_id=910001');
      await change(cause);
      expect((await reconcile.run()).failed).toBe(0);
      await jobs.run(25);
      const response = await self();
      expect(valueOf(response)).toMatchObject({ value: 29 });
      expect(response!.subjects.every((subject) => subject.periods.every((period) => period.period === 'T1'))).toBe(true);
    }
  });

  it('rejects a legacy manual refresh when the published period already uses the current revision', async () => {
    await publish('T1');
    expect((await service.read(scope())).items[0]).toMatchObject({ state: 'published' });
    await expect(
      service.command(ACTOR, await input('publish-update', 'T1')),
    ).rejects.toThrow('student-portal-publication-no-update-conflict');
  });

  it('rejects obsolete source targets and idempotency payload changes without accepting a newer revision', async () => {
    const request = await input();
    const first = await service.command(ACTOR, request);
    expect(await service.command(ACTOR, request)).toEqual(first);
    await expect(service.command(ACTOR, { ...request, period: 'T2' })).rejects.toThrow('idempotency-conflict');
    const old = await input('publish', 'T2');
    await change();
    await expect(service.command(ACTOR, { ...old, expectedVersion: (await service.read(scope())).version })).rejects.toThrow('source-conflict');
    const job = await jobs.claim();
    expect(job).not.toBeNull();
    expect(await jobs.perform(job!)).toBe('stale');
    expect((await self())!.subjects).toHaveLength(0);
  });

  it('preserves independent pending approvals when another period is queued, and an in-flight job cannot undo unpublish', async () => {
    await service.command(ACTOR, await input('publish', 'T1'));
    await service.command(ACTOR, await input('publish', 'T2'));
    await jobs.run(25);
    expect(valueOf(await self())).toMatchObject({ value: 25 });
    expect(valueOf(await self(), 'T2')).toMatchObject({ value: 20 });
    await pg.exec('UPDATE gradebook.fechamento SET am1_fonte=26000 WHERE oferta_id=910001');
    await change();
    await reconcile.run();
    expect((await service.read(scope())).items[0]).toMatchObject({ state: 'update-pending' });
    await service.command(ACTOR, await input('publish-update', 'T1'));
    const old = await jobs.claim();
    await service.command(ACTOR, await input('unpublish', 'T1'));
    expect(await jobs.perform(old!)).toBe('stale');
    expect(valueOf(await self())).toBeUndefined();
    expect(valueOf(await self(), 'T2')).toMatchObject({ value: 20 });
    const stored = JSON.stringify((await pg.query('SELECT payload_json FROM student_portal.published_projection WHERE account_id=$1', [accountId])).rows);
    expect(stored).not.toContain('"period":"T1"');
    await service.command(ACTOR, await input('publish', 'T1'));
    expect(valueOf(await self())).toBeUndefined();
    await jobs.run(25);
    expect(valueOf(await self())).toMatchObject({ value: 25 });
  });

  it('fences an expired lease after a restart and never lets the old worker commit', async () => {
    await service.command(ACTOR, await input());
    const first = await jobs.claim();
    expect(await new PublicationJobsV1(sql).claim()).toBeNull();
    await pg.query("UPDATE student_portal.publication_job SET lease_until=statement_timestamp()-interval '1 second' WHERE id=$1", [first!.id]);
    const second = await new PublicationJobsV1(sql).claim();
    expect(second!.attempts).toBe(first!.attempts + 1);
    expect(await jobs.perform(first!)).toBe('stale');
    expect(await jobs.perform(second!)).toBe('done');
    expect(await jobs.perform(second!)).toBe('stale');
  });

  it('terminalizes an abandoned fifth lease and permits a new explicit approval to retry', async () => {
    await service.command(ACTOR, await input());
    const first = await jobs.claim();
    await pg.query("UPDATE student_portal.publication_job SET attempts=5,lease_until=statement_timestamp()-interval '1 second' WHERE id=$1", [first!.id]);
    expect(await jobs.claim()).toBeNull();
    expect((await pg.query('SELECT state,lease_until FROM student_portal.publication_job WHERE id=$1', [first!.id])).rows[0])
      .toMatchObject({ state: 'failed', lease_until: null });
    expect(await jobs.perform(first!)).toBe('stale');
    expect((await publish()).done).toBe(1);
  });

  it('never auto-publishes an old class approval after a lifecycle projection purge', async () => {
    await settings({ autoUpdate: true });
    await publish();
    await pg.exec('UPDATE gradebook.vinculo SET turma_id=910002 WHERE aluno_id=910001');
    await change('relation');
    await reconcile.run();
    await jobs.run(25);
    expect((await self())!.subjects).toHaveLength(0);
    await pg.exec('UPDATE gradebook.vinculo SET turma_id=910001 WHERE aluno_id=910001');
    await change('relation');
    await reconcile.run();
    await jobs.run(25);
    expect((await self())!.subjects).toHaveLength(0);
    await publish();
    expect(valueOf(await self())).toMatchObject({ value: 25 });
  });

  it('rolls back failed materialization, retries with backoff and preserves T1/T2 when T3 source is broken', async () => {
    await publish('T1');
    await publish('T2');
    await service.command(ACTOR, await input('publish', 'T3'));
    failSwap = true;
    const first = await jobs.claim();
    expect(await jobs.perform(first!)).toBe('failed');
    expect(await jobs.claim()).toBeNull();
    expect(valueOf(await self())).toMatchObject({ value: 25 });
    failSwap = false;
    await pg.exec("UPDATE student_portal.publication_job SET next_attempt_at=statement_timestamp() WHERE state='queued'");
    await pg.exec('UPDATE gradebook.instrumento SET maximo=NULL WHERE oferta_id=910001 AND trimestre=3 AND slot=1');
    expect((await jobs.run(1)).failed).toBe(1);
    expect(valueOf(await self(), 'T2')).toMatchObject({ value: 20 });
    expect(valueOf(await self(), 'T3')).toBeUndefined();
  });

  it('denies stale policy, class changes, exits and database failure without returning an old unauthorized snapshot', async () => {
    await publish();
    const before = await self();
    expect(await reader.readAuthorized(accountId, before!.revisions)).not.toBeNull();
    await settings({ allowedPeriods: [] });
    expect((await self())!.subjects).toHaveLength(0);
    expect(await reader.readAuthorized(accountId, before!.revisions)).toBeNull();
    await pg.exec('UPDATE gradebook.vinculo SET turma_id=910002 WHERE aluno_id=910001');
    expect(await self()).toBeNull();
    await change('relation');
    expect((await self())!.subjects).toHaveLength(0);
    await pg.exec('UPDATE gradebook.vinculo SET situacao=3 WHERE aluno_id=910001');
    expect(await self()).toBeNull();
    const broken: StudentPortalPostgresSqlV1 = { unsafe: () => { throw new Error('synthetic-database-down'); }, begin: async () => { throw new Error('synthetic-database-down'); } };
    await expect(new SelfProjectionReaderV1(broken).read(accountId, crypto.randomUUID())).rejects.toThrow('synthetic-database-down');
  });

  it('keeps final results closed for missing or divergent official values, and allows a concordant official result only after the toggle', async () => {
    await settings({ showFinalResult: true });
    await publish();
    expect((await self())!.profile.result).toBe('in-progress');
    await pg.exec('UPDATE gradebook.fechamento SET u_fonte=99000');
    await change();
    await publish('T1', 'publish-update');
    expect((await self())!.profile.result).toBe('in-progress');
    await pg.exec(`UPDATE gradebook.nota n SET valor=i.maximo FROM gradebook.instrumento i WHERE i.id=n.instrumento_id;
      UPDATE gradebook.fechamento SET am1_fonte=30000,am2_fonte=30000,am3_fonte=40000,u_fonte=100000;`);
    await change();
    await publish('T1', 'publish-update');
    expect((await self())!.profile.result).toBe('approved');
    await settings({ showFinalResult: false });
    expect((await self())!.profile.result).toBe('in-progress');
    expect((await self())!.subjects.every((subject) => subject.officialOutcome === undefined)).toBe(true);
  });

  it('publishes school scope with its exposed CAS and preserves zero, NC, RR and REC markers', async () => {
    await settings({ showPartials: true });
    await pg.exec("UPDATE gradebook.fechamento SET am3_fonte=0,rec_nc_mask=1,rec_rr_mask=2 WHERE oferta_id=910001");
    await change();
    await reconcile.run();
    await jobs.run(25);
    const snapshot = await service.read(SCHOOL);
    expect(snapshot.count).toBe(2);
    const request = { ...(await input()), scope: SCHOOL, expectedVersion: snapshot.items[0]!.version };
    await service.command(ACTOR, request);
    await jobs.run(25);
    const math = (await self())!.subjects.find((subject) => subject.label === 'MATEMATICA')!;
    expect(math.periods[0]!.final).toMatchObject({ kind: 'score', value: 25 });
    expect(math.periods[0]!.partials!.some((partial) => partial.mark.kind === 'score' && partial.mark.value === 0)).toBe(true);
    await publish('T3');
    expect(valueOf(await self(), 'T3')).toMatchObject({ kind: 'score', value: 0 });
    await publish('REC1');
    expect(valueOf(await self(), 'REC1')).toMatchObject({ kind: 'nc' });
    await publish('REC2');
    expect(valueOf(await self(), 'REC2')).toMatchObject({ kind: 'rr' });
    await expect(service.command(ACTOR, { ...request, idempotencyKey: crypto.randomUUID() })).rejects.toThrow('version-conflict');
  });

  it('defers disclosure by database time without promoting data before the configured date', async () => {
    const current = await policy.read(SCHOOL);
    const future = new Date(Math.floor(Date.now() / 1000) * 1000 + 3600_000).toISOString();
    await settings({ calendar: { ...current.value.calendar, disclosure: { mode: 'single', at: future, periods: ['T1'] } } });
    await service.command(ACTOR, await input());
    expect((await jobs.run()).deferred).toBe(1);
    expect((await self())!.subjects).toHaveLength(0);
    expect(await jobs.claim()).toBeNull();
  });
});
