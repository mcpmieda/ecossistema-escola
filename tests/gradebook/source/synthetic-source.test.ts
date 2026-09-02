import { describe, expect, it } from 'vitest';
import {
  SOURCE_CONTRACT_V1,
  isSourceQualitativeActivityApplicableV1,
} from '../../../shared/gradebook-contracts/source/source-contract-v1';
import {
  resolveSourceAssessmentDefinitionV2,
  type SourceAssessmentSlotV2,
} from '../../../shared/gradebook-contracts/source/source-contract-v2';
import {
  recognizeWorkbook,
  type GradeSheetRecognition,
  type StudentRecognition,
} from '../../../src/features/gradebook/import/spreadsheet-recognizer';
import {
  SYNTHETIC_ACTIVITY_CASES,
  SYNTHETIC_EXPECTATIONS,
  SYNTHETIC_FILES,
  SYNTHETIC_SHEET_CONTROLS,
  SYNTHETIC_TEACHER_WORKBOOK,
  createSyntheticFile,
  createSyntheticSheetJs,
} from '../fixtures/synthetic-teacher-workbooks';

const SYNTHETIC_SHA256 = 'a'.repeat(64);

function recognizeSyntheticWorkbook() {
  return recognizeWorkbook(
    createSyntheticFile(SYNTHETIC_FILES.xlsx),
    SYNTHETIC_TEACHER_WORKBOOK,
    createSyntheticSheetJs(),
    { fileSha256: SYNTHETIC_SHA256 },
  );
}

function requiredDefinition(sheetName: string, sourceSlot: SourceAssessmentSlotV2) {
  const definition = requiredSheet(sheetName).assessmentDefinitions.find(
    (candidate) => candidate.sourceSlot === sourceSlot,
  );
  if (!definition) throw new Error(`Fixture sintética perdeu a definição ${sourceSlot}.`);
  return definition;
}

function requiredSheet(name: string): GradeSheetRecognition {
  const sheet = recognizeSyntheticWorkbook().gradeSheets.find(
    (candidate) => candidate.name === name,
  );
  if (!sheet) throw new Error(`Fixture sintética perdeu a guia obrigatória ${name}.`);
  return sheet;
}

function requiredStudent(sheetName: string, row: number): StudentRecognition {
  const student = requiredSheet(sheetName).students.find((candidate) => candidate.row === row);
  if (!student) {
    throw new Error(`Fixture sintética perdeu o estudante da linha ${row} na guia ${sheetName}.`);
  }
  return student;
}

describe('massa sintética — contrato e guias da fonte', () => {
  it('SRC-001/SRC-002: reconhece D1 implícito, D2 e D3 explícitos', () => {
    expect(requiredSheet('6A1º').disciplineIndex).toBe('D1');
    expect(requiredSheet('6A2ºD2').disciplineIndex).toBe('D2');
    expect(requiredSheet('6A3ºD3').disciplineIndex).toBe('D3');
  });

  it('SRC-003: lê VG, 1º, 2º, 3º, REC e os metadados J1/K2/K3/K4', () => {
    const summary = recognizeSyntheticWorkbook();
    expect(summary.gradeSheets.map((sheet) => sheet.name)).toEqual(
      SYNTHETIC_EXPECTATIONS.source.gradeSheetNames,
    );
    expect(new Set(summary.gradeSheets.map((sheet) => sheet.stage))).toEqual(
      new Set(['overview', 'trimester-1', 'trimester-2', 'trimester-3', 'recovery']),
    );

    expect(requiredSheet('6A1º')).toMatchObject({
      declaredStudents: SYNTHETIC_EXPECTATIONS.source.d1DeclaredStudents,
      discipline: 'Matemática Sintética',
      className: '6A',
      declaredStage: '1º trimestre',
    });
  });

  it('SRC-004: aplica o contrato oficial a *, máximo zero e nome longo', () => {
    for (const activity of SYNTHETIC_ACTIVITY_CASES) {
      expect(
        isSourceQualitativeActivityApplicableV1(activity),
        `Aplicabilidade inesperada para a atividade sintética: ${activity.name}`,
      ).toBe(activity.expectedApplicable);
    }
    expect(SYNTHETIC_ACTIVITY_CASES[2].name.length).toBeGreaterThan(80);
  });

  it('SRC-005/SRC-008: lê a guia marcada como protegida sem modificar a fonte sintética', () => {
    const before = structuredClone(SYNTHETIC_TEACHER_WORKBOOK);
    const summary = recognizeSyntheticWorkbook();

    expect(SYNTHETIC_SHEET_CONTROLS.protectedSheetNames).toContain('6A1º');
    expect(summary.gradeSheets.map((sheet) => sheet.name)).toContain('6A1º');
    expect(SYNTHETIC_TEACHER_WORKBOOK).toEqual(before);
  });

  it('SRC-006/SRC-007: separa auxiliares ocultas e guia inesperada sem descarte silencioso', () => {
    const summary = recognizeSyntheticWorkbook();

    expect(SYNTHETIC_SHEET_CONTROLS.hiddenSheetNames).toEqual(['CONFIGURAÇÃO', 'AUXILIAR OCULTA']);
    expect(summary.auxiliarySheets).toEqual(SYNTHETIC_EXPECTATIONS.source.auxiliarySheetNames);
    expect(summary.unrecognizedSheets).toEqual(
      SYNTHETIC_EXPECTATIONS.source.unrecognizedSheetNames,
    );
  });
});

describe('massa sintética — semântica observável das células', () => {
  it('CELL-001/CELL-010: vazio e campo ausente não viram zero no leitor atual', () => {
    const student = requiredStudent('6A1º', 5);
    expect(student.qualitative[3]).toBeNull();
    expect(student.qualitative[5]).toBeNull();
    expect(SOURCE_CONTRACT_V1.semantics.empty).toBe('absence');
    expect(SOURCE_CONTRACT_V1.semantics.notApplicable).toBe('not-applicable');
    expect(SOURCE_CONTRACT_V1.semantics.missingField).toBe('missing-field');
  });

  it('CELL-002: preserva 0,1 na origem e expõe zero oficial', () => {
    expect(requiredStudent('6A1º', 5).quantitativeAssessments[0]).toEqual(
      SYNTHETIC_EXPECTATIONS.cells.officialZero,
    );
  });

  it('CELL-003: mantém zero manual legado distinto', () => {
    expect(requiredStudent('6A1º', 5).quantitativeAssessments[1]).toEqual(
      SYNTHETIC_EXPECTATIONS.cells.legacyZero,
    );
  });

  it('CELL-004/CELL-005: preserva números manuais positivos e negativos', () => {
    const student = requiredStudent('6A1º', 5);
    expect(student.qualitativeTotal).toEqual(SYNTHETIC_EXPECTATIONS.cells.manualPositive);
    expect(student.qualitative[0]).toEqual(SYNTHETIC_EXPECTATIONS.cells.manualNegative);
  });

  it('CELL-006: conserva fórmula e cache não zero', () => {
    expect(requiredStudent('6A1º', 5).quantitativeTotal).toEqual(
      SYNTHETIC_EXPECTATIONS.cells.formulaNonzero,
    );
  });

  it('CELL-007: fórmula com cache zero permanece ausência', () => {
    expect(requiredStudent('6A1º', 5).parallel).toBeNull();
  });

  it('CELL-008/CELL-009: fórmula sem cache e texto inválido não inventam nota', () => {
    const student = requiredStudent('6A1º', 5);
    expect(student.qualitative[2]).toBeNull();
    expect(student.qualitative[1]).toBeNull();
  });
});

describe('massa sintética — posições, movimentações e recuperação', () => {
  it('ID-001: preserva posições históricas além da quantidade declarada em J1', () => {
    const sheet = requiredSheet('6A1º');
    expect(sheet.declaredStudents).toBe(SYNTHETIC_EXPECTATIONS.source.d1DeclaredStudents);
    expect(sheet.students).toHaveLength(SYNTHETIC_EXPECTATIONS.source.d1HistoricalPositions);
  });

  it('ID-002/ID-003: preserva FOI PARA/ESTAVA NO e notas replicadas nas duas posições', () => {
    const origin = requiredStudent('6A1º', 7);
    const destination = requiredStudent('6B1º', 5);

    expect(origin.status).toBe(SYNTHETIC_EXPECTATIONS.transfer.originStatus);
    expect(destination.status).toBe(SYNTHETIC_EXPECTATIONS.transfer.destinationStatus);
    expect(origin.official?.value).toBe(SYNTHETIC_EXPECTATIONS.transfer.replicatedOfficialValue);
    expect(destination.official?.value).toBe(
      SYNTHETIC_EXPECTATIONS.transfer.replicatedOfficialValue,
    );
  });

  it('ID-004/ID-005: mantém notas de novato e de posição histórica', () => {
    expect(requiredStudent('6A1º', 6)).toMatchObject({
      status: 'NOVATO',
      official: { value: 7 },
      annual: { value: 18 },
    });
    expect(requiredStudent('6A1º', 8)).toMatchObject({
      status: 'TRANSFERIDO',
      official: { value: 5.5 },
      annual: { value: 14 },
    });
  });

  it('ID-006: preserva o ponto inicial usado para distinguir homônimos', () => {
    expect(requiredStudent('6A1º', 9).name).toBe('.Estudante Fictício Homônimo');
    expect(requiredStudent('6A1º', 10).name).toBe('Estudante Fictício Homônimo');
  });

  it('ID-007: mantém leituras de arquivos anuais independentes sem associação aproximada', () => {
    const first = recognizeWorkbook(
      { ...createSyntheticFile(SYNTHETIC_FILES.xlsx), name: 'massa-sintetica-ano-a.xlsx' },
      SYNTHETIC_TEACHER_WORKBOOK,
      createSyntheticSheetJs(),
      { fileSha256: SYNTHETIC_SHA256 },
    );
    const second = recognizeWorkbook(
      { ...createSyntheticFile(SYNTHETIC_FILES.xlsx), name: 'massa-sintetica-ano-b.xlsx' },
      SYNTHETIC_TEACHER_WORKBOOK,
      createSyntheticSheetJs(),
      { fileSha256: SYNTHETIC_SHA256 },
    );

    expect(first.fileName).not.toBe(second.fileName);
    expect(
      first.classes.map(
        ({ name, students, declaredStudents, disciplines, trimesters, recovery }) => ({
          name,
          students,
          declaredStudents,
          disciplines,
          trimesters,
          recovery,
        }),
      ),
    ).toEqual(
      second.classes.map(
        ({ name, students, declaredStudents, disciplines, trimesters, recovery }) => ({
          name,
          students,
          declaredStudents,
          disciplines,
          trimesters,
          recovery,
        }),
      ),
    );
  });

  it('REC-001/REC-002/REC-003/REC-004: lê originais, aplicabilidade, REC e total pós-REC', () => {
    const recovery = requiredStudent('6AREC', 5).recovery;
    if (!recovery) throw new Error('Fixture sintética perdeu a leitura de recuperação da linha 5.');

    expect([
      recovery.originalTrimester1?.value,
      recovery.originalTrimester2?.value,
      recovery.originalTrimester3?.value,
      recovery.originalAnnual?.value,
    ]).toEqual(SYNTHETIC_EXPECTATIONS.recovery.original);
    expect([
      recovery.trimester1?.value,
      recovery.trimester2?.value,
      recovery.trimester3?.value,
      recovery.totalAfterRecovery?.value,
    ]).toEqual(SYNTHETIC_EXPECTATIONS.recovery.replacement);
    expect([
      recovery.eligibleTrimester1,
      recovery.eligibleTrimester2,
      recovery.eligibleTrimester3,
    ]).toEqual(SYNTHETIC_EXPECTATIONS.recovery.eligible);
  });

  it('REC-005: ausência de nota REC permanece ausência, não zero', () => {
    const recovery = requiredStudent('6AREC', 6).recovery;
    if (!recovery) throw new Error('Fixture sintética perdeu a leitura de recuperação da linha 6.');
    expect(recovery.trimester2).toBeNull();
  });
});

describe('massa sintética — definições trimestrais V2', () => {
  it('lê R3/S3 antes dos alunos e mantém R/S como slots quantitativos genéricos', () => {
    const sheet = requiredSheet('6A1º');
    expect(sheet.students.every((student) => student.row >= 5)).toBe(true);
    expect(sheet.assessmentDefinitions).toHaveLength(12);
    expect(resolveSourceAssessmentDefinitionV2(requiredDefinition('6A1º', 'R'))).toMatchObject({
      state: 'resolved',
      kind: 'quantitative-assessment',
      sourceSlot: 'R',
      name: 'Avaliação quantitativa 1',
      maximum: 8,
    });
    expect(resolveSourceAssessmentDefinitionV2(requiredDefinition('6A1º', 'S'))).toMatchObject({
      state: 'resolved',
      kind: 'quantitative-assessment',
      sourceSlot: 'S',
      name: 'Avaliação quantitativa 2',
      maximum: 5.5,
    });
    expect(JSON.stringify(sheet)).not.toContain('simulation');
  });

  it('separa AA3, AA4 e AA5 sem normalizar destrutivamente o nome livre', () => {
    const definition = requiredDefinition('6A1º', 'AA');
    if (definition.kind !== 'qualitative-activity')
      throw new Error('AA deixou de ser qualitativa.');
    expect(definition.maximumConfiguration).toMatchObject({
      state: 'numeric',
      rawValue: 3,
      provenance: { cellAddress: 'AA3', fileSha256: SYNTHETIC_SHA256 },
    });
    expect(definition.name).toMatchObject({
      state: 'text',
      rawValue: 'Pesquisa sobre frações',
      provenance: { cellAddress: 'AA4' },
    });
    expect(requiredStudent('6A1º', 5).qualitative[0]).toEqual(
      SYNTHETIC_EXPECTATIONS.cells.manualNegative,
    );
  });

  it('preserva vazio, *, Unicode e definição nomeada incompleta como insufficient-data', () => {
    const empty = requiredDefinition('6A1º', 'AC');
    const marker = requiredDefinition('6A1º', 'AD');
    expect(empty.maximumConfiguration).toMatchObject({ state: 'ambiguous-empty', rawValue: '' });
    expect(marker.maximumConfiguration).toMatchObject({ state: 'ambiguous-marker', rawValue: '*' });
    expect(resolveSourceAssessmentDefinitionV2(empty)).toMatchObject({
      state: 'insufficient-data',
      observedName: 'Atividade nomeada sem máximo',
      reason: 'maximum-ambiguous-empty',
    });
    expect(resolveSourceAssessmentDefinitionV2(marker)).toMatchObject({
      state: 'insufficient-data',
      reason: 'maximum-ambiguous-marker',
    });
    if (marker.kind !== 'qualitative-activity' || marker.name.state !== 'text') {
      throw new Error('Nome Unicode sintético não foi preservado.');
    }
    expect(marker.name.rawValue).toContain('Produção científica — investigação');
    expect(marker.name.rawValue.length).toBeGreaterThan(80);
  });

  it('observa mudança de nome/máximo e regressão de slot resolvido para ambíguo/ausente', () => {
    expect(resolveSourceAssessmentDefinitionV2(requiredDefinition('6A2º', 'AA'))).toMatchObject({
      state: 'resolved',
      name: 'Pesquisa sobre frações — versão revisada',
      maximum: 4,
    });
    expect(resolveSourceAssessmentDefinitionV2(requiredDefinition('6A2º', 'S'))).toMatchObject({
      state: 'insufficient-data',
      reason: 'maximum-ambiguous-marker',
    });
    expect(resolveSourceAssessmentDefinitionV2(requiredDefinition('6A3º', 'R'))).toMatchObject({
      state: 'insufficient-data',
      reason: 'maximum-missing-field',
    });
  });

  it('preserva T, AK, AM e AN do estudante sem recomposição pelos novos detalhes', () => {
    const student = requiredStudent('6A1º', 5);
    expect(student.quantitativeTotal).toEqual(SYNTHETIC_EXPECTATIONS.cells.formulaNonzero);
    expect(student.qualitativeTotal).toEqual(SYNTHETIC_EXPECTATIONS.cells.manualPositive);
    expect(student.official?.value).toBe(9.5);
    expect(student.annual?.value).toBe(20);
  });
});
