import { describe, expect, it } from 'vitest';

import type { ImportedGradeValueV1 } from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import type {
  SourceCellClassificationV1,
  SourceCellEvidenceV1,
} from '../../../../shared/gradebook-contracts/source/source-contract-v1';
import { interpretSourceCell } from '../../../../src/gradebook-domain/source/interpret-source-cell';

const provenance = {
  fileName: 'synthetic-gradebook.xlsx',
  fileSha256: 'synthetic-sha256',
  sheetName: 'SyntheticClass1º',
  cellAddress: 'R10',
};

const profile = { maximumValue: 10 } as const;

type EvidenceWithoutProvenance = SourceCellEvidenceV1 extends infer Evidence
  ? Evidence extends SourceCellEvidenceV1
    ? Omit<Evidence, 'provenance'>
    : never
  : never;

function evidence(input: EvidenceWithoutProvenance): SourceCellEvidenceV1 {
  return { ...input, provenance } as SourceCellEvidenceV1;
}

describe('interpretSourceCell', () => {
  it('CELL-001: treats an empty cell as absence instead of zero', () => {
    const source = evidence({ classification: 'empty', rawValue: '' });

    expect(interpretSourceCell(source, profile)).toEqual({
      present: false,
      sourceValue: '',
      semanticValue: { state: 'absent' },
      valid: true,
      classification: 'empty',
      evidence: source,
      occurrences: [],
    });
  });

  it('CELL-002: preserves the manual 0.1 marker and interprets it as official zero', () => {
    const source = evidence({
      classification: 'manual-official-zero-marker',
      rawValue: 0.1,
    });
    const interpreted = interpretSourceCell(source, profile);

    expect(interpreted).toMatchObject({
      present: true,
      sourceValue: 0.1,
      semanticValue: { state: 'official-zero', value: 0, sourceMarker: 0.1 },
      valid: true,
      classification: 'manual-official-zero-marker',
      evidence: source,
    });
  });

  it('CELL-003: keeps a manual legacy zero distinct from an official zero marker', () => {
    const source = evidence({ classification: 'manual-legacy-zero', rawValue: 0 });

    expect(interpretSourceCell(source, profile).semanticValue).toEqual({
      state: 'legacy-zero',
      value: 0,
    });
  });

  it('CELL-004: preserves a valid positive manual grade', () => {
    const source = evidence({ classification: 'manual-positive-number', rawValue: 7.5 });

    expect(interpretSourceCell(source, profile)).toMatchObject({
      present: true,
      sourceValue: 7.5,
      semanticValue: { state: 'numeric', value: 7.5 },
      valid: true,
      occurrences: [],
    });
  });

  it('CELL-005: preserves a negative grade and emits a deterministic occurrence', () => {
    const source = evidence({ classification: 'manual-negative-number', rawValue: -1 });
    const interpreted = interpretSourceCell(source, profile);

    expect(interpreted).toMatchObject({
      present: true,
      sourceValue: -1,
      semanticValue: { state: 'numeric', value: -1 },
      valid: false,
    });
    expect(interpreted.occurrences).toEqual([
      {
        code: 'negative-source-value',
        rule: 'source-cell-semantics-v1',
        message: 'The source grade is negative.',
        recommendedAction: 'Verify the source cell before using this grade.',
        provenance,
      },
    ]);
  });

  it('preserves a grade above the configured maximum and emits an occurrence', () => {
    const source = evidence({ classification: 'manual-positive-number', rawValue: 10.5 });
    const interpreted = interpretSourceCell(source, profile);

    expect(interpreted).toMatchObject({
      semanticValue: { state: 'numeric', value: 10.5 },
      valid: false,
    });
    expect(interpreted.occurrences).toHaveLength(1);
    expect(interpreted.occurrences[0]).toMatchObject({
      code: 'source-value-above-maximum',
      rule: 'source-cell-semantics-v1',
      provenance,
    });
  });

  it('CELL-006: uses a nonzero formula cache while preserving formula evidence', () => {
    const source = evidence({
      classification: 'formula-nonzero',
      rawValue: 8,
      formula: '=SUM(R8:R9)',
      cachedValue: 8,
    });
    const interpreted = interpretSourceCell(source, profile);

    expect(interpreted).toMatchObject({
      present: true,
      semanticValue: { state: 'numeric', value: 8 },
      valid: true,
      evidence: {
        formula: '=SUM(R8:R9)',
        cachedValue: 8,
        provenance,
      },
    });
  });

  it('CELL-007: treats a formula whose cache is zero as absence', () => {
    const source = evidence({
      classification: 'formula-zero',
      rawValue: 0,
      formula: '=SUM(R8:R9)',
      cachedValue: 0,
    });

    expect(interpretSourceCell(source, profile)).toMatchObject({
      present: false,
      semanticValue: { state: 'absent' },
      valid: true,
      evidence: source,
    });
  });

  it('CELL-008: does not invent a grade for a formula error or missing cache', () => {
    const source = evidence({
      classification: 'formula-error-or-missing-cache',
      rawValue: '#VALUE!',
      formula: '=R8+R9',
      cachedValue: null,
      sourceError: '#VALUE!',
    });
    const interpreted = interpretSourceCell(source, profile);

    expect(interpreted).toMatchObject({
      present: false,
      semanticValue: {
        state: 'insufficient-data',
        reason: 'formula-error-or-missing-cache',
      },
      valid: false,
    });
    expect(interpreted.occurrences[0]).toMatchObject({
      code: 'formula-error-or-missing-cache',
      provenance,
    });
  });

  it('CELL-009: does not convert invalid text into a grade', () => {
    const source = evidence({ classification: 'invalid-text', rawValue: 'seven' });
    const interpreted = interpretSourceCell(source, profile);

    expect(interpreted).toMatchObject({
      present: false,
      sourceValue: 'seven',
      semanticValue: { state: 'insufficient-data', reason: 'invalid-source-text' },
      valid: false,
    });
    expect(interpreted.occurrences[0]?.code).toBe('invalid-source-text');
  });

  it('CELL-010: distinguishes not-applicable, empty, and missing fields', () => {
    const cases: ReadonlyArray<{
      source: SourceCellEvidenceV1;
      classification: SourceCellClassificationV1;
      state: 'not-applicable' | 'absent' | 'insufficient-data';
      valid: boolean;
    }> = [
      {
        source: evidence({ classification: 'not-applicable', rawValue: '*' }),
        classification: 'not-applicable',
        state: 'not-applicable',
        valid: true,
      },
      {
        source: evidence({ classification: 'empty', rawValue: null }),
        classification: 'empty',
        state: 'absent',
        valid: true,
      },
      {
        source: evidence({ classification: 'missing-field', rawValue: undefined }),
        classification: 'missing-field',
        state: 'insufficient-data',
        valid: false,
      },
    ];

    const results = cases.map(({ source }) => interpretSourceCell(source, profile));

    expect(results.map(({ classification }) => classification)).toEqual(
      cases.map(({ classification }) => classification),
    );
    expect(results.map(({ semanticValue }) => semanticValue.state)).toEqual(
      cases.map(({ state }) => state),
    );
    expect(results.map(({ valid }) => valid)).toEqual(cases.map(({ valid }) => valid));
    expect(results[0]?.occurrences).toEqual([]);
    expect(results[1]?.occurrences).toEqual([]);
    expect(results[2]?.occurrences[0]).toMatchObject({
      code: 'missing-source-field',
      rule: 'source-cell-semantics-v1',
      recommendedAction: 'Verify the source layout and field mapping.',
      provenance,
    });
  });

  it('is directly compatible with the integrated imported grade contract', () => {
    const source = evidence({ classification: 'manual-positive-number', rawValue: 6 });
    const interpreted = interpretSourceCell(source, profile);
    const imported: ImportedGradeValueV1 = {
      value: interpreted.semanticValue,
      evidence: [interpreted.evidence],
    };

    expect(imported).toEqual({
      value: { state: 'numeric', value: 6 },
      evidence: [source],
    });
  });

  it('ENG-012: returns equal output for the same input and profile without mutating them', () => {
    const source = evidence({
      classification: 'formula-nonzero',
      rawValue: 11,
      formula: '=R8+R9',
      cachedValue: 11,
    });
    const sourceBefore = structuredClone(source);
    const profileBefore = structuredClone(profile);

    expect(interpretSourceCell(source, profile)).toEqual(interpretSourceCell(source, profile));
    expect(source).toEqual(sourceBefore);
    expect(profile).toEqual(profileBefore);
  });

  it('rejects an invalid profile deterministically', () => {
    const source = evidence({ classification: 'empty', rawValue: null });

    expect(() => interpretSourceCell(source, { maximumValue: Number.NaN })).toThrow(
      new RangeError('maximumValue must be a finite, non-negative number'),
    );
  });
});
