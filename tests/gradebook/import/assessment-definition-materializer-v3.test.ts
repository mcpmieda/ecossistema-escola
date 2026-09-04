import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  EnrollmentId,
  StudentId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import type { SourceAssessmentDefinitionV2 } from '../../../shared/gradebook-contracts/source/source-contract-v2';
import { materializeAssessmentDefinitionsV3 } from '../../../src/features/gradebook/import/assessment-definition-materializer-v3';
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
  logicalSourceReference: 'logical-source:v3:synthetic',
  academicYearId: 'academic-year:v3:2026' as AcademicYearId,
  teachingAssignmentId: 'teaching-assignment:v3:synthetic' as TeachingAssignmentId,
  term: 1 as const,
  students: [
    {
      row: 5,
      studentId: 'student:v3:1' as StudentId,
      enrollmentId: 'enrollment:v3:1' as EnrollmentId,
    },
    {
      row: 6,
      studentId: 'student:v3:2' as StudentId,
      enrollmentId: 'enrollment:v3:2' as EnrollmentId,
    },
  ],
};

function replaceDefinition(
  sheet: GradeSheetRecognition,
  slot: SourceAssessmentDefinitionV2['sourceSlot'],
  update: (definition: SourceAssessmentDefinitionV2) => SourceAssessmentDefinitionV2,
): GradeSheetRecognition {
  return {
    ...sheet,
    assessmentDefinitions: sheet.assessmentDefinitions.map((definition) =>
      definition.sourceSlot === slot ? update(definition) : definition,
    ),
  };
}

describe('materialização de definições V3', () => {
  it('não cria componente nem GradeEntry para slots sem máximo e sem lançamento', async () => {
    const sheet = {
      ...baseSheet(),
      students: baseSheet().students.map((student) => ({
        ...student,
        qualitative: Array.from({ length: 10 }, () => null),
      })),
    };
    const result = await materializeAssessmentDefinitionsV3(sheet, context);

    expect(result.notApplicableDefinitions.length).toBeGreaterThan(0);
    expect(
      result.notApplicableDefinitions.every(
        (definition) =>
          definition.assessmentComponentsMaterialized === 0 &&
          definition.gradeEntriesMaterialized === 0,
      ),
    ).toBe(true);
    const inactiveSlots = new Set(
      result.notApplicableDefinitions.map((definition) => definition.sourceDefinition.sourceSlot),
    );
    expect(
      result.components.some((component) =>
        inactiveSlots.has(component.sourceDefinition.sourceSlot),
      ),
    ).toBe(false);
  });

  it('bloqueia máximo não numérico quando existe lançamento no slot', async () => {
    const original = baseSheet();
    const sheet = replaceDefinition(original, 'AA', (definition) => ({
      ...definition,
      maximumConfiguration: {
        state: 'ambiguous-marker',
        rawValue: '*',
        provenance: definition.maximumConfiguration.provenance,
      },
    }));
    const result = await materializeAssessmentDefinitionsV3(sheet, context);

    expect(result.blockedDefinitions).toContainEqual(
      expect.objectContaining({
        sourceDefinition: expect.objectContaining({ sourceSlot: 'AA' }),
        resolution: expect.objectContaining({ reason: 'maximum-ambiguous-marker' }),
        gradeEntriesMaterialized: 0,
      }),
    );
    expect(
      result.components.some((component) => component.sourceDefinition.sourceSlot === 'AA'),
    ).toBe(false);
  });

  it('materializa máximo positivo mesmo com AA4 inválido usando rótulo estrutural', async () => {
    const sheet = replaceDefinition(baseSheet(), 'AA', (definition) => {
      if (definition.kind !== 'qualitative-activity') return definition;
      return {
        ...definition,
        name: {
          state: 'unrecognized',
          rawValue: 99,
          provenance: definition.name.provenance,
        },
      };
    });
    const result = await materializeAssessmentDefinitionsV3(sheet, context);
    const component = result.components.find(
      (candidate) => candidate.sourceDefinition.sourceSlot === 'AA',
    );

    expect(component?.value).toMatchObject({
      name: 'Atividade qualitativa 1',
      maximum: 3,
      applicability: { state: 'applicable' },
    });
    expect(
      component?.sourceDefinition.kind === 'qualitative-activity' &&
        component.sourceDefinition.name.state,
    ).toBe('unrecognized');
  });

  it('trata o mesmo slot de cada trimestre como observação independente', async () => {
    const first = replaceDefinition(baseSheet(), 'AA', (definition) => ({
      ...definition,
      maximumConfiguration: {
        state: 'ambiguous-marker',
        rawValue: '*',
        provenance: definition.maximumConfiguration.provenance,
      },
    }));
    const withoutValues = {
      ...first,
      students: first.students.map((student) => ({
        ...student,
        qualitative: [null, ...student.qualitative.slice(1)],
      })),
    };
    const second = { ...baseSheet(), stage: 'trimester-2' as const };

    const [t1, t2] = await Promise.all([
      materializeAssessmentDefinitionsV3(withoutValues, context),
      materializeAssessmentDefinitionsV3(second, { ...context, term: 2 }),
    ]);
    expect(
      t1.notApplicableDefinitions.some((value) => value.sourceDefinition.sourceSlot === 'AA'),
    ).toBe(true);
    expect(t2.components.some((value) => value.sourceDefinition.sourceSlot === 'AA')).toBe(true);
  });

  it('não modifica T nem AK e não cria máximo zero como atalho', async () => {
    const sheet = baseSheet();
    const before = sheet.students.map((student) => [
      student.quantitativeTotal,
      student.qualitativeTotal,
    ]);
    const result = await materializeAssessmentDefinitionsV3(sheet, context);
    expect(
      sheet.students.map((student) => [student.quantitativeTotal, student.qualitativeTotal]),
    ).toEqual(before);
    expect(result.components.every((component) => component.value.maximum > 0)).toBe(true);
  });
});
