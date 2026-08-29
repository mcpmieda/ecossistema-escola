import { describe, expect, it } from 'vitest';
import { syncCommitRequestSchema, syncPreflightRequestSchema } from '../shared/banco-notas-sync';
const workbook = {
  workbookModelId: '11111111-1111-4111-8111-111111111111',
  sourceHash: 'a'.repeat(64),
  relationshipSnapshotId: '22222222-2222-4222-8222-222222222222',
  definitionVersion: '1',
  layoutVersion: '1',
  mappingVersion: 1,
  schoolYear: 2026,
  sheetKey: 'sheet',
};
const change = {
  cellAddress: 'B2',
  field: 'NotaT1' as const,
  baselineEventId: '33333333-3333-4333-8333-333333333333',
  baselineSequence: 1,
  valueAfter: 0,
  isAbsent: false,
};
const base = {
  schemaVersion: 1 as const,
  requestId: '44444444-4444-4444-8444-444444444444',
  workbook,
  changes: [change],
};
describe('Sync V1 contracts', () => {
  it('preserves zero and accepts explicit absence only with null', () => {
    expect(syncPreflightRequestSchema.parse(base).changes[0]?.valueAfter).toBe(0);
    expect(
      syncPreflightRequestSchema.safeParse({
        ...base,
        changes: [{ ...change, valueAfter: null, isAbsent: true }],
      }).success,
    ).toBe(true);
    expect(
      syncPreflightRequestSchema.safeParse({
        ...base,
        changes: [{ ...change, valueAfter: 0, isAbsent: true }],
      }).success,
    ).toBe(false);
  });
  it('rejects over-posting, duplicate mappings and more than 500 changes', () => {
    expect(syncPreflightRequestSchema.safeParse({ ...base, forged: true }).success).toBe(false);
    expect(
      syncPreflightRequestSchema.safeParse({ ...base, changes: [change, change] }).success,
    ).toBe(false);
    expect(
      syncPreflightRequestSchema.safeParse({
        ...base,
        changes: Array.from({ length: 501 }, (_, i) => ({ ...change, cellAddress: `B${i + 2}` })),
      }).success,
    ).toBe(false);
  });
  it('requires the SHA-256 preflight fingerprint at commit', () => {
    expect(
      syncCommitRequestSchema.safeParse({ ...base, preflightFingerprint: 'a'.repeat(64) }).success,
    ).toBe(true);
    expect(syncCommitRequestSchema.safeParse(base).success).toBe(false);
  });
});
