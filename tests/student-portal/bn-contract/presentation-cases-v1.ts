import type {
  AcademicPresentationInputV1,
  AcademicMeetsMinimumV1,
} from '../../../shared/gradebook-contracts/student-portal/academic-presentation-v1';

/** Synthetic conformance vectors for the sole BN implementation in #747. */
export const PRESENTATION_CASES_V1: readonly {
  name: string;
  input: AcademicPresentationInputV1;
  expected: AcademicMeetsMinimumV1;
}[] = [
  {
    name: 'T1 below 60/100',
    input: { valueMilli: 17_999, maximumMilli: 30_000, minimumApprovalMilli: 60_000 },
    expected: false,
  },
  {
    name: 'T1 exact 60/100',
    input: { valueMilli: 18_000, maximumMilli: 30_000, minimumApprovalMilli: 60_000 },
    expected: true,
  },
  {
    name: 'T1 above 60/100',
    input: { valueMilli: 18_001, maximumMilli: 30_000, minimumApprovalMilli: 60_000 },
    expected: true,
  },
  {
    name: 'T1 below 75/100',
    input: { valueMilli: 22_499, maximumMilli: 30_000, minimumApprovalMilli: 75_000 },
    expected: false,
  },
  {
    name: 'T1 exact 75/100',
    input: { valueMilli: 22_500, maximumMilli: 30_000, minimumApprovalMilli: 75_000 },
    expected: true,
  },
  {
    name: 'T3 exact 75/100',
    input: { valueMilli: 30_000, maximumMilli: 40_000, minimumApprovalMilli: 75_000 },
    expected: true,
  },
  {
    name: 'partial below 75/100',
    input: { valueMilli: 1_499, maximumMilli: 2_000, minimumApprovalMilli: 75_000 },
    expected: false,
  },
  {
    name: 'partial exact 75/100',
    input: { valueMilli: 1_500, maximumMilli: 2_000, minimumApprovalMilli: 75_000 },
    expected: true,
  },
  {
    name: 'zero is a score',
    input: { valueMilli: 0, maximumMilli: 2_000, minimumApprovalMilli: 75_000 },
    expected: false,
  },
  {
    name: 'absent is unclassified',
    input: { valueMilli: null, maximumMilli: 2_000, minimumApprovalMilli: 75_000 },
    expected: null,
  },
  {
    name: 'missing maximum',
    input: { valueMilli: 1_500, maximumMilli: null, minimumApprovalMilli: 75_000 },
    expected: null,
  },
  {
    name: 'zero maximum',
    input: { valueMilli: 1_500, maximumMilli: 0, minimumApprovalMilli: 75_000 },
    expected: null,
  },
  {
    name: 'negative maximum',
    input: { valueMilli: 1_500, maximumMilli: -1, minimumApprovalMilli: 75_000 },
    expected: null,
  },
  {
    name: 'missing annual minimum',
    input: { valueMilli: 1_500, maximumMilli: 2_000, minimumApprovalMilli: null },
    expected: null,
  },
  {
    name: 'above maximum is not clamped',
    input: { valueMilli: 2_001, maximumMilli: 2_000, minimumApprovalMilli: 100_001 },
    expected: true,
  },
  {
    name: 'annual official value',
    input: { valueMilli: 75_000, maximumMilli: 100_000, minimumApprovalMilli: 75_000 },
    expected: true,
  },
  {
    name: 'fractional threshold is exact',
    input: { valueMilli: 1, maximumMilli: 3, minimumApprovalMilli: 33_334 },
    expected: false,
  },
  {
    name: 'integer products exceed Number precision',
    input: {
      valueMilli: 4_503_599_627_370_495,
      maximumMilli: 9_007_199_254_740_991,
      minimumApprovalMilli: 50_000,
    },
    expected: false,
  },
];
