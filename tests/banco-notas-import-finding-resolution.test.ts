import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

type Evidence = {
  migrationFreeOfSeed: boolean;
  resolutionRecorded: boolean;
  findingImmutable: boolean;
  resolutionImmutable: boolean;
  duplicateResolutionRejected: boolean;
  stateReentryRejected: boolean;
};

function runtimeEvidence(): Evidence {
  const output = execFileSync(
    process.execPath,
    [join(root, 'tests/helpers/banco-notas-import-finding-resolution-runtime.mjs')],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    },
  );
  return JSON.parse(output.trim()) as Evidence;
}

const evidence = runtimeEvidence();

describe('Banco de Notas import finding resolution migration', () => {
  it('keeps the migration free of product seed data', () => {
    expect(evidence.migrationFreeOfSeed).toBe(true);
  });

  it('records resolution separately while keeping both streams immutable', () => {
    expect(evidence.resolutionRecorded).toBe(true);
    expect(evidence.findingImmutable).toBe(true);
    expect(evidence.resolutionImmutable).toBe(true);
  });

  it('prevents resolving the same finding twice', () => {
    expect(evidence.duplicateResolutionRejected).toBe(true);
  });

  it('rejects a concurrent same-state re-entry', () => {
    expect(evidence.stateReentryRejected).toBe(true);
  });
});
