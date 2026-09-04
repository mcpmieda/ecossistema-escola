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
      state: 'resolved',
      name: 'Rótulo livre',
      maximum: 7.5,
      applicability: { state: 'applicable' },
    });

    expect(
      resolveSourceAssessmentDefinitionV3(qualitative(7.5, 42), {
        hasObservedStudentValue: false,
      }),
    ).toMatchObject({
      state: 'resolved',
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
  ] as const)(
    'resolve máximo não numérico %j sem lançamento como not-applicable no snapshot',
    (rawMaximum, maximumConfigurationState) => {
      const resolution = resolveSourceAssessmentDefinitionV3(qualitative(rawMaximum), {
        hasObservedStudentValue: false,
      });
      expect(resolution).toMatchObject({
        state: 'resolved',
        maximumConfigurationState,
        applicability: { state: 'not-applicable', reason: 'maximum-not-configured' },
      });
      expect('maximum' in resolution).toBe(false);
    },
  );

  it.each([
    ['*', 'maximum-ambiguous-marker'],
    ['', 'maximum-ambiguous-empty'],
    [undefined, 'maximum-missing-field'],
    ['a definir', 'maximum-unrecognized'],
  ] as const)(
    'mantém máximo não numérico %j com lançamento em review-required',
    (rawMaximum, reason) => {
      expect(
        resolveSourceAssessmentDefinitionV3(qualitative(rawMaximum), {
          hasObservedStudentValue: true,
        }),
      ).toMatchObject({ state: 'insufficient-data', reason });
    },
  );

  it.each([0, -1, Number.NaN])(
    'mantém máximo numérico não positivo/inválido fail-closed: %s',
    (maximum) => {
      expect(
        resolveSourceAssessmentDefinitionV3(qualitative(maximum), {
          hasObservedStudentValue: false,
        }),
      ).toMatchObject({ state: 'insufficient-data', reason: 'maximum-not-positive' });
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
