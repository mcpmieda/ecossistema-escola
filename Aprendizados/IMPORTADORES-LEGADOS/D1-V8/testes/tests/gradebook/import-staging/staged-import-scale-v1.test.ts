import { describe, expect, it } from 'vitest';
import type { AcademicYearId } from '../../../shared/gradebook-contracts/entities';
import type {
  GradebookImportCourseV6,
  GradebookImportPersistenceRequestV6,
  GradebookImportRosterV6,
} from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import {
  deriveGradebookImportStageChunksV1,
  GRADEBOOK_IMPORT_STAGE_MAX_POSITIONS_V1,
} from '../../../server/gradebook/application/import/import-staging-service-v1';
import { splitCompactGradebookImportV6 } from '../../../src/features/gradebook/import/import-staging-client-v1';

const academicYearId = 'academic-year:staged-scale:2026' as AcademicYearId;
const instant = '2026-09-05T09:00:00.000Z';

function roster(classIndex: number, students: number): GradebookImportRosterV6 {
  return {
    classGroupLabel: `TURMA SINTÉTICA ${classIndex + 1}`,
    students: Array.from({ length: students }, (_, index) => [
      index + 1,
      `Estudante Escala ${classIndex + 1}-${index + 1}`,
      index % 19 === 0 ? 'TRANSFERIDO' : 'ATIVO',
    ] as const),
  };
}

function course(
  rosterValue: GradebookImportRosterV6,
  courseIndex: number,
): GradebookImportCourseV6 {
  const rows = rosterValue.students.map((student) => student[0]);
  const term = (value: 1 | 2 | 3) => ({
    term: value,
    sourceSheetName: `ESCALA-${courseIndex + 1}-${value}ºD${courseIndex + 1}`,
    assessmentDefinitions: [
      ['R', 10] as const,
      ['S', 10] as const,
      ...(value === 1
        ? ([['AA', 5, 'Atividade A'], ['AB', null, 'Atividade B']] as const)
        : value === 2
          ? ([['AA', 5, 'Atividade A']] as const)
          : []),
    ],
    rows: rows.map((position) => [
      position,
      {
        R: 6,
        S: 7,
        T: 13,
        ...(value < 3 ? { AA: 4 } : {}),
        ...(value === 1 ? { AB: 3 } : {}),
        AK: value < 3 ? 7 : 12,
        AM: value === 3 ? 25 : 20,
        ...(value === 3 ? { AN: 65 } : {}),
      },
    ] as const),
  });
  return {
    classGroupLabel: rosterValue.classGroupLabel,
    subjectLabel: `Componente Sintético ${courseIndex + 1}`,
    disciplineIndex: `D${courseIndex + 1}`,
    terms: [term(1), term(2), term(3)],
    recovery: {
      sourceSheetName: `ESCALA-${courseIndex + 1}-REC-D${courseIndex + 1}`,
      rows: rows.map((position, index) => [
        position,
        index + 5,
        { X: 20, Y: 20, AA: 20, AB: 60, AC: 0, AD: 0, AE: 0 },
      ] as const),
    },
  };
}

function request(): GradebookImportPersistenceRequestV6 {
  // 11 turmas; as duas primeiras possuem dois componentes, totalizando 13 cursos.
  const rosters = Array.from({ length: 11 }, (_, index) => roster(index, index === 0 ? 27 : 26));
  const courses: GradebookImportCourseV6[] = rosters.map((value, index) => course(value, index));
  courses.push(course(rosters[0]!, 11), course(rosters[1]!, 12));
  return {
    transportVersion: 6,
    operation: 'persist-recognized-file',
    manifest: {
      fileName: 'fixture-escala-staging.xlsb',
      extension: 'xlsb',
      reportedMimeType: null,
      sizeBytes: 1024,
      lastModifiedAt: null,
      sha256: 'a'.repeat(64),
      sourceContractVersion: 2,
      parserVersion: 'synthetic-staging-scale-v1',
      readAt: instant,
    },
    recognizedSuggestions: { academicYear: 2026, teacherName: 'Docente Sintético Escala' },
    confirmedContext: { academicYearId },
    sourceResolution: { mode: 'resolve-or-create' },
    rosters,
    courses,
    diagnostics: [],
  };
}

function requestWithStudents(students: number): GradebookImportPersistenceRequestV6 {
  const base = request();
  const oneRoster = roster(0, students);
  return {
    ...base,
    rosters: [oneRoster],
    courses: [course(oneRoster, 0)],
  };
}

describe('staged V6 realistic scale', () => {
  it('uses one bounded chunk per realistic course on Workers Paid', () => {
    const input = request();
    const uniqueStudents = input.rosters.reduce((total, value) => total + value.students.length, 0);
    expect(uniqueStudents).toBe(287);
    expect(input.courses).toHaveLength(13);
    expect(GRADEBOOK_IMPORT_STAGE_MAX_POSITIONS_V1).toBe(40);

    const clientChunks = splitCompactGradebookImportV6(input);
    const serverChunks = deriveGradebookImportStageChunksV1(input);
    expect(clientChunks).toHaveLength(13);
    expect(serverChunks).toHaveLength(13);

    for (const [index, chunk] of clientChunks.entries()) {
      expect(chunk.courses).toHaveLength(1);
      expect(chunk.rosters).toHaveLength(1);
      const positions = chunk.courses[0]!.terms[0].rows.map((row) => row[0]);
      expect(positions.length).toBeGreaterThan(0);
      expect(positions.length).toBeLessThanOrEqual(40);
      expect(chunk.courses[0]!.terms[1].rows.map((row) => row[0])).toEqual(positions);
      expect(chunk.courses[0]!.terms[2].rows.map((row) => row[0])).toEqual(positions);
      expect(chunk.courses[0]!.recovery?.rows.map((row) => row[0])).toEqual(positions);
      expect(serverChunks[index]?.positions).toEqual(positions);
    }
  });

  it('keeps 40 positions in one chunk and splits 41 into two matching chunks', () => {
    const forty = requestWithStudents(40);
    expect(splitCompactGradebookImportV6(forty)).toHaveLength(1);
    expect(deriveGradebookImportStageChunksV1(forty)).toHaveLength(1);

    const fortyOne = requestWithStudents(41);
    const clientChunks = splitCompactGradebookImportV6(fortyOne);
    const serverChunks = deriveGradebookImportStageChunksV1(fortyOne);
    expect(clientChunks).toHaveLength(2);
    expect(serverChunks).toHaveLength(2);
    expect(clientChunks.map((chunk) => chunk.courses[0]!.terms[0].rows.length)).toEqual([40, 1]);
    expect(serverChunks.map((chunk) => chunk.positions.length)).toEqual([40, 1]);
  });
});
