import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import { installResetSchemaFixtureV1 } from '../year-reset/schema-fixture';

it('supports an explicit academic-policy event atomically, with replay and rollback', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(readFileSync('migrations/gradebook-simplified/0001_current_schema.sql', 'utf8'));
    await installResetSchemaFixtureV1(pg);
    await pg.exec('INSERT INTO gradebook.ano_letivo VALUES (2026,60000,2)');
    const state = async () =>
      (
        await pg.query(`SELECT y.minimum_approval,r.academic_counter::integer,
      r.reset_counter::integer FROM student_portal.academic_year_policy_v1 y
      JOIN student_portal.academic_revision r USING(academic_year) WHERE academic_year=2026`)
      ).rows[0];
    const initial = await state();
    // Synthetic producer simulation only: no current product endpoint edits the minimum.
    const event = `SELECT * FROM student_portal.record_gradebook_change_v1(
      '74500000-0000-4000-8000-000000000001'::uuid,2026::smallint,
      'academic-policy',true,'{}'::integer[],'2026-09-13T12:00:00Z'::timestamptz)`;
    await pg.exec('BEGIN; UPDATE gradebook.ano_letivo SET minimo_aprovacao=75000 WHERE ano=2026');
    const revision = (await pg.query(event)).rows;
    expect(await state()).toEqual({
      minimum_approval: 75_000,
      academic_counter: 2,
      reset_counter: 2,
    });
    expect((await pg.query(event)).rows).toEqual(revision);
    expect(
      (
        await pg.query(
          'SELECT cause,student_ids,affects_academic FROM student_portal.revision_event',
        )
      ).rows,
    ).toEqual([{ cause: 'academic-policy', student_ids: [], affects_academic: true }]);
    await pg.exec('ROLLBACK');
    expect(await state()).toEqual(initial);
    expect(
      (await pg.query('SELECT count(*)::integer AS count FROM student_portal.revision_event')).rows,
    ).toEqual([{ count: 0 }]);
  } finally {
    await pg.close();
  }
}, 30_000);
