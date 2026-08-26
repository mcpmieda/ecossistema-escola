// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration1 = readFileSync(
  join(root, 'infra/banco-notas/d1/migrations/0001_banco_notas_foundation.sql'),
  'utf8',
);
const migration7 = readFileSync(
  join(root, 'infra/banco-notas/d1/migrations/0007_banco_notas_teacher_entra_identity.sql'),
  'utf8',
);

const YEAR_ID = '11111111-1111-4111-8111-111111111111';
const TEACHER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_TEACHER_ID = '33333333-3333-4333-8333-333333333333';
const MODEL_ID = '44444444-4444-4444-8444-444444444444';
const ENTRA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ENTRA_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function baseDatabase(modelSyncEnabled = false): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(migration1);
  db.exec(`
    INSERT INTO school_years (id, year, name, starts_on, ends_on)
    VALUES ('${YEAR_ID}', 2026, '2026', '2026-01-01', '2026-12-31');

    INSERT INTO teachers (id, display_name)
    VALUES ('${TEACHER_ID}', 'Docente sintético');

    INSERT INTO teacher_models
      (id, school_year_id, teacher_id, state, sync_enabled, environment)
    VALUES
      ('${MODEL_ID}', '${YEAR_ID}', '${TEACHER_ID}', 'connected', ${modelSyncEnabled ? 1 : 0}, 'homologation');
  `);
  return db;
}

describe('Banco de Notas teacher Entra identity migration', () => {
  it('fails safe by disabling a pre-existing sync model without Entra identity', () => {
    const db = baseDatabase(true);
    db.exec(migration7);

    expect(
      db.prepare('SELECT sync_enabled FROM teacher_models WHERE id = ?').get(MODEL_ID),
    ).toMatchObject({ sync_enabled: 0 });
    db.close();
  });

  it('blocks sync until the active teacher has a unique Entra object id', () => {
    const db = baseDatabase();
    db.exec(migration7);

    expect(() =>
      db.prepare('UPDATE teacher_models SET sync_enabled = 1 WHERE id = ?').run(MODEL_ID),
    ).toThrow('teacher model entra identity required for sync');

    db.prepare('UPDATE teachers SET entra_object_id = ? WHERE id = ?').run(ENTRA_ID, TEACHER_ID);
    db.prepare('UPDATE teacher_models SET sync_enabled = 1 WHERE id = ?').run(MODEL_ID);

    expect(
      db.prepare('SELECT sync_enabled FROM teacher_models WHERE id = ?').get(MODEL_ID),
    ).toMatchObject({ sync_enabled: 1 });
    db.close();
  });

  it('prevents two teachers from sharing the same Entra object id', () => {
    const db = baseDatabase();
    db.exec(migration7);
    db.prepare('UPDATE teachers SET entra_object_id = ? WHERE id = ?').run(ENTRA_ID, TEACHER_ID);
    db.prepare('INSERT INTO teachers (id, display_name) VALUES (?, ?)').run(
      OTHER_TEACHER_ID,
      'Outro docente sintético',
    );

    expect(() =>
      db.prepare('UPDATE teachers SET entra_object_id = ? WHERE id = ?').run(
        ENTRA_ID,
        OTHER_TEACHER_ID,
      ),
    ).toThrow('UNIQUE constraint failed');
    db.close();
  });

  it('locks teacher identity and active status while a model is sync-enabled', () => {
    const db = baseDatabase();
    db.exec(migration7);
    db.prepare('UPDATE teachers SET entra_object_id = ? WHERE id = ?').run(ENTRA_ID, TEACHER_ID);
    db.prepare('UPDATE teacher_models SET sync_enabled = 1 WHERE id = ?').run(MODEL_ID);

    expect(() =>
      db.prepare('UPDATE teachers SET entra_object_id = ? WHERE id = ?').run(
        OTHER_ENTRA_ID,
        TEACHER_ID,
      ),
    ).toThrow('teacher entra identity locked while sync enabled');
    expect(() =>
      db.prepare("UPDATE teachers SET status = 'inactive' WHERE id = ?").run(TEACHER_ID),
    ).toThrow('active teacher required while sync enabled');

    db.prepare('UPDATE teacher_models SET sync_enabled = 0 WHERE id = ?').run(MODEL_ID);
    db.prepare('UPDATE teachers SET entra_object_id = ? WHERE id = ?').run(
      OTHER_ENTRA_ID,
      TEACHER_ID,
    );
    db.prepare("UPDATE teachers SET status = 'inactive' WHERE id = ?").run(TEACHER_ID);

    expect(
      db.prepare('SELECT entra_object_id, status FROM teachers WHERE id = ?').get(TEACHER_ID),
    ).toMatchObject({ entra_object_id: OTHER_ENTRA_ID, status: 'inactive' });
    db.close();
  });
});
