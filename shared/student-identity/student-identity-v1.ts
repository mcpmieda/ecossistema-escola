import { z } from 'zod';

/** Person identity, not an academic row number, class number or login credential. */
export const studentUidV1 = z.uuid().transform((value) => value.toLowerCase());
const academicYear = z.number().int().min(1900).max(9999);
const academicStudentId = z.number().int().positive().max(2_147_483_647);
export const STUDENT_IDENTITY_BATCH_LIMIT_V1 = 500;

export const studentIdentityRequestV1 = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('gradebook'),
    academicYear,
    studentIds: z.array(academicStudentId).min(1).max(STUDENT_IDENTITY_BATCH_LIMIT_V1),
  }).strict(),
  z.object({
    source: z.literal('portal'),
    academicYear,
    accountIds: z.array(studentUidV1).min(1).max(STUDENT_IDENTITY_BATCH_LIMIT_V1),
  }).strict(),
]);

export const studentIdentityResolutionV1 = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('gradebook'),
    studentUid: studentUidV1,
    academicYear,
    gradebookStudentId: academicStudentId,
  }).strict(),
  z.object({
    source: z.literal('portal'),
    studentUid: studentUidV1,
    academicYear,
    accountId: studentUidV1,
    gradebookStudentId: academicStudentId.nullable(),
  }).strict(),
]);

export type StudentIdentityRequestV1 = z.infer<typeof studentIdentityRequestV1>;
export type StudentIdentityResolutionV1 = z.infer<typeof studentIdentityResolutionV1>;
