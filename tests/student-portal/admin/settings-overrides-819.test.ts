// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
import type { StudentPortalPostgresSqlV1 } from '../../../server/student-portal/persistence/postgres-persistence-v1';
import {
  installAdminReadFixtureV2,
  resetAdminReadFixtureV2,
  readApiV2,
  readContextV2,
  readAccountIdV2,
  READ_CLASS_V2,
  READ_SCHOOL_V2,
} from './read-fixture-v2';
import { adminReadQueryV2 } from '../../../shared/student-portal-contracts/admin-read-v2';
import type { ScopeV1 } from '../../../shared/student-portal-contracts/core-v1';
let pg: PGlite, sql: StudentPortalPostgresSqlV1;
beforeAll(async () => {
  pg = new PGlite();
  const run = async <R extends Record<string, unknown>>(
    db: Pick<PGlite, 'query'>,
    q: string,
    v: readonly unknown[] = [],
  ): Promise<R[]> => (await db.query<R>(q, [...v])).rows;
  sql = {
    unsafe: (q, v) => run(pg, q, v),
    begin: (cb) => pg.transaction((tx) => cb({ unsafe: (q, v) => run(tx, q, v) })),
  };
  await installAdminReadFixtureV2(pg, sql);
}, 30_000);
afterAll(async () => pg?.close());
beforeEach(async () => resetAdminReadFixtureV2(sql));
const account = { kind: 'account', academicYear: 2026, accountId: readAccountIdV2(1) } as const;
async function own(
  scope: Exclude<ScopeV1, { kind: 'school' }>,
  field: string,
  value: unknown,
  inherited = false,
) {
  const id =
    scope.kind === 'class' ? `class:2026:${scope.classId}` : `account:2026:${scope.accountId}`;
  await sql.unsafe(
    `INSERT INTO student_portal.setting (scope_key,field_key,scope_kind,academic_year,class_id,account_id,value_json,source_scope_json,version) VALUES($1,$2,$3,2026,$4,$5::uuid,$6::jsonb,$7::jsonb,1)`,
    [
      id,
      field,
      scope.kind,
      scope.kind === 'class' ? scope.classId : null,
      scope.kind === 'account' ? scope.accountId : null,
      JSON.stringify(value),
      JSON.stringify(inherited ? READ_SCHOOL_V2 : scope),
    ],
  );
}
const query = (
  scope: ScopeV1 = READ_SCHOOL_V2,
  page: { limit: number; cursor?: string } = { limit: 100 },
) => ({ contractVersion: 2, operation: 'settings-overrides', scope, page });
async function read(scope: ScopeV1 = READ_SCHOOL_V2, page?: { limit: number; cursor?: string }) {
  const result = await readApiV2(sql).query(readContextV2(), query(scope, page));
  expect(result.state).toBe('settings-overrides');
  if (result.state !== 'settings-overrides') throw new Error(`Unexpected ${result.state}`);
  return result;
}
it('lists only directly owned options and groups them by class or account', async () => {
  await own(READ_CLASS_V2, 'showPartials', true);
  await own(account, 'accessEnabled', false);
  await own(account, 'allowedPeriods', ['T1']);
  await own({ ...account, accountId: readAccountIdV2(2) }, 'showPartials', true, true);
  const before = await sql.unsafe(
    'SELECT * FROM student_portal.setting ORDER BY scope_key,field_key',
  );
  const result = await read();
  expect(result.items).toHaveLength(2);
  expect(result.items.find((r) => r.scope.kind === 'account')).toMatchObject({
    label: 'SYNTHETIC READ STUDENT 001',
    classLabel: 'SYNTHETIC READ CLASS 1',
    value: { accessEnabled: false, allowedPeriods: ['T1'] },
  });
  expect(result.items.find((r) => r.scope.kind === 'class')!.value).toEqual({ showPartials: true });
  expect(
    await sql.unsafe('SELECT * FROM student_portal.setting ORDER BY scope_key,field_key'),
  ).toEqual(before);
});
it('limits the list to the selected class and individual account without another scope leaking', async () => {
  await own(READ_CLASS_V2, 'showPartials', true);
  await own({ ...READ_CLASS_V2, classId: 746002 }, 'showPartials', false);
  await own(account, 'accessEnabled', false);
  expect((await read(READ_CLASS_V2)).items).toHaveLength(2);
  expect((await read(account)).items.map((r) => r.scope)).toEqual([account]);
  expect((await read({ ...READ_CLASS_V2, classId: 746002 })).items).toHaveLength(1);
});
it('keeps signed cursor continuation bound to the actor, query, operation and scope', async () => {
  await own(READ_CLASS_V2, 'showPartials', true);
  await own(account, 'accessEnabled', false);
  const first = await read(READ_SCHOOL_V2, { limit: 1 });
  expect(first.nextCursor).toBeTruthy();
  const page = { limit: 1, cursor: first.nextCursor! };
  const next = await read(READ_SCHOOL_V2, page);
  expect(next.items).toHaveLength(1);
  expect(next.items[0]!.id).not.toBe(first.items[0]!.id);
  expect(next.nextCursor).toBeNull();
  const api = readApiV2(sql);
  for (const q of [
    query(READ_CLASS_V2, page),
    { ...query(READ_SCHOOL_V2, page), operation: 'accounts-read' },
    {
      ...query(READ_SCHOOL_V2, page),
      page: { ...page, cursor: first.nextCursor!.slice(0, -2) + 'xx' },
    },
  ])
    expect((await api.query(readContextV2(), q)).state).toBe('invalid-request');
  expect(
    (
      await api.query(
        { ...readContextV2(), actorId: readAccountIdV2(5) },
        query(READ_SCHOOL_V2, page),
      )
    ).state,
  ).toBe('invalid-request');
});
it('rejects unauthorized or cross-year reads and unrelated filters rather than inventing a result', async () => {
  const api = readApiV2(sql);
  expect((await api.query({ ...readContextV2(), capability: 'unrelated' }, query())).state).toBe(
    'forbidden',
  );
  expect(
    adminReadQueryV2.safeParse({ ...query(), scope: { kind: 'school', academicYear: 2025 } })
      .success,
  ).toBe(false);
  for (const extra of [{ nameSearch: 'anything' }, { blocked: true }, { sessionView: 'active' }])
    expect(adminReadQueryV2.safeParse({ ...query(), ...extra }).success).toBe(false);
  expect((await read()).items).toEqual([]);
});
