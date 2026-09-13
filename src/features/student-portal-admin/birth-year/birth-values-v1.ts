import {
  birthYearV1,
  type AdminCommandV1,
} from '../../../../shared/student-portal-contracts/admin-v1';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import type { BirthRecordV1 } from './birth-read-v1';

export type BirthSingleCommandV1 = Extract<AdminCommandV1, { operation: 'birth-write' }>;
export type BirthBatchCommandV1 = Extract<AdminCommandV1, { operation: 'birth-batch' }>;
export type BirthItemV1 = BirthSingleCommandV1['item'];
export type BirthConfirmationV1 = 'confirmed' | 'unconfirmed-test';
export type BirthRowStatusV1 =
  'idle' | 'draft' | 'saving' | 'saved' | 'error' | 'conflict' | 'refresh-error';
export interface BirthDraftRowV1 {
  record: BirthRecordV1;
  year: string;
  confirmation: BirthConfirmationV1;
  revision: number;
  selected: boolean;
  status: BirthRowStatusV1;
  error?: PortalClientErrorV1;
}
export function validBirthYearV1(year: string) {
  return birthYearV1.safeParse(year).success;
}
export function birthDraftRowV1(record: BirthRecordV1): BirthDraftRowV1 {
  return {
    record,
    year: record.birth.year ?? '',
    confirmation: record.birth.confirmation ?? 'unconfirmed-test',
    revision: 0,
    selected: false,
    status: 'idle',
  };
}
export function birthDirtyV1(row: BirthDraftRowV1) {
  return (
    row.year !== (row.record.birth.year ?? '') ||
    (row.year !== '' && row.confirmation !== row.record.birth.confirmation)
  );
}
export function birthSetItemV1(row: BirthDraftRowV1): BirthItemV1 {
  if (!validBirthYearV1(row.year)) throw new PortalClientErrorV1('invalid-request');
  return {
    action: 'set',
    accountId: row.record.account.accountId,
    expectedVersion: row.record.birth.version,
    year: row.year,
    confirmation: row.confirmation,
  };
}
export function birthClearItemV1(row: BirthDraftRowV1): BirthItemV1 {
  return {
    action: 'clear',
    accountId: row.record.account.accountId,
    expectedVersion: row.record.birth.version,
  };
}
export function birthSingleCommandV1(
  row: BirthDraftRowV1,
  item: BirthItemV1,
): BirthSingleCommandV1 {
  return {
    contractVersion: 1,
    operation: 'birth-write',
    idempotencyKey: crypto.randomUUID(),
    expectedVersion: row.record.account.version,
    item,
  };
}
export function birthErrorV1(error: unknown) {
  return error instanceof PortalClientErrorV1 ? error : new PortalClientErrorV1('network-error');
}
export function birthRetryableV1(error: PortalClientErrorV1) {
  return ['network-error', 'invalid-response', 'unavailable', 'rate-limited'].includes(error.state);
}
export function birthProtectedFailureV1(error: PortalClientErrorV1) {
  return ['unauthenticated', 'forbidden'].includes(error.state);
}
