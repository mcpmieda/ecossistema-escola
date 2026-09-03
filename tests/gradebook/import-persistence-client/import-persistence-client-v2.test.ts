import { describe, expect, it, vi } from 'vitest';
import type {
  AcademicYearId,
  EnrollmentId,
  StudentId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import type {
  ImportFileId,
  SourceFileManifestId,
} from '../../../shared/gradebook-contracts/imports/import-ids-v1';
import {
  createGradebookImportPersistenceRequestV4,
  persistRecognizedGradebookFileV4,
} from '../../../src/features/gradebook/import/import-persistence-client-v2';
import type { BatchSuccess } from '../../../src/features/gradebook/import/import-batch';

const missing = { classification: 'missing-field' } as const;

const result = {
  id: 'client-file:synthetic' as ImportFileId,
  manifest: {
    id: 'client-manifest:must-not-cross-http' as SourceFileManifestId,
    fileName: 'arquivo-sintetico.xlsx',
    extension: 'xlsx',
    reportedMimeType: null,
    sizeBytes: 64,
    lastModifiedAt: null,
    sha256: 'a'.repeat(64),
    sourceContractVersion: 2,
    parserVersion: 'synthetic-parser',
    readAt: '2026-09-03T12:00:00.000Z',
  },
  summary: {
    fileName: 'arquivo-sintetico.xlsx',
    format: 'XLSX',
    size: 64,
    parserVersion: 'synthetic-parser',
    sheets: [{ name: '6SRECD1', range: 'A1:AN5', rows: 5, columns: 40 }],
    gradeSheets: [
      {
        name: '6SRECD1',
        range: 'A1:AN5',
        rows: 5,
        columns: 40,
        className: '6S',
        discipline: 'Componente sintético',
        disciplineIndex: 'D1',
        stage: 'recovery',
        declaredStage: 'REC',
        declaredStudents: 1,
        assessmentDefinitions: [],
        students: [
          {
            row: 5,
            number: '1',
            name: 'Estudante sintético',
            status: 'ATIVO',
            quantitativeAssessments: [null, null],
            quantitativeTotal: null,
            parallel: null,
            qualitative: [],
            qualitativeTotal: null,
            official: null,
            annual: null,
            termResultObservations: null,
            recovery: {
              trimester1: null,
              trimester2: null,
              trimester3: null,
              totalAfterRecovery: null,
              originalTrimester1: null,
              originalTrimester2: null,
              originalTrimester3: null,
              originalAnnual: null,
              resultObservations: {
                trimester1: missing,
                trimester2: missing,
                trimester3: missing,
                totalAfterRecovery: missing,
                originalTrimester1: missing,
                originalTrimester2: missing,
                originalTrimester3: missing,
                originalAnnual: missing,
              },
              applicabilityTrimester1: { classification: 'numeric', rawValue: 0 },
              applicabilityTrimester2: { classification: 'empty', rawValue: '' },
              applicabilityTrimester3: { classification: 'missing-field' },
              eligibleTrimester1: false,
              eligibleTrimester2: false,
              eligibleTrimester3: false,
            },
          },
        ],
        formulas: 0,
        officialZeros: 0,
      },
    ],
    classes: [],
    auxiliarySheets: [],
    unrecognizedSheets: [],
  },
} as const satisfies BatchSuccess;

const references = {
  academicYearId: 'academic-year:synthetic' as AcademicYearId,
  sheetsByName: {
    '6SRECD1': {
      teachingAssignmentId: 'teaching-assignment:synthetic' as TeachingAssignmentId,
      studentsByRow: {
        5: {
          studentId: 'student:synthetic' as StudentId,
          enrollmentId: 'enrollment:synthetic' as EnrollmentId,
        },
      },
    },
  },
};

describe('Gradebook import persistence client V4', () => {
  it('builds one bounded observation request without browser-owned IDs, provenance or workbook bytes', () => {
    const request = createGradebookImportPersistenceRequestV4(result, references);
    const serialized = JSON.stringify(request);
    expect(request).toMatchObject({
      transportVersion: 4,
      sourceResolution: { mode: 'resolve-or-create' },
      confirmedContext: { academicYearId: references.academicYearId },
      sheets: [
        {
          kind: 'recovery',
          students: [
            {
              recovery: {
                trimester1: { classification: 'missing-field' },
                applicabilityTrimester1: { classification: 'numeric', rawValue: 0 },
              },
            },
          ],
        },
      ],
    });
    expect(serialized).not.toContain('logicalSourceId');
    expect(serialized).not.toContain('client-manifest:must-not-cross-http');
    expect(serialized).not.toContain('provenance');
    expect(serialized).not.toMatch(
      /arrayBuffer|workbook|worksheet|expectedVersion|authorityMode|writes|sql/iu,
    );
  });

  it('uses no-store/same-origin and accepts only a sanitized V4 response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          transportVersion: 4,
          state: 'no-changes',
          summary: {
            assessmentDefinitions: { total: 1, resolved: 1, blocked: 0 },
            assessmentComponents: { unchanged: 1, new: 0, changed: 0, blocked: 0 },
            academicRecords: {
              unchanged: 1,
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
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await expect(persistRecognizedGradebookFileV4(result, references)).resolves.toMatchObject({
      transportVersion: 4,
      state: 'no-changes',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/gradebook/import-persistence',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
      }),
    );
    fetchMock.mockRestore();
  });
});
