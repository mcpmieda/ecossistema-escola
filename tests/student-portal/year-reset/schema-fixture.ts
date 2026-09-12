import { readFileSync } from 'node:fs';

// Complete private schema on a disposable test database, never a production fallback.
export async function installResetSchemaFixtureV1(database: {
  exec(sql: string): Promise<unknown>;
}): Promise<void> {
  await database.exec(
    'ALTER TABLE gradebook.fechamento ADD COLUMN IF NOT EXISTS rec_rr_mask SMALLINT NOT NULL DEFAULT 0',
  );
  await database.exec(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gradebook_app') THEN
      CREATE ROLE gradebook_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
    END IF;
  END $$;`);
  for (const name of [
    '0001_identity_credentials_acl_v1.sql',
    '0002_policy_publication_revision_v1.sql',
    '0003_audit_receipts_closure_integration_v1.sql',
    '0004_gradebook_integration_usage_v1.sql',
    '0005_year_reset_protocol_v1.sql',
    '0006_gradebook_revision_year_range_v1.sql',
  ])
    await database.exec(readFileSync(`migrations/student-portal/${name}`, 'utf8'));
}
