import { describe, expect, it } from 'vitest';
import { normalizeGradebookImportPersistenceResponseV5 } from '../../../src/features/gradebook/import/import-persistence-client-v2';

const emptySummary = {
  assessmentDefinitions: { total: 0, resolved: 0, blocked: 0 },
  assessmentComponents: { unchanged: 0, new: 0, changed: 0, blocked: 0 },
  academicRecords: {
    unchanged: 0,
    new: 0,
    changed: 0,
    missingFromNewSource: 0,
    blocked: 0,
  },
  plannedWrites: {
    logicalSources: 0,
    sourceFileVersions: 0,
    importBatchVersions: 0,
    assessmentComponentVersions: 0,
    academicRecordVersions: 0,
    logicalSourceRecordAssociationVersions: 0,
    total: 0,
  },
  committedWrites: {
    logicalSources: 0,
    sourceFileVersions: 0,
    importBatchVersions: 0,
    assessmentComponentVersions: 0,
    academicRecordVersions: 0,
    logicalSourceRecordAssociationVersions: 0,
    total: 0,
  },
} as const;

describe('Gradebook import persistence client V5 response compatibility', () => {
  it('keeps a valid V5 response unchanged', () => {
    const response = { transportVersion: 5, state: 'unavailable' } as const;
    expect(normalizeGradebookImportPersistenceResponseV5(response)).toBe(response);
  });

  it.each([
    { transportVersion: 4, state: 'not-authorized' } as const,
    { transportVersion: 4, state: 'unavailable' } as const,
    {
      transportVersion: 4,
      state: 'invalid-request',
      reason: 'payload-too-large',
    } as const,
  ])('promotes only pre-negotiation V4 failure %s to V5', (response) => {
    expect(normalizeGradebookImportPersistenceResponseV5(response)).toEqual({
      ...response,
      transportVersion: 5,
    });
  });

  it('rejects a V4 academic result instead of masking a server downgrade', () => {
    const response = {
      transportVersion: 4,
      state: 'no-changes',
      summary: emptySummary,
    } as const;
    expect(normalizeGradebookImportPersistenceResponseV5(response)).toBeNull();
  });
});
