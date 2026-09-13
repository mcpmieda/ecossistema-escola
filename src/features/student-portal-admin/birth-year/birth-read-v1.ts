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
