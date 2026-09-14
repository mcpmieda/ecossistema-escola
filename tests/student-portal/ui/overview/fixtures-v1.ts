import type {
  AdminCommandV1,
  AdminQueryV1,
} from '../../../../shared/student-portal-contracts/admin-v1';
import type {
  AdminAccountReadV2,
  AdminReadQueryV2,
  AdminReadResponseV2,
} from '../../../../shared/student-portal-contracts/admin-read-v2';
import { createPortalAdminClientV1 } from '../../../../src/features/student-portal-admin/shared/admin-client-v1';
import { createPortalAdminReadClientV2 } from '../../../../src/features/student-portal-admin/accounts/accounts-client-v2';
import type { OperationsPropsV1 } from '../../../../src/features/student-portal-admin/overview/operations-values-v1';
export const opIdV1 = (n: number) => '75600000-0000-4000-8000-' + String(n).padStart(12, '0');
export const OP_CLASS_V1 = { kind: 'class', academicYear: 2026, classId: 756001 } as const;
export const OP_ACCOUNT_V1 = { kind: 'account', academicYear: 2026, accountId: opIdV1(1) } as const;
export const OP_META_V1 = { contractVersion: 1, requestId: opIdV1(9900) } as const;
export const opJsonV1 = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
export function operationsMockV1(
  options: {
    count?: number;
    now?: () => number;
    ipExpiry?: number;
    query?: (
      query: AdminQueryV1 | AdminReadQueryV2,
      signal?: AbortSignal | null,
    ) => Promise<Response> | undefined;
    write?: (command: AdminCommandV1, signal?: AbortSignal | null) => Promise<Response> | undefined;
  } = {},
) {
  const now = options.now ?? Date.now,
    at = () => new Date(now()).toISOString();
  const accounts: AdminAccountReadV2[] = Array.from({ length: 3 }, (_, i) => ({
    accountId: opIdV1(i + 1),
    link: { academicYear: 2026, studentId: 756001 + i },
    linkClosed: false,
    name: 'SYNTHETIC OP STUDENT ' + (i + 1),
    classLabel: 'SYNTHETIC OP CLASS',
    classId: 756001,
    state: 'active',
    eligibility: 'eligible',
    blocked: false,
    version: 11 + i,
    access: {
      state: 'resolved',
      enabled: true,
      source: OP_CLASS_V1,
      settingsVersion: 3,
      accessPermitted: true,
    },
    lastAuthenticationAt: null,
    validSessionCount: 1,
    firstAccess: { state: 'not-required', qrIssued: true, recoveryReady: true },
  }));
  const sessions: Extract<AdminReadResponseV2, { state: 'sessions-read' }>['items'] = Array.from(
    { length: options.count ?? 4 },
    (_, i) => ({
      sessionId: opIdV1(100 + i),
      accountId: opIdV1(1),
      name: accounts[0]!.name,
      classLabel: accounts[0]!.classLabel,
      classId: 756001,
      accountVersion: 11,
      createdAt: new Date(now() - 3600_000 - i * 60_000).toISOString(),
      expiresAt: new Date(now() + (i % 4 === 1 ? -60_000 : 86400_000)).toISOString(),
      effectiveExpiresAt: new Date(now() + (i % 4 === 1 ? -60_000 : 3600_000)).toISOString(),
      revokedAt: i % 4 === 2 ? at() : null,
      persistent: i % 2 === 0,
      validity: (['valid', 'expired', 'revoked', 'unavailable'] as const)[i % 4]!,
    }),
  );
  const queries: (AdminQueryV1 | AdminReadQueryV2)[] = [],
    writes: AdminCommandV1[] = [],
    bodies: string[] = [];
  const receipts = new Map<string, { operationId: string; version: number }>();
  let version = 756;
  let populationEnabled = false,
    populationAccounts = 3,
    populationMissing = 381,
    populationOverrides = 9;
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = String(init?.body),
      value = JSON.parse(body);
    if (String(input).endsWith('/command')) {
      const command = value as AdminCommandV1;
      writes.push(command);
      bodies.push(body);
      const custom = options.write?.(command, init?.signal);
      if (custom) return custom;
      if (command.operation !== 'sessions-revoke' && command.operation !== 'population-start')
        return opJsonV1({ ...OP_META_V1, state: 'invalid-request' }, 400);
      let receipt = receipts.get(command.idempotencyKey);
      if (!receipt) {
        const scope =
          command.operation === 'sessions-revoke'
            ? command.scope
            : { kind: 'school' as const, academicYear: 2026 as const };
        const expected =
          scope.kind === 'account'
            ? accounts.find((a) => a.accountId === scope.accountId)?.version
            : version;
        if (expected !== command.expectedVersion)
          return opJsonV1({ ...OP_META_V1, state: 'conflict' }, 409);
        if (command.operation === 'sessions-revoke') {
          for (const session of sessions)
            if (
              (scope.kind !== 'account' || session.accountId === scope.accountId) &&
              (!command.sessionId || command.sessionId === session.sessionId)
            ) {
              session.revokedAt = at();
              session.validity = 'revoked';
            }
          accounts[0]!.version++;
        } else {
          populationEnabled = true;
          populationAccounts += populationMissing;
          populationMissing = 0;
          populationOverrides = 0;
        }
        version++;
        receipt = {
          operationId: opIdV1(9800 + receipts.size),
          version: scope.kind === 'account' ? accounts[0]!.version : version,
        };
        receipts.set(command.idempotencyKey, receipt);
      }
      return opJsonV1({ ...OP_META_V1, state: 'committed', ...receipt });
    }
    const query = value as AdminQueryV1 | AdminReadQueryV2;
    queries.push(query);
    const custom = options.query?.(query, init?.signal);
    if (custom) return custom;
    const offset = query.page.cursor ? Number(query.page.cursor.slice(32)) : 0;
    const next = (length: number) =>
      offset + query.page.limit < length ? 'c'.repeat(32) + (offset + query.page.limit) : null;
    const filtered = accounts
      .filter((a) =>
        query.scope.kind === 'account'
          ? a.accountId === query.scope.accountId
          : query.scope.kind === 'class'
            ? a.classId === query.scope.classId
            : true,
      )
      .filter(
        (a) => !query.nameSearch || a.name.toLowerCase().includes(query.nameSearch.toLowerCase()),
      );
    if (query.operation === 'accounts-read')
      return opJsonV1({
        ...OP_META_V1,
        contractVersion: 2,
        state: 'accounts-read',
        observedAt: at(),
        scopeVersion: version,
        items: filtered.slice(offset, offset + query.page.limit),
        nextCursor: next(filtered.length),
        lastAuthenticationWindowMonths: 12,
      });
    if (query.operation === 'sessions-read') {
      const rows = sessions.filter((s) => filtered.some((a) => a.accountId === s.accountId));
      return opJsonV1({
        ...OP_META_V1,
        contractVersion: 2,
        state: 'sessions-read',
        scope: query.scope,
        observedAt: at(),
        version: query.scope.kind === 'account' ? (filtered[0]?.version ?? 0) : version,
        revocableCount: rows.filter((s) => s.revokedAt === null).length,
        items: rows.slice(offset, offset + query.page.limit),
        nextCursor: next(rows.length),
      });
    }
    if (query.operation === 'overview')
      return opJsonV1({
        ...OP_META_V1,
        contractVersion: 2,
        state: 'overview',
        observedAt: at(),
        scopeVersion: version,
        counts: {
          accounts: filtered.length,
          active: filtered.length,
          pendingActivation: 0,
          resetRequired: 0,
          blocked: 0,
          unresolved: 0,
          unlinked: 0,
          accessEnabled: filtered.length,
          accessPermitted: filtered.length,
          validSessions: sessions.filter(
            (s) => s.validity === 'valid' && filtered.some((a) => a.accountId === s.accountId),
          ).length,
        },
        health: 'normal',
      });
    if (query.operation === 'health')
      return opJsonV1({ ...OP_META_V1, state: 'health', status: 'normal' });
    if (query.operation === 'population')
      return opJsonV1({
        ...OP_META_V1,
        state: 'population',
        enabled: populationEnabled,
        version,
        sourceProfiles: 384,
        eligibleSourceProfiles: 353,
        exitSourceProfiles: 31,
        classes: 15,
        accounts: populationAccounts,
        eligibleAccounts: populationEnabled ? 353 : 3,
        deniedAccounts: populationEnabled ? 31 : 0,
        missingProfiles: populationMissing,
        overrideRows: populationOverrides,
      });
    if (query.contractVersion !== 1)
      return opJsonV1({ ...OP_META_V1, state: 'invalid-request' }, 400);
    const events = Array.from({ length: options.count ?? 4 }, (_, i) => ({
      eventId: opIdV1(300 + i),
      at: new Date(now() - i * 60_000).toISOString(),
      actorId: opIdV1(900),
      accountId: opIdV1(1),
      scope: OP_ACCOUNT_V1,
      kind: 'session-revoked' as const,
      result: 'success' as const,
      requestId: opIdV1(1000 + i),
      version: 11,
      maskedIp: '192.0.2.*',
    })).filter(
      (e) =>
        (!query.event || e.kind === query.event) &&
        (!query.result || e.result === query.result) &&
        (!query.from || e.at >= query.from) &&
        (!query.until || e.at <= query.until),
    );
    if (query.operation === 'audit')
      return opJsonV1({
        ...OP_META_V1,
        state: 'audit',
        items: events.slice(offset, offset + query.page.limit),
        nextCursor: next(events.length),
      });
    if (query.operation === 'audit-detail')
      return opJsonV1({
        ...OP_META_V1,
        state: 'audit-detail',
        event: events.find((e) => e.eventId === query.eventId),
        ip: '192.0.2.42',
        ipExpiresAt: new Date(now() + (options.ipExpiry ?? 10_000)).toISOString(),
      });
    return opJsonV1({ ...OP_META_V1, state: 'invalid-request' }, 400);
  };
  const client = createPortalAdminClientV1({ fetch: fetcher }),
    reader = createPortalAdminReadClientV2({ fetch: fetcher });
  const props: OperationsPropsV1 = {
    client,
    reader,
    scope: OP_ACCOUNT_V1,
    scopeLabel: 'SYNTHETIC OP STUDENT 1',
    identityKey: 'synthetic-756-operator',
    canWrite: true,
  };
  return { client, reader, props, accounts, sessions, queries, writes, bodies, receipts };
}
