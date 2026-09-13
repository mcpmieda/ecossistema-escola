import {
  academicPresentationInputSchemaV1,
  type ResolveStudentMarkPresentationV1,
} from '../../../../shared/gradebook-contracts/student-portal/academic-presentation-v1';
import { SIMPLIFIED_TERM_MAXIMUM_MILLI_V1 } from './resolve-simplified-academic-engine-v1';

const annualMaximum = BigInt(
  ([1, 2, 3] as const).reduce((sum, term) => sum + SIMPLIFIED_TERM_MAXIMUM_MILLI_V1[term], 0),
);

/** Presentation only: no rounding, clamping or changes to academic facts/REC/outcomes. */
export const resolveStudentMarkPresentationV1: ResolveStudentMarkPresentationV1 = (input) => {
  const { valueMilli, maximumMilli, minimumApprovalMilli } =
    academicPresentationInputSchemaV1.parse(input);
  if (
    valueMilli === null ||
    maximumMilli === null ||
    maximumMilli <= 0 ||
    minimumApprovalMilli === null
  )
    return null;
  return BigInt(valueMilli) * annualMaximum >= BigInt(maximumMilli) * BigInt(minimumApprovalMilli);
};
