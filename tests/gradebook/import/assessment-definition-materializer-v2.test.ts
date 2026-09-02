import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  EnrollmentId,
  StudentId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import {
  NATIVE_TERM_COMPOSITION_PROFILE_2026_V1,
  composeNativeTermResult,
} from '../../../src/gradebook-domain/calculations/term/compose-native-term-result';
import { materializeAssessmentDefinitionsV2 } from '../../../src/features/gradebook/import/assessment-definition-materializer-v2';
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

const academicYearId = 'academic-year:assessment-v2:2026' as AcademicYearId;
const teachingAssignmentId =
  'teaching-assignment:assessment-v2:mathematics' as TeachingAssignmentId;
const logicalSourceReference = 'logical-source:assessment-v2:teacher-a';
const fileSha256 = 'b'.repeat(64);

function workbook() {
  return recognizeWorkbook(
    createSyntheticFile(SYNTHETIC_FILES.xlsx),
    SYNTHETIC_TEACHER_WORKBOOK,
    createSyntheticSheetJs(),
    { fileSha256 },
  );
}

function sheet(name = '6A1º'): GradeSheetRecognition {
  const result = workbook().gradeSheets.find((candidate) => candidate.name === name);
  if (!result) throw new Error(`Guia sintética ausente: ${name}`);
  return result;
}

function context(
  overrides: Partial<{
    logicalSourceReference: string;
    academicYearId: AcademicYearId;
    teachingAssignmentId: TeachingAssignmentId;
    term: 1 | 2 | 3;
  }> = {},
) {
  return {
    logicalSourceReference,
    academicYearId,
    teachingAssignmentId,
    term: 1 as const,
    students: [
      {
        row: 5,
        studentId: 'student:assessment-v2:01' as StudentId,
        enrollmentId: 'enrollment:assessment-v2:01' as EnrollmentId,
      },
      {
        row: 6,
        studentId: 'student:assessment-v2:02' as StudentId,
        enrollmentId: 'enrollment:assessment-v2:02' as EnrollmentId,
      },
    ],
    ...overrides,
  };
}

describe('materialização de definições de avaliações V2', () => {
  it('materializa apenas definições resolvidas com tipo, nome, máximo e ordem oficiais', async () => {
    const result = await materializeAssessmentDefinitionsV2(sheet(), context());

    expect(
      result.components.map(({ value }) => [value.type, value.name, value.maximum, value.order]),
    ).toEqual([
      ['quantitative-assessment', 'Avaliação quantitativa 1', 8, 1],
      ['quantitative-assessment', 'Avaliação quantitativa 2', 5.5, 2],
      ['qualitative-activity', 'Pesquisa sobre frações', 3, 3],
      ['qualitative-activity', 'Seminário', 4, 4],
      ['qualitative-activity', 'Leitura e síntese', 2.5, 7],
    ]);
    expect(JSON.stringify(result.components)).not.toContain('simulation');
    expect(result.blockedDefinitions).toHaveLength(7);
    expect(
      result.blockedDefinitions.every((definition) => definition.gradeEntriesMaterialized === 0),
    ).toBe(true);
  });

  it('associa R, S e AA somente aos seus próprios componentes e preserva zero/negativo', async () => {
    const result = await materializeAssessmentDefinitionsV2(sheet(), context());
    const bySlot = new Map(
      result.components.map((component) => [
        component.sourceDefinition.sourceSlot,
        component.value,
      ]),
    );
    const entries = new Map(
      result.gradeEntries.map((entry) => [entry.assessmentComponentId, entry]),
    );

    expect(entries.get(bySlot.get('R')!.id)?.value.imported.value).toEqual({
      state: 'official-zero',
      value: 0,
      sourceMarker: 0.1,
    });
    expect(entries.get(bySlot.get('S')!.id)?.value.imported.value).toEqual({
      state: 'legacy-zero',
      value: 0,
    });
    expect(entries.get(bySlot.get('AA')!.id)?.value.imported.value).toEqual({
      state: 'numeric',
      value: -1,
    });
    expect(
      entries.get(bySlot.get('R')!.id)?.value.imported.evidence[0].provenance.cellAddress,
    ).toBe('R5');
    expect(
      entries.get(bySlot.get('S')!.id)?.value.imported.evidence[0].provenance.cellAddress,
    ).toBe('S5');
    expect(
      entries.get(bySlot.get('AA')!.id)?.value.imported.evidence[0].provenance.cellAddress,
    ).toBe('AA5');
    expect(
      result.gradeEntries.some((entry) => entry.assessmentComponentId === bySlot.get('AB')!.id),
    ).toBe(false);
  });

  it('não cria componente ou GradeEntry órfão para nome/configuração insuficiente', async () => {
    const result = await materializeAssessmentDefinitionsV2(sheet(), context());
    const blockedSlots = result.blockedDefinitions.map(
      (definition) => definition.sourceDefinition.sourceSlot,
    );
    expect(blockedSlots).toEqual(['AC', 'AD', 'AF', 'AG', 'AH', 'AI', 'AJ']);
    expect(result.components.some((component) => component.value.maximum === 0)).toBe(false);
    expect(
      result.blockedDefinitions.find(
        ({ sourceDefinition }) => sourceDefinition.sourceSlot === 'AC',
      ),
    ).toMatchObject({
      resolution: {
        state: 'insufficient-data',
        observedName: 'Atividade nomeada sem máximo',
        reason: 'maximum-ambiguous-empty',
      },
    });
  });

  it('mantém identidade no mesmo slot quando nome/máximo mudam e muda a versão sem trocar o ID', async () => {
    const originalSheet = sheet();
    const changedAa = sheet('6A2º').assessmentDefinitions.find(
      (definition) => definition.sourceSlot === 'AA',
    );
    if (!changedAa) throw new Error('Definição AA alterada ausente.');
    const changedSheet: GradeSheetRecognition = {
      ...originalSheet,
      assessmentDefinitions: originalSheet.assessmentDefinitions.map((definition) =>
        definition.sourceSlot === 'AA' ? changedAa : definition,
      ),
    };
    const [original, changed] = await Promise.all([
      materializeAssessmentDefinitionsV2(originalSheet, context()),
      materializeAssessmentDefinitionsV2(changedSheet, context()),
    ]);
    const first = original.components.find(
      ({ sourceDefinition }) => sourceDefinition.sourceSlot === 'AA',
    );
    const second = changed.components.find(
      ({ sourceDefinition }) => sourceDefinition.sourceSlot === 'AA',
    );
    expect(first?.stableKey).toBe(second?.stableKey);
    expect(first?.value.id).toBe(second?.value.id);
    expect(first?.value).toMatchObject({ name: 'Pesquisa sobre frações', maximum: 3 });
    expect(second?.value).toMatchObject({
      name: 'Pesquisa sobre frações — versão revisada',
      maximum: 4,
    });
  });

  it('isola componente por fonte lógica, ano, assignment, trimestre e slot', async () => {
    const base = await materializeAssessmentDefinitionsV2(sheet(), context());
    const baseR = base.components.find(
      ({ sourceDefinition }) => sourceDefinition.sourceSlot === 'R',
    )!;
    const variants = await Promise.all([
      materializeAssessmentDefinitionsV2(
        sheet(),
        context({ logicalSourceReference: 'logical-source:assessment-v2:teacher-b' }),
      ),
      materializeAssessmentDefinitionsV2(
        sheet(),
        context({ academicYearId: 'academic-year:assessment-v2:2027' as AcademicYearId }),
      ),
      materializeAssessmentDefinitionsV2(
        sheet(),
        context({
          teachingAssignmentId: 'teaching-assignment:assessment-v2:science' as TeachingAssignmentId,
        }),
      ),
      materializeAssessmentDefinitionsV2(
        { ...sheet(), stage: 'trimester-2' },
        context({ term: 2 }),
      ),
    ]);
    const variantIds = variants.map(
      (result) =>
        result.components.find(({ sourceDefinition }) => sourceDefinition.sourceSlot === 'R')!.value
          .id,
    );
    expect(new Set([baseR.value.id, ...variantIds]).size).toBe(5);
  });

  it('mudar só o valor do aluno mantém componente e stream do GradeEntry estáveis', async () => {
    const originalSheet = sheet();
    const changedSheet: GradeSheetRecognition = {
      ...originalSheet,
      students: originalSheet.students.map((student) =>
        student.row === 5
          ? {
              ...student,
              quantitativeAssessments: [
                { source: 6, value: 6, kind: 'manual' },
                student.quantitativeAssessments[1],
              ],
            }
          : student,
      ),
    };
    const [original, changed] = await Promise.all([
      materializeAssessmentDefinitionsV2(originalSheet, context()),
      materializeAssessmentDefinitionsV2(changedSheet, context()),
    ]);
    const originalR = original.components.find(
      ({ sourceDefinition }) => sourceDefinition.sourceSlot === 'R',
    )!;
    const changedR = changed.components.find(
      ({ sourceDefinition }) => sourceDefinition.sourceSlot === 'R',
    )!;
    const originalEntry = original.gradeEntries.find(
      (entry) => entry.assessmentComponentId === originalR.value.id,
    )!;
    const changedEntry = changed.gradeEntries.find(
      (entry) => entry.assessmentComponentId === changedR.value.id,
    )!;
    expect(changedR.value).toEqual(originalR.value);
    expect(changedEntry.id).toBe(originalEntry.id);
    expect(changedEntry.value.imported.value).toEqual({ state: 'numeric', value: 6 });
  });

  it('não altera os agregados oficiais reconhecidos ao enriquecer as definições', async () => {
    const recognized = sheet();
    const before = recognized.students.map((student) => ({
      quantitativeTotal: student.quantitativeTotal,
      parallel: student.parallel,
      qualitativeTotal: student.qualitativeTotal,
      official: student.official,
      annual: student.annual,
    }));
    await materializeAssessmentDefinitionsV2(recognized, context());
    expect(
      recognized.students.map((student) => ({
        quantitativeTotal: student.quantitativeTotal,
        parallel: student.parallel,
        qualitativeTotal: student.qualitativeTotal,
        official: student.official,
        annual: student.annual,
      })),
    ).toEqual(before);
  });

  it('preserva o resultado do motor nativo e o perfil 45/55 após a materialização', async () => {
    const recognized = sheet();
    const student = recognized.students[0];
    if (!student?.quantitativeTotal || !student.qualitativeTotal) {
      throw new Error('Agregados sintéticos esperados não foram reconhecidos.');
    }
    const engineInput = {
      term: 1 as const,
      quantitativeConsidered: {
        state: 'numeric' as const,
        value: student.quantitativeTotal.value,
      },
      qualitativeOperational: {
        state: 'numeric' as const,
        value: student.qualitativeTotal.value,
      },
    };
    const before = composeNativeTermResult(engineInput, NATIVE_TERM_COMPOSITION_PROFILE_2026_V1);

    await materializeAssessmentDefinitionsV2(recognized, context());

    const after = composeNativeTermResult(engineInput, NATIVE_TERM_COMPOSITION_PROFILE_2026_V1);
    expect(after).toEqual(before);
    expect(after.maximums).toEqual({ term: 30, quantitative: 13.5, qualitative: 16.5 });
  });
});
