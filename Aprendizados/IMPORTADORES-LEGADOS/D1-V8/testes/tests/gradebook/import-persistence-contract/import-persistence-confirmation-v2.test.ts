import { describe, expect, it } from 'vitest';
import type { GradebookImportPersistenceResponseV5 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v5';
import { responseIssueLabel } from '../../../src/features/gradebook/import/import-persistence-confirmation-v2';

function summary(componentBlocked: number, recordBlocked: number) {
  return {
    assessmentDefinitions: {
      total: componentBlocked,
      resolved: 0,
      blocked: componentBlocked,
    },
    assessmentComponents: { unchanged: 0, new: 0, changed: 0, blocked: componentBlocked },
    academicRecords: {
      unchanged: 0,
      new: 0,
      changed: 0,
      missingFromNewSource: 0,
      blocked: recordBlocked,
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
  };
}

describe('Import persistence confirmation V2', () => {
  it('projects only the distinct sanitized issue codes', () => {
    const response = {
      transportVersion: 5,
      state: 'blocked',
      summary: summary(1, 0),
      issues: [
        { code: 'blocked-definition', scope: 'file' },
        { code: 'blocked-definition', scope: 'sheet', sourceSheetName: 'Synthetic' },
      ],
    } satisfies GradebookImportPersistenceResponseV5;

    expect(responseIssueLabel(response)).toBe('Motivo técnico: blocked-definition.');
  });

  it('projects only aggregate component counts for a planning failure', () => {
    const response = {
      transportVersion: 5,
      state: 'blocked',
      summary: summary(2, 0),
      issues: [{ code: 'planning-failed', scope: 'file' }],
    } satisfies GradebookImportPersistenceResponseV5;

    expect(responseIssueLabel(response)).toBe(
      'Motivo técnico: planning-failed. Planner: componentes (2).',
    );
  });

  it('projects only aggregate academic-record counts for a planning failure', () => {
    const response = {
      transportVersion: 5,
      state: 'blocked',
      summary: summary(0, 3),
      issues: [{ code: 'planning-failed', scope: 'file' }],
    } satisfies GradebookImportPersistenceResponseV5;

    expect(responseIssueLabel(response)).toBe(
      'Motivo técnico: planning-failed. Planner: registros acadêmicos (3).',
    );
  });

  it('projects both aggregate planner phases without identifiers or evidence', () => {
    const response = {
      transportVersion: 5,
      state: 'blocked',
      summary: summary(2, 3),
      issues: [{ code: 'planning-failed', scope: 'file' }],
    } satisfies GradebookImportPersistenceResponseV5;

    expect(responseIssueLabel(response)).toBe(
      'Motivo técnico: planning-failed. Planner: componentes (2), registros acadêmicos (3).',
    );
  });

  it('projects the sanitized invalid-request reason', () => {
    const response = {
      transportVersion: 5,
      state: 'invalid-request',
      reason: 'payload-too-large',
    } satisfies GradebookImportPersistenceResponseV5;

    expect(responseIssueLabel(response)).toBe('Motivo técnico: payload-too-large.');
  });

  it('does not add a diagnostic label to successful responses', () => {
    const response = {
      transportVersion: 5,
      state: 'no-changes',
      summary: summary(0, 0),
    } satisfies GradebookImportPersistenceResponseV5;

    expect(responseIssueLabel(response)).toBeNull();
  });
});
