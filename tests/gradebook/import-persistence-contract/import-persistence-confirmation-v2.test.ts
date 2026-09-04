import { describe, expect, it } from 'vitest';
import type { GradebookImportPersistenceResponseV5 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v5';
import { responseIssueLabel } from '../../../src/features/gradebook/import/import-persistence-confirmation-v2';

describe('Import persistence confirmation V2', () => {
  it('projects only the distinct sanitized issue codes', () => {
    const response = {
      transportVersion: 5,
      state: 'blocked',
      summary: {
        assessmentDefinitions: { total: 1, resolved: 0, blocked: 1 },
        assessmentComponents: { unchanged: 0, new: 0, changed: 0, blocked: 1 },
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
      },
      issues: [
        { code: 'blocked-definition', scope: 'file' },
        { code: 'blocked-definition', scope: 'sheet', sourceSheetName: 'Synthetic' },
      ],
    } satisfies GradebookImportPersistenceResponseV5;

    expect(responseIssueLabel(response)).toBe('Motivo técnico: blocked-definition.');
  });

  it('does not add a diagnostic label to successful responses', () => {
    const response = {
      transportVersion: 5,
      state: 'no-changes',
      summary: {
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
      },
    } satisfies GradebookImportPersistenceResponseV5;

    expect(responseIssueLabel(response)).toBeNull();
  });
});
