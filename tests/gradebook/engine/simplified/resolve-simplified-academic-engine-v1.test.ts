import { describe, expect, it } from 'vitest';
import {
  resolveSimplifiedComponentRecoveryV1,
  resolveSimplifiedTermV1,
  roundSimplifiedGradeMilliV1,
  type SimplifiedInstrumentFactV1,
} from '../../../../src/gradebook-domain/calculations/simplified/resolve-simplified-academic-engine-v1';

function term1(instruments: readonly SimplifiedInstrumentFactV1[]) {
  return resolveSimplifiedTermV1({ term: 1, instruments });
}

function completeTerm(term: 1 | 2 | 3, roundedMilli: number) {
  const maximum = term === 3 ? 40_000 : 30_000;
  const quantitativeMaximum = (maximum * 45) / 100;
  const qualitativeMaximum = (maximum * 55) / 100;
  const avMaximum = quantitativeMaximum / 2;
  return resolveSimplifiedTermV1({
    term,
    instruments: [
      { slot: 1, maximumMilli: avMaximum, valueMilli: Math.min(avMaximum, roundedMilli) },
      { slot: 2, maximumMilli: avMaximum, valueMilli: 0 },
      {
        slot: 11,
        maximumMilli: qualitativeMaximum,
        valueMilli: Math.max(0, roundedMilli - Math.min(avMaximum, roundedMilli)),
      },
    ],
  });
}

describe('simplified academic engine v1', () => {
  it('uses the 2026 rounding boundaries homologated against AM', () => {
    expect(roundSimplifiedGradeMilliV1(23_299)).toBe(23_000);
    expect(roundSimplifiedGradeMilliV1(23_300)).toBe(23_500);
    expect(roundSimplifiedGradeMilliV1(23_749)).toBe(23_500);
    expect(roundSimplifiedGradeMilliV1(23_750)).toBe(24_000);
    expect(roundSimplifiedGradeMilliV1(19_255)).toBe(19_000);
  });

  it('reproduces an observed parallel-recovery AM case with exact integers', () => {
    const outcome = term1([
      { slot: 1, maximumMilli: 6_750, valueMilli: 1_500 },
      { slot: 2, maximumMilli: 6_750, valueMilli: 1_250 },
      { slot: 3, maximumMilli: null, valueMilli: 8_250 },
      { slot: 11, maximumMilli: 16_500, valueMilli: 4_000 },
    ]);

    expect(outcome.quantitativeOriginalMilli).toBe(2_750);
    expect(outcome.parallelApplicable).toBe(true);
    expect(outcome.quantitativeConsideredMilli).toBe(8_250);
    expect(outcome.rawMilli).toBe(12_250);
    expect(outcome.roundedMilli).toBe(12_000);
    expect(outcome.coverage.complete).toBe(true);
  });

  it('keeps above-maximum facts in the calculation and reports a warning', () => {
    const outcome = term1([
      { slot: 1, maximumMilli: 6_750, valueMilli: 6_750 },
      { slot: 2, maximumMilli: 6_750, valueMilli: 6_750 },
      { slot: 11, maximumMilli: 3_000, valueMilli: 3_750 },
      { slot: 12, maximumMilli: 13_500, valueMilli: 10_000 },
    ]);

    expect(outcome.qualitativeOperationalMilli).toBe(13_750);
    expect(outcome.rawMilli).toBe(27_250);
    expect(outcome.roundedMilli).toBe(27_000);
    expect(outcome.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'value-above-maximum', slot: 11, valueMilli: 3_750 }),
      ]),
    );
  });

  it('does not turn a missing configured grade into an official zero', () => {
    const outcome = term1([
      { slot: 1, maximumMilli: 6_750, valueMilli: 6_000 },
      { slot: 2, maximumMilli: 6_750, valueMilli: 6_000 },
      { slot: 11, maximumMilli: 8_250, valueMilli: 8_000 },
      { slot: 12, maximumMilli: 8_250, valueMilli: null },
    ]);

    expect(outcome.rawMilli).toBe(20_000);
    expect(outcome.coverage.complete).toBe(false);
    expect(outcome.coverage.missingSlots).toContain(12);
  });

  it('marks parallel as required only when the quantitative original is complete and below 60%', () => {
    const incomplete = term1([
      { slot: 1, maximumMilli: 6_750, valueMilli: 2_000 },
      { slot: 2, maximumMilli: 6_750, valueMilli: null },
      { slot: 11, maximumMilli: 16_500, valueMilli: 10_000 },
    ]);
    expect(incomplete.parallelApplicable).toBeNull();
    expect(incomplete.coverage.reasons).toContain('parallel-applicability-unresolved');

    const applicable = term1([
      { slot: 1, maximumMilli: 6_750, valueMilli: 2_000 },
      { slot: 2, maximumMilli: 6_750, valueMilli: 2_000 },
      { slot: 11, maximumMilli: 16_500, valueMilli: 10_000 },
    ]);
    expect(applicable.parallelApplicable).toBe(true);
    expect(applicable.coverage.missingSlots).toContain(3);
  });

  it('resolves direct approval from three complete terms', () => {
    const outcome = resolveSimplifiedComponentRecoveryV1({
      terms: [completeTerm(1, 20_000), completeTerm(2, 20_000), completeTerm(3, 20_000)],
      recovery: { 1: null, 2: null, 3: null },
      minimumApprovalMilli: 60_000,
    });

    expect(outcome.originalTotalMilli).toBe(60_000);
    expect(outcome.recoveryRequired).toBe(false);
    expect(outcome.classification).toBe('approved-direct');
    expect(outcome.postRecoveryTotalMilli).toBe(60_000);
  });

  it('uses final recovery as a replacement only for applicable terms', () => {
    const outcome = resolveSimplifiedComponentRecoveryV1({
      terms: [completeTerm(1, 10_000), completeTerm(2, 20_000), completeTerm(3, 20_000)],
      recovery: { 1: 25_000, 2: null, 3: null },
      minimumApprovalMilli: 60_000,
    });

    expect(outcome.originalTotalMilli).toBe(50_000);
    expect(outcome.recoveryRequired).toBe(true);
    expect(outcome.recoveryTerms[1].applicable).toBe(true);
    expect(outcome.recoveryTerms[2].applicable).toBe(false);
    expect(outcome.recoveryTerms[3].applicable).toBe(true);
    expect(outcome.classification).toBe('recovery-pending');

    const completed = resolveSimplifiedComponentRecoveryV1({
      terms: [completeTerm(1, 10_000), completeTerm(2, 20_000), completeTerm(3, 20_000)],
      recovery: { 1: 25_000, 2: null, 3: 25_000 },
      minimumApprovalMilli: 60_000,
    });
    expect(completed.postRecoveryTotalMilli).toBe(70_000);
    expect(completed.classification).toBe('approved-after-recovery');
  });

  it('treats N/C in an applicable final recovery as automatic no-show failure', () => {
    const outcome = resolveSimplifiedComponentRecoveryV1({
      terms: [completeTerm(1, 10_000), completeTerm(2, 20_000), completeTerm(3, 20_000)],
      recovery: { 1: 'NC', 2: null, 3: 25_000 },
      minimumApprovalMilli: 60_000,
    });

    expect(outcome.classification).toBe('failed-no-show');
    expect(outcome.postRecoveryTotalMilli).toBeNull();
  });
});
