import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import { installResetSchemaFixtureV1 } from '../year-reset/schema-fixture';
import { ACADEMIC_FIXTURE_SQL_V1 } from './academic-fixture-v1';
import type { StudentPortalPostgresSqlV1 } from '../../../server/student-portal/persistence/postgres-persistence-v1';
import { PolicyServiceV1 } from '../../../server/student-portal/policies/policy-service-v1';
import { PublicationServiceV1 } from '../../../server/student-portal/publication/publication-service-v1';
import { SelfProjectionReaderV1 } from '../../../server/student-portal/publication/self-projection-reader-v1';
import { PublicationJobsV1 } from '../../../server/student-portal/jobs/publication-jobs-v1';
import { PublicationReconcilerV1 } from '../../../server/student-portal/jobs/reconcile-v1';
import { AcademicStudentReaderPostgresV1 } from '../../../server/student-portal/academic/academic-reader-v1';

it('keeps the approved classification with autoUpdate OFF until an explicit update of the new academic revision', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(readFileSync('migrations/gradebook-simplified/0001_current_schema.sql', 'utf8'));
    await installResetSchemaFixtureV1(pg);
    await pg.exec(ACADEMIC_FIXTURE_SQL_V1);
    const sql: StudentPortalPostgresSqlV1 = {
      unsafe: async <R extends Record<string, unknown>>(
        query: string,
        values: readonly unknown[] = [],
      ) => (await pg.query<R>(query, [...values])).rows,
      begin: (run) =>
        pg.transaction((tx) =>
          run({
            unsafe: async <R extends Record<string, unknown>>(
              query: string,
              values: readonly unknown[] = [],
            ) => (await tx.query<R>(query, [...values])).rows,
          }),
        ),
    };
    const actor = '74700000-0000-4000-8000-000000000001';
    const school = { kind: 'school', academicYear: 2026 } as const;
    const accountId = (
      await pg.query<{ id: string }>(
        'SELECT id FROM student_portal.account WHERE gradebook_student_id=910001',
      )
    ).rows[0]!.id;
    const scope = { kind: 'account', academicYear: 2026, accountId } as const;
    const revision = async () =>
      (
        await pg.query<{ revision: string }>(
          "SELECT academic_generation||':'||academic_counter::text AS revision FROM student_portal.academic_revision WHERE academic_year=2026",
        )
      ).rows[0]!.revision;
    const policy = new PolicyServiceV1(sql);
    const service = new PublicationServiceV1(sql);
    const self = new SelfProjectionReaderV1(sql);
    const jobs = new PublicationJobsV1(sql);
    const reconcile = new PublicationReconcilerV1(sql);
    await pg.query("UPDATE student_portal.account SET auth_state='active' WHERE id=$1::uuid", [
      accountId,
    ]);
    await policy.initializeDefaults();
    const settings = async (value: Record<string, unknown>) =>
      policy.mutate(actor, {
        contractVersion: 1,
        operation: 'settings-set',
        scope: school,
        value,
        expectedVersion: (await policy.read(school)).version,
        acknowledgeImmediateEffect: true,
        idempotencyKey: crypto.randomUUID(),
      });
    const defaults = await policy.read(school);
    const now = Math.floor(Date.now() / 1000) * 1000;
    const at = (days: number) => new Date(now + days * 86400_000).toISOString();
    await settings({
      accessEnabled: true,
      autoUpdate: false,
      allowedPeriods: ['T1'],
      calendar: {
        ...defaults.value.calendar,
        yearStartsAt: at(-10),
        yearEndsAt: at(10),
        disclosure: { mode: 'single', at: at(-1), periods: ['T1'] },
      },
    });
    const publish = async (operation: 'publish' | 'publish-update') => {
      await service.command(actor, {
        contractVersion: 1,
        operation,
        scope,
        period: 'T1',
        expectedVersion: (await service.read(scope)).version,
        targetDataVersion: await revision(),
        idempotencyKey: crypto.randomUUID(),
      });
      expect((await jobs.run(25)).failed).toBe(0);
    };
    const read = () => self.read(accountId, crypto.randomUUID());
    const score = (
      result: Pick<NonNullable<Awaited<ReturnType<typeof read>>>, 'subjects'> | null,
    ) => result!.subjects.find((s) => s.label === 'MATEMATICA')!.periods[0]!.final;
    await publish('publish');
    const before = await read();
    expect(score(before)).toMatchObject({ value: 25, maximum: 30, meetsMinimum: true });
    // Explicit synthetic producer: current product has no minimum editor.
    await pg.transaction(async (tx) => {
      await tx.exec('UPDATE gradebook.ano_letivo SET minimo_aprovacao=90000 WHERE ano=2026');
      await tx.query(
        "SELECT * FROM student_portal.record_gradebook_change_v1($1::uuid,2026::smallint,'academic-policy',true,ARRAY[910001],statement_timestamp())",
        [crypto.randomUUID()],
      );
    });
    const current = await new AcademicStudentReaderPostgresV1(sql).readOfficial(
      { academicYear: 2026, studentId: 910001 },
      await revision(),
    );
    expect(score(current)).toMatchObject({ value: 25, maximum: 30, meetsMinimum: false });
    await reconcile.run();
    await jobs.run(25);
    expect(score(await read())).toEqual(score(before));
    expect((await read())!.revisions.dataVersion).toBe(before!.revisions.dataVersion);
    expect((await service.read(scope)).items[0]!.state).toBe('update-pending');
    await settings({ showPartials: true });
    await reconcile.run();
    await jobs.run(25);
    expect(score(await read())).toEqual(score(before));
    await publish('publish-update');
    const after = await read();
    expect(score(after)).toMatchObject({ value: 25, maximum: 30, meetsMinimum: false });
    expect(after!.revisions.dataVersion).not.toBe(before!.revisions.dataVersion);
    expect(
      after!.subjects.every((subject) => subject.periods.every((period) => period.period === 'T1')),
    ).toBe(true);
    const official = (
      await pg.query(
        'SELECT am1_fonte,u_fonte FROM gradebook.fechamento WHERE oferta_id=910001 AND aluno_id=910001',
      )
    ).rows[0];
    expect(official).toEqual({ am1_fonte: 25000, u_fonte: 99000 });
  } finally {
    await pg.close();
  }
}, 30_000);
