import { describe, expect, it } from 'vitest';
import type { AcademicYearId } from '../../../shared/gradebook-contracts/entities';
import {
  GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6,
  inspectGradebookImportPersistenceRequestV6,
  isGradebookImportPersistenceRequestV6,
  type GradebookImportPersistenceRequestV6,
} from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import type { GradebookImportPersistenceRequestV5 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v5';
import {
  SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2,
  SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2,
} from '../../../shared/gradebook-contracts/source/source-contract-v2';

const academicYearId = 'academic-year:synthetic-2026' as AcademicYearId;

function compactRequest(studentCount = 2): GradebookImportPersistenceRequestV6 {
  const roster = Array.from({ length: studentCount }, (_, index) =>
    index === studentCount - 1
      ? ([index + 1, `Estudante Sintético ${index + 1}`, 'TRANSFERIDO'] as const)
      : ([index + 1, `Estudante Sintético ${index + 1}`] as const),
  );
  const rows = Array.from({ length: studentCount }, (_, index) => [
    index + 1,
    {
      R: index + 1,
      T: ['f', index + 1, index + 1, '=R5+S5'] as const,
      AM: index + 1,
    },
  ] as const);
  const term = (value: 1 | 2 | 3) => ({
    term: value,
    sourceSheetName: `6A${value}º`,
    assessmentDefinitions: [
      ['R', 8] as const,
      ['S', 2] as const,
      ['AA', null, 'Atividade Sintética'] as const,
    ],
    rows: rows.map(([position, cells]) => [
      position,
      value === 3 ? { ...cells, AN: 60 } : cells,
    ] as const),
  });
  return {
    transportVersion: 6,
    operation: 'persist-recognized-file',
    manifest: {
      fileName: 'fixture-sintetica.xlsb',
      extension: 'xlsb',
      reportedMimeType: null,
      sizeBytes: 128,
      lastModifiedAt: null,
      sha256: 'a'.repeat(64),
      sourceContractVersion: 2,
      parserVersion: 'synthetic',
      readAt: '2026-09-04T12:00:00.000Z',
    },
    recognizedSuggestions: { academicYear: 2026, teacherName: 'Docente Sintético' },
    confirmedContext: { academicYearId },
    sourceResolution: { mode: 'resolve-or-create' },
    rosters: [{ classGroupLabel: '6A', students: roster }],
    courses: [
      {
        classGroupLabel: '6A',
        subjectLabel: 'Componente Sintético',
        disciplineIndex: 'D1',
        terms: [term(1), term(2), term(3)],
        recovery: {
          sourceSheetName: '6AREC',
          rows: [
            [1, 5, { X: 20, Y: 20, AA: 20, AB: 60, AC: 1, AD: 0, AE: 0 }],
          ],
        },
      },
    ],
    diagnostics: [],
  };
}

function verboseV5(studentCount = 20): GradebookImportPersistenceRequestV5 {
  const missing = { classification: 'empty' as const, rawValue: null };
  const definitions = [
    ...SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2.map((slot) => ({
      sourceSlot: slot.sourceSlot,
      maximumConfiguration: { state: 'numeric' as const, rawValue: 5 },
    })),
    ...SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2.map((slot) => ({
      sourceSlot: slot.sourceSlot,
      maximumConfiguration: { state: 'ambiguous-marker' as const, rawValue: '*' as const },
      name: { state: 'unrecognized' as const, rawValue: slot.order },
    })),
  ];
  const students = Array.from({ length: studentCount }, (_, index) => ({
    sourceRow: index + 5,
    sourceStudent: { position: index + 1, label: `Estudante Sintético ${index + 1}` },
    assessmentValues: [
      {
        sourceSlot: 'R' as const,
        value: { kind: 'manual' as const, source: index + 1, value: index + 1 },
      },
    ],
    aggregates: {
      quantitativeTotal: missing,
      parallelAssessment: missing,
      qualitativeTotal: missing,
      officialTermGrade: missing,
      annualAccumulatedTotal: missing,
    },
  }));
  const term = (value: 1 | 2 | 3) => ({
    kind: 'term' as const,
    sourceSheetName: `6A${value}º`,
    term: value,
    recognizedContext: {
      classGroupLabel: '6A',
      subjectLabel: 'Componente Sintético',
      disciplineIndex: 'D1' as const,
    },
    assessmentDefinitions: definitions,
    students,
  });
  const recoveryStudents = students.map((student) => ({
    sourceRow: student.sourceRow,
    sourceStudent: student.sourceStudent,
    recovery: {
      trimester1: missing,
      trimester2: missing,
      trimester3: missing,
      totalAfterRecovery: missing,
      originalTrimester1: missing,
      originalTrimester2: missing,
      originalTrimester3: missing,
      originalAnnual: missing,
      applicabilityTrimester1: { classification: 'numeric' as const, rawValue: 0 },
      applicabilityTrimester2: { classification: 'numeric' as const, rawValue: 0 },
      applicabilityTrimester3: { classification: 'numeric' as const, rawValue: 0 },
    },
  }));
  return {
    transportVersion: 5,
    operation: 'persist-recognized-file',
    manifest: {
      fileName: 'fixture-sintetica.xlsb',
      extension: 'xlsb',
      reportedMimeType: null,
      sizeBytes: 128,
      lastModifiedAt: null,
      sha256: 'a'.repeat(64),
      sourceContractVersion: 2,
      parserVersion: 'synthetic',
      readAt: '2026-09-04T12:00:00.000Z',
    },
    recognizedSuggestions: { academicYear: 2026, teacherName: 'Docente Sintético' },
    confirmedContext: { academicYearId },
    sourceResolution: { mode: 'resolve-or-create' },
    sheets: [
      term(1),
      term(2),
      term(3),
      {
        kind: 'recovery',
        sourceSheetName: '6AREC',
        recognizedContext: {
          classGroupLabel: '6A',
          subjectLabel: 'Componente Sintético',
          disciplineIndex: 'D1',
        },
        students: recoveryStudents,
      },
    ],
    diagnostics: [],
  };
}

describe('GradebookImportPersistenceTransportV6', () => {
  it('accepts one roster per class, compact rows and source status without client-owned IDs', () => {
    const value = compactRequest();
    expect(inspectGradebookImportPersistenceRequestV6(value)).toBe('ready');
    expect(isGradebookImportPersistenceRequestV6(value)).toBe(true);
    const serialized = JSON.stringify(value);
    expect(serialized).toContain('TRANSFERIDO');
    expect(serialized).not.toMatch(/studentId|enrollmentId|teachingAssignmentId|expectedVersion/u);
    expect(serialized.match(/Estudante Sintético/gu)?.length).toBe(2);
  });

  it('treats roster position as contiguous K5:K50 source order and keeps transferred students', () => {
    const value = compactRequest(3);
    expect(value.rosters[0]!.students).toHaveLength(3);
    expect(value.rosters[0]!.students[2]).toEqual([3, 'Estudante Sintético 3', 'TRANSFERIDO']);
    expect(inspectGradebookImportPersistenceRequestV6(value)).toBe('ready');

    const invalid = structuredClone(value) as unknown as {
      rosters: Array<{ students: Array<[number, string]> }>;
    };
    invalid.rosters[0]!.students[1]![0] = 7;
    expect(inspectGradebookImportPersistenceRequestV6(invalid)).toBe('invalid-request');
  });

  it('fails closed on duplicate roster names because REC resolves against the class roster', () => {
    const value = structuredClone(compactRequest()) as unknown as {
      rosters: Array<{ students: Array<[number, string, string?]> }>;
    };
    value.rosters[0]!.students[1]![1] = 'ESTUDANTE SINTÉTICO 1';
    expect(inspectGradebookImportPersistenceRequestV6(value)).toBe('duplicate-identity');
  });

  it('requires REC references to resolve to the canonical roster while preserving the dynamic source row', () => {
    const value = structuredClone(compactRequest()) as unknown as {
      courses: Array<{ recovery: { rows: Array<[number, number, Record<string, unknown>]> } }>;
    };
    value.courses[0]!.recovery.rows[0]![0] = 99;
    expect(inspectGradebookImportPersistenceRequestV6(value)).toBe('incompatible-reference');

    value.courses[0]!.recovery.rows[0]![0] = 1;
    value.courses[0]!.recovery.rows[0]![1] = 51;
    expect(inspectGradebookImportPersistenceRequestV6(value)).toBe('invalid-academic-shape');
  });

  it('rejects empty placeholders and accepts a real qualitative grade without a configured maximum', () => {
    const value = structuredClone(compactRequest()) as unknown as {
      courses: Array<{
        terms: Array<{
          assessmentDefinitions: Array<unknown>;
          rows: Array<[number, Record<string, unknown>]>;
        }>;
      }>;
    };
    value.courses[0]!.terms[0]!.assessmentDefinitions.push(['AB', null, null]);
    expect(inspectGradebookImportPersistenceRequestV6(value)).toBe('invalid-academic-shape');

    value.courses[0]!.terms[0]!.assessmentDefinitions.pop();
    value.courses[0]!.terms[0]!.rows[0]![1].AA = 2;
    expect(inspectGradebookImportPersistenceRequestV6(value)).toBe('ready');
  });

  it('keeps T/Z/AK/AM on every term and restricts annual accumulated AN to T3', () => {
    const value = structuredClone(compactRequest()) as unknown as {
      courses: Array<{ terms: Array<{ rows: Array<[number, Record<string, unknown>]> }> }>;
    };
    value.courses[0]!.terms[0]!.rows[0]![1].AN = 40;
    expect(inspectGradebookImportPersistenceRequestV6(value)).toBe('invalid-academic-shape');

    delete value.courses[0]!.terms[0]!.rows[0]![1].AN;
    value.courses[0]!.terms[2]!.rows[0]![1].AN = 40;
    expect(inspectGradebookImportPersistenceRequestV6(value)).toBe('ready');
  });

  it('preserves formula cache/evidence in a compact tuple and rejects malformed formula cells', () => {
    const value = compactRequest();
    expect(value.courses[0]!.terms[0]!.rows[0]![1].T).toEqual(['f', 1, 1, '=R5+S5']);

    const malformed = structuredClone(value) as unknown as {
      courses: Array<{ terms: Array<{ rows: Array<[number, Record<string, unknown>]> }> }>;
    };
    malformed.courses[0]!.terms[0]!.rows[0]![1].T = ['f', 1, 1, ''];
    expect(inspectGradebookImportPersistenceRequestV6(malformed)).toBe('invalid-academic-shape');
  });

  it('preserves the 46-row K5:K50 hard bound without consulting J1', () => {
    expect(GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxRosterStudentsPerClass).toBe(46);
    const value = compactRequest(46);
    expect(inspectGradebookImportPersistenceRequestV6(value)).toBe('ready');

    const tooLarge = compactRequest(46) as unknown as {
      rosters: Array<{ students: unknown[] }>;
    };
    tooLarge.rosters[0]!.students.push([47, 'Estudante Sintético 47']);
    expect(inspectGradebookImportPersistenceRequestV6(tooLarge)).toBe('payload-too-large');
  });

  it('is materially smaller than the repeated-roster V5 shape on an equivalent synthetic source', () => {
    const v5 = verboseV5(20);
    const v6 = compactRequest(20);
    const v5Bytes = new TextEncoder().encode(JSON.stringify(v5)).byteLength;
    const v6Bytes = new TextEncoder().encode(JSON.stringify(v6)).byteLength;

    expect(v6Bytes).toBeLessThan(v5Bytes * 0.45);
    expect(v6.rosters[0]!.students).toHaveLength(20);
    expect(v6.courses[0]!.terms).toHaveLength(3);
  });
});
