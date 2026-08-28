import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration = readFileSync(
  join(root, 'infra/banco-notas/d1/migrations/0006_banco_notas_import_analysis_profiles.sql'),
  'utf8',
);

type RuntimeEvidence = Record<string, boolean>;

function runtimeEvidence(): RuntimeEvidence {
  const output = execFileSync(
    process.execPath,
    [join(root, 'tests/helpers/banco-notas-import-analysis-profiles-sqlite-runtime.mjs')],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    },
  );
  return JSON.parse(output.trim()) as RuntimeEvidence;
}

const evidence = runtimeEvidence();

describe('Banco de Notas import analysis profile D1 migration', () => {
  it('contains no product seed data', () => {
    expect(migration).not.toMatch(/INSERT\s+INTO/iu);
  });

  it('creates immutable profile and job-link storage', () => {
    expect(evidence.tablesCreated).toBe(true);
    expect(evidence.profileAppendOnly).toBe(true);
    expect(evidence.attachmentAppendOnly).toBe(true);
  });

  it('enforces source, school-year and source-type integrity', () => {
    expect(evidence.profileCrossYearRejected).toBe(true);
    expect(evidence.profileLinkedSourceRejected).toBe(true);
    expect(evidence.sourceMismatchAttachmentRejected).toBe(true);
  });

  it('allows only draft XLSX jobs to bind an analysis profile', () => {
    expect(evidence.xlsxAttachmentAllowed).toBe(true);
    expect(evidence.xlsbAttachmentRejected).toBe(true);
    expect(evidence.nonDraftAttachmentRejected).toBe(true);
  });
});
