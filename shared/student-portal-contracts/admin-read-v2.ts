import { z } from 'zod';
import { accountSummaryV1, adminQueryV1 } from './admin-v1';
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
  z.string()
    .max(80)
    .refine((value) => !value.includes('\0'))
    .parse(query);
  return {
    contractVersion: 2,
    operation: 'search',
    year: 2026,
    kind: 'class-group',
    query,
    offset,
    limit,
  };
}

/** Opt-in reads only; every V1 query, command, response and CAS meaning remains unchanged. */
export const adminReadQueryV2 = z
  .object({
    contractVersion: z.literal(2),
    operation: z.enum(['accounts-read', 'overview', 'sessions-read']),
    scope: scopeV1,
    page: pageRequestV1,
    accountState: accountStateV1.optional(),
    blocked: z.boolean().optional(),
    nameSearch: z.string().min(1).max(200).optional(),
  })
  .strict()
  .refine((value) => value.operation !== 'overview' || !value.page.cursor, 'Overview has no cursor')
  .refine(
    (value) =>
      value.operation !== 'sessions-read' ||
      [value.accountState, value.blocked, value.nameSearch].every((field) => field === undefined),
    'Session scope must match the complete revocation scope',
  );
export const adminQueryRequestV2 = z.union([adminQueryV1, adminReadQueryV2]);
export const adminAccessV2 = z
  .object({
    state: z.enum(['resolved', 'unresolved']),
    enabled: z.boolean().nullable(),
    source: scopeV1.nullable(),
    settingsVersion: versionV1.nullable(),
    accessPermitted: z.boolean(),
  })
  .strict();
export const adminAccountReadV2 = accountSummaryV1
  .extend({
    // Explicit lifecycle fact; the UI must not infer closure from unresolved access.
    linkClosed: z.boolean(),
    classId: z.number().int().positive().safe().nullable(),
    access: adminAccessV2,
    // Latest successful login/activation event retained in the preceding 12 months.
    // Null means unknown in the retained window, never proof of no previous access.
    lastAuthenticationAt: instantV1.nullable(),
    validSessionCount: z.number().int().nonnegative().safe(),
  })
  .strict();
const base = { contractVersion: z.literal(2), requestId: portalIdV1, observedAt: instantV1 };
const count = z.number().int().nonnegative().safe();
export const ADMIN_OVERVIEW_ACCOUNT_LIMIT_V2 = 5_000;
export const adminReadResponseV2 = z.discriminatedUnion('state', [
  z
    .object({
      ...base,
      state: z.literal('sessions-read'),
      scope: scopeV1,
      // Same CAS as sessions-revoke; count includes expired but not yet revoked sessions.
      version: versionV1,
      revocableCount: count,
      items: z
        .array(
          z
            .object({
              sessionId: portalIdV1,
              accountId: portalIdV1,
              name: z.string().max(200),
              classLabel: z.string().max(80),
              classId: z.number().int().positive().safe().nullable(),
              accountVersion: versionV1,
              createdAt: instantV1,
              expiresAt: instantV1,
              effectiveExpiresAt: instantV1.nullable(),
              revokedAt: instantV1.nullable(),
              persistent: z.boolean(),
              validity: z.enum(['valid', 'expired', 'revoked', 'unavailable']),
            })
            .strict(),
        )
        .max(100),
      nextCursor: opaqueV1.nullable(),
    })
    .strict(),
  z
    .object({
      ...base,
      state: z.literal('accounts-read'),
      scopeVersion: versionV1,
      items: z.array(adminAccountReadV2).max(100),
      nextCursor: opaqueV1.nullable(),
      lastAuthenticationWindowMonths: z.literal(12),
    })
    .strict(),
  z
    .object({
      ...base,
      state: z.literal('overview'),
      scopeVersion: versionV1,
      counts: z
        .object({
          accounts: count,
          active: count,
          pendingActivation: count,
          resetRequired: count,
          blocked: count,
          unresolved: count,
          unlinked: count,
          accessEnabled: count,
          accessPermitted: count,
          validSessions: count,
        })
        .strict(),
      health: z.enum(['normal', 'attention', 'intervention']),
    })
    .strict(),
]);
export type AdminReadQueryV2 = z.infer<typeof adminReadQueryV2>;
export type AdminReadResponseV2 = z.infer<typeof adminReadResponseV2>;
export type AdminAccountReadV2 = z.infer<typeof adminAccountReadV2>;
