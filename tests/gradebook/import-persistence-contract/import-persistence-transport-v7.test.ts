import { describe, expect, it } from 'vitest';
import type { AcademicYearId } from '../../../shared/gradebook-contracts/entities';
import {
  GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V7,
  GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V7,
  inspectGradebookImportPersistenceBatchRequestV7,
  isGradebookImportPersistenceBatchRequestV7,
  isGradebookImportPersistenceBatchResponseV7,
  type GradebookImportPersistenceBatchRequestV7,
} from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v7';
import type { GradebookImportPersistenceRequestV6 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';

function request(): GradebookImportPersistenceRequestV6 {
  const term = (value: 1 | 2 | 3) => ({
    term: value,
    sourceSheetName: `6A${value}ºD1`,
    assessmentDefinitions: [
      ['R', 10],
      ['S', 10],
    ] as const,
    rows: [[1, {}]] as const,
  });
  return {
    transportVersion: 6,
    operation: 'persist-recognized-file',
    manifest: {
      fileName: 'fixture-v7.xlsb',
      extension: 'xlsb',
      reportedMimeType: null,
      sizeBytes: 100,
      lastModifiedAt: null,
      sha256: 'a'.repeat(64),
      sourceContractVersion: 2,
      parserVersion: 'synthetic-v7',
      readAt: '2026-09-06T00:00:00.000Z',
    },
    recognizedSuggestions: { academicYear: 2026, teacherName: 'Professor Sintético' },
    confirmedContext: { academicYearId: 'academic-year:synthetic-2026' as AcademicYearId },
    sourceResolution: { mode: 'resolve-or-create' },
    rosters: [{ classGroupLabel: '6A', students: [[1, 'Estudante Sintético']] }],
    courses: [
      {
        classGroupLabel: '6A',
        subjectLabel: 'Componente Sintético',
        disciplineIndex: 'D1',
        terms: [term(1), term(2), term(3)],
        recovery: null,
      },
    ],
    diagnostics: [],
  };
}

function batch(count: number): GradebookImportPersistenceBatchRequestV7 {
  return {
    transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V7,
    operation: GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V7,
    requests: Array.from({ length: count }, request),
  };
}

const noChanges = {
  transportVersion: 6,
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
      importBatchVersions: 1,
      assessmentComponentVersions: 0,
      academicRecordVersions: 0,
      logicalSourceRecordAssociationVersions: 0,
      total: 1,
    },
    committedWrites: {
      logicalSources: 0,
      sourceFileVersions: 0,
      importBatchVersions: 1,
      assessmentComponentVersions: 0,
      academicRecordVersions: 0,
      logicalSourceRecordAssociationVersions: 0,
      total: 1,
    },
  },
} as const;

describe('Gradebook import persistence transport V7', () => {
  it.each([1, 18, 50])('accepts a bounded batch with %i V6 item(s)', (count) => {
    const value = batch(count);
    expect(inspectGradebookImportPersistenceBatchRequestV7(value)).toBe('ready');
    expect(isGradebookImportPersistenceBatchRequestV7(value)).toBe(true);
  });

  it('rejects 51 files before service execution', () => {
    expect(inspectGradebookImportPersistenceBatchRequestV7(batch(51))).toBe('payload-too-large');
  });

  it('delegates every item to the V6 inspector', () => {
    const value = batch(2);
    const broken = {
      ...value,
      requests: [value.requests[0], { ...value.requests[1], diagnostics: [{ code: 'x' }] }],
    };
    expect(inspectGradebookImportPersistenceBatchRequestV7(broken)).toBe('invalid-request');
  });

  it('validates sanitized per-item batch responses', () => {
    expect(
      isGradebookImportPersistenceBatchResponseV7({
        transportVersion: 7,
        state: 'completed',
        items: [
          {
            index: 0,
            attempts: 1,
            totalMs: 12,
            failureCategory: 'none',
            response: noChanges,
          },
        ],
        pendingFromIndex: null,
        totalMs: 12,
      }),
    ).toBe(true);
  });
});
