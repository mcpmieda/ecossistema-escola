// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { D1BancoNotasAddinAuthorizer } from '../server/banco-notas/d1-addin-authorizer';

const root = process.cwd();
const migration1 = readFileSync(
  join(root, 'infra/banco-notas/d1/migrations/0001_banco_notas_foundation.sql'),
  'utf8',
);
const migration7 = readFileSync(
  join(root, 'infra/banco-notas/d1/migrations/0007_banco_notas_teacher_entra_identity.sql'),
  'utf8',
);

class SqlitePrepared {
  private values: SQLInputValue[] = [];

  constructor(private readonly statement: StatementSync) {}

  bind(...values: SQLInputValue[]): SqlitePrepared {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    return (this.statement.get(...this.values) as T | undefined) ?? null;
  }
}

class SqliteD1 {
  constructor(readonly database: DatabaseSync) {}

  prepare(sql: string): SqlitePrepared {
    return new SqlitePrepared(this.database.prepare(sql));
  }
}

const YEAR_ID = '11111111-1111-4111-8111-111111111111';
const TEACHER_ID = '22222222-2222-4222-8222-222222222222';
const MODEL_ID = '33333333-3333-4333-8333-333333333333';
const OWNER_OID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_OID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function runtime(identity: string | null = OWNER_OID, status = 'active'): SqliteD1 {
  const db = new DatabaseSync(':memory:');
  db.exec(migration1);
  db.exec(migration7);
  db.exec(`
    INSERT INTO school_years (id, year, name, starts_on, ends_on)
    VALUES ('${YEAR_ID}', 2026, '2026', '2026-01-01', '2026-12-31');

    INSERT INTO teachers (id, display_name, status, entra_object_id)
    VALUES (
      '${TEACHER_ID}',
      'Docente sintético',
      '${status}',
      ${identity === null ? 'NULL' : `'${identity}'`}
    );

    INSERT INTO teacher_models
      (id, school_year_id, teacher_id, state, sync_enabled, environment)
    VALUES
      ('${MODEL_ID}', '${YEAR_ID}', '${TEACHER_ID}', 'connected', 0, 'homologation');
  `);
  return new SqliteD1(db);
}

function authorizer(runtimeValue: SqliteD1): D1BancoNotasAddinAuthorizer {
  return new D1BancoNotasAddinAuthorizer(runtimeValue as unknown as D1Database);
}

describe('Banco de Notas add-in ownership authorization', () => {
  it('accepts only the Entra oid bound to the active teacher model', async () => {
    const current = runtime();
    await expect(
      authorizer(current).assertTeacherModelOwner({
        teacherModelId: MODEL_ID,
        entraObjectId: OWNER_OID.toUpperCase(),
      }),
    ).resolves.toBeUndefined();
    current.database.close();
  });

  it('rejects a valid tenant identity that owns a different model', async () => {
    const current = runtime();
    await expect(
      authorizer(current).assertTeacherModelOwner({
        teacherModelId: MODEL_ID,
        entraObjectId: OTHER_OID,
      }),
    ).rejects.toMatchObject({
      message: 'teacher_model_not_owned',
      status: 403,
    });
    current.database.close();
  });

  it('fails closed when the teacher has no Entra identity', async () => {
    const current = runtime(null);
    await expect(
      authorizer(current).assertTeacherModelOwner({
        teacherModelId: MODEL_ID,
        entraObjectId: OWNER_OID,
      }),
    ).rejects.toThrow('teacher_entra_identity_missing');
    current.database.close();
  });

  it('fails closed for inactive teachers and unknown models', async () => {
    const current = runtime(OWNER_OID, 'inactive');
    const check = authorizer(current);
    await expect(
      check.assertTeacherModelOwner({
        teacherModelId: MODEL_ID,
        entraObjectId: OWNER_OID,
      }),
    ).rejects.toThrow('teacher_identity_inactive');
    await expect(
      check.assertTeacherModelOwner({
        teacherModelId: '44444444-4444-4444-8444-444444444444',
        entraObjectId: OWNER_OID,
      }),
    ).rejects.toThrow('teacher_model_not_owned');
    current.database.close();
  });
});
