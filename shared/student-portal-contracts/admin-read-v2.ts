import { z } from 'zod';
import { termClosingSummaryV1, termClosingV1, TERM_CLOSING_MODES_V1, TERM_CLOSING_PERIODS_V1 } from './term-closing-v1';
import { settingsOverrideV1 } from './policy-v1';
import { accountSummaryV1, adminQueryV1 } from './admin-v1';
import { customizationsResponseV1 } from './customizations-v1';
import {
  accountStateV1,
  instantV1,
  opaqueV1,
  pageRequestV1,
  portalIdV1,
  scopeV1,
  versionV1,
} from './core-v1';
import type { OperationalWorkspaceRequestV2 } from '../gradebook-contracts/operational-workspace/operational-workspace-transport-v2';

/** Reuse the complete, authorized BN catalog, including classes with no bindings/accounts. */
export const ADMIN_CLASS_CATALOG_PATH_V2 = '/api/gradebook/operational-workspace';
export function adminClassCatalogRequestV2(
  offset = 0,
  limit = 100,
  query = '',
): Extract<OperationalWorkspaceRequestV2, { operation: 'search' }> {
  z.number().int().min(0).max(100_000).parse(offset);
  z.number().int().min(1).max(100).parse(limit);
  z.string().max(80).refine((value) => !value.includes('\0')).parse(query);
  return { contractVersion: 2, operation: 'search', year: 2026, kind: 'class-group', query, offset, limit };
}

/** Opt-in reads only; every existing query/response and CAS meaning remains unchanged. */
export const adminReadQueryV2 = z.object({
  contractVersion: z.literal(2),
  operation: z.enum(['accounts-read', 'overview', 'sessions-read', 'settings-overrides', 'customizations-read', 'closing-preview']),
  scope: scopeV1,
  page: pageRequestV1,
  accountState: accountStateV1.optional(),
  blocked: z.boolean().optional(),
  nameSearch: z.string().min(1).max(200).optional(),
  sessionView: z.enum(['active', 'history']).optional(),
}).strict()
  .refine((value) => value.sessionView === undefined || value.operation === 'sessions-read', 'Session view is only valid for sessions')
  .refine((value) => value.operation !== 'overview' || !value.page.cursor, 'Overview has no cursor')
  .refine((value) => !['sessions-read', 'settings-overrides'].includes(value.operation) ||
    [value.accountState, value.blocked, value.nameSearch].every((field) => field === undefined), 'Session scope must match the complete revocation scope')
  .refine((value) => value.operation !== 'customizations-read' ||
    (value.accountState === undefined && value.blocked === undefined && !value.nameSearch?.includes('\0')), 'Customization inventory accepts only scope and name search')
  // Fechamento do trimestre preview (#1132 D12): one student's record only.
  .refine((value) => value.operation !== 'closing-preview' ||
    (value.scope.kind === 'account' && [value.accountState, value.blocked, value.nameSearch].every((field) => field === undefined)),
  'Closing preview is read for one account');
export const adminQueryRequestV2 = z.union([adminQueryV1, adminReadQueryV2]);
export const adminAccessV2 = z.object({
  state: z.enum(['resolved', 'unresolved']), enabled: z.boolean().nullable(), source: scopeV1.nullable(),
  settingsVersion: versionV1.nullable(), accessPermitted: z.boolean(),
}).strict();
export const adminAccountReadV2 = accountSummaryV1.extend({
  linkClosed: z.boolean(),
  classId: z.number().int().positive().safe().nullable(),
  access: adminAccessV2,
  // Unknown in the retained window is not proof of no previous access.
  lastAuthenticationAt: instantV1.nullable(),
  validSessionCount: z.number().int().nonnegative().safe(),
  firstAccess: z.object({
    state: z.enum(['ready', 'birth-missing', 'birth-unconfirmed', 'qr-missing', 'pin-missing', 'pin-outdated', 'not-required']),
    qrIssued: z.boolean(), recoveryReady: z.boolean(),
  }).strict(),
}).strict();
const base = { contractVersion: z.literal(2), requestId: portalIdV1, observedAt: instantV1 };
const count = z.number().int().nonnegative().safe();
export const ADMIN_OVERVIEW_ACCOUNT_LIMIT_V2 = 5_000;
export const customizedSettingsRowV1 = z.object({
  id: z.string().regex(/^(?:class:2026:[1-9]\d*|account:2026:[0-9a-f-]{36})$/u),
  scope: scopeV1.refine((s) => s.kind !== 'school'), label: z.string().max(200), classLabel: z.string().max(80),
  value: settingsOverrideV1, updatedAt: instantV1,
}).strict();
export const adminReadResponseV2 = z.discriminatedUnion('state', [
  customizationsResponseV1,
  z.object({ ...base, state: z.literal('closing-preview'), scope: scopeV1,
    available: z.boolean(), visibleToStudent: z.boolean(), mode: z.enum(TERM_CLOSING_MODES_V1),
    closedPeriods: z.array(z.enum(TERM_CLOSING_PERIODS_V1)).max(3),
    subjects: z.array(z.object({ subjectId: z.number().int().positive(), label: z.string().min(1).max(120),
      closings: z.array(termClosingV1).max(3) }).strict()).max(100),
    summary: termClosingSummaryV1.optional(),
  }).strict(),
  z.object({ ...base, state: z.literal('settings-overrides'), scope: scopeV1,
    items: z.array(customizedSettingsRowV1).max(100), nextCursor: opaqueV1.nullable(),
  }).strict(),
  z.object({ ...base, state: z.literal('sessions-read'), sessionView: z.enum(['active', 'history']).optional(), scope: scopeV1,
    version: versionV1, revocableCount: count,
    items: z.array(z.object({
      sessionId: portalIdV1, accountId: portalIdV1, name: z.string().max(200), classLabel: z.string().max(80),
      classId: z.number().int().positive().safe().nullable(), accountVersion: versionV1,
      createdAt: instantV1, expiresAt: instantV1, effectiveExpiresAt: instantV1.nullable(), revokedAt: instantV1.nullable(),
      persistent: z.boolean(), validity: z.enum(['valid', 'expired', 'revoked', 'unavailable']),
    }).strict()).max(100), nextCursor: opaqueV1.nullable(),
  }).strict(),
  z.object({ ...base, state: z.literal('accounts-read'), scopeVersion: versionV1,
    items: z.array(adminAccountReadV2).max(100), nextCursor: opaqueV1.nullable(), lastAuthenticationWindowMonths: z.literal(12),
  }).strict(),
  z.object({ ...base, state: z.literal('overview'), scopeVersion: versionV1,
    counts: z.object({ accounts: count, active: count, pendingActivation: count, resetRequired: count, blocked: count,
      unresolved: count, unlinked: count, accessEnabled: count, accessPermitted: count, validSessions: count,
    }).strict(), health: z.enum(['normal', 'attention', 'intervention']),
  }).strict(),
]);
export type AdminReadQueryV2 = z.infer<typeof adminReadQueryV2>;
export type AdminReadResponseV2 = z.infer<typeof adminReadResponseV2>;
export type AdminAccountReadV2 = z.infer<typeof adminAccountReadV2>;
