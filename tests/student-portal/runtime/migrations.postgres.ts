import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { provePortalHyperdriveV1 } from '../../../server/student-portal/runtime/hyperdrive-proof-v1';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withPortalPersistenceV1 } from '../../../server/student-portal/runtime/database-v1';
import {
  createStudentPortalPostgresPersistenceV1,
  type StudentPortalPostgresSqlV1,
} from '../../../server/student-portal/persistence/postgres-persistence-v1';

// This suite intentionally requires a fresh, disposable local database.
const target = new URL(process.env.PORTAL_TEST_DATABASE_URL ?? 'http://missing.invalid');
if (target.protocol !== 'postgres:' || target.hostname !== '127.0.0.1' || target.pathname !== '/portal705_test') {
  throw new Error('Set PORTAL_TEST_DATABASE_URL to the disposable local portal705_test database.');
}
const admin = postgres(target.toString(), { max: 1, onnotice: () => undefined });
const clients: ReturnType<typeof postgres>[] = [admin];
function asRole(username: string) {
  const connection = new URL(target);
  connection.username = username;
  const sql = postgres(connection.toString(), { max: 1, onnotice: () => undefined });
  clients.push(sql);
  return sql;
}
const portal = asRole('student_portal_app');
const gradebook = asRole('gradebook_app');
const anonymous = asRole('anon');
const authenticated = asRole('authenticated');
const migrator = asRole('portal_migration_admin');
const persistence = createStudentPortalPostgresPersistenceV1(portal as unknown as StudentPortalPostgresSqlV1);
const ACCOUNT = '11111111-1111-4111-8111-111111111111';

beforeAll(async () => {
  const existing = await admin`SELECT to_regnamespace('student_portal') IS NOT NULL AS present`;
  if (existing[0]?.present) throw new Error('Disposable database must be fresh; refusing to overwrite it.');
  await admin.unsafe(readFileSync('migrations/gradebook-simplified/0001_current_schema.sql', 'utf8'));
  await admin.unsafe(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gradebook_app') THEN
      CREATE ROLE gradebook_app LOGIN NOSUPERUSER NOBYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon LOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated LOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='portal_migration_admin') THEN
      CREATE ROLE portal_migration_admin LOGIN CREATEROLE NOSUPERUSER NOBYPASSRLS;
    END IF;
  END $$;`);
  for (const name of [
    'application_role_grants.sql', '0003_council_session_v3.sql',
    '0004_council_v3_least_privilege.sql', '0005_relational_bulletin_snapshot_v2.sql',
    '0006_import_diagnostic_treatment_v1.sql', '0007_multiyear_rr_v1.sql', '0008_year_reset_acl_v1.sql',
  ]) await admin.unsafe(readFileSync(`migrations/gradebook-simplified/${name}`, 'utf8'));
  await admin.unsafe(`
    GRANT CREATE ON DATABASE portal705_test TO portal_migration_admin;
    GRANT USAGE ON SCHEMA gradebook TO portal_migration_admin;
    GRANT SELECT, REFERENCES ON ALL TABLES IN SCHEMA gradebook TO portal_migration_admin;
  `);
  for (const name of [
    '0001_identity_credentials_acl_v1.sql', '0002_policy_publication_revision_v1.sql',
    '0003_audit_receipts_closure_integration_v1.sql', '0004_gradebook_integration_usage_v1.sql',
  ]) await migrator.unsafe(readFileSync(`migrations/student-portal/${name}`, 'utf8'));
  await admin.unsafe(`
    INSERT INTO gradebook.ano_letivo (ano,minimo_aprovacao,max_componentes_conselho) VALUES (2026,60000,2);
    INSERT INTO gradebook.aluno (id,ano,nome) VALUES (1,2026,'SYNTHETIC PORTAL TEST');
    INSERT INTO gradebook.ano_letivo (ano,minimo_aprovacao,max_componentes_conselho) VALUES (2025,60000,2),(2024,60000,2);
  `);
  await migrator.unsafe(readFileSync('migrations/student-portal/0005_year_reset_protocol_v1.sql', 'utf8'));
});

afterAll(async () => { await Promise.all(clients.map((sql) => sql.end({ timeout: 1 }))); });

describe('native PostgreSQL migrations and runtime role isolation', () => {
  it('runs the synthetic deployment proof and removes its committed row', async () => {
    const connection = new URL(target);
    connection.username = 'student_portal_app';
    expect(await provePortalHyperdriveV1({ connectionString: connection.toString() }, '11111111111111111111111111111111')).toBe(true);
    expect((await admin`SELECT count(*)::int AS n FROM student_portal.setting
      WHERE scope_key='runtime-705-11111111111111111111111111111111'`)[0]?.n).toBe(0);
    expect(await provePortalHyperdriveV1({ connectionString: target.toString() }, '22222222222222222222222222222222')).toBe(false);
  });
  it('connects as the dedicated role and commits through the actual postgres.js adapter', async () => {
    expect((await portal`SELECT current_user AS role`)[0]?.role).toBe('student_portal_app');
    expect(await persistence.transaction((tx) => tx.insertAccount({
      id: ACCOUNT, link: { academicYear: 2026, studentId: 1 }, state: 'pending-activation',
      eligibility: 'eligible', blocked: false, version: 0, securityVersion: 0, pinVersion: 0, closedAt: null,
    }))).toBe('created');
    expect(await persistence.transaction((tx) => tx.findByLink({ academicYear: 2026, studentId: 1 })))
      .toMatchObject({ id: ACCOUNT, version: 0 });
  });

  it('rolls back failed work on the real connection', async () => {
    await expect(portal.begin(async (tx) => {
      await tx`UPDATE student_portal.account SET blocked=true WHERE id=${ACCOUNT}`;
      throw new Error('synthetic-rollback');
    })).rejects.toThrow('synthetic-rollback');
    expect((await portal`SELECT blocked FROM student_portal.account WHERE id=${ACCOUNT}`)[0]?.blocked).toBe(false);
  });

  it('denies academic tables and DDL while allowing the narrow academic view', async () => {
    expect((await portal`SELECT count(*)::int AS count FROM student_portal.academic_student_v1`)[0]?.count).toBe(1);
    for (const query of [
      'SELECT * FROM gradebook.aluno LIMIT 0',
      'UPDATE gradebook.aluno SET nome=nome WHERE false',
      'CREATE TABLE student_portal.forbidden_test(id integer)',
      'CREATE ROLE forbidden_portal_test',
    ]) await expect(portal.unsafe(query)).rejects.toMatchObject({ code: '42501' });
  });

  it('denies both API roles the private schema and privileged functions', async () => {
    for (const sql of [anonymous, authenticated]) {
      await expect(sql`SELECT * FROM student_portal.account LIMIT 0`).rejects.toMatchObject({ code: '42501' });
      await expect(sql`SELECT * FROM student_portal.inspect_year_reset_guard_v1(2026::smallint)`)
        .rejects.toMatchObject({ code: '42501' });
    }
  });

  it('grants ADM only the narrow guard and denies Portal table access', async () => {
    expect((await gradebook`SELECT * FROM student_portal.inspect_year_reset_guard_v1(2026::smallint)`)[0])
      .toMatchObject({ linked_count: '1', state: 'portal-linked-accounts' });
    await expect(gradebook`SELECT * FROM student_portal.account LIMIT 0`).rejects.toMatchObject({ code: '42501' });
    await expect(gradebook`DELETE FROM student_portal.account WHERE false`).rejects.toMatchObject({ code: '42501' });
  });

  it('keeps the academic foreign key restrictive with a linked account', async () => {
    await expect(admin`DELETE FROM gradebook.aluno WHERE id=1 AND ano=2026`).rejects.toMatchObject({
      code: expect.stringMatching(/^(23503|23001)$/),
      constraint_name: 'student_portal_account_gradebook_fk_v1',
    });
  });

  it('uses the bounded runtime connection and closes it after reading', async () => {
    const connection = new URL(target);
    connection.username = 'student_portal_app';
    expect(await withPortalPersistenceV1({ connectionString: connection.toString() }, (port) =>
      port.transaction((tx) => tx.findAccount(ACCOUNT)),
    )).toMatchObject({ id: ACCOUNT, blocked: false });
    expect((await admin`SELECT count(*)::int AS count FROM pg_stat_activity
      WHERE application_name='student-portal-v1'`)[0]?.count).toBe(0);
  });

  it('refuses a privileged connection before calling the application', async () => {
    let called = false;
    await expect(withPortalPersistenceV1({ connectionString: target.toString() }, async () => {
      called = true;
    })).rejects.toThrow('student-portal-database-unavailable');
    expect(called).toBe(false);
  });

  it('bounds lock waits and closes the failed runtime connection', async () => {
    const connection = new URL(target);
    connection.username = 'student_portal_app';
    await admin.begin(async (held) => {
      await held`SELECT id FROM student_portal.account WHERE id=${ACCOUNT} FOR UPDATE`;
      const started = Date.now();
      await expect(withPortalPersistenceV1({ connectionString: connection.toString() }, (port) =>
        port.transaction((tx) => tx.lockAccounts([ACCOUNT])),
      )).rejects.toThrow('student-portal-database-unavailable');
      expect(Date.now() - started).toBeLessThan(5000);
    });
    expect((await admin`SELECT count(*)::int AS count FROM pg_stat_activity
      WHERE application_name='student-portal-v1'`)[0]?.count).toBe(0);
  });
});

const actorDigest = 'a'.repeat(64);
const proofDigest = (index: number) => index.toString(16).padStart(64, '0');
async function lockedProof(
  operation: 'prepare' | 'consume',
  index: number,
  year = 2025,
  actor = actorDigest,
) {
  return gradebook.begin(async (tx) => {
    await tx.unsafe(operation === 'consume'
      ? 'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE'
      : 'SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await tx.unsafe(operation === 'consume'
      ? 'SELECT pg_advisory_xact_lock(613,0)'
      : 'SELECT pg_advisory_xact_lock_shared(613,0)');
    await tx`SELECT pg_advisory_xact_lock(613,${year})`;
    const result = await tx.unsafe(
      `SELECT student_portal.${operation}_year_reset_v1($1::smallint,$2,$3) AS state`,
      [year, actor, proofDigest(index)],
    );
    return result[0]?.state;
  });
}

describe('native private reset proof support #706', () => {
  it('requires the caller lock protocol and denies public/Portal roles and direct ADM table access', async () => {
    await expect(gradebook`SELECT student_portal.prepare_year_reset_v1(2025::smallint,${actorDigest},${proofDigest(1)})`)
      .rejects.toMatchObject({ code: '55000' });
    for (const sql of [portal, anonymous, authenticated]) {
      await expect(sql`SELECT student_portal.prepare_year_reset_v1(2025::smallint,${actorDigest},${proofDigest(1)})`)
        .rejects.toMatchObject({ code: '42501' });
    }
    await expect(gradebook`SELECT * FROM student_portal.year_reset_preview_proof LIMIT 0`)
      .rejects.toMatchObject({ code: '42501' });
  });

  it('blocks pending and blocked accounts regardless of sessions or eligibility', async () => {
    expect(await lockedProof('prepare', 2, 2026)).toBe('portal-linked-accounts');
    await portal`UPDATE student_portal.account SET blocked=true WHERE id=${ACCOUNT}`;
    try {
      expect(await lockedProof('prepare', 3, 2026)).toBe('portal-linked-accounts');
      expect(await lockedProof('consume', 3, 2026)).toBe('portal-linked-accounts');
    } finally {
      await portal`UPDATE student_portal.account SET blocked=false WHERE id=${ACCOUNT}`;
    }
  });

  it('supports a BN year without Portal accounts and issues a server-bounded proof', async () => {
    expect(await lockedProof('prepare', 4)).toBe('clear');
    const rows = await admin`SELECT academic_year,actor_digest,consumed_at,
      extract(epoch FROM expires_at-issued_at)::int AS seconds
      FROM student_portal.year_reset_preview_proof WHERE token_digest=${proofDigest(4)}`;
    expect(rows[0]).toMatchObject({ academic_year: 2025, actor_digest: actorDigest, consumed_at: null, seconds: 300 });
  });

  it('refuses another actor, year and unknown token without consuming the valid proof', async () => {
    expect(await lockedProof('consume', 4, 2025, 'b'.repeat(64))).toBe('preview-changed');
    expect(await lockedProof('consume', 4, 2024)).toBe('preview-changed');
    expect(await lockedProof('consume', 999)).toBe('preview-changed');
    expect((await admin`SELECT consumed_at FROM student_portal.year_reset_preview_proof WHERE token_digest=${proofDigest(4)}`)[0]?.consumed_at).toBeNull();
  });

  it('rejects same-count state changes, expiry and token replay', async () => {
    expect(await lockedProof('prepare', 5)).toBe('clear');
    await admin`UPDATE student_portal.academic_revision SET reset_counter=reset_counter+1 WHERE academic_year=2025`;
    expect(await lockedProof('consume', 5)).toBe('preview-changed');
    expect(await lockedProof('prepare', 6)).toBe('clear');
    await admin`UPDATE student_portal.year_reset_preview_proof
      SET issued_at=statement_timestamp()-interval '10 minutes',expires_at=statement_timestamp()-interval '5 minutes'
      WHERE token_digest=${proofDigest(6)}`;
    expect(await lockedProof('consume', 6)).toBe('preview-changed');
    expect(await lockedProof('prepare', 7)).toBe('clear');
    expect(await lockedProof('consume', 7)).toBe('clear');
    expect(await lockedProof('consume', 7)).toBe('preview-changed');
  });

  it('rolls back proof consumption with a failed physical transaction', async () => {
    expect(await lockedProof('prepare', 8)).toBe('clear');
    await expect(gradebook.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(613,0)`;
      await tx`SELECT pg_advisory_xact_lock(613,2025)`;
      expect((await tx`SELECT student_portal.consume_year_reset_v1(2025::smallint,${actorDigest},${proofDigest(8)}) AS state`)[0]?.state).toBe('clear');
      throw new Error('synthetic-reset-failure');
    })).rejects.toThrow('synthetic-reset-failure');
    expect((await admin`SELECT consumed_at,consumed_transaction FROM student_portal.year_reset_preview_proof WHERE token_digest=${proofDigest(8)}`)[0])
      .toMatchObject({ consumed_at: null, consumed_transaction: null });
  });

  it('requires deletion and consumption in the same transaction before rotating durable generations', async () => {
    expect(await lockedProof('prepare', 9, 2024)).toBe('clear');
    const before = (await admin`SELECT academic_generation FROM student_portal.academic_revision WHERE academic_year=2024`)[0]?.academic_generation;
    await gradebook.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(613,0)`;
      await tx`SELECT pg_advisory_xact_lock(613,2024)`;
      expect((await tx`SELECT student_portal.consume_year_reset_v1(2024::smallint,${actorDigest},${proofDigest(9)}) AS state`)[0]?.state).toBe('clear');
      await tx`DELETE FROM gradebook.ano_letivo WHERE ano=2024`;
      await tx`SELECT student_portal.complete_year_reset_v1(2024::smallint,${actorDigest},${proofDigest(9)})`;
    });
    const after = (await admin`SELECT academic_generation,academic_counter FROM student_portal.academic_revision WHERE academic_year=2024`)[0];
    expect(after?.academic_generation).not.toBe(before);
    expect(String(after?.academic_counter)).toBe('1');
    await expect(gradebook.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(613,0)`;
      await tx`SELECT pg_advisory_xact_lock(613,2024)`;
      await tx`SELECT student_portal.complete_year_reset_v1(2024::smallint,${actorDigest},${proofDigest(9)})`;
    })).rejects.toMatchObject({ code: '55000' });
    expect((await admin`SELECT count(*)::int AS n FROM gradebook.ano_letivo WHERE ano IN (2025,2026)`)[0]?.n).toBe(2);
  });

  it('rejects completion while the year exists without consuming a new proof', async () => {
    expect(await lockedProof('prepare', 10)).toBe('clear');
    await expect(gradebook.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(613,0)`;
      await tx`SELECT pg_advisory_xact_lock(613,2025)`;
      await tx`SELECT student_portal.consume_year_reset_v1(2025::smallint,${actorDigest},${proofDigest(10)})`;
      await tx`SELECT student_portal.complete_year_reset_v1(2025::smallint,${actorDigest},${proofDigest(10)})`;
    })).rejects.toMatchObject({ code: '55000' });
    expect((await admin`SELECT consumed_at FROM student_portal.year_reset_preview_proof WHERE token_digest=${proofDigest(10)}`)[0]?.consumed_at).toBeNull();
  });

  it('aborts an old serializable snapshot after waiting for a real concurrent writer', async () => {
    expect(await lockedProof('prepare', 11)).toBe('clear');
    const observer = asRole('portal_test_admin');
    const contender = asRole('gradebook_app');
    const pid = (await contender`SELECT pg_backend_pid() AS pid`)[0]?.pid as number;
    let outcome: Promise<string | undefined> | undefined;
    await admin.begin(async (held) => {
      await held`SELECT pg_advisory_xact_lock_shared(613,0)`;
      await held`SELECT pg_advisory_xact_lock(613,2025)`;
      outcome = contender.begin(async (tx) => {
        await tx`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`;
        await tx`SET LOCAL lock_timeout='3s'`;
        await tx`SELECT pg_advisory_xact_lock(613,0)`;
        await tx`SELECT pg_advisory_xact_lock(613,2025)`;
        await tx`SELECT student_portal.consume_year_reset_v1(2025::smallint,${actorDigest},${proofDigest(11)})`;
        return undefined;
      }).catch((error: unknown) => (error as { code?: string }).code);
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        waiting = (await observer`SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=${pid}`)[0]?.waiting === true;
        if (waiting) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await held`UPDATE student_portal.academic_revision SET reset_counter=reset_counter+1 WHERE academic_year=2025`;
    });
    expect(await outcome).toBe('40001');
    expect(await lockedProof('consume', 11)).toBe('preview-changed');
  });
});
