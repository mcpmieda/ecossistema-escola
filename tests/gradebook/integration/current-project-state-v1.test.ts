import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveConfig } from 'prettier';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), 'utf8');
const identityStateSchema = z.object({
  shared_student_identity_1114: z.object({
    issue: z.literal(1114),
    pull_request: z.literal(1115),
    canonical_key: z.literal('studentUid'),
    migration: z.literal('0018_shared_student_identity_v1.sql'),
    status: z.literal('applied-and-postflight-verified'),
    production_migration_applied: z.literal(true),
    production_migration_version: z.literal(20260922212633),
    evidence: z.literal('docs/student-identity/POSTFLIGHT_1114.md'),
  }),
});

/** Reuses the installed formatter's public YAML config loader, not substring matching or a custom parser. */
async function readYamlDocument(path: string) {
  const document: unknown = await resolveConfig(path, { config: path, useCache: false });
  return document;
}

const latestMigration = (directory: string) =>
  readdirSync(join(root, directory))
    .filter((name) => /^\d{4}_.+\.sql$/u.test(name))
    .sort((left, right) => left.localeCompare(right))
    .at(-1);

describe('current canonical project state', () => {
  it('tracks the latest Gradebook migration present in the current tree', () => {
    const state = source('docs/gradebook/PROJECT_STATE.yaml');
    const latest = latestMigration('migrations/gradebook-simplified');
    expect(latest).toBe('0013_default_privileges_hardening_v1.sql');
    expect(state).toContain(`latest_gradebook_migration_file: ${latest}`);
    expect(state).toContain('latest_gradebook_migration_status: applied-and-postflight-verified');
  });

  it('parses the applied identity checkpoint and preserves the earlier recovery evidence', async () => {
    const gradebookState = await readYamlDocument(join(root, 'docs/gradebook/PROJECT_STATE.yaml'));
    const portalState = await readYamlDocument(join(root, 'docs/student-portal/PROJECT_STATE.yaml'));
    const latest = latestMigration('migrations/student-portal');
    expect(latest).toBe('0020_term_closing_policy_v1.sql');
    expect(gradebookState).toMatchObject({
      storage: { total_table_count: 31, student_identity_table_count: 1 },
      repository_snapshot: {
        student_portal_latest_migration_in_tree: latest,
        student_portal_candidate_migrations_status: '0020-pending-worker-deploy-then-additive-policy-migration',
      },
      student_portal_integration: {
        schema_migration_file: '0018_shared_student_identity_v1.sql',
        schema_migration_production_version: 20260922212633,
        schema_table_count: 28,
      },
    });
    expect(portalState).toMatchObject({
      student_portal_latest_migration_in_tree: latest,
      student_portal_schema_latest_migration: '0018_shared_student_identity_v1.sql',
      student_portal_schema_production_version: 20260922212633,
      student_portal_schema_table_count: 28,
      recovery_1101: {
        production_migrations_applied: true,
        production_migration_versions: [20260922150000, 20260922150001],
      },
    });
    for (const state of [gradebookState, portalState]) {
      const identity = identityStateSchema.parse(state).shared_student_identity_1114;
      expect(identity.production_migration_applied).toBe(true);
      const evidence = source(identity.evidence);
      expect(evidence).toContain(String(identity.production_migration_version));
      expect(evidence).toContain('0e4c1f1298c6f69e5acf12f4ebe0464ea0ea97ab');
    }
  });

  it('rejects malformed YAML and an identity block nested under an unrelated key', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'identity-project-state-'));
    const file = join(directory, 'state.yaml');
    try {
      writeFileSync(file, 'invalid: [\n');
      await expect(readYamlDocument(file)).rejects.toThrow();
      writeFileSync(file, `unrelated:\n  shared_student_identity_1114:\n    issue: 1114\n    pull_request: 1115\n    canonical_key: studentUid\n    migration: 0018_shared_student_identity_v1.sql\n    status: applied-and-postflight-verified\n    production_migration_applied: true\n    production_migration_version: 20260922212633\n    evidence: docs/student-identity/POSTFLIGHT_1114.md\n`);
      expect(identityStateSchema.safeParse(await readYamlDocument(file)).success).toBe(false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('keeps historical checkpoint 668 explicitly non-authoritative and retains its pending pilot', async () => {
    const state = await readYamlDocument(join(root, 'docs/gradebook/PROJECT_STATE.yaml'));
    expect(state).toMatchObject({
      repository_snapshot: { historical_checkpoint_668_is_runtime_authority: false },
      historical_checkpoint_668: {
        history: { obsolete_execution_queues: [185, 192, 593] },
        final_phases: expect.arrayContaining([expect.objectContaining({
          phase: 'FINAL-3',
          status: 'relational-v3-integrated-migrated-deployed-smoke-and-local-contention-green-joint-visual-validation-and-pilot-pending',
        })]),
      },
    });
  });

  it('points current entry documents to the consolidated maintenance queue', () => {
    for (const path of ['docs/gradebook/README.md', 'docs/gradebook/COMECE_AQUI.md', 'docs/gradebook/ISSUE_MAP.md']) {
      const document = source(path);
      expect(document).toContain('#970');
      expect(document).not.toContain('A fila ativa é [Portal do Aluno Parte2 #742]');
    }
  });
});
