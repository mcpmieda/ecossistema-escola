import { describe, expect, it } from 'vitest';
import { isQualitativeColumnOrdinalV1, meaningfulQualitativeDescriptionV1 } from '../../../shared/gradebook-contracts/source/qualitative-slot-evidence-v1';
import { sourceSubjectAbbreviationV1 } from '../../../shared/gradebook-contracts/source/subject-abbreviations-v1';
import { termRecoveryVisibilityV1 } from '../../../src/gradebook-domain/calculations/simplified/term-recovery-visibility-v1';
import { resolveSimplifiedTermV1 } from '../../../src/gradebook-domain/calculations/simplified/resolve-simplified-academic-engine-v1';
import { resolveLegacyAcademicYear } from '../../../src/platform/gradebook-legacy-year';

describe('source evidence, not per-student omission #646', () => {
  it.each([undefined, '', '5', ' 5 ', '5,0', '5.00'])('does not manufacture activity from ordinal %s', (description) => {
    expect(meaningfulQualitativeDescriptionV1(15, null, description, false)).toBeUndefined();
  });
  it('preserves a maximum, a zero, an unavailable fact, a meaningful numeric title or another slot number', () => {
    expect(meaningfulQualitativeDescriptionV1(15, 1000, '5', false)).toBe('5');
    expect(meaningfulQualitativeDescriptionV1(15, null, '5', true)).toBe('5');
    expect(meaningfulQualitativeDescriptionV1(15, null, '2026', false)).toBe('2026');
    expect(isQualitativeColumnOrdinalV1(15, '4')).toBe(false);
    expect(isQualitativeColumnOrdinalV1(1, '1')).toBe(false);
  });
  it('uses the inspected catalogue without inventing an abbreviation for an unknown subject', () => {
    expect(sourceSubjectAbbreviationV1(' matemática ')).toBe('M');
    expect(sourceSubjectAbbreviationV1('COMPUTAÇÃO')).toBe('CT');
    expect(sourceSubjectAbbreviationV1('Nova disciplina')).toBeNull();
  });
  it.each([[7000, 10000, true], [7000, 11000, false], [8100, 1000, false]])('shows a recovery row only below both 60%% limits (%i/%i)', (quantitative, qualitative, expected) => {
    const term = resolveSimplifiedTermV1({ term: 1, instruments: [
      { slot: 1, maximumMilli: 8500, valueMilli: quantitative }, { slot: 2, maximumMilli: 5000, valueMilli: 0 },
      { slot: 11, maximumMilli: 16500, valueMilli: qualitative },
    ] });
    const original = structuredClone(term);
    expect(termRecoveryVisibilityV1(term, true)).toEqual({ showParallel: expected, showRecovery: expected });
    expect(term).toEqual(original);
    expect(termRecoveryVisibilityV1(term, null).showRecovery).toBe(false);
  });
  it('does not assert recovery eligibility for a missing definition', () => {
    expect(termRecoveryVisibilityV1(null, true)).toEqual({ showParallel: false, showRecovery: false });
  });
  it('maps only unique real year IDs, never fabricated IDs or a neighboring year', () => {
    expect(resolveLegacyAcademicYear(2026, [{ id: 'opaque-year-id', label: '2026' }])).toBe('opaque-year-id');
    expect(resolveLegacyAcademicYear(2026, [{ id: 'x', label: '2025' }])).toBeNull();
    expect(resolveLegacyAcademicYear(2026, [{ id: 'x', label: '2026' }, { id: 'y', label: '2026' }])).toBeNull();
  });
});
