import { describe, expect, it } from 'vitest';

import {
  SOURCE_CONTRACT_V1,
  type SourceCellProvenanceV1,
} from '../../../shared/gradebook-contracts/source/source-contract-v1';
import {
  SOURCE_CONTRACT_V2,
  classifySourceAssessmentMaximumConfigurationV2,
  classifySourceAssessmentNameV2,
  resolveSourceAssessmentDefinitionV2,
  type SourceAssessmentDefinitionV2,
} from '../../../shared/gradebook-contracts/source/source-contract-v2';
import {
  SOURCE_CONTRACT_V3,
  resolveSourceAssessmentDefinitionV3,
} from '../../../shared/gradebook-contracts/source/source-contract-v3';

function provenance(cellAddress: string): SourceCellProvenanceV1 {
  return {
    fileName: 'fixture-sintetica.xlsb',
    fileSha256: '3'.repeat(64),
    sheetName: 'T1-SINTETICA',
    cellAddress,
  };
}

function qualitative(
  rawMaximum: number | null | '' | '*' | string | boolean | undefined,
  rawName: number | null | '' | string | boolean | undefined = 'Atividade sintética',
): SourceAssessmentDefinitionV2 {
  return {
    contractVersion: 2,
    kind: 'qualitative-activity',
    sourceSlot: 'AA',
    order: 1,
    maximumConfiguration: classifySourceAssessmentMaximumConfigurationV2(
      rawMaximum,
      provenance('AA3'),
    ),
    name: classifySourceAssessmentNameV2(rawName, provenance('AA4')),
  };
}

describe('SourceContractV3 — semântica institucional de AA3:AJ4', () => {
  it('resolve máximo numérico positivo como aplicável e trata AA4 como texto de exibição', () => {
    expect(
      resolveSourceAssessmentDefinitionV3(qualitative(7.5, 'Rótulo livre'), {
        hasObservedStudentValue: false,
      }),
    ).toMatchObject({
      state: 'configured',
      name: 'Rótulo livre',
      maximum: 7.5,
      applicability: { state: 'applicable' },
    });

    expect(
      resolveSourceAssessmentDefinitionV3(qualitative(7.5, 42), {
        hasObservedStudentValue: false,
      }),
    ).toMatchObject({
      state: 'configured',
      name: 'Atividade qualitativa 1',
      maximum: 7.5,
      applicability: { state: 'applicable' },
    });
  });

  it.each([
    ['*', 'ambiguous-marker'],
    ['', 'ambiguous-empty'],
    [null, 'ambiguous-empty'],
    [undefined, 'missing-field'],
    ['a definir', 'unrecognized'],
    [true, 'unrecognized'],
    [0, 'numeric'],
    [-1, 'numeric'],
    [Number.NaN, 'numeric'],
  ] as const)(
    'classifica máximo não configurado %j sem lançamento de forma explícita',
    (rawMaximum, maximumConfigurationState) => {
      const resolution = resolveSourceAssessmentDefinitionV3(qualitative(rawMaximum), {
        hasObservedStudentValue: false,
      });
      expect(resolution).toMatchObject({
        state: 'maximum-not-defined',
        maximumConfigurationState,
        reason: 'maximum-not-defined',
      });
      expect('maximum' in resolution).toBe(false);
      expect('applicability' in resolution).toBe(false);
    },
  );

  it.each([
    ['*', 'maximum-ambiguous-marker'],
    ['', 'maximum-ambiguous-empty'],
    [null, 'maximum-ambiguous-empty'],
    [undefined, 'maximum-missing-field'],
    ['a definir', 'maximum-unrecognized'],
    [true, 'maximum-unrecognized'],
    [0, 'maximum-not-positive'],
    [-1, 'maximum-not-positive'],
    [Number.NaN, 'maximum-not-positive'],
  ] as const)(
    'bloqueia máximo não configurado %j quando existe lançamento',
    (rawMaximum, reason) => {
      expect(
        resolveSourceAssessmentDefinitionV3(qualitative(rawMaximum), {
          hasObservedStudentValue: true,
        }),
      ).toMatchObject({ state: 'insufficient-data', reason });
    },
  );

  it.each([null, '', '   ', 42, true] as const)(
    'usa rótulo estrutural quando AA4 não contém texto livre válido: %j',
    (rawName) => {
      expect(
        resolveSourceAssessmentDefinitionV3(qualitative(7.5, rawName), {
          hasObservedStudentValue: true,
        }),
      ).toMatchObject({
        state: 'configured',
        name: 'Atividade qualitativa 1',
        maximum: 7.5,
      });
    },
  );

  it('preserva R/S em V2 e preserva integralmente V1/V2 históricos', () => {
    const quantitative = {
      contractVersion: 2,
      kind: 'quantitative-assessment',
      sourceSlot: 'R',
      order: 1,
      structuralLabel: 'Avaliação quantitativa 1',
      maximumConfiguration: classifySourceAssessmentMaximumConfigurationV2('*', provenance('R3')),
    } satisfies SourceAssessmentDefinitionV2;

    expect(
      resolveSourceAssessmentDefinitionV3(quantitative, {
        hasObservedStudentValue: false,
      }),
    ).toEqual(resolveSourceAssessmentDefinitionV2(quantitative));
    expect(SOURCE_CONTRACT_V1.version).toBe(1);
    expect(SOURCE_CONTRACT_V2.version).toBe(2);
    expect(SOURCE_CONTRACT_V3).toMatchObject({
      version: 3,
      predecessorVersion: 2,
      compatibility: {
        historicalV1Semantics: 'preserve-as-v1',
        historicalV2Semantics: 'preserve-as-v2',
        transportV4ObservationsSufficient: true,
      },
    });
    expect(SOURCE_CONTRACT_V3.authoritativeImportedAggregates).toEqual(
      SOURCE_CONTRACT_V2.authoritativeImportedAggregates,
    );
  });
});
