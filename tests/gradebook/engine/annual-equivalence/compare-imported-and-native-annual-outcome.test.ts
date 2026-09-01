import { describe, expect, it } from 'vitest';

import type {
  AcademicGradeValueV1,
  ImportedGradeValueV1,
  ResultCoverageV1,
} from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import type { SourceCellEvidenceV1 } from '../../../../shared/gradebook-contracts/source/source-contract-v1';
import {
  compareImportedAndNativeAnnualOutcome,
  NATIVE_ANNUAL_EQUIVALENCE_RULE_VERSION_V1,
  type NativeAnnualEquivalenceInputV1,
} from '../../../../src/gradebook-domain/calculations/annual-equivalence/compare-imported-and-native-annual-outcome';
import {
  NATIVE_ANNUAL_OUTCOME_PROFILE_2026_V1,
  type NativeAnnualComponentInputV1,
} from '../../../../src/gradebook-domain/calculations/annual-result/resolve-native-annual-outcome';

const profile = NATIVE_ANNUAL_OUTCOME_PROFILE_2026_V1;
const completeCoverage: ResultCoverageV1 = {
  state: 'complete',
  expectedItemCount: 1,
  resolvedItemCount: 1,
  missingItemCount: 0,
  reasons: [],
};
const provenance = {
  fileName: 'synthetic-gradebook.xlsx',
  fileSha256: 'synthetic-sha256',
  sheetName: 'SyntheticClassREC',
  cellAddress: 'U10',
};

function numeric(value: number): AcademicGradeValueV1 {
  return { state: 'numeric', value };
}

function evidenceFor(value: AcademicGradeValueV1): SourceCellEvidenceV1 {
  switch (value.state) {
    case 'numeric':
      return { classification: 'manual-positive-number', rawValue: value.value, provenance };
    case 'official-zero':
      return {
        classification: 'manual-official-zero-marker',
        rawValue: value.sourceMarker,
        provenance,
      };
    case 'legacy-zero':
      return { classification: 'manual-legacy-zero', rawValue: value.value, provenance };
    case 'absent':
      return { classification: 'empty', rawValue: '', provenance };
    case 'not-applicable':
      return { classification: 'not-applicable', rawValue: '*', provenance };
    case 'insufficient-data':
      return { classification: 'missing-field', rawValue: undefined, provenance };
  }
}

function imported(value: AcademicGradeValueV1): ImportedGradeValueV1 {
  const sourceEvidence = evidenceFor(value);
  return { value, evidence: [sourceEvidence] };
}

function component(
  originalTotal: AcademicGradeValueV1,
  postRecoveryTotal: AcademicGradeValueV1 = originalTotal,
  coverage: ResultCoverageV1 = completeCoverage,
): NativeAnnualComponentInputV1 {
  return {
    componentKey: 'synthetic-component',
    originalTotal,
    postRecoveryTotal,
    coverage,
  };
}

function input(
  importedValue: AcademicGradeValueV1,
  nativeComponent: NativeAnnualComponentInputV1 = component(importedValue),
  importedCoverage: ResultCoverageV1 = completeCoverage,
): NativeAnnualEquivalenceInputV1 {
  return {
    componentKey: 'synthetic-component',
    importedValue: imported(importedValue),
    importedCoverage,
    importedRuleVersion: 'synthetic-import-rule-v1',
    nativeAnnualInput: {
      components: [nativeComponent],
      finalDecision: { status: 'pending' },
    },
  };
}

function compare(source: NativeAnnualEquivalenceInputV1) {
  return compareImportedAndNativeAnnualOutcome(source, profile);
}

describe('compareImportedAndNativeAnnualOutcome', () => {
  it('AUD-001: returns match for exactly equal comparable values without erasing either side', () => {
    const source = input(numeric(60));
    const result = compare(source);

    expect(result).toMatchObject({
      authorityMode: 'imported-source',
      componentKey: 'synthetic-component',
      classification: 'match',
      difference: 0,
      coverage: { comparable: true },
      reasons: ['values-identical'],
      versions: {
        equivalenceRule: NATIVE_ANNUAL_EQUIVALENCE_RULE_VERSION_V1,
        importedRule: 'synthetic-import-rule-v1',
        nativeAnnualProfileVersion: 1,
        nativeAcademicYearProfile: 2026,
      },
    });
    expect(result.importedValue).toBe(source.importedValue);
    expect(result.importedValue.evidence[0]).toBe(source.importedValue.evidence[0]);
    expect(result.nativeComponent?.postRecoveryTotal).toEqual(numeric(60));
    expect(result.nativeOutcome.calculatedAcademicState).toBe('approved-direct');
  });

  it.each([
    ['official zero', { state: 'official-zero', value: 0, sourceMarker: 0.1 } as const],
    ['legacy zero', { state: 'legacy-zero', value: 0 } as const],
  ])(
    'AUD-002: classifies %s versus native numeric zero as an explicit expected difference',
    (_label, importedZero) => {
      const result = compare(input(importedZero, component(numeric(0))));

      expect(result.classification).toBe('expected-difference');
      expect(result.difference).toBe(0);
      expect(result.reasons).toEqual(['zero-origin-state-difference']);
      expect(result.findings).toEqual([
        {
          code: 'zero-origin-state-difference',
          side: 'comparison',
          message:
            'Imported and native annual values are both semantic zero, with distinct preserved origin states.',
        },
      ]);
      expect(result.importedValue.value).toBe(importedZero);
      expect(result.nativeComponent?.postRecoveryTotal).toEqual(numeric(0));
    },
  );

  it('keeps identical official-zero states as match', () => {
    const officialZero = {
      state: 'official-zero',
      value: 0,
      sourceMarker: 0.1,
    } as const;
    const result = compare(input(officialZero, component(officialZero)));

    expect(result.classification).toBe('match');
    expect(result.reasons).toEqual(['values-identical']);
    expect(result.importedValue.value).toBe(officialZero);
    expect(result.nativeComponent?.postRecoveryTotal).toBe(officialZero);
  });

  it('AUD-003: reports an exact mismatch without correcting or replacing either value', () => {
    const source = input(numeric(59.9), component(numeric(60)));
    const result = compare(source);

    expect(result.classification).toBe('mismatch');
    expect(result.difference).toBe(Math.abs(59.9 - 60));
    expect(result.reasons).toEqual(['values-differ']);
    expect(result.importedValue.value).toEqual(numeric(59.9));
    expect(result.nativeComponent?.postRecoveryTotal).toEqual(numeric(60));
    expect(result.authorityMode).toBe('imported-source');
    expect(result).not.toHaveProperty('tolerance');
  });

  it.each([
    ['absent', { state: 'absent' } as const, 'imported-value-absent'],
    [
      'not applicable',
      { state: 'not-applicable', reason: 'synthetic-status' } as const,
      'imported-value-not-applicable',
    ],
    [
      'insufficient data',
      { state: 'insufficient-data', reason: 'synthetic-source-gap' } as const,
      'imported-value-insufficient-data',
    ],
  ])('returns not-comparable when the imported value is %s', (_label, value, reason) => {
    const result = compare(input(value, component(numeric(60))));

    expect(result.classification).toBe('not-comparable');
    expect(result.difference).toBeNull();
    expect(result.reasons).toContain(reason);
    expect(result.coverage.comparable).toBe(false);
    expect(result.importedValue.value).toBe(value);
  });

  it.each([
    [
      'partial',
      {
        state: 'partial',
        expectedItemCount: 2,
        resolvedItemCount: 1,
        missingItemCount: 1,
        reasons: ['synthetic-partial-coverage'],
      } satisfies ResultCoverageV1,
      'imported-coverage-partial',
    ],
    [
      'insufficient-data',
      {
        state: 'insufficient-data',
        expectedItemCount: 1,
        resolvedItemCount: 0,
        missingItemCount: 1,
        reasons: ['synthetic-source-gap'],
      } satisfies ResultCoverageV1,
      'imported-coverage-insufficient-data',
    ],
    [
      'not-applicable',
      {
        state: 'not-applicable',
        expectedItemCount: 1,
        resolvedItemCount: 1,
        missingItemCount: 0,
        reasons: ['synthetic-status'],
      } satisfies ResultCoverageV1,
      'imported-coverage-not-applicable',
    ],
  ])('returns not-comparable for imported %s coverage', (_label, coverage, reason) => {
    const result = compare(input(numeric(60), component(numeric(60)), coverage));

    expect(result.classification).toBe('not-comparable');
    expect(result.difference).toBeNull();
    expect(result.reasons).toContain(reason);
    expect(result.coverage.imported).toBe(coverage);
  });

  it('returns not-comparable for a partial native outcome without inventing a failure', () => {
    const partialCoverage: ResultCoverageV1 = {
      state: 'partial',
      expectedItemCount: 2,
      resolvedItemCount: 1,
      missingItemCount: 1,
      reasons: ['synthetic-source-gap'],
    };
    const source = input(numeric(60), {
      componentKey: 'synthetic-component',
      originalTotal: { state: 'absent' },
      postRecoveryTotal: { state: 'absent' },
      coverage: partialCoverage,
    });
    const result = compare(source);

    expect(result.classification).toBe('not-comparable');
    expect(result.difference).toBeNull();
    expect(result.reasons).toEqual([
      'native-coverage-insufficient-data',
      'native-value-absent',
      'native-component-unresolved',
    ]);
    expect(result.nativeOutcome.notApprovedComponentCount).toBe(0);
    expect(result.nativeOutcome.calculatedAcademicState).toBe('insufficient-data');
  });

  it('returns not-comparable when the requested native component is not present', () => {
    const base = input(numeric(60));
    const source: NativeAnnualEquivalenceInputV1 = {
      ...base,
      nativeAnnualInput: {
        ...base.nativeAnnualInput,
        components: [
          {
            ...base.nativeAnnualInput.components[0]!,
            componentKey: 'another-component',
          },
        ],
      },
    };

    const result = compare(source);

    expect(result.classification).toBe('not-comparable');
    expect(result.nativeComponent).toBeNull();
    expect(result.reasons).toEqual(['native-component-not-found']);
  });

  it.each([
    [59.9, 59.9, 'eligible-for-council'],
    [59.9, 60, 'approved-after-recovery'],
    [59.9, 60.1, 'approved-after-recovery'],
    [60, 60, 'approved-direct'],
    [60.1, 60.1, 'approved-direct'],
  ] as const)(
    'preserves the native boundary result for original %s and post-REC %s',
    (original, postRecovery, academicState) => {
      const result = compare(
        input(numeric(postRecovery), component(numeric(original), numeric(postRecovery))),
      );

      expect(result.classification).toBe('match');
      expect(result.nativeComponent?.classification).toBe(
        original >= 60
          ? 'approved-direct'
          : postRecovery >= 60
            ? 'approved-after-recovery'
            : 'not-approved',
      );
      expect(result.nativeOutcome.calculatedAcademicState).toBe(academicState);
      expect(result.authorityMode).toBe('imported-source');
    },
  );

  it('preserves a recorded formal decision without making or changing it', () => {
    const formalDecision = {
      status: 'recorded',
      outcome: 'approved',
      basis: 'class-council',
      resultingState: 'approved-by-council',
      reference: 'synthetic-formal-decision',
    } as const;
    const base = input(numeric(59.9), component(numeric(59.9)));
    const source: NativeAnnualEquivalenceInputV1 = {
      ...base,
      nativeAnnualInput: {
        ...base.nativeAnnualInput,
        finalDecision: formalDecision,
      },
    };

    const result = compare(source);

    expect(result.nativeOutcome.finalDecision).toBe(formalDecision);
    expect(result.nativeOutcome.calculatedAcademicState).toBe('eligible-for-council');
    expect(result.nativeOutcome.effectiveAcademicState).toBe('approved-by-council');
    expect(result.nativeOutcome.effectiveStateSource).toBe('formal-decision');
    expect(result.authorityMode).toBe('imported-source');
  });

  it('is deterministic and does not mutate input, evidence, profile or native values', () => {
    const source = input(numeric(60.1), component(numeric(59.9), numeric(60.1)));
    const sourceBefore = structuredClone(source);
    const profileBefore = structuredClone(profile);

    const first = compare(source);
    const second = compare(source);

    expect(first).toEqual(second);
    expect(source).toEqual(sourceBefore);
    expect(profile).toEqual(profileBefore);
  });

  it.each([
    [
      'empty component key',
      { ...input(numeric(60)), componentKey: '' },
      'componentKey must be a non-empty string',
    ],
    [
      'empty imported rule version',
      { ...input(numeric(60)), importedRuleVersion: ' ' },
      'importedRuleVersion must be a non-empty string',
    ],
    [
      'non-finite imported value',
      input(numeric(Number.NaN), component(numeric(60))),
      'imported annual value must be a finite number',
    ],
  ] as const)('rejects %s explicitly', (_label, source, message) => {
    expect(() => compare(source)).toThrow(new RangeError(message));
  });
});
