import { SYNTHETIC_SELF_V1 } from '../../../shared/student-portal-contracts/fixtures-v1';
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
