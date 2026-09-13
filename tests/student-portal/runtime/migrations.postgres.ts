import { PortalAdminApiV1 } from '../../../server/student-portal/admin/api-v1';
import { PublicationServiceV1 } from '../../../server/student-portal/publication/publication-service-v1';
import { SelfProjectionReaderV1 } from '../../../server/student-portal/publication/self-projection-reader-v1';
import { PublicationJobsV1 } from '../../../server/student-portal/jobs/publication-jobs-v1';
import { SYNTHETIC_SELF_V1 } from '../../../shared/student-portal-contracts/fixtures-v1';
import { AuthServiceV1 } from '../../../server/student-portal/auth/auth-service-v1';
import { QrServiceV1 } from '../../../server/student-portal/auth/qr-service-v1';
import { SessionServiceV1 } from '../../../server/student-portal/auth/session-service-v1';
import { PortalCryptoV1 } from '../../../server/student-portal/crypto/crypto-v1';
import { AcademicStudentReaderPostgresV1, ACADEMIC_STUDENT_QUERY_V1 } from '../../../server/student-portal/academic/academic-reader-v1';
import { ACADEMIC_FIXTURE_SQL_V1 } from '../academic/academic-fixture-v1';
import { BirthYearServiceV1 } from '../../../server/student-portal/birth-year/birth-year-service-v1';
import type { CryptoPortV1 } from '../../../shared/student-portal-contracts/ports-v1';
import { createGradebookRelationalImportServiceV11 } from '../../../server/gradebook/application/import/import-relational-service-v11';
import { replaceGradebookImportDiagnosticsSnapshotV1 } from '../../../server/gradebook/application/import/import-diagnostics-snapshot-v1';
import { createYearResetServiceV1 } from '../../../server/gradebook/application/settings/year-reset-v1';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import {
  createGradebookPostgresDatabaseFromSqlV1,
  type GradebookPostgresSqlV1,
} from '../../../server/gradebook/persistence/postgres/postgres-database-v1';
import {
  lockYearResetV1,
  newYearResetTokenV1,
  yearResetDigestV1,
  yearResetProofV1,
} from '../../../server/student-portal/integration/year-reset/proof-v1';
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

describe('reset proof through the application PostgreSQL facade', () => {
  it('persists only the digest and rejects a different authenticated actor', async () => {
    const database = createGradebookPostgresDatabaseFromSqlV1(
      gradebook as unknown as GradebookPostgresSqlV1,
    );
    const token = newYearResetTokenV1();
    expect(token).toMatch(/^[a-f0-9]{64}$/u);
    expect(newYearResetTokenV1()).not.toBe(token);
    const digest = await yearResetDigestV1(token);
    const actor = await yearResetDigestV1('synthetic-operator-one');
    await database.transaction(async (tx) => {
      await tx.exec('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await lockYearResetV1(tx, 2025, 'preview');
      expect(await yearResetProofV1(tx, 'prepare', 2025, actor, digest)).toBe('clear');
    });
    expect(
      (
        await admin`SELECT token_digest FROM student_portal.year_reset_preview_proof WHERE token_digest=${digest}`
      )[0]?.token_digest,
    ).toBe(digest);
    expect(
      (
        await admin`SELECT count(*)::integer AS n FROM student_portal.year_reset_preview_proof WHERE token_digest=${token}`
      )[0]?.n,
    ).toBe(0);
    await database.transaction(async (tx) => {
      await tx.exec('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
      await lockYearResetV1(tx, 2025, 'execute');
      expect(
        await yearResetProofV1(
          tx,
          'consume',
          2025,
          await yearResetDigestV1('synthetic-operator-two'),
          digest,
        ),
      ).toBe('preview-changed');
    });
    await expect(
      database.transaction(async (tx) => {
        await tx.exec('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
        await lockYearResetV1(tx, 2025, 'execute');
        expect(await yearResetProofV1(tx, 'consume', 2025, actor, digest)).toBe('clear');
        throw new Error('synthetic-adapter-rollback');
      }),
    ).rejects.toThrow('synthetic-adapter-rollback');
    expect(
      (
        await admin`SELECT consumed_at FROM student_portal.year_reset_preview_proof WHERE token_digest=${digest}`
      )[0]?.consumed_at,
    ).toBeNull();
  });
});

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
  await migrator.unsafe(readFileSync('migrations/student-portal/0006_gradebook_revision_year_range_v1.sql', 'utf8'));
  await migrator.unsafe(readFileSync('migrations/student-portal/0007_lifecycle_integration_v1.sql', 'utf8'));
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

  it('stores verifier and projection JSON objects through postgres.js without double encoding', async () => {
    const verifier={algorithm:'synthetic-kdf',parameters:{cost:1},salt:'synthetic-salt',pepperVersion:1,digest:'synthetic-digest'};
    await persistence.transaction(async(tx)=>{
      await tx.saveCredentials({accountId:ACCOUNT,credentialId:'s'.repeat(32),keyVersion:1,state:'active',pin:verifier,password:verifier,pinVersion:0});
      expect(await tx.swapProjection(ACCOUNT,{...SYNTHETIC_SELF_V1,profile:{...SYNTHETIC_SELF_V1.profile,link:{academicYear:2026,studentId:1}}},SYNTHETIC_SELF_V1.revisions)).toBe(true);
    });
    expect((await portal`SELECT jsonb_typeof(pin_verifier) AS kind FROM student_portal.password_credential WHERE account_id=${ACCOUNT}`)[0]?.kind).toBe('object');
    expect((await portal`SELECT jsonb_typeof(payload_json) AS kind FROM student_portal.published_projection WHERE account_id=${ACCOUNT}`)[0]?.kind).toBe('object');
    expect(await persistence.transaction((tx)=>tx.readCredentials(ACCOUNT))).toMatchObject({pin:verifier,password:verifier});
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


describe('native application reset service', () => {
  it('blocks a linked account and atomically resets only a synthetic empty year', async () => {
    const database = createGradebookPostgresDatabaseFromSqlV1(gradebook as unknown as GradebookPostgresSqlV1);
    const service = createYearResetServiceV1(database, '44444444-4444-4444-8444-444444444444');
    expect(await service.execute({ contractVersion: 1, operation: 'preview', year: 2026 }))
      .toEqual({ contractVersion: 1, state: 'portal-linked-accounts' });
    await admin`INSERT INTO gradebook.ano_letivo VALUES (2023,60000,2)`;
    await gradebook.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock_shared(613,0)`;
      await tx`SELECT pg_advisory_xact_lock(613,2023)`;
      await tx`SELECT student_portal.ensure_year_coordination_v1(2023::smallint)`;
    });
    const preview = await service.execute({ contractVersion: 1, operation: 'preview', year: 2023 });
    if (preview.state !== 'ready' || preview.operation !== 'preview') throw new Error('synthetic-preview-failed');
    const command = { contractVersion: 1, operation: 'execute', year: 2023,
      previewRevision: preview.previewRevision, confirmationPhrase: preview.confirmationPhrase,
      understandsIrreversible: true };
    expect(await service.execute(command)).toEqual({ contractVersion: 1, state: 'ready',
      operation: 'execute', year: 2023, deletedRows: 1 });
    expect(await service.execute(command)).toEqual({ contractVersion: 1, state: 'preview-changed' });
    expect((await admin`SELECT count(*)::integer AS n FROM gradebook.ano_letivo WHERE ano=2023`)[0]?.n).toBe(0);
    expect((await admin`SELECT count(*)::integer AS n FROM gradebook.ano_letivo WHERE ano IN (2025,2026)`)[0]?.n).toBe(2);
    expect((await admin`SELECT count(*)::integer AS n FROM student_portal.account`)[0]?.n).toBe(1);
  });
});


describe('native auxiliary reset revisions', () => {
  it('moves current diagnostic evidence across years and keeps identical observations unchanged', async () => {
    const database = createGradebookPostgresDatabaseFromSqlV1(gradebook as unknown as GradebookPostgresSqlV1);
    const observation = (year:number) => ({ version: 1 as const, academicYear: year,
      fileName: 'synthetic-reset-diagnostics.xlsx', sha256: 'e'.repeat(64),
      diagnostics: [{ key: 'synthetic-finding', severity: 'warning' as const,
        code: 'source-unavailable' as const, message: 'Synthetic finding', recommendedAction: 'Check synthetic fixture', fieldKind: 'recovery' as const }] });
    expect(await replaceGradebookImportDiagnosticsSnapshotV1(database, observation(2021))).toBe(1);
    const before = await admin`SELECT reset_counter FROM student_portal.academic_revision WHERE academic_year=2021`;
    expect(await replaceGradebookImportDiagnosticsSnapshotV1(database, observation(2021))).toBe(0);
    expect(await admin`SELECT reset_counter FROM student_portal.academic_revision WHERE academic_year=2021`).toEqual(before);
    expect(await replaceGradebookImportDiagnosticsSnapshotV1(database, observation(2022))).toBe(2);
    expect((await admin`SELECT count(*)::integer AS n FROM gradebook.importacao_diagnostico WHERE ano=2021`)[0]?.n).toBe(0);
    expect((await admin`SELECT count(*)::integer AS n FROM gradebook.importacao_diagnostico WHERE ano=2022`)[0]?.n).toBe(1);
    expect((await admin`SELECT count(*)::integer AS n FROM student_portal.revision_event WHERE academic_year IN (2021,2022) AND NOT affects_academic`)[0]?.n).toBe(3);
  });
});


describe('native import reset revisions', () => {
  it('commits buffered writes before one revision and does not revise an identical import', async () => {
    await admin`SELECT setval(pg_get_serial_sequence('gradebook.aluno','id'),100)`;
    const queries:string[] = [];
    let failRevision = false;
    const database = createGradebookPostgresDatabaseFromSqlV1({
      unsafe: () => { throw new Error('outside-import-transaction'); },
      begin: (operation) => gradebook.begin(async (tx) => operation({
        typed: (value,oid) => tx.typed(value,oid),
        async unsafe(query,parameters=[]) {
          queries.push(query);
          if(failRevision && query.includes('record_gradebook_change_v1')) throw new Error('synthetic-finalizer-failure');
          return tx.unsafe(query,[...parameters] as never[]);
        },
      })) as ReturnType<GradebookPostgresSqlV1['begin']>,
    } as GradebookPostgresSqlV1);
    const service = createGradebookRelationalImportServiceV11(database);
    const manifest = { fileName:'synthetic-reset-import.xlsx',sha256:'f'.repeat(64),parserVersion:'synthetic-v1' };
    expect(await service.execute({ transportVersion:9, operation:'persist-relacao', manifest, ano:2020,
      turmas:[{codigo:'T20',nome:'SYNTHETIC CLASS',etapa:6,turno:'MATUTINO',alunos:[[1,'SYNTHETIC IMPORT STUDENT',0]]}] }))
      .toMatchObject({state:'applied'});
    const term = (trimestre: 1 | 2 | 3) => ({trimestre, instrumentos:[[1,10000,'SYNTHETIC ASSESSMENT']] as const,alunos:[[1,[3000],3000]] as const});
    const notes = { transportVersion:9 as const, operation:'persist-notas' as const, manifest, ano:2020,professor:'SYNTHETIC TEACHER',
      ofertas:[{turmaCodigo:'T20',disciplina:'SYNTHETIC SUBJECT',trimestres:[term(1),term(2),term(3)] as const,recuperacao:[]}] };
    queries.length=0;
    expect(await service.execute(notes)).toMatchObject({state:'applied'});
    const eventIndex=queries.findIndex((query)=>query.includes('record_gradebook_change_v1'));
    const bufferIndexes=queries.flatMap((query,index)=>query.includes('jsonb_to_recordset')?[index]:[]);
    expect(bufferIndexes.length).toBeGreaterThan(0);
    expect(bufferIndexes.every((index)=>index<eventIndex)).toBe(true);
    expect(queries.filter((query)=>query.includes('record_gradebook_change_v1'))).toHaveLength(1);
    const before=await admin`SELECT reset_counter FROM student_portal.academic_revision WHERE academic_year=2020`;
    expect(await service.execute(notes)).toMatchObject({state:'no-changes'});
    expect(await admin`SELECT reset_counter FROM student_portal.academic_revision WHERE academic_year=2020`).toEqual(before);
    failRevision=true;
    const changed={...notes,ofertas:[{...notes.ofertas[0]!,trimestres:[
      {...term(1),alunos:[[1,[4000],4000]] as const},term(2),term(3)] as const}]};
    await expect(service.execute(changed)).rejects.toThrow('synthetic-finalizer-failure');
    failRevision=false;
    expect(await admin`SELECT reset_counter FROM student_portal.academic_revision WHERE academic_year=2020`).toEqual(before);
    expect((await admin`SELECT count(*)::integer AS n FROM gradebook.nota n JOIN gradebook.instrumento i ON i.id=n.instrumento_id JOIN gradebook.oferta o ON o.id=i.oferta_id WHERE o.ano=2020 AND n.valor<>3000`)[0]?.n).toBe(0);

  });
});


describe('native service contention with live Portal links', () => {
  it('retries after link creation or closure commits during its wait, without deleting academic data', async () => {
    await portal`UPDATE student_portal.account SET gradebook_student_id=NULL,closed_at=clock_timestamp(),eligibility='unlinked' WHERE id=${ACCOUNT}`;
    const writer=asRole('student_portal_app');
    const contender=asRole('gradebook_app');
    const database=createGradebookPostgresDatabaseFromSqlV1(contender as unknown as GradebookPostgresSqlV1);
    const service=createYearResetServiceV1(database,'55555555-5555-4555-8555-555555555555');
    const preview=await service.execute({contractVersion:1,operation:'preview',year:2026});
    if(preview.state!=='ready'||preview.operation!=='preview') throw new Error('preview-missing');
    const command={contractVersion:1,operation:'execute',year:2026,previewRevision:preview.previewRevision,
      confirmationPhrase:preview.confirmationPhrase,understandsIrreversible:true};
    const pid=(await contender`SELECT pg_backend_pid() AS pid`)[0]!.pid;
    const linked='66666666-6666-4666-8666-666666666666';
    for(const closing of [false,true]) {
      await writer.unsafe('BEGIN');
      let pending:ReturnType<typeof service.execute>|undefined;
      try {
        await writer`SELECT pg_advisory_xact_lock_shared(613,0)`;
        await writer`SELECT pg_advisory_xact_lock(613,2026)`;
        if(closing) {
          await writer`UPDATE student_portal.account SET gradebook_student_id=NULL,closed_at=clock_timestamp(),eligibility='unlinked' WHERE id=${linked}`;
        } else {
          await writer`INSERT INTO student_portal.account(id,academic_year,gradebook_student_id,auth_state,eligibility,blocked)
            VALUES (${linked},2026,1,'pending-activation','eligible',true)`;
        }
        await writer`UPDATE student_portal.academic_revision SET reset_counter=reset_counter+1,portal_link_counter=portal_link_counter+1 WHERE academic_year=2026`;
        pending=service.execute(command);
        let waiting=false;
        for(let attempt=0;attempt<100;attempt++) {
          waiting=(await admin`SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=${pid}`)[0]?.waiting===true;
          if(waiting) break;
          await new Promise((resolve)=>setTimeout(resolve,10));
        }
        expect(waiting).toBe(true);
        await writer.unsafe('COMMIT');
        expect(await pending).toEqual({contractVersion:1,state:closing?'preview-changed':'portal-linked-accounts'});
      } finally {
        await writer.unsafe('ROLLBACK');
        await pending?.catch(()=>undefined);
      }
    }
    expect((await admin`SELECT count(*)::integer AS n FROM gradebook.aluno WHERE ano=2026`)[0]?.n).toBe(1);
    expect((await admin`SELECT count(*)::integer AS n FROM student_portal.account WHERE gradebook_student_id IS NOT NULL`)[0]?.n).toBe(0);
  });

  it('times out behind a different-year writer without consuming the preview', async () => {
    const writer=asRole('gradebook_app');
    const contender=asRole('gradebook_app');
    const service=createYearResetServiceV1(createGradebookPostgresDatabaseFromSqlV1(contender as unknown as GradebookPostgresSqlV1), '77777777-7777-4777-8777-777777777777');
    const preview=await service.execute({contractVersion:1,operation:'preview',year:2025});
    if(preview.state!=='ready'||preview.operation!=='preview') throw new Error('preview-missing');
    await contender.unsafe("SET lock_timeout='100ms'");
    await writer.unsafe('BEGIN');
    try {
      await writer`SELECT pg_advisory_xact_lock_shared(613,0)`;
      await writer`SELECT pg_advisory_xact_lock(613,2026)`;
      await expect(service.execute({contractVersion:1,operation:'execute',year:2025,
        previewRevision:preview.previewRevision,confirmationPhrase:preview.confirmationPhrase,understandsIrreversible:true}))
        .rejects.toMatchObject({code:'55P03'});
    } finally { await writer.unsafe('ROLLBACK'); }
    const digest=await yearResetDigestV1(preview.previewRevision);
    expect((await admin`SELECT consumed_at FROM student_portal.year_reset_preview_proof WHERE token_digest=${digest}`)[0]?.consumed_at).toBeNull();
    expect((await admin`SELECT count(*)::integer AS n FROM gradebook.ano_letivo WHERE ano=2025`)[0]?.n).toBe(1);
  });
});


describe('native diagnostic scope race', () => {
  it('restarts before deleting a newly discovered year instead of acquiring locks out of order', async () => {
    const connection=asRole('gradebook_app');
    const concurrent=asRole('gradebook_app');
    const other=createGradebookPostgresDatabaseFromSqlV1(concurrent as unknown as GradebookPostgresSqlV1);
    const observation=(year:number)=>({version:1 as const,academicYear:year,fileName:'synthetic-scope-race.xlsx',sha256:'9'.repeat(64),
      diagnostics:[{key:'synthetic-scope',severity:'warning' as const,code:'source-unavailable' as const,message:'Synthetic',recommendedAction:'Synthetic',fieldKind:'recovery' as const}]});
    let injected=false;
    let attempts=0;
    const database=createGradebookPostgresDatabaseFromSqlV1({
      unsafe:()=>{throw new Error('outside-transaction');},
      begin:(operation)=>{
        attempts++;
        return connection.begin(async(tx)=>operation({
          typed:(value,oid)=>tx.typed(value,oid),
          async unsafe(query,parameters=[]) {
            const result=await tx.unsafe(query,[...parameters] as never[]);
            if(!injected && query.includes('SELECT DISTINCT ano')) {
              injected=true;
              await replaceGradebookImportDiagnosticsSnapshotV1(other,observation(2028));
            }
            return result;
          },
        })) as ReturnType<GradebookPostgresSqlV1['begin']>;
      },
    } as GradebookPostgresSqlV1);
    expect(await replaceGradebookImportDiagnosticsSnapshotV1(database,observation(2027))).toBe(2);
    expect(attempts).toBe(2);
    expect((await admin`SELECT ano FROM gradebook.importacao_diagnostico WHERE hash=decode(repeat('9',64),'hex')`).map((row)=>row.ano)).toEqual([2027]);
    expect((await admin`SELECT count(*)::integer AS n FROM student_portal.revision_event WHERE academic_year IN (2027,2028)`)[0]?.n).toBe(3);
  });
});
import { LifecycleServiceV1 } from '../../../server/student-portal/integration/lifecycle/lifecycle-service-v1';
import { LinkClosureServiceV1 } from '../../../server/student-portal/integration/lifecycle/link-closure-v1';
import { AcademicEligibilityReaderPostgresV1 } from '../../../server/student-portal/integration/lifecycle/academic-eligibility-v1';

describe('native lifecycle transactions and least privilege', () => {
  it('serializes simultaneous initial synchronization to one account and refuses Gradebook gate escalation', async () => {
    await admin`INSERT INTO gradebook.turma(id,ano,codigo,nome,etapa,turno) VALUES (900010,2026,'S707','SYNTHETIC LIFECYCLE CLASS',6,'TESTE')`;
    await admin`INSERT INTO gradebook.aluno(id,ano,nome) VALUES (900020,2026,'SYNTHETIC LIFECYCLE STUDENT')`;
    await admin`INSERT INTO gradebook.vinculo(ano,turma_id,numero,aluno_id) VALUES (2026,900010,1,900020)`;
    await expect(gradebook`SELECT * FROM student_portal.synchronize_profiles_v1(true)`).rejects.toMatchObject({code:'42501'});
    await expect(gradebook`UPDATE student_portal.lifecycle_control SET population_enabled=true`).rejects.toMatchObject({code:'42501'});
    await expect(anonymous`SELECT * FROM student_portal.synchronize_gradebook_profiles_v1()`).rejects.toMatchObject({code:'42501'});
    expect((await gradebook`SELECT * FROM student_portal.synchronize_gradebook_profiles_v1()`)[0]?.created_count).toBe(0);
    await portal`UPDATE student_portal.lifecycle_control SET population_enabled=true`;
    const other=asRole('gradebook_app');
    const outcomes=await Promise.all([
      gradebook`SELECT * FROM student_portal.synchronize_gradebook_profiles_v1()`,
      other`SELECT * FROM student_portal.synchronize_gradebook_profiles_v1()`,
    ]);
    expect(outcomes.reduce((n,rows)=>n+Number(rows[0]?.created_count),0)).toBe(1);
    expect((await portal`SELECT count(*)::integer AS n FROM student_portal.account WHERE gradebook_student_id=900020`)[0]?.n).toBe(1);
  });

  it('waits behind the reset barrier before reading or creating links', async () => {
    const barrier=asRole('gradebook_app');
    const contender=asRole('student_portal_app');
    const lifecycle=new LifecycleServiceV1(contender as unknown as StudentPortalPostgresSqlV1);
    const pid=(await contender`SELECT pg_backend_pid() AS pid`)[0]!.pid;
    await barrier.unsafe('BEGIN');
    let pending:ReturnType<typeof lifecycle.synchronize>|undefined;
    try {
      await barrier`SELECT pg_advisory_xact_lock(613,0)`;
      await barrier`SELECT pg_advisory_xact_lock(613,2026)`;
      pending=lifecycle.synchronize({createProfiles:true});
      let waiting=false;
      for(let attempt=0;attempt<100;attempt++) {
        waiting=(await admin`SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=${pid}`)[0]?.waiting===true;
        if(waiting) break;
        await new Promise((resolve)=>setTimeout(resolve,10));
      }
      expect(waiting).toBe(true);
      await barrier.unsafe('COMMIT');
      expect(await pending).toMatchObject({created:0});
    } finally {
      await barrier.unsafe('ROLLBACK');
      await pending?.catch(()=>undefined);
    }
  });

  it('rolls back native V11 exit, revision and revocation after the lifecycle hook, then commits a safe retry', async () => {
    const account=(await portal`SELECT id,security_version FROM student_portal.account WHERE gradebook_student_id=900020`)[0]!;
    await portal`INSERT INTO student_portal.session(id,account_id,token_hash,security_version,expires_at,persistent)
      VALUES (gen_random_uuid(),${account.id},'synthetic-native-707-session',${account.security_version},now()+interval '1 day',false)`;
    let failAfterSync=true;
    const database=createGradebookPostgresDatabaseFromSqlV1({
      unsafe:()=>{throw new Error('outside-transaction');},
      begin:(operation)=>gradebook.begin(async(tx)=>operation({
        typed:(value,oid)=>tx.typed(value,oid),
        async unsafe(query,parameters=[]) {
          const result=await tx.unsafe(query,[...parameters] as never[]);
          if(failAfterSync && query.includes('synchronize_gradebook_profiles_v1')) throw new Error('synthetic-native-after-lifecycle');
          return result;
        },
      })) as ReturnType<GradebookPostgresSqlV1['begin']>,
    } as GradebookPostgresSqlV1);
    const service=createGradebookRelationalImportServiceV11(database);
    const request={transportVersion:9 as const,operation:'persist-relacao' as const,ano:2026,
      manifest:{fileName:'synthetic-707.xlsx',sha256:'7'.repeat(64),parserVersion:'synthetic-v1'},
      turmas:[{codigo:'S707',nome:'SYNTHETIC LIFECYCLE CLASS',etapa:6,turno:'TESTE',alunos:[[1,'SYNTHETIC LIFECYCLE STUDENT',3] as const]}]};
    const before=await portal`SELECT academic_counter,reset_counter FROM student_portal.academic_revision WHERE academic_year=2026`;
    await expect(service.execute(request)).rejects.toThrow('synthetic-native-after-lifecycle');
    expect(await portal`SELECT academic_counter,reset_counter FROM student_portal.academic_revision WHERE academic_year=2026`).toEqual(before);
    expect((await portal`SELECT revoked_at FROM student_portal.session WHERE token_hash='synthetic-native-707-session'`)[0]?.revoked_at).toBeNull();
    failAfterSync=false;
    expect(await service.execute(request)).toMatchObject({state:'applied'});
    expect((await portal`SELECT revoked_at IS NOT NULL AS revoked FROM student_portal.session WHERE token_hash='synthetic-native-707-session'`)[0]?.revoked).toBe(true);
    const eligibility=new AcademicEligibilityReaderPostgresV1(portal as unknown as StudentPortalPostgresSqlV1);
    expect(await eligibility.readCurrent({academicYear:2026,studentId:900020})).toMatchObject({state:'exit'});
  });

  it('rejects stale closure then commits a tombstone and cannot repopulate the closed identity', async () => {
    const actor='88888888-8888-4888-8888-888888888888';
    const closure=new LinkClosureServiceV1(portal as unknown as StudentPortalPostgresSqlV1);
    const stale=await closure.preview(actor);
    await portal`UPDATE student_portal.account SET version=version+1 WHERE gradebook_student_id=900020`;
    const command=(preview:typeof stale)=>({contractVersion:1,operation:'links-close',academicYear:2026,
      expectedVersion:preview.version,expectedCount:preview.count,previewToken:preview.previewToken,confirmed:true,idempotencyKey:crypto.randomUUID()});
    await expect(closure.execute(actor,command(stale))).rejects.toThrow('student-portal-link-preview-conflict');
    const current=await closure.preview(actor);
    expect(await closure.execute(actor,command(current))).toMatchObject({closed:1});
    expect((await gradebook`SELECT * FROM student_portal.synchronize_gradebook_profiles_v1()`)[0]?.created_count).toBe(0);
    expect((await portal`SELECT count(*)::integer AS n FROM student_portal.link_closure WHERE gradebook_student_id=900020`)[0]?.n).toBe(1);
    expect((await admin`SELECT count(*)::integer AS n FROM gradebook.aluno WHERE id=900020`)[0]?.n).toBe(1);
  });
});

import { PolicyServiceV1 } from '../../../server/student-portal/policies/policy-service-v1';

describe('native policy persistence and concurrency', () => {
  const school={kind:'school' as const,academicYear:2026 as const};
  const actor='99999999-9999-4999-8999-999999999999';
  const policy=new PolicyServiceV1(portal as unknown as StudentPortalPostgresSqlV1);

  it('persists complete defaults as JSON and serializes competing CAS commands on real connections', async () => {
    const initialized=await policy.initializeDefaults();
    expect(initialized.settings.version).toBe(1);
    expect((await portal`SELECT jsonb_typeof(value_json) AS value_kind,jsonb_typeof(source_scope_json) AS source_kind
      FROM student_portal.setting WHERE scope_key='school:2026' AND field_key='accessEnabled'`)[0])
      .toMatchObject({value_kind:'boolean',source_kind:'object'});
    const other=new PolicyServiceV1(asRole('student_portal_app') as unknown as StudentPortalPostgresSqlV1);
    const command=(value:Record<string,boolean>)=>({contractVersion:1,operation:'settings-set',scope:school,
      value,expectedVersion:1,acknowledgeImmediateEffect:true,idempotencyKey:crypto.randomUUID()});
    const commands=[command({accessEnabled:true}),command({showPartials:true})];
    const results=await Promise.allSettled([policy.mutate(actor,commands[0]),other.mutate(actor,commands[1])]);
    expect(results.filter((result)=>result.status==='fulfilled')).toHaveLength(1);
    const rejected=results.find((result)=>result.status==='rejected');
    expect(rejected?.status==='rejected' && rejected.reason.message).toBe('student-portal-policy-version-conflict');
    const winner=results.findIndex((result)=>result.status==='fulfilled');
    const won=results[winner]!;
    expect(await policy.mutate(actor,commands[winner])).toEqual(won.status==='fulfilled'?won.value:null);
    expect((await policy.read(school)).version).toBe(2);
  });

  it('rejects a stale account policy after a Gradebook class change commits', async () => {
    await admin`INSERT INTO gradebook.turma(id,ano,codigo,nome,etapa,turno) VALUES (900011,2026,'S708','SYNTHETIC POLICY NEXT CLASS',6,'TESTE')`;
    await admin`INSERT INTO gradebook.aluno(id,ano,nome) VALUES (900021,2026,'SYNTHETIC POLICY NATIVE STUDENT')`;
    await admin`INSERT INTO gradebook.vinculo(ano,turma_id,numero,aluno_id) VALUES (2026,900010,2,900021)`;
    await gradebook`SELECT * FROM student_portal.synchronize_gradebook_profiles_v1()`;
    const row=(await portal`SELECT id FROM student_portal.account WHERE gradebook_student_id=900021`)[0]!;
    const scope={kind:'account' as const,academicYear:2026 as const,accountId:String(row.id)};
    const before=await policy.readSnapshot(scope);
    await gradebook.begin(async(tx)=>{
      await tx`SELECT pg_advisory_xact_lock_shared(613,0)`;
      await tx`SELECT pg_advisory_xact_lock(613,2026)`;
      await tx`UPDATE gradebook.vinculo SET turma_id=900011 WHERE aluno_id=900021`;
      await tx`SELECT * FROM student_portal.synchronize_gradebook_profiles_v1()`;
    });
    const after=await policy.readSnapshot(scope);
    expect(after.classId).toBe(900011);
    expect(after.policyVersion).not.toBe(before.policyVersion);
    await expect(policy.mutate(actor,{contractVersion:1,operation:'settings-set',scope,value:{accessEnabled:false},
      expectedVersion:before.settings.version,acknowledgeImmediateEffect:true,idempotencyKey:crypto.randomUUID()}))
      .rejects.toThrow('student-portal-policy-version-conflict');
  });

  it('rolls back policy and command receipt with a failed publication composition', async () => {
    const before=await policy.readSnapshot(school);
    const key=crypto.randomUUID();
    await expect(portal.begin(async(tx)=>{
      await policy.mutateInTransaction(tx as unknown as StudentPortalPostgresSqlV1,actor,{contractVersion:1,
        operation:'settings-set',scope:school,value:{showFinalResult:true},expectedVersion:before.settings.version,
        acknowledgeImmediateEffect:true,idempotencyKey:key});
      throw new Error('synthetic-native-policy-publication-rollback');
    })).rejects.toThrow('synthetic-native-policy-publication-rollback');
    expect(await policy.readSnapshot(school)).toEqual(before);
    expect((await portal`SELECT count(*)::integer AS n FROM student_portal.operation_receipt WHERE idempotency_key=${key}`)[0]?.n).toBe(0);
  });
});

describe('native birth CAS and PIN invalidation', () => {
  const actor='77777777-7777-4777-8777-777777777777';
  const unused=()=>{throw new Error('synthetic-unused');};
  const cryptoPort:CryptoPortV1={randomToken:unused,hashOpaqueToken:unused,verifySecret:unused,signQr:unused,verifyQr:unused,
    async deriveVerifier(_secret,pepperVersion){return {algorithm:'synthetic-only',parameters:{},salt:crypto.randomUUID(),digest:crypto.randomUUID(),pepperVersion};}};
  const birth=new BirthYearServiceV1(portal as unknown as StudentPortalPostgresSqlV1,cryptoPort,1);
  let id:string;

  it('serializes competing account/field CAS on two real Portal connections', async()=>{
    await admin`INSERT INTO gradebook.aluno(id,ano,nome) VALUES (900022,2026,'SYNTHETIC NATIVE BIRTH STUDENT')`;
    await admin`INSERT INTO gradebook.vinculo(ano,turma_id,numero,aluno_id) VALUES (2026,900011,3,900022)`;
    await gradebook`SELECT * FROM student_portal.synchronize_gradebook_profiles_v1()`;
    id=String((await portal`SELECT id FROM student_portal.account WHERE gradebook_student_id=900022`)[0]!.id);
    const initial=(await birth.readClass(900011)).items.find((item)=>item.accountId===id)!;
    const make=(year:string)=>({contractVersion:1,operation:'birth-write',expectedVersion:initial.accountVersion,idempotencyKey:crypto.randomUUID(),
      item:{action:'set',accountId:id,expectedVersion:0,year,confirmation:'unconfirmed-test'}});
    const inputs=[make('2001'),make('2002')];
    const other=new BirthYearServiceV1(asRole('student_portal_app') as unknown as StudentPortalPostgresSqlV1,cryptoPort,1);
    const results=await Promise.allSettled([birth.write(actor,inputs[0]),other.write(actor,inputs[1])]);
    expect(results.filter((result)=>result.status==='fulfilled')).toHaveLength(1);
    const rejected=results.find((result)=>result.status==='rejected');
    expect(rejected?.status==='rejected' && rejected.reason.message).toBe('student-portal-birth-version-conflict');
    const winner=results.findIndex((result)=>result.status==='fulfilled');
    const won=results[winner]!;
    expect(await birth.write(actor,inputs[winner])).toEqual(won.status==='fulfilled'?won.value:null);
    expect((await portal`SELECT jsonb_typeof(pin_verifier) AS kind,pin_version::integer FROM student_portal.password_credential WHERE account_id=${id}`)[0])
      .toMatchObject({kind:'object',pin_version:1});
  });

  it('clears the PIN and consumes challenges while preserving active password and sessions', async()=>{
    const verifier={algorithm:'synthetic-only',parameters:{},salt:'synthetic-salt',digest:'synthetic-password-digest',pepperVersion:1};
    await portal`UPDATE student_portal.account SET auth_state='active' WHERE id=${id}`;
    await portal`UPDATE student_portal.password_credential SET password_verifier=${portal.json(verifier)} WHERE account_id=${id}`;
    await portal`INSERT INTO student_portal.auth_challenge(token_hash,account_id,security_version,pin_version,expires_at)
      VALUES (repeat('b',32),${id},0,1,now()+interval '5 minutes')`;
    await portal`INSERT INTO student_portal.session(id,account_id,token_hash,security_version,expires_at,persistent)
      VALUES (gen_random_uuid(),${id},repeat('n',32),0,now()+interval '1 day',true)`;
    const current=(await birth.readClass(900011)).items.find((item)=>item.accountId===id)!;
    await birth.write(actor,{contractVersion:1,operation:'birth-write',expectedVersion:current.accountVersion,idempotencyKey:crypto.randomUUID(),
      item:{action:'clear',accountId:id,expectedVersion:current.version}});
    expect((await portal`SELECT pin_verifier,password_verifier,pin_version::integer FROM student_portal.password_credential WHERE account_id=${id}`)[0])
      .toMatchObject({pin_verifier:null,password_verifier:verifier,pin_version:2});
    expect((await portal`SELECT count(*)::integer AS n FROM student_portal.auth_challenge WHERE account_id=${id} AND consumed_at IS NULL`)[0]?.n).toBe(0);
    expect((await portal`SELECT count(*)::integer AS n FROM student_portal.session WHERE account_id=${id} AND revoked_at IS NULL`)[0]?.n).toBe(1);
    expect((await portal`SELECT auth_state,security_version::integer FROM student_portal.account WHERE id=${id}`)[0])
      .toMatchObject({auth_state:'active',security_version:0});
  });
});

describe('native official academic reader and query plan', () => {
  const reader=new AcademicStudentReaderPostgresV1(portal as unknown as StudentPortalPostgresSqlV1);
  let revision:string;
  it('reads through only approved views with the production Portal role and preserves source facts', async()=>{
    await admin.unsafe(ACADEMIC_FIXTURE_SQL_V1);
    revision=String((await portal`SELECT academic_generation||':'||academic_counter::text AS revision FROM student_portal.academic_revision WHERE academic_year=2026`)[0]!.revision);
    const result=await reader.readOfficial({academicYear:2026,studentId:910001},revision);
    expect(result!.subjects.map((subject)=>subject.label)).toEqual(['PORTUGUES','MATEMATICA']);
    expect(result!.subjects[1]!.periods[0]!.final).toMatchObject({kind:'score',value:25,maximum:30});
    expect(result!.subjects[1]!.periods[1]!.final).toEqual({kind:'absent'});
    expect(result!.subjects[1]!.periods[2]!.final).toMatchObject({kind:'score',value:0});
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE TEACHER|ACADEMIC OTHER|officialAnnual|sourceAm|offerId/);
    expect(await reader.readOfficial({academicYear:2026,studentId:910001},`${'b'.repeat(32)}:999`)).toBeNull();
  });
  it('executes a bounded statement plan and rejects a fresh exit even before lifecycle jobs run', async()=>{
    const plan=await portal.unsafe(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${ACADEMIC_STUDENT_QUERY_V1}`,[2026,910001]);
    const report=plan[0]!['QUERY PLAN'][0];
    expect(report.Plan['Actual Rows']).toBe(1);
    expect(report['Execution Time']).toBeLessThan(5000);
    await admin`UPDATE gradebook.vinculo SET situacao=3 WHERE aluno_id=910001`;
    expect(await reader.readOfficial({academicYear:2026,studentId:910001},revision)).toBeNull();
  });
});

describe('native authentication locks with real scrypt and separate connections', () => {
  const actor = '88888888-8888-4888-8888-888888888888';
  const cryptography = new PortalCryptoV1(new Map([[1, new Uint8Array(32).fill(31)]]), new Map([[1, new Uint8Array(32).fill(32)]]));
  const connection = asRole('student_portal_app');
  const primary = portal as unknown as StudentPortalPostgresSqlV1;
  const secondary = connection as unknown as StudentPortalPostgresSqlV1;
  const auth = new AuthServiceV1(primary, cryptography, 1, { verify: async () => true });
  const other = new AuthServiceV1(secondary, cryptography, 1, { verify: async () => true });
  const qrService = new QrServiceV1(secondary, cryptography, 1);
  const sessions = new SessionServiceV1(primary, cryptography);
  const births = new BirthYearServiceV1(secondary, cryptography, 1);
  let number = 0;
  async function fixture() {
    const studentId = 920001 + number++;
    await admin`INSERT INTO gradebook.aluno(id,ano,nome) VALUES (${studentId},2026,'SYNTHETIC NATIVE AUTH')`;
    await admin`INSERT INTO gradebook.vinculo(ano,turma_id,numero,aluno_id) VALUES (2026,900011,${30 + number},${studentId})`;
    await gradebook`SELECT * FROM student_portal.synchronize_gradebook_profiles_v1()`;
    const accountId = String((await portal`SELECT id FROM student_portal.account WHERE gradebook_student_id=${studentId}`)[0]!.id);
    const scope = { kind: 'account', academicYear: 2026, accountId } as const;
    const policy = new PolicyServiceV1(primary);
    const current = await policy.read(scope);
    const clock = Math.floor(Date.now() / 1000) * 1000;
    await policy.mutate(actor, { contractVersion: 1, operation: 'settings-set', scope, expectedVersion: current.version,
      idempotencyKey: crypto.randomUUID(), acknowledgeImmediateEffect: true, value: { accessEnabled: true,
        calendar: { ...current.value.calendar, yearStartsAt: new Date(clock - 86400_000).toISOString(),
          yearEndsAt: new Date(clock + 60 * 86400_000).toISOString() } } });
    const version = async () => Number((await portal`SELECT version::text FROM student_portal.account WHERE id=${accountId}`)[0]!.version);
    const command = async (operation: string, extra: Record<string, unknown> = {}) => ({ contractVersion: 1, operation, accountId,
      expectedVersion: await version(), idempotencyKey: crypto.randomUUID(), ...extra });
    await births.write(actor, { contractVersion: 1, operation: 'birth-write', expectedVersion: await version(), idempotencyKey: crypto.randomUUID(),
      item: { action: 'set', accountId, expectedVersion: 0, year: '2001', confirmation: 'confirmed' } });
    const qr = (await qrService.command(actor, await command('qr-issue'))).qr!;
    const challenge = await auth.challenge({ contractVersion: 1, qr, pin: '2001' }, crypto.randomUUID());
    if (challenge.state !== 'password-creation') throw new Error('synthetic-native-challenge-failed');
    const activate = { contractVersion: 1, challenge: challenge.challenge, password: '123456', confirmation: '123456', keepConnected: false };
    return { accountId, scope, version, command, qr, activate };
  }

  it('only one concurrent activation commits its single-use proof and session', async () => {
    const fixtureData = await fixture();
    const results = await Promise.all([auth.activate(fixtureData.activate, crypto.randomUUID()), other.activate(fixtureData.activate, crypto.randomUUID())]);
    expect(results.filter((result) => 'token' in result)).toHaveLength(1);
    expect(results.filter((result) => 'state' in result && result.state === 'unauthenticated')).toHaveLength(1);
    expect((await portal`SELECT count(*)::integer AS n FROM student_portal.session WHERE account_id=${fixtureData.accountId}`)[0]?.n).toBe(1);
  });

  it('login racing with password reset, blocking or QR rotation cannot leave an authorized old session', async () => {
    for (const operation of ['password-reset', 'block', 'qr-regenerate']) {
      const data = await fixture();
      const initial = await auth.activate(data.activate, crypto.randomUUID());
      if (!('token' in initial)) throw new Error('synthetic-native-activation-failed');
      const command = await data.command(operation, { confirmed: true, ...(operation === 'block' ? { blocked: true } : {}) });
      const [login] = await Promise.all([
        auth.login({ contractVersion: 1, qr: data.qr, password: '123456', keepConnected: false }, crypto.randomUUID()),
        qrService.command(actor, command),
      ]);
      expect(await sessions.read(initial.token, crypto.randomUUID())).toBeNull();
      if ('token' in login) expect(await sessions.read(login.token, crypto.randomUUID())).toBeNull();
      if (operation === 'qr-regenerate') {
        const old = await auth.login({ contractVersion: 1, qr: data.qr, password: '123456', keepConnected: false }, crypto.randomUUID());
        expect(old).toMatchObject({ state: 'unauthenticated' });
      }
    }
  }, 30_000);

  it('birth correction wins over an outstanding proof while preserving login sessions on a different active account', async () => {
    const pending = await fixture();
    const birthCommand = { contractVersion: 1, operation: 'birth-write', expectedVersion: await pending.version(), idempotencyKey: crypto.randomUUID(),
      item: { action: 'set', accountId: pending.accountId, expectedVersion: 1, year: '2002', confirmation: 'confirmed' } };
    await births.write(actor, birthCommand);
    expect(await auth.activate(pending.activate, crypto.randomUUID())).toMatchObject({ state: 'unauthenticated' });
    const active = await fixture();
    const signed = await auth.activate(active.activate, crypto.randomUUID());
    if (!('token' in signed)) throw new Error('synthetic-native-activation-failed');
    const [login] = await Promise.all([
      auth.login({ contractVersion: 1, qr: active.qr, password: '123456', keepConnected: false }, crypto.randomUUID()),
      births.write(actor, { contractVersion: 1, operation: 'birth-write', expectedVersion: await active.version(), idempotencyKey: crypto.randomUUID(),
        item: { action: 'clear', accountId: active.accountId, expectedVersion: 1 } }),
    ]);
    expect(login).toHaveProperty('token');
    expect(await sessions.read(signed.token, crypto.randomUUID())).toMatchObject({ state: 'authenticated' });
    if ('token' in login) expect(await sessions.read(login.token, crypto.randomUUID())).toMatchObject({ state: 'authenticated' });
  });

  it('commits distributed failure counters without losing increments and revokes only the selected session', async () => {
    const data = await fixture();
    const signed = await auth.activate(data.activate, crypto.randomUUID());
    if (!('token' in signed)) throw new Error('synthetic-native-activation-failed');
    const bad = { contractVersion: 1, qr: data.qr, password: '000000', keepConnected: false };
    await Promise.all([auth.login(bad, crypto.randomUUID()), other.login(bad, crypto.randomUUID())]);
    expect((await portal`SELECT failures FROM student_portal.auth_attempt WHERE account_id=${data.accountId}`)[0]?.failures).toBe(2);
    const second = await auth.login({ ...bad, password: '123456' }, crypto.randomUUID());
    if (!('token' in second)) throw new Error('synthetic-native-login-failed');
    const hash = await cryptography.hashOpaqueToken(signed.token);
    const sessionId = String((await portal`SELECT id FROM student_portal.session WHERE token_hash=${hash}`)[0]!.id);
    const result = await sessions.revoke(actor, { contractVersion: 1, operation: 'sessions-revoke', scope: data.scope, sessionId,
      expectedVersion: (await sessions.readRevocationScope(data.scope)).version, confirmed: true, idempotencyKey: crypto.randomUUID() });
    expect(result.version).toBeGreaterThan(0);
    expect(await sessions.read(signed.token, crypto.randomUUID())).toBeNull();
    expect(await sessions.read(second.token, crypto.randomUUID())).toMatchObject({ state: 'authenticated' });
    const classScope = { kind: 'class', academicYear: 2026, classId: 900011 } as const;
    const scopeSnapshot = await sessions.readRevocationScope(classScope);
    await sessions.revoke(actor, { contractVersion: 1, operation: 'sessions-revoke', scope: classScope,
      expectedVersion: scopeSnapshot.version, confirmed: true, idempotencyKey: crypto.randomUUID() });
    expect(await sessions.read(second.token, crypto.randomUUID())).toBeNull();
  });
});


describe('native publication targets and competing job leases', () => {
  const actor = '99999999-9999-4999-8999-999999999999';
  const primary = portal as unknown as StudentPortalPostgresSqlV1;
  const secondary = asRole('student_portal_app') as unknown as StudentPortalPostgresSqlV1;
  const publications = new PublicationServiceV1(primary);
  const jobs = new PublicationJobsV1(primary);
  const other = new PublicationJobsV1(secondary);
  const reader = new SelfProjectionReaderV1(primary);
  const policy = new PolicyServiceV1(secondary);
  let accountId: string;
  const scope = () => ({ kind: 'account', academicYear: 2026, accountId } as const);
  async function command(operation = 'publish', period = 'T1') {
    const target = String((await portal`SELECT academic_generation||':'||academic_counter::text AS revision FROM student_portal.academic_revision WHERE academic_year=2026`)[0]!.revision);
    return { contractVersion: 1, operation, scope: scope(), period, expectedVersion: (await publications.read(scope())).version,
      idempotencyKey: crypto.randomUUID(), ...(operation === 'unpublish' ? { confirmed: true } : { targetDataVersion: target }) };
  }
  const self = () => reader.read(accountId, crypto.randomUUID());
  const t1 = async () => (await self())?.subjects.flatMap((subject) => subject.periods).filter((period) => period.period === 'T1');

  it('claims once across real connections and commits only the exact approved target', async () => {
    await admin`UPDATE gradebook.vinculo SET situacao=NULL,turma_id=910001 WHERE aluno_id=910001`;
    await gradebook`SELECT * FROM student_portal.synchronize_gradebook_profiles_v1()`;
    accountId = String((await portal`SELECT id FROM student_portal.account WHERE gradebook_student_id=910001`)[0]!.id);
    await portal`UPDATE student_portal.account SET auth_state='active',blocked=false WHERE id=${accountId}`;
    const current = await policy.read(scope());
    const clock = Math.floor(Date.now() / 1000) * 1000;
    const at = (days: number) => new Date(clock + days * 86400_000).toISOString();
    await policy.mutate(actor, { contractVersion: 1, operation: 'settings-set', scope: scope(), expectedVersion: current.version,
      idempotencyKey: crypto.randomUUID(), acknowledgeImmediateEffect: true, value: { accessEnabled: true, allowedPeriods: ['T1','T2','T3'],
        calendar: { ...current.value.calendar, yearStartsAt: at(-60),t1EndsAt:at(-50),t2EndsAt:at(-40),t3EndsAt:at(-30),
          recoveriesStartAt:at(-20),yearEndsAt:at(30),finalDisclosureAt:at(-10),disclosure:{mode:'single',at:at(-10),periods:['T1','T2','T3']} } } });
    const request = await command();
    const [first, replay] = await Promise.all([publications.command(actor, request), new PublicationServiceV1(secondary).command(actor, request)]);
    expect(replay).toEqual(first);
    const claimed = (await Promise.all([jobs.claim(), other.claim()])).filter((job) => job !== null);
    expect(claimed).toHaveLength(1);
    expect(await other.perform(claimed[0]!)).toBe('done');
    expect((await t1())!.length).toBeGreaterThan(0);
    expect(await jobs.perform(claimed[0]!)).toBe('stale');
  });

  it('unpublish wins over an already claimed job on another Portal connection', async () => {
    await publications.command(actor, await command('publish-update'));
    const claimed = await other.claim();
    expect(claimed).not.toBeNull();
    await publications.command(actor, await command('unpublish'));
    expect(await other.perform(claimed!)).toBe('stale');
    expect(await t1()).toHaveLength(0);
    await publications.command(actor, await command());
    expect(await t1()).toHaveLength(0);
    await jobs.run();
    expect((await t1())!.length).toBeGreaterThan(0);
  });

  it('a changed policy fences pending work and filters the committed copy immediately', async () => {
    await publications.command(actor, await command('publish-update'));
    const claimed = await jobs.claim();
    const before = await self();
    const current = await policy.read(scope());
    await policy.mutate(actor, { contractVersion: 1, operation: 'settings-set', scope: scope(), expectedVersion: current.version,
      idempotencyKey: crypto.randomUUID(), acknowledgeImmediateEffect: true, value: { allowedPeriods: [] } });
    expect(await other.perform(claimed!)).toBe('stale');
    expect(await t1()).toHaveLength(0);
    expect(await reader.readAuthorized(accountId, before!.revisions)).toBeNull();
  });

  it('a restarted claimant fences the expired worker with a new attempt generation', async () => {
    const current = await policy.read(scope());
    await policy.mutate(actor, { contractVersion: 1, operation: 'settings-set', scope: scope(), expectedVersion: current.version,
      idempotencyKey: crypto.randomUUID(), acknowledgeImmediateEffect: true, value: { allowedPeriods: ['T1'] } });
    await publications.command(actor, await command());
    const first = await jobs.claim();
    await portal`UPDATE student_portal.publication_job SET lease_until=statement_timestamp()-interval '1 second' WHERE id=${first!.id}`;
    const second = await other.claim();
    expect(second!.attempts).toBe(first!.attempts + 1);
    expect(await jobs.perform(first!)).toBe('stale');
    expect(await other.perform(second!)).toBe('done');
    expect((await t1())!.length).toBeGreaterThan(0);
  });
});


describe('native administrative facade and atomic batch receipts', () => {
  const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const tenant = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const cryptography = new PortalCryptoV1(new Map([[1, new Uint8Array(32).fill(41)]]), new Map([[1, new Uint8Array(32).fill(42)]]));
  const options = { tenantId: tenant, cryptoPort: cryptography, qrKeyVersion: 1, pepperVersion: 1, cursorSecret: 'synthetic-native-cursor-713-'.repeat(3) };
  const api = new PortalAdminApiV1(portal as unknown as StudentPortalPostgresSqlV1, options);
  const other = new PortalAdminApiV1(asRole('student_portal_app') as unknown as StudentPortalPostgresSqlV1, options);
  const context = () => ({ actorId: actor, tenantId: tenant, requestId: crypto.randomUUID(), authenticatedAt: new Date().toISOString(), capability: 'platform.settings.write' });
  const scope = { kind: 'class', academicYear: 2026, classId: 910001 } as const;
  const school = { kind: 'school', academicYear: 2026 } as const;
  let accountIds: string[];

  it('executes the accounts SQL under the restricted role and commits one QR batch across competing connections', async () => {
    const accounts = await api.query(context(), { contractVersion: 1, operation: 'accounts', scope, page: { limit: 100 } });
    if (accounts.state !== 'accounts') throw new Error(`synthetic-native-accounts-${accounts.state}`);
    expect(accounts.items).toHaveLength(2);
    accountIds = accounts.items.map((item) => item.accountId);
    const request = { contractVersion: 1, operation: 'qr-batch', classId: scope.classId, accountIds,
      expectedVersion: accounts.scopeVersion, mode: 'qr-name-class', confirmed: true, idempotencyKey: crypto.randomUUID() };
    const [first, replay] = await Promise.all([api.command(context(), request), other.command(context(), request)]);
    expect(first.state).toBe('qr');
    expect(replay.state).toBe('qr');
    if (first.state !== 'qr' || replay.state !== 'qr') throw new Error('synthetic-native-qr-failed');
    expect(first.cards).toHaveLength(2);
    expect(replay.cards).toEqual(first.cards);
    expect(replay.version).toBe(first.version);
    expect(JSON.stringify(first)).not.toMatch(/birth|password|verifier|pin|tokenHash/);
    const births = await api.query(context(), { contractVersion: 1, operation: 'birth-years', scope, page: {} });
    expect(births.state).toBe('birth-years');
    const sessions = await api.query(context(), { contractVersion: 1, operation: 'sessions', scope, page: {} });
    expect(sessions.state).toBe('sessions');
  });

  it('keeps timestamp microseconds in scoped audit cursors and exposes raw IP only within retention', async () => {
    await portal.unsafe(`UPDATE student_portal.audit_event SET occurred_at=date_trunc('second',statement_timestamp())+interval '0.123456 seconds',
      raw_ip='192.0.2.21',masked_ip='192.0.2.0/24',ip_expires_at=statement_timestamp()+interval '1 day'
      WHERE account_id IN (SELECT value::uuid FROM jsonb_array_elements_text($1::text::jsonb)) AND kind='qr-issued'`, [JSON.stringify(accountIds)]);
    const request = { contractVersion: 1, operation: 'audit', scope, event: 'qr-issued', page: { limit: 1 } };
    const first = await api.query(context(), request);
    if (first.state !== 'audit') throw new Error(`synthetic-native-audit-${first.state}`);
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const second = await api.query(context(), { ...request, page: { limit: 1, cursor: first.nextCursor } });
    if (second.state !== 'audit') throw new Error(`synthetic-native-audit-page-${second.state}`);
    expect(second.items).toHaveLength(1);
    expect(second.items[0]!.eventId).not.toBe(first.items[0]!.eventId);
    const detail = { contractVersion: 1, operation: 'audit-detail', scope, page: {}, eventId: first.items[0]!.eventId };
    const visible = await api.query(context(), detail);
    expect(visible).toMatchObject({ state: 'audit-detail', ip: '192.0.2.21' });
    await portal`UPDATE student_portal.audit_event SET occurred_at=statement_timestamp()-interval '91 days' WHERE event_id=${detail.eventId}`;
    expect(await api.query(context(), detail)).toMatchObject({ state: 'audit-detail', ip: null, ipExpiresAt: null });
    expect(await api.query({ ...context(), capability: 'platform.settings.read' }, detail)).toMatchObject({ state: 'forbidden' });
  });

  it('replays link closure after commit without consuming another preview or touching academic records', async () => {
    const before = Number((await admin`SELECT count(*)::integer AS n FROM gradebook.aluno`)[0]!.n);
    const preview = await api.query(context(), { contractVersion: 1, operation: 'links-preview', scope: school, page: {} });
    if (preview.state !== 'links-preview') throw new Error(`synthetic-native-preview-${preview.state}`);
    const request = { contractVersion: 1, operation: 'links-close', academicYear: 2026, previewToken: preview.previewToken,
      expectedCount: preview.count, expectedVersion: preview.version, confirmed: true, idempotencyKey: crypto.randomUUID() };
    const [first, replay] = await Promise.all([api.command(context(), request), other.command(context(), request)]);
    if (first.state !== 'committed' || replay.state !== 'committed') throw new Error(`synthetic-native-close-${first.state}-${replay.state}`);
    expect(replay.operationId).toBe(first.operationId);
    expect(replay.version).toBe(first.version);
    expect(Number((await admin`SELECT count(*)::integer AS n FROM gradebook.aluno`)[0]!.n)).toBe(before);
    expect((await portal`SELECT count(*)::integer AS n FROM student_portal.account WHERE gradebook_student_id IS NOT NULL`)[0]!.n).toBe(0);
  });
});
