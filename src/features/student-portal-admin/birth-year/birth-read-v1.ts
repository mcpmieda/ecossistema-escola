import type { AdminResponseV1 } from '../../../../shared/student-portal-contracts/admin-v1';
import type { AdminAccountReadV2 } from '../../../../shared/student-portal-contracts/admin-read-v2';
import { scopeV1, type ScopeV1 } from '../../../../shared/student-portal-contracts/core-v1';
import type { PortalAdminClientV1 } from '../shared/admin-client-v1';
import type { PortalAdminReadClientV2 } from '../accounts/accounts-client-v2';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';

export type BirthScopeV1 = Exclude<ScopeV1, { kind: 'school' }>;
export type BirthValueV1 = Extract<AdminResponseV1, { state: 'birth-years' }>['items'][number];
export interface BirthRecordV1 {
  account: AdminAccountReadV2;
  birth: BirthValueV1;
}
export interface BirthCursorsV1 {
  accounts: string;
  birth: string;
}
export interface BirthPageV1 {
  rows: BirthRecordV1[];
  scopeVersion: number;
  next: BirthCursorsV1 | null;
}

/** Two bounded reads, joined by identity and matching account CAS, never by row position.
 * Opaque cursors belong to different operations and must remain separate. */
export async function readBirthPageV1(
  client: PortalAdminClientV1,
  reader: PortalAdminReadClientV2,
  scope: BirthScopeV1,
  cursor: BirthCursorsV1 | undefined,
  signal: AbortSignal,
  expectedClassId?: number,
): Promise<BirthPageV1> {
  const parsed = scopeV1.safeParse(scope);
  if (!parsed.success || parsed.data.kind === 'school')
    throw new PortalClientErrorV1('invalid-request');
  const [accounts, birth] = await Promise.all([
    reader.query(
      {
        contractVersion: 2,
        operation: 'accounts-read',
        scope,
        page: { limit: 100, ...(cursor ? { cursor: cursor.accounts } : {}) },
      },
      signal,
    ),
    client.query(
      {
        contractVersion: 1,
        operation: 'birth-years',
        scope,
        page: { limit: 100, ...(cursor ? { cursor: cursor.birth } : {}) },
      },
      signal,
    ),
  ]);
  signal.throwIfAborted();
  if (accounts.state !== 'accounts-read' || birth.state !== 'birth-years')
    throw new PortalClientErrorV1('invalid-response');
  if (accounts.items.length !== birth.items.length || !!accounts.nextCursor !== !!birth.nextCursor)
    throw new PortalClientErrorV1('conflict');
  const births = new Map(birth.items.map((item) => [item.accountId, item]));
  if (
    births.size !== birth.items.length ||
    new Set(accounts.items.map((a) => a.accountId)).size !== accounts.items.length
  )
    throw new PortalClientErrorV1('invalid-response');
  if (scope.kind === 'account' && (accounts.items.length > 1 || accounts.nextCursor))
    throw new PortalClientErrorV1('invalid-response');
  const classId = scope.kind === 'class' ? scope.classId : expectedClassId;
  const rows = accounts.items.map((account) => {
    const value = births.get(account.accountId);
    if (!value || account.version !== value.accountVersion)
      throw new PortalClientErrorV1('conflict');
    if ((value.year === null) !== (value.confirmation === null))
      throw new PortalClientErrorV1('invalid-response');
    if (scope.kind === 'account' && account.accountId !== scope.accountId)
      throw new PortalClientErrorV1('invalid-response');
    if (
      account.linkClosed ||
      !account.link ||
      account.classId === null ||
      (classId !== undefined && account.classId !== classId)
    )
      throw new PortalClientErrorV1('conflict');
    return { account, birth: value };
  });
  return {
    rows,
    scopeVersion: birth.scopeVersion,
    next:
      accounts.nextCursor && birth.nextCursor
        ? { accounts: accounts.nextCursor, birth: birth.nextCursor }
        : null,
  };
}

/** Automatic collection for the UI. The first interaction stays to one100-row page; later
 * continuation keeps the paired account/birth cursors and all existing CAS checks. */
export async function readBirthCollectionV1(
  client: PortalAdminClientV1,
  reader: PortalAdminReadClientV2,
  scope: BirthScopeV1,
  signal: AbortSignal,
  desired = 100,
  seed?: BirthPageV1,
): Promise<BirthPageV1> {
  const rows = new Map((seed?.rows ?? []).map((row) => [row.account.accountId, row]));
  const seen = new Set<string>();
  let cursor = seed?.next ?? undefined;
  let result = seed;
  let added = 0;
  for (let i = 0; i < Math.max(20, Math.ceil(desired / 100) + 10); i++) {
    signal.throwIfAborted();
    if (cursor) {
      const key = JSON.stringify(cursor);
      if (seen.has(key)) throw new PortalClientErrorV1('invalid-response');
      seen.add(key);
    }
    const page = await readBirthPageV1(client, reader, scope, cursor, signal);
    signal.throwIfAborted();
    for (const row of page.rows) {
      if (!rows.has(row.account.accountId)) added++;
      rows.set(row.account.accountId, row);
    }
    result = { ...page, rows: [...rows.values()] };
    if (!page.next || added >= desired) return result;
    cursor = page.next;
  }
  if (!result) throw new PortalClientErrorV1('invalid-response');
  return result;
}
