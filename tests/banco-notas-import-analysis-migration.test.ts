import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration = readFileSync(
  join(root, 'infra/banco-notas/d1/migrations/0005_banco_notas_import_analysis.sql'),
  'utf8',
);

type RuntimeEvidence = Record<string, boolean>;

function runtimeEvidence(): RuntimeEvidence {
  const output = execFileSync(
    process.execPath,
    [join(root, 'tests/helpers/banco-notas-import-analysis-sqlite-runtime.mjs')],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    },
  );
  return JSON.parse(output.trim()) as RuntimeEvidence;
}

const evidence = runtimeEvidence();

describe('Banco de Notas import analysis D1 migration', () => {
  it('contains no product seed data', () => {
    expect(migration).not.toMatch(/INSERT\s+INTO/iu);
  });

  it('creates immutable import analysis storage and requires it for analyzed state', () => {
    expect(evidence.analysisTableCreated).toBe(true);
    expect(evidence.analyzedWithoutArtifactRejected).toBe(true);
    expect(evidence.validAnalysisTransitionAllowed).toBe(true);
    expect(evidence.analysisAppendOnly).toBe(true);
    expect(evidence.duplicateAnalysisRejected).toBe(true);
  });

  it('rejects analysis provenance that differs from the import job', () => {
    expect(evidence.analysisHashMismatchRejected).toBe(true);
    expect(evidence.analysisFormatMismatchRejected).toBe(true);
  });

  it('rolls back an analysis artifact when the surrounding transaction fails', () => {
    expect(evidence.analysisTransactionRollback).toBe(true);
  });
});
