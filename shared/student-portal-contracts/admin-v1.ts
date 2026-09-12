import { z } from 'zod';
import { accountStateV1, academicLinkV1, commandMetaV1, eligibilityStateV1, instantV1, opaqueV1, pageRequestV1, periodV1, portalIdV1, publicationStateV1, revisionV1, scopeV1, versionV1 } from './core-v1';
import { qrUrlV1 } from './auth-v1';
import { effectiveSettingsV1, settingsOverrideV1 } from './policy-v1';

export const birthYearV1 = z.string().regex(/^[0-9]{4}$/u).refine((s) => Number(s) >= 1900 && Number(s) <= 2026, 'Birth year outside V1 range');
export const birthWriteV1 = z.discriminatedUnion('action', [
  z.object({ action: z.literal('set'), accountId: portalIdV1, expectedVersion: versionV1, year: birthYearV1, confirmation: z.enum(['confirmed', 'unconfirmed-test']) }).strict(),
  z.object({ action: z.literal('clear'), accountId: portalIdV1, expectedVersion: versionV1 }).strict(),
]);
const account = { ...commandMetaV1, accountId: portalIdV1 };
export const printModeV1 = z.enum(['qr-only', 'qr-name', 'qr-name-class']);
export const adminCommandV1 = z.discriminatedUnion('operation', [
  z.object({ ...account, operation: z.literal('qr-issue') }).strict(),
  z.object({ ...account, operation: z.literal('qr-reprint') }).strict(),
  z.object({ ...account, operation: z.literal('qr-regenerate'), confirmed: z.literal(true) }).strict(),
  z.object({ ...account, operation: z.literal('password-reset'), confirmed: z.literal(true) }).strict(),
  z.object({ ...account, operation: z.literal('account-reset'), confirmed: z.literal(true) }).strict(),
  z.object({ ...account, operation: z.literal('block'), blocked: z.boolean(), confirmed: z.literal(true) }).strict(),
  z.object({ ...commandMetaV1, operation: z.literal('sessions-revoke'), scope: scopeV1, sessionId: portalIdV1.optional(), confirmed: z.literal(true) }).strict(),
  z.object({ ...commandMetaV1, operation: z.literal('birth-write'), item: birthWriteV1 }).strict(),
  z.object({ ...commandMetaV1, operation: z.literal('birth-batch'), classId: z.number().int().positive(), expectedCount: z.number().int().min(1).max(100), items: z.array(birthWriteV1).min(1).max(100), confirmed: z.literal(true) }).strict(),
  z.object({ ...commandMetaV1, operation: z.literal('settings-set'), scope: scopeV1, value: settingsOverrideV1, acknowledgeImmediateEffect: z.boolean() }).strict(),
  z.object({ ...commandMetaV1, operation: z.literal('settings-inherit'), scope: scopeV1, keys: z.array(z.enum(['accessEnabled', 'showPartials', 'autoUpdate', 'showFinalResult', 'allowedPeriods', 'risk', 'calendar'])).min(1).max(7) }).strict(),
  z.object({ ...commandMetaV1, operation: z.literal('publish'), scope: scopeV1, period: periodV1, targetDataVersion: revisionV1 }).strict(),
  z.object({ ...commandMetaV1, operation: z.literal('publish-update'), scope: scopeV1, period: periodV1, targetDataVersion: revisionV1 }).strict(),
  z.object({ ...commandMetaV1, operation: z.literal('unpublish'), scope: scopeV1, period: periodV1, confirmed: z.literal(true) }).strict(),
  z.object({ ...commandMetaV1, operation: z.literal('links-close'), academicYear: z.literal(2026), previewToken: opaqueV1, expectedCount: z.number().int().nonnegative(), confirmed: z.literal(true) }).strict(),
  z.object({ ...commandMetaV1, operation: z.literal('qr-batch'), classId: z.number().int().positive(), accountIds: z.array(portalIdV1).min(1).max(100), mode: printModeV1.default('qr-name-class'), confirmed: z.literal(true) }).strict(),
]).superRefine((v, ctx) => {
  if (v.operation === 'birth-batch' && (v.expectedCount !== v.items.length || new Set(v.items.map((i) => i.accountId)).size !== v.items.length)) ctx.addIssue({ code: 'custom', path: ['items'], message: 'Scope count or duplicate account' });
  if (v.operation === 'sessions-revoke' && v.sessionId && v.scope.kind !== 'account') ctx.addIssue({ code: 'custom', path: ['scope'], message: 'Individual session requires account scope' });
  if (v.operation === 'qr-batch' && new Set(v.accountIds).size !== v.accountIds.length) ctx.addIssue({ code: 'custom', path: ['accountIds'], message: 'Duplicate account' });
});
export const auditKindV1 = z.enum(['login', 'login-failed', 'activated', 'password-reset', 'account-reset', 'qr-issued', 'qr-reprinted', 'qr-regenerated', 'blocked', 'unblocked', 'session-revoked', 'birth-changed', 'settings-changed', 'published', 'unpublished', 'projection-updated', 'links-closed']);
export const adminQueryV1 = z.object({
  contractVersion: z.literal(1), operation: z.enum(['accounts', 'sessions', 'birth-years', 'settings', 'publication', 'audit', 'audit-detail', 'health', 'links-preview']),
  scope: scopeV1, page: pageRequestV1, from: instantV1.optional(), until: instantV1.optional(), event: auditKindV1.optional(), result: z.enum(['success', 'denied', 'failed']).optional(),
  eventId: portalIdV1.optional(), accountState: accountStateV1.optional(), blocked: z.boolean().optional(), nameSearch: z.string().min(1).max(200).optional(),
}).strict().refine((v) => !v.from || !v.until || Date.parse(v.from) <= Date.parse(v.until), 'Invalid interval')
  .refine((v) => v.operation !== 'audit-detail' || v.eventId !== undefined, 'Audit detail requires eventId');
export const accountSummaryV1 = z.object({ accountId: portalIdV1, link: academicLinkV1.nullable(), name: z.string().max(200), classLabel: z.string().max(80), state: accountStateV1, eligibility: eligibilityStateV1, blocked: z.boolean(), version: versionV1 }).strict();
const card = { accountId: portalIdV1, qr: qrUrlV1 };
export const printCardV1 = z.discriminatedUnion('mode', [
  z.object({ ...card, mode: z.literal('qr-only') }).strict(),
  z.object({ ...card, mode: z.literal('qr-name'), name: z.string().min(1).max(200) }).strict(),
  z.object({ ...card, mode: z.literal('qr-name-class'), name: z.string().min(1).max(200), classLabel: z.string().min(1).max(80) }).strict(),
]);
export const auditEventV1 = z.object({ eventId: portalIdV1, at: instantV1, actorId: portalIdV1, accountId: portalIdV1.nullable(), scope: scopeV1, kind: auditKindV1, result: z.enum(['success', 'denied', 'failed']), requestId: portalIdV1, version: versionV1, maskedIp: z.string().max(64).nullable() }).strict();
const base = { contractVersion: z.literal(1), requestId: portalIdV1 };
const paging = { nextCursor: opaqueV1.nullable() };
export const adminResponseV1 = z.discriminatedUnion('state', [
  z.object({ ...base, state: z.literal('accounts'), items: z.array(accountSummaryV1).max(100), ...paging }).strict(),
  z.object({ ...base, state: z.literal('sessions'), items: z.array(z.object({ sessionId: portalIdV1, accountId: portalIdV1, expiresAt: instantV1, revokedAt: instantV1.nullable() }).strict()).max(100), ...paging }).strict(),
  z.object({ ...base, state: z.literal('birth-years'), items: z.array(z.object({ accountId: portalIdV1, year: birthYearV1.nullable(), confirmation: z.enum(['confirmed', 'unconfirmed-test']).nullable(), version: versionV1 }).strict()).max(100), ...paging }).strict(),
  z.object({ ...base, state: z.literal('settings'), settings: effectiveSettingsV1 }).strict(),
  z.object({ ...base, state: z.literal('publication'), items: z.array(z.object({ period: periodV1, state: publicationStateV1, availableRevision: revisionV1.nullable(), publishedRevision: revisionV1.nullable(), version: versionV1 }).strict()).max(6) }).strict(),
  z.object({ ...base, state: z.literal('audit'), items: z.array(auditEventV1).max(100), ...paging }).strict(),
  z.object({ ...base, state: z.literal('audit-detail'), event: auditEventV1, ip: z.union([z.ipv4(), z.ipv6()]).nullable(), ipExpiresAt: instantV1.nullable() }).strict(),
  z.object({ ...base, state: z.literal('health'), status: z.enum(['normal', 'attention', 'intervention']) }).strict(),
  z.object({ ...base, state: z.literal('links-preview'), count: z.number().int().nonnegative(), previewToken: opaqueV1, expiresAt: instantV1, version: versionV1 }).strict(),
  z.object({ ...base, state: z.literal('committed'), operationId: portalIdV1, version: versionV1 }).strict(),
  z.object({ ...base, state: z.literal('qr'), cards: z.array(printCardV1).min(1).max(100), version: versionV1 }).strict(),
  z.object({ ...base, state: z.literal('batch'), operationId: portalIdV1, items: z.array(z.object({ accountId: portalIdV1, state: z.enum(['committed', 'conflict', 'forbidden', 'unavailable']), version: versionV1 }).strict()).max(100) }).strict(),
]);
export const ADMIN_BODY_BYTES_V1 = 65536;
export type AdminCommandV1 = z.infer<typeof adminCommandV1>;
export type AdminQueryV1 = z.infer<typeof adminQueryV1>;
export type AdminResponseV1 = z.infer<typeof adminResponseV1>;
