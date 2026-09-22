import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), 'utf8');

const latestMigration = (directory: string) =>
  readdirSync(join(root, directory))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()
    .at(-1);

describe('current canonical project state', () => {
  it('tracks the latest Gradebook migration present in the current tree', () => {
    const state = source('docs/gradebook/PROJECT_STATE.yaml');
    const latest = latestMigration('migrations/gradebook-simplified');

    expect(latest).toBe('0013_default_privileges_hardening_v1.sql');
    expect(state).toContain(`latest_gradebook_migration_file: ${latest}`);
    expect(state).toContain('latest_gradebook_migration_status: applied-and-postflight-verified');
  });

  it('tracks the latest Student Portal migration present in the current tree', () => {
    const gradebookState = source('docs/gradebook/PROJECT_STATE.yaml');
    const portalState = source('docs/student-portal/PROJECT_STATE.yaml');
    const latest = latestMigration('migrations/student-portal');

    expect(latest).toBe('0017_security_event_priority_v1.sql');
    expect(gradebookState).toContain(`student_portal_latest_migration_in_tree: ${latest}`);
    expect(portalState).toContain(`student_portal_latest_migration_in_tree: ${latest}`);
    // Tree presence alone is not production evidence; #1102 recorded the postflight of 0016/0017.
    expect(gradebookState).toContain('schema_migration_file: 0017_security_event_priority_v1.sql');
    expect(portalState).toContain('student_portal_schema_latest_migration: 0017_security_event_priority_v1.sql');
    expect(portalState).toContain('production_migrations_applied: true');
    expect(portalState).toContain('student_portal_schema_production_version: 20260922150001');
    expect(portalState).toContain('student_portal_schema_table_count: 27');
  });

  it('keeps historical checkpoint 668 explicitly non-authoritative', () => {
    const state = source('docs/gradebook/PROJECT_STATE.yaml');

    expect(state).toContain('historical_checkpoint_668_is_runtime_authority: false');
    expect(state).toContain('historical_checkpoint_668:');
    expect(state).toContain('obsolete_execution_queues: [185, 192, 593]');
  });

  it('points current entry documents to the consolidated maintenance queue', () => {
    for (const path of [
      'docs/gradebook/README.md',
      'docs/gradebook/COMECE_AQUI.md',
      'docs/gradebook/ISSUE_MAP.md',
    ]) {
      const document = source(path);
      expect(document).toContain('#970');
      expect(document).not.toContain('A fila ativa é [Portal do Aluno Parte2 #742]');
    }
  });
});
