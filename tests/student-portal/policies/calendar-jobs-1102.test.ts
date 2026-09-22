import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initialPolicyDefaultsV1 } from '../../../server/student-portal/policies/defaults-v1';
import { publicationWindowV1 } from '../../../server/student-portal/policies/calendar-v1';
import {
  disclosureDueV1,
  PublicationJobsV1,
} from '../../../server/student-portal/jobs/publication-jobs-v1';
import { PolicyServiceV1 } from '../../../server/student-portal/policies/policy-service-v1';
import { PublicationServiceV1 } from '../../../server/student-portal/publication/publication-service-v1';
import type { StudentPortalPostgresSqlV1 } from '../../../server/student-portal/persistence/postgres-persistence-v1';
import { installResetSchemaFixtureV1 } from '../year-reset/schema-fixture';
import { ACADEMIC_FIXTURE_SQL_V1 } from '../academic/academic-fixture-v1';

const at = (day: number) => `2026-01-${String(day).padStart(2, '0')}T00:00:00Z`;
function policy() {
  const value = initialPolicyDefaultsV1();
  value.accessEnabled = true;
  value.allowedPeriods = ['T1', 'T2'];
  Object.assign(value.calendar, {
    yearStartsAt: at(1),
    t1EndsAt: at(5),
    t2StartsAt: at(6),
    yearEndsAt: at(30),
    disclosure: { mode: 'single', at: null, periods: ['T1', 'T2'] },
  });
  return value;
}

describe('publication calendar #1102', () => {
  it('preserves legacy bounds and manual disclosure while intersecting period starts', () => {
    expect(publicationWindowV1(policy(), ['T1', 'T2'])).toEqual({
      start: new Date(at(6)),
      end: new Date(at(30)),
    });
    expect(disclosureDueV1(policy(), ['T1', 'T2'])).toEqual(new Date(at(6)));
  });

  it('uses explicit access bounds independently from the academic year end', () => {
    const value = policy();
    value.calendar.accessStartsAt = at(20);
    value.calendar.accessEndsAt = '2026-02-10T00:00:00Z';
    expect(publicationWindowV1(value, ['T1'])).toEqual({
      start: new Date(at(20)),
      end: new Date('2026-02-10T00:00:00Z'),
    });
    value.calendar.yearEndsAt = null;
    expect(publicationWindowV1(value, ['T1'])?.end).toEqual(new Date('2026-02-10T00:00:00Z'));
  });

  it('intersects independent disclosure ends and rejects an empty joint window', () => {
    const value = policy();
    value.calendar.disclosure = {
      mode: 'per-period',
      at: { T1: at(2), T2: at(8), T3: null, REC1: null, REC2: null, REC3: null },
      endsAt: { T1: at(10), T2: at(15), T3: null, REC1: null, REC2: null, REC3: null },
    };
    expect(publicationWindowV1(value, ['T1', 'T2'])).toEqual({
      start: new Date(at(8)),
      end: new Date(at(10)),
    });
    value.calendar.accessStartsAt = at(10);
    expect(publicationWindowV1(value, ['T1', 'T2'])).toBeNull();
    expect(disclosureDueV1(value, ['T1', 'T2'])).toBeNull();
  });

  it('respects school closure, disabled periods, selected single periods and missing starts', () => {
    const value = policy();
    expect(publicationWindowV1(value, [])).toBeNull();
    expect(publicationWindowV1(value, ['T3'])).toBeNull();
    value.calendar.disclosure = { mode: 'single', at: null, periods: ['T1'], endsAt: at(9) };
    expect(publicationWindowV1(value, ['T2'])).toBeNull();
    expect(publicationWindowV1(value, ['T1'])?.end).toEqual(new Date(at(9)));
    value.accessEnabled = false;
    expect(publicationWindowV1(value, ['T1'])).toBeNull();
    value.accessEnabled = true;
    value.calendar.yearStartsAt = null;
    value.calendar.accessStartsAt = at(1);
    expect(publicationWindowV1(value, ['T1'])).toBeNull();
  });
});

describe('publication jobs honor inclusive starts and exclusive ends #1102', () => {
  const actor = '11111111-1111-4111-8111-111111111111';
  const school = { kind: 'school', academicYear: 2026 } as const;
  let pg: PGlite;
  let sql: StudentPortalPostgresSqlV1;
  let accountId: string;
  let clock: Date;
  let clockReads = 0;
  let usePolicyClock = false;
  let expireDuringBuild = false;
  const now = '2026-01-20T00:00:00Z';
  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(readFileSync('migrations/gradebook-simplified/0001_current_schema.sql', 'utf8'));
    await installResetSchemaFixtureV1(pg);
    await pg.exec(ACADEMIC_FIXTURE_SQL_V1);
    accountId = (
      await pg.query<{ id: string }>(
        'SELECT id FROM student_portal.account WHERE gradebook_student_id=910001',
      )
    ).rows[0]!.id;
    const run = async <R extends Record<string, unknown>>(
      target: Pick<PGlite, 'query'>,
      query: string,
      parameters: readonly unknown[] = [],
    ) => {
      const rows = (await target.query<R>(query, [...parameters])).rows;
      if (usePolicyClock && query === 'SELECT statement_timestamp() AS now') {
        clockReads++;
        return [
          { now: expireDuringBuild && clockReads >= 2 ? new Date(at(21)) : clock },
        ] as unknown as R[];
      }
      return rows;
    };
    sql = {
      unsafe: (query, parameters) => run(pg, query, parameters),
      begin: (operation) =>
        pg.transaction((tx) =>
          operation({ unsafe: (query, parameters) => run(tx, query, parameters) }),
        ),
    };
  }, 30_000);
  beforeEach(async () => {
    clock = new Date(now);
    clockReads = 0;
    usePolicyClock = false;
    expireDuringBuild = false;
    await pg.exec(`TRUNCATE student_portal.setting,student_portal.publication,student_portal.published_projection,
      student_portal.publication_job,student_portal.audit_event,student_portal.operation_receipt;
      UPDATE student_portal.account SET auth_state='active',blocked=false,eligibility='eligible',version=0;`);
    await new PolicyServiceV1(sql).initializeDefaults();
  });
  afterAll(async () => {
    await pg?.close();
  });

  async function perform(start: string, end: string, disclosureEnd?: string) {
    const policies = new PolicyServiceV1(sql);
    const current = await policies.read(school);
    const value = policy();
    value.calendar.accessStartsAt = start;
    value.calendar.accessEndsAt = end;
    value.calendar.disclosure = {
      mode: 'single',
      at: at(2),
      periods: ['T1'],
      ...(disclosureEnd ? { endsAt: disclosureEnd } : {}),
    };
    await policies.mutate(actor, {
      contractVersion: 1,
      operation: 'settings-set',
      scope: school,
      value,
      expectedVersion: current.version,
      acknowledgeImmediateEffect: true,
      idempotencyKey: crypto.randomUUID(),
    });
    const service = new PublicationServiceV1(sql);
    const scope = { kind: 'account', academicYear: 2026, accountId } as const;
    const revision = String(
      (
        await pg.query<{ revision: string }>(
          "SELECT academic_generation||':'||academic_counter::text AS revision FROM student_portal.academic_revision WHERE academic_year=2026",
        )
      ).rows[0]!.revision,
    );
    await service.command(actor, {
      contractVersion: 1,
      operation: 'publish',
      scope,
      period: 'T1',
      expectedVersion: (await service.read(scope)).version,
      targetDataVersion: revision,
      idempotencyKey: crypto.randomUUID(),
    });
    const jobs = new PublicationJobsV1(sql);
    const job = await jobs.claim();
    expect(job).not.toBeNull();
    // Lease ownership uses PostgreSQL's real clock; only the policy clock is synthetic.
    job!.leaseUntil = new Date(Date.now() + 3_600_000).toISOString();
    await pg.query(
      'UPDATE student_portal.publication_job SET lease_until=$2::timestamptz WHERE id=$1',
      [job!.id, job!.leaseUntil],
    );
    clockReads = 0;
    usePolicyClock = true;
    return jobs.perform(job!);
  }

  it('defers before access starts without publishing a revision', async () => {
    expect(await perform(at(21), at(30))).toBe('deferred');
    expect(
      (await pg.query<{ published_revision: string | null }>('SELECT published_revision FROM student_portal.publication')).rows.every(
        (row) => row.published_revision === null,
      ),
    ).toBe(true);
  });
  it('publishes at the inclusive start', async () => {
    expect(await perform(now, at(30))).toBe('done');
  });
  it.each([now, at(19)])('refuses a delayed job at or after disclosure end %s', async (end) => {
    expect(await perform(at(1), at(30), end)).toBe('stale');
    expect(
      (await pg.query<{ published_revision: string | null }>('SELECT published_revision FROM student_portal.publication')).rows.every(
        (row) => row.published_revision === null,
      ),
    ).toBe(true);
    expect((await pg.query('SELECT * FROM student_portal.published_projection')).rows).toHaveLength(
      0,
    );
  });
  it('refuses the exclusive access end', async () => {
    expect(await perform(at(1), now)).toBe('stale');
  });
  it('rolls back when the window closes during source reading', async () => {
    expireDuringBuild = true;
    expect(await perform(at(1), at(21))).toBe('stale');
    expect(
      (await pg.query<{ published_revision: string | null }>('SELECT published_revision FROM student_portal.publication')).rows.every(
        (row) => row.published_revision === null,
      ),
    ).toBe(true);
  });
});
