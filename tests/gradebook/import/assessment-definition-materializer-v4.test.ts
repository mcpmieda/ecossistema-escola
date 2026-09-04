import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  EnrollmentId,
  StudentId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import type { SourceAssessmentDefinitionV2 } from '../../../shared/gradebook-contracts/source/source-contract-v2';
import { materializeAssessmentDefinitionsV4 } from '../../../src/features/gradebook/import/assessment-definition-materializer-v4';
import {
  recognizeWorkbook,
  type GradeSheetRecognition,
} from '../../../src/features/gradebook/import/spreadsheet-recognizer';
import {
  SYNTHETIC_FILES,
  SYNTHETIC_TEACHER_WORKBOOK,
  createSyntheticFile,
  createSyntheticSheetJs,
} from '../fixtures/synthetic-teacher-workbooks';

function baseSheet(): GradeSheetRecognition {
  const workbook = recognizeWorkbook(
    createSyntheticFile(SYNTHETIC_FILES.xlsx),
    SYNTHETIC_TEACHER_WORKBOOK,
    createSyntheticSheetJs(),
    { fileSha256: '4'.repeat(64) },
  );
  const sheet = workbook.gradeSheets.find((candidate) => candidate.name === '6A1º');
  if (!sheet) throw new Error('fixture-sintetica-ausente');
  return sheet;
}

const context = {
  logicalSourceReference: 'logical-source:v4:synthetic',
  academicYearId: 'academic-year:v4:2026' as AcademicYearId,
  teachingAssignmentId: 'teaching-assignment:v4:synthetic' as TeachingAssignmentId,
  term: 1 as const,
  students: [
    {
      row: 5,
      studentId: 'student:v4:1' as StudentId,
      enrollmentId: 'enrollment:v4:1' as EnrollmentId,
    },
    {
      row: 6,
      studentId: 'student:v4:2' as StudentId,
      enrollmentId: 'enrollment:v4:2' as EnrollmentId,
    },
  ],
};

function replaceMaximum(
  sheet: GradeSheetRecognition,
  maximumConfiguration: SourceAssessmentDefinitionV2['maximumConfiguration'],
): GradeSheetRecognition {
  return {
    ...sheet,
    assessmentDefinitions: sheet.assessmentDefinitions.map((definition) =>
      definition.sourceSlot === 'AA' ? { ...definition, maximumConfiguration } : definition,
    ),
  };
}

describe('materialização de definições V4', () => {
  it('persiste componente e notas sem máximo e completa o mesmo componente em reimportação', async () => {
    const original = baseSheet();
    const aa = original.assessmentDefinitions.find((value) => value.sourceSlot === 'AA');
    if (!aa) throw new Error('definição AA sintética ausente');
    const withoutMaximum = replaceMaximum(original, {
      state: 'ambiguous-empty',
      rawValue: '',
      provenance: aa.maximumConfiguration.provenance,
    });

    const first = await materializeAssessmentDefinitionsV4(withoutMaximum, context);
    const completed = await materializeAssessmentDefinitionsV4(original, context);
    const firstComponent = first.components.find(
      (value) => value.sourceDefinition.sourceSlot === 'AA',
    );
    const completedComponent = completed.components.find(
      (value) => value.sourceDefinition.sourceSlot === 'AA',
    );
    const firstEntries = first.gradeEntries.filter(
      (value) => value.assessmentComponentId === firstComponent?.value.id,
    );
    const completedEntries = completed.gradeEntries.filter(
      (value) => value.assessmentComponentId === completedComponent?.value.id,
    );

    expect(first.blockedDefinitions).toHaveLength(0);
    expect(firstComponent?.value.maximum).toEqual({ state: 'not-defined' });
    expect(firstEntries.length).toBeGreaterThan(0);
    expect(completedComponent?.value.maximum).toEqual({ state: 'defined', value: 3 });
    expect(completedComponent?.value.id).toBe(firstComponent?.value.id);
    expect(completedComponent?.stableKey).toBe(firstComponent?.stableKey);
    expect(completedEntries.map((value) => value.id)).toEqual(
      firstEntries.map((value) => value.id),
    );
    expect(completedEntries.map((value) => value.value)).toEqual(
      firstEntries.map((value) => value.value),
    );
  });
});
