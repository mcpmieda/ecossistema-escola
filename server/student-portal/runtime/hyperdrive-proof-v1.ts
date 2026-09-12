import postgres from 'postgres';

/** Synthetic, bounded infrastructure proof. Never called by a public handler. */
export async function provePortalHyperdriveV1(
  binding: Pick<Hyperdrive, 'connectionString'>,
  runId: string,
): Promise<boolean> {
  if (!/^[a-f0-9]{32}$/.test(runId)) throw new Error('invalid-proof-id');
  const scope = `runtime-705-${runId}`;
  const sql = postgres(binding.connectionString, {
    max: 1,
    fetch_types: false,
    prepare: true,
    connect_timeout: 5,
    idle_timeout: 5,
    max_lifetime: 60,
    connection: {
      application_name: 'student-portal-runtime-proof',
      statement_timeout: 5000,
      lock_timeout: 1500,
      idle_in_transaction_session_timeout: 10000,
    },
    onnotice: () => undefined,
  });
  let owned = false;
  async function run(): Promise<boolean> {
    const identity = await sql`SELECT current_user AS role,
      has_schema_privilege(current_user,'student_portal','CREATE') AS ddl,
      has_schema_privilege(current_user,'gradebook','USAGE') AS academic_write`;
    if (
      identity[0]?.role !== 'student_portal_app' ||
      identity[0]?.ddl ||
      identity[0]?.academic_write
    )
      return false;
    const existing =
      await sql`SELECT count(*)::int AS n FROM student_portal.setting WHERE scope_key=${scope}`;
    if (existing[0]?.n !== 0) return false;
    owned = true;
    await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock_shared(613,0)`;
      await tx`SELECT pg_advisory_xact_lock_shared(613,2026)`;
      await tx`INSERT INTO student_portal.setting(scope_key,field_key,scope_kind,value_json,source_scope_json,version)
        VALUES (${scope},'accessEnabled','school','false'::jsonb,'{}'::jsonb,1)`;
    });
    const committed =
      await sql`SELECT value_json AS value FROM student_portal.setting WHERE scope_key=${scope}`;
    if (committed[0]?.value !== false) return false;
    const rollback = new Error('synthetic-rollback');
    try {
      await sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock_shared(613,0)`;
        await tx`SELECT pg_advisory_xact_lock_shared(613,2026)`;
        await tx`UPDATE student_portal.setting SET value_json='true'::jsonb WHERE scope_key=${scope}`;
        const changed =
          await tx`SELECT value_json AS value FROM student_portal.setting WHERE scope_key=${scope}`;
        if (changed[0]?.value !== true) throw new Error('read-after-write-failed');
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    const unchanged =
      await sql`SELECT value_json AS value FROM student_portal.setting WHERE scope_key=${scope}`;
    return unchanged[0]?.value === false;
  }
  let passed: boolean;
  try {
    passed = await run();
  } catch {
    passed = false;
  } finally {
    try {
      if (owned) {
        await sql.begin(async (tx) => {
          await tx`SELECT pg_advisory_xact_lock_shared(613,0)`;
          await tx`SELECT pg_advisory_xact_lock_shared(613,2026)`;
          await tx`DELETE FROM student_portal.setting WHERE scope_key=${scope}`;
        });
        const remaining =
          await sql`SELECT count(*)::int AS n FROM student_portal.setting WHERE scope_key=${scope}`;
        if (remaining[0]?.n !== 0) passed = false;
      }
    } catch {
      passed = false;
    } finally {
      await sql.end({ timeout: 1 }).catch(() => undefined);
    }
  }
  return passed;
}
