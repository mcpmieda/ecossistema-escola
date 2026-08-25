import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration1 = readFileSync(
  join(root, 'infra/banco-notas/d1/migrations/0001_banco_notas_foundation.sql'),
  'utf8',
);
const migration2 = readFileSync(
  join(root, 'infra/banco-notas/d1/migrations/0002_banco_notas_cross_year_integrity.sql'),
  'utf8',
);

type RuntimeEvidence = Record<string, boolean>;

function runtimeEvidence(): RuntimeEvidence {
  const output = execFileSync(
    process.execPath,
    [join(root, 'tests/helpers/banco-notas-sqlite-runtime.mjs')],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    },
  );
  return JSON.parse(output.trim()) as RuntimeEvidence;
}

const evidence = runtimeEvidence();

describe('Banco de Notas D1 migration compatibility', () => {
  it('keeps migration files free of product seed data', () => {
    expect(migration1).not.toMatch(/INSERT\s+INTO/iu);
    expect(migration2).not.toMatch(/INSERT\s+INTO/iu);
  });

  it('executes both migrations in a real SQLite runtime', () => {
    expect(evidence.schemaCreated).toBe(true);
  });

  it('enforces source authority and school-year integrity at storage level', () => {
    expect(evidence.syncDefaultOff).toBe(true);
    expect(evidence.crossYearSourceRejected).toBe(true);
    expect(evidence.authorityOverlapRejected).toBe(true);
    expect(evidence.referenceSourceAllowed).toBe(true);
    expect(evidence.teacherOverrideAllowed).toBe(true);
    expect(evidence.teacherAssignmentYearRejected).toBe(true);
    expect(evidence.importYearRejected).toBe(true);
  });

  it('enforces grade identity, absence semantics and append-only history', () => {
    expect(evidence.zeroIsValidValue).toBe(true);
    expect(evidence.idempotencyRejected).toBe(true);
    expect(evidence.appliedSequenceCollisionRejected).toBe(true);
    expect(evidence.staleSequenceAuditAllowed).toBe(true);
    expect(evidence.snapshotCompositeIdentity).toBe(true);
    expect(evidence.absenceWithValueRejected).toBe(true);
    expect(evidence.gradeEventsAppendOnly).toBe(true);
    expect(evidence.auditEventsAppendOnly).toBe(true);
  });

  it('proves rollback semantics for a failed multi-statement transaction', () => {
    expect(evidence.transactionRollback).toBe(true);
  });
});
