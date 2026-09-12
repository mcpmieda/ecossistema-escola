import { z } from 'zod';

export const PORTAL_VERSION_V1 = 1 as const;
export const PORTAL_YEAR_V1 = 2026 as const;
export const PORTAL_ORIGIN_V1 = 'https://aluno.escolaieda.com';
export const portalIdV1 = z.uuid();
export const versionV1 = z.number().int().safe().nonnegative();
export const instantV1 = z.iso.datetime({ offset: true });
export const opaqueV1 = z.string().min(32).max(512).regex(/^[A-Za-z0-9_-]+$/u);
export const periodV1 = z.enum(['T1', 'T2', 'T3', 'REC1', 'REC2', 'REC3']);
export const academicLinkV1 = z.object({ academicYear: z.literal(PORTAL_YEAR_V1), studentId: z.number().int().positive().safe() }).strict();
export const scopeV1 = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('school'), academicYear: z.literal(PORTAL_YEAR_V1) }).strict(),
  z.object({ kind: z.literal('class'), academicYear: z.literal(PORTAL_YEAR_V1), classId: z.number().int().positive().safe() }).strict(),
  z.object({ kind: z.literal('account'), academicYear: z.literal(PORTAL_YEAR_V1), accountId: portalIdV1 }).strict(),
]);
export const commandMetaV1 = { contractVersion: z.literal(1), expectedVersion: versionV1, idempotencyKey: portalIdV1 };
export const pageRequestV1 = z.object({ cursor: opaqueV1.optional(), limit: z.number().int().min(1).max(100).default(50) }).strict();
export const accountStateV1 = z.enum(['pending-activation', 'active', 'reset-required']);
export const eligibilityStateV1 = z.enum(['eligible', 'exit', 'unresolved', 'unlinked']);
export const publicationStateV1 = z.enum(['no-data', 'available', 'published', 'update-pending']);
export const revisionV1 = z.string().min(1).max(128).regex(/^[A-Za-z0-9:_-]+$/u);
export const revisionsV1 = z.object({ dataVersion: revisionV1, policyVersion: revisionV1, publicationVersion: revisionV1 }).strict();
export const ERROR_HTTP_V1 = {
  'invalid-request': 400, unauthenticated: 401, forbidden: 403, conflict: 409,
  'body-too-large': 413, 'rate-limited': 429, unavailable: 503,
} as const;
export const failureV1 = z.object({
  contractVersion: z.literal(1), requestId: portalIdV1,
  state: z.enum(['invalid-request', 'unauthenticated', 'forbidden', 'conflict', 'body-too-large', 'rate-limited', 'unavailable']),
  retryAfterSeconds: z.number().int().positive().max(86400).optional(),
}).strict();
export const healthV1 = z.object({ contractVersion: z.literal(1), state: z.enum(['ok', 'unavailable']) }).strict();
export type ScopeV1 = z.infer<typeof scopeV1>;
export type AcademicLinkV1 = z.infer<typeof academicLinkV1>;
export type RevisionsV1 = z.infer<typeof revisionsV1>;
export type FailureV1 = z.infer<typeof failureV1>;
