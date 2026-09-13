import { describe, expect, it } from 'vitest';
import {
  academicMeetsMinimumSchemaV1,
  academicPresentationInputSchemaV1,
} from '../../../shared/gradebook-contracts/student-portal/academic-presentation-v1';
import { academicMarkSchemaV1 } from '../../../shared/gradebook-contracts/student-portal/academic-student-reader-v1';
import {
  performanceCellV2,
  projectPerformanceFactsV2,
  type PerformanceFactV2,
} from '../../../server/gradebook/application/results/relational-performance-facts-v2';
import { PRESENTATION_CASES_V1 } from './presentation-cases-v1';

describe('BN presentation contract #745', () => {
  it('keeps every conformance vector representable without computing in the schema', () => {
    for (const { input, expected } of PRESENTATION_CASES_V1) {
      expect(academicPresentationInputSchemaV1.parse(input)).toEqual(input);
      expect(academicMeetsMinimumSchemaV1.parse(expected)).toBe(expected);
    }
  });

  it('preserves V1 score fields and all nonnumeric kinds', () => {
    for (const meetsMinimum of [true, false, null]) {
      const score = { kind: 'score', valueMilli: 0, maximumMilli: null, meetsMinimum };
      expect(academicMarkSchemaV1.parse(score)).toEqual(score);
    }
    for (const kind of ['absent', 'nc', 'rr', 'recovery-pending']) {
      expect(academicMarkSchemaV1.parse({ kind })).toEqual({ kind });
      expect(academicMarkSchemaV1.safeParse({ kind, meetsMinimum: false }).success).toBe(false);
    }
    expect(academicMeetsMinimumSchemaV1.safeParse('false').success).toBe(false);
  });

  it('rejects coercion, rounding, unsafe values and untrusted policy extensions', () => {
    const input = PRESENTATION_CASES_V1[0]!.input;
    for (const valueMilli of ['0', -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(academicPresentationInputSchemaV1.safeParse({ ...input, valueMilli }).success).toBe(
        false,
      );
    }
    expect(
      academicPresentationInputSchemaV1.safeParse({ ...input, minimumApprovalMilli: 0 }).success,
    ).toBe(false);
    expect(academicPresentationInputSchemaV1.safeParse({ ...input, percentage: 60 }).success).toBe(
      false,
    );
  });

  // Existing BN implementation establishes proportional authority. These tests
  // do not claim the new Portal helper/adapter (reserved to #747) is implemented.
  it.each([60_000, 75_000])(
    'agrees with existing BN REC classification for annual minimum %i',
    (minimum) => {
      const facts: PerformanceFactV2[] = ([1, 2, 3] as const).flatMap((term) =>
        ([1, 2, 11] as const).map((slot) => ({
          term,
          slot,
          label: 'Instrumento sintético',
          valueMilli: 0,
          maximumMilli: slot === 11 ? (term === 3 ? 22_000 : 16_500) : term === 3 ? 9_000 : 6_750,
        })),
      );
      const cases = PRESENTATION_CASES_V1.filter(
        ({ name, input }) => name.startsWith('T1 ') && input.minimumApprovalMilli === minimum,
      );
      for (const { input, expected } of cases) {
        const projection = projectPerformanceFactsV2(
          1,
          facts,
          { am: [0, 0, 0], rec: [input.valueMilli, null, null], u: null },
          minimum,
        );
        const cell = performanceCellV2(projection, 1, 'recovery');
        expect(cell.valueMilli).toBe(input.valueMilli);
        expect(cell.maximumMilli).toBe(input.maximumMilli);
        expect(cell.level).toBe(expected ? 'at-or-above' : 'below');
      }
    },
  );
});
