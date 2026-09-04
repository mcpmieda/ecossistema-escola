import { describe, expect, it } from 'vitest';
import {
  resolveSourceAssessmentDefinitionV4,
  SOURCE_CONTRACT_V4,
} from '../../../shared/gradebook-contracts/source/source-contract-v4';
import type { SourceAssessmentDefinitionV2 } from '../../../shared/gradebook-contracts/source/source-contract-v2';

const provenance = {
  fileName: 'fixture-sintetica.xlsx',
  fileSha256: 'a'.repeat(64),
  sheetName: 'TURMA-SINTETICA-1º',
  cellAddress: 'AA3',
};

function qualitative(
  maximum: SourceAssessmentDefinitionV2['maximumConfiguration'],
): SourceAssessmentDefinitionV2 {
  return {
    contractVersion: 2,
    kind: 'qualitative-activity',
    sourceSlot: 'AA',
    order: 1,
    maximumConfiguration: maximum,
    name: {
      state: 'text',
      rawValue: 'Atividade sintética',
      provenance: { ...provenance, cellAddress: 'AA4' },
    },
  };
}

describe('SourceContract V4', () => {
  it.each([
    { state: 'ambiguous-empty', rawValue: '' } as const,
    { state: 'ambiguous-marker', rawValue: '*' } as const,
    { state: 'numeric', rawValue: 0 } as const,
    { state: 'numeric', rawValue: -1 } as const,
  ])('resolves a qualitative slot without maximum as nonblocking: %o', (value) => {
    const result = resolveSourceAssessmentDefinitionV4(qualitative({ ...value, provenance }), {
      hasObservedStudentValue: true,
    });
    expect(result).toMatchObject({
      state: 'resolved',
      maximum: { state: 'not-defined' },
      name: 'Atividade sintética',
    });
  });

  it('preserves a positive maximum and the later-completion rule', () => {
    expect(
      resolveSourceAssessmentDefinitionV4(
        qualitative({ state: 'numeric', rawValue: 6, provenance }),
        { hasObservedStudentValue: true },
      ),
    ).toMatchObject({ maximum: { state: 'defined', value: 6 } });
    expect(SOURCE_CONTRACT_V4.assessmentDefinitionSemantics).toMatchObject({
      materializeComponentWithoutMaximum: true,
      materializeGradeEntriesWithoutMaximum: true,
      laterDefinedMaximum: 'append-version-to-same-stable-component-identity',
    });
  });
});
