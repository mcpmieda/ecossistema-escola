import { describe, expect, it } from 'vitest';

import {
  SOURCE_CONTRACT_V1,
  isSourceQualitativeActivityApplicableV1,
  type SourceCellProvenanceV1,
} from '../../../shared/gradebook-contracts/source/source-contract-v1';
import {
  SOURCE_CONTRACT_V2,
  SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2,
  SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2,
  classifySourceAssessmentMaximumConfigurationV2,
  classifySourceAssessmentNameV2,
  resolveSourceAssessmentDefinitionV2,
  type SourceAssessmentDefinitionV2,
} from '../../../shared/gradebook-contracts/source/source-contract-v2';

function provenance(cellAddress: string): SourceCellProvenanceV1 {
  return {
    fileName: 'professor-sintetico.xlsx',
    fileSha256: '1'.repeat(64),
    sheetName: '6A1ºD2',
    cellAddress,
  };
}

function qualitativeDefinition(
  sourceSlot: 'AA' | 'AB' | 'AC',
  order: number,
  maximum: number | null | '' | '*',
  name: string | null | '',
): SourceAssessmentDefinitionV2 {
  return {
    contractVersion: 2,
    kind: 'qualitative-activity',
    sourceSlot,
    order,
    maximumConfiguration: classifySourceAssessmentMaximumConfigurationV2(
      maximum,
      provenance(`${sourceSlot}3`),
    ),
    name: classifySourceAssessmentNameV2(name, provenance(`${sourceSlot}4`)),
  };
}

describe('SourceContractV2 — definições trimestrais de avaliação', () => {
  it('SRC2-001: separa R3/S3 dos valores R/S dos estudantes a partir da linha 5', () => {
    expect(SOURCE_CONTRACT_V2.cells.term.studentStartRow).toBe(5);
    expect(SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2).toEqual([
      {
        sourceSlot: 'R',
        order: 1,
        structuralLabel: 'Avaliação quantitativa 1',
        maximumCell: 'R3',
        studentValueColumn: 'R',
      },
      {
        sourceSlot: 'S',
        order: 2,
        structuralLabel: 'Avaliação quantitativa 2',
        maximumCell: 'S3',
        studentValueColumn: 'S',
      },
    ]);
  });

  it('SRC2-002: formaliza AA3:AJ3, AA4:AJ4 e AA5+ sem misturar suas naturezas', () => {
    expect(SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2).toHaveLength(10);
    expect(SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2[0]).toEqual({
      sourceSlot: 'AA',
      order: 1,
      maximumCell: 'AA3',
      nameCell: 'AA4',
      studentValueColumn: 'AA',
    });
    expect(SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2[9]).toEqual({
      sourceSlot: 'AJ',
      order: 10,
      maximumCell: 'AJ3',
      nameCell: 'AJ4',
      studentValueColumn: 'AJ',
    });
  });

  it('SRC2-003: preserva número, vazio e * do máximo/configuração sem coerção destrutiva', () => {
    expect(classifySourceAssessmentMaximumConfigurationV2(8, provenance('AA3'))).toMatchObject({
      state: 'numeric',
      rawValue: 8,
    });
    expect(classifySourceAssessmentMaximumConfigurationV2('', provenance('AB3'))).toMatchObject({
      state: 'ambiguous-empty',
      rawValue: '',
    });
    expect(classifySourceAssessmentMaximumConfigurationV2(null, provenance('AC3'))).toMatchObject({
      state: 'ambiguous-empty',
      rawValue: null,
    });
    expect(classifySourceAssessmentMaximumConfigurationV2('*', provenance('AD3'))).toMatchObject({
      state: 'ambiguous-marker',
      rawValue: '*',
    });
  });

  it('SRC2-004: vazio/* ambíguo permanece insufficient-data e nunca fabrica maximum 0', () => {
    const empty = resolveSourceAssessmentDefinitionV2(
      qualitativeDefinition('AA', 1, '', 'Seminário sintético'),
    );
    const marker = resolveSourceAssessmentDefinitionV2(
      qualitativeDefinition('AB', 2, '*', 'Pesquisa sintética'),
    );
    const zero = resolveSourceAssessmentDefinitionV2(
      qualitativeDefinition('AC', 3, 0, 'Atividade sintética'),
    );

    expect(empty).toEqual({
      state: 'insufficient-data',
      kind: 'qualitative-activity',
      sourceSlot: 'AA',
      order: 1,
      observedName: 'Seminário sintético',
      reason: 'maximum-ambiguous-empty',
    });
    expect(marker).toMatchObject({
      state: 'insufficient-data',
      observedName: 'Pesquisa sintética',
      reason: 'maximum-ambiguous-marker',
    });
    expect(zero).toMatchObject({ state: 'insufficient-data', reason: 'maximum-not-positive' });
    expect('maximum' in empty).toBe(false);
    expect('maximum' in marker).toBe(false);
    expect('maximum' in zero).toBe(false);
  });

  it('SRC2-005: preserva texto livre, Unicode, acentuação e nome longo sem usá-los como semântica', () => {
    const longName = `Investigação — frações, razão e proporção: ação/reflexão çãõ ${'∆'.repeat(180)}`;
    const definition = qualitativeDefinition('AA', 1, 4.5, longName);
    const resolved = resolveSourceAssessmentDefinitionV2(definition);

    expect(definition.kind === 'qualitative-activity' ? definition.name.rawValue : null).toBe(longName);
    expect(resolved).toMatchObject({
      state: 'resolved',
      kind: 'qualitative-activity',
      sourceSlot: 'AA',
      name: longName,
      maximum: 4.5,
      applicability: { state: 'applicable' },
    });
  });

  it('SRC2-006: R/S resolvem apenas como avaliações quantitativas estruturais, nunca simulation', () => {
    const secondAssessment = {
      contractVersion: 2,
      kind: 'quantitative-assessment',
      sourceSlot: 'S',
      order: 2,
      structuralLabel: 'Avaliação quantitativa 2',
      maximumConfiguration: classifySourceAssessmentMaximumConfigurationV2(6, provenance('S3')),
    } satisfies SourceAssessmentDefinitionV2;

    expect(resolveSourceAssessmentDefinitionV2(secondAssessment)).toEqual({
      state: 'resolved',
      kind: 'quantitative-assessment',
      sourceSlot: 'S',
      order: 2,
      name: 'Avaliação quantitativa 2',
      maximum: 6,
      applicability: { state: 'applicable' },
    });
    expect(JSON.stringify(SOURCE_CONTRACT_V2)).not.toContain('simulation');
  });

  it('SRC2-007: mantém SourceContractV1 interpretável sem reescrever a evidência histórica', () => {
    expect(SOURCE_CONTRACT_V1.version).toBe(1);
    expect(SOURCE_CONTRACT_V1.cells.termColumns.writtenAssessment).toBe('R');
    expect(isSourceQualitativeActivityApplicableV1({ name: '*', maximum: 10 })).toBe(false);
    expect(SOURCE_CONTRACT_V2.predecessorVersion).toBe(1);
    expect(SOURCE_CONTRACT_V2.compatibility).toEqual({
      historicalV1Semantics: 'preserve-as-v1',
      reinterpretHistoricalV1: false,
    });
  });

  it('SRC2-008: T/Z/AK/AM/AN permanecem importados e não são recalculados pelos slots', () => {
    expect(SOURCE_CONTRACT_V2.authoritativeImportedAggregates).toEqual({
      quantitativeTotal: 'T',
      parallelAssessment: 'Z',
      qualitativeTotal: 'AK',
      officialTermGrade: 'AM',
      annualAccumulatedTotal: 'AN',
      recalculateFromAssessmentDefinitions: false,
    });
  });
});
