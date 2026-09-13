import { describe, expect, it } from 'vitest';
import { resolveStudentMarkPresentationV1 } from '../../../src/gradebook-domain/calculations/simplified/resolve-student-mark-presentation-v1';
import type { AcademicPresentationInputV1 } from '../../../shared/gradebook-contracts/student-portal/academic-presentation-v1';
import { PRESENTATION_CASES_V1 } from '../../student-portal/bn-contract/presentation-cases-v1';

describe('single BN presentation rule', () => {
  it.each(PRESENTATION_CASES_V1)('$name', ({ input, expected }) => {
    expect(resolveStudentMarkPresentationV1(input)).toBe(expected);
  });
  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '1500'])(
    'rejects invalid score representation %s instead of coercing it',
    (valueMilli) => {
      expect(() =>
        resolveStudentMarkPresentationV1({
          valueMilli,
          maximumMilli: 2000,
          minimumApprovalMilli: 75000,
        } as unknown as AcademicPresentationInputV1),
      ).toThrow();
    },
  );
});
