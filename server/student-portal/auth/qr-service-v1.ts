import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  adminCommandV1,
  type AdminCommandV1,
} from '../../../shared/student-portal-contracts/admin-v1';
import { PORTAL_ORIGIN_V1 } from '../../../shared/student-portal-contracts/core-v1';
import { qrUrlV1 } from '../../../shared/student-portal-contracts/auth-v1';
import type {
  AccountRecordV1,
  CredentialRecordV1,
  CryptoPortV1,
  IdempotencyRecordV1,
  PortalTransactionV1,
} from '../../../shared/student-portal-contracts/ports-v1';
import type {
  StudentPortalPostgresQueryV1,
  StudentPortalPostgresSqlV1,
} from '../persistence/postgres-persistence-v1';
import {
  accountScopeV1,
  authAuditV1,
  authNowV1,
  authTransactionV1,
  revokeChallengesV1,
} from './transaction-v1';

const operations = [
  'qr-issue',
  'qr-reprint',
  'qr-regenerate',
  'password-reset',
  'account-reset',
  'block',
] as const;
type Operation = (typeof operations)[number];
type QrCommandV1 = Extract<AdminCommandV1, { operation: Operation }>;

const kinds = {
  'qr-issue': 'qr-issued',
  'qr-reprint': 'qr-reprinted',
  'qr-regenerate': 'qr-regenerated',
  'password-reset': 'password-reset',
  'account-reset': 'account-reset',
  block: 'blocked',
} as const;

function parseQrCommandV1(input: unknown): QrCommandV1 {
  const command = adminCommandV1.parse(input);
  if (!('accountId' in command) || !operations.includes(command.operation as Operation))
    throw new Error('student-portal-qr-command-invalid');
  return command as QrCommandV1;
}

function needsRecoveryProofV1(operation: Operation, account: AccountRecordV1) {
  return (
    operation === 'password-reset' ||
    operation === 'account-reset' ||
    (operation.startsWith('qr-') && account.state !== 'active')
  );
}

function validateCredentialOperationV1(
  operation: Operation,
  credential: CredentialRecordV1 | null,
  active: CredentialRecordV1 | null,
) {
  if (operation === 'qr-reprint' && !active) throw new Error('student-portal-qr-unavailable');
  if (operation === 'qr-issue' && credential?.state !== undefined && !active)
    throw new Error('student-portal-qr-regeneration-required');
}

function mutationFlagsV1(
  operation: Operation,
  command: QrCommandV1,
  account: AccountRecordV1,
  active: CredentialRecordV1 | null,
) {
  const newQr =
    (operation === 'qr-issue' && !active) ||
    operation === 'qr-regenerate' ||
    operation === 'account-reset';
  const resetPassword = operation === 'password-reset' || operation === 'account-reset';
  const blockChanged =
    command.operation === 'block' && command.blocked !== account.blocked;
  const securityChanged = operation === 'qr-regenerate' || resetPassword || blockChanged;
  return { newQr, resetPassword, securityChanged, changed: newQr || securityChanged };
}

function nextAccountStateV1(account: AccountRecordV1, operation: Operation) {
  if (operation === 'account-reset') return 'pending-activation' as const;
  if (operation === 'password-reset') return 'reset-required' as const;
  return account.state;
}

function nextBlockedV1(account: AccountRecordV1, command: QrCommandV1) {
  return command.operation === 'block' ? command.blocked : account.blocked;
}

function auditKindV1(operation: Operation, command: QrCommandV1) {
  if (command.operation === 'block' && !command.blocked) return 'unblocked' as const;
  return kinds[operation];
}

/** Private primitive: #713 supplies trusted admin authorization and transport; no public route. */
export class QrServiceV1 {
  constructor(
    private readonly sql: StudentPortalPostgresSqlV1,
    private readonly cryptoPort: CryptoPortV1,
    private readonly keyVersion: number,
  ) {
    z.number().int().positive().max(999999).parse(keyVersion);
  }

  private async url(credentialId: string, keyVersion: number): Promise<string> {
    const signature = await this.cryptoPort.signQr(credentialId, keyVersion);
    return qrUrlV1.parse(
      `${PORTAL_ORIGIN_V1}/access#v1.${credentialId}.${keyVersion}.${signature}`,
    );
  }

  private async replayReceiptV1(
    store: PortalTransactionV1,
    receipt: IdempotencyRecordV1,
    account: AccountRecordV1,
    operation: Operation,
    digest: string,
    accountId: string,
  ) {
    if (receipt.requestDigest !== digest)
      throw new Error('student-portal-qr-idempotency-conflict');
    if (!operation.startsWith('qr-'))
      return { operationId: receipt.operationId, version: receipt.version };

    // Never replay a card after a later rotation/reset/closure changed its account.
    if (account.version !== receipt.version)
      throw new Error('student-portal-qr-version-conflict');
    const credential = await store.readCredentials(accountId);
    if (credential?.state !== 'active') throw new Error('student-portal-qr-unavailable');
    return {
      operationId: receipt.operationId,
      version: receipt.version,
      qr: await this.url(credential.credentialId, credential.keyVersion),
    };
  }

  private async assertRecoveryReadyV1(
    tx: StudentPortalPostgresQueryV1,
    store: PortalTransactionV1,
    account: AccountRecordV1,
    accountId: string,
    operation: Operation,
  ) {
    if (!needsRecoveryProofV1(operation, account)) return;
    const birth = await store.readBirth(accountId);
    const pin = await tx.unsafe(
      `SELECT (pin_verifier IS NOT NULL AND pin_version=$2) AS ready
      FROM student_portal.password_credential WHERE account_id=$1::uuid`,
      [accountId, account.pinVersion],
    );
    if (!birth?.year || birth.confirmation !== 'confirmed' || pin[0]?.ready !== true)
      throw new Error('student-portal-qr-recovery-conflict');
  }

  private async applyQrMutationV1(
    tx: StudentPortalPostgresQueryV1,
    accountId: string,
    active: CredentialRecordV1 | null,
    operation: Operation,
    newQr: boolean,
    now: Date,
  ) {
    if (!newQr)
      return operation.startsWith('qr-') && active
        ? this.url(active.credentialId, active.keyVersion)
        : undefined;

    const credentialId = this.cryptoPort.randomToken(32);
    const qr = await this.url(credentialId, this.keyVersion); // Missing signing key rolls back before issuance.
    await tx.unsafe(
      `UPDATE student_portal.qr_credential SET state='revoked',revoked_at=$2::timestamptz
      WHERE account_id=$1::uuid AND state='active'`,
      [accountId, now.toISOString()],
    );
    await tx.unsafe(
      `INSERT INTO student_portal.qr_credential(credential_id,account_id,key_version,state)
      VALUES ($1,$2::uuid,$3,'active')`,
      [credentialId, accountId, this.keyVersion],
    );
    return qr;
  }

  private async finalizeMutationV1(
    tx: StudentPortalPostgresQueryV1,
    store: PortalTransactionV1,
    account: AccountRecordV1,
    command: QrCommandV1,
    operation: Operation,
    accountId: string,
    actor: string,
    receiptActor: string,
    digest: string,
    now: Date,
    qr: string | undefined,
    changed: boolean,
    securityChanged: boolean,
  ) {
    const next: AccountRecordV1 = {
      ...account,
      version: account.version + (changed ? 1 : 0),
      securityVersion: account.securityVersion + (securityChanged ? 1 : 0),
      state: nextAccountStateV1(account, operation),
      blocked: nextBlockedV1(account, command),
    };
    if (changed && !(await store.compareAndSetAccount(next, account.version)))
      throw new Error('student-portal-qr-version-conflict');

    if (securityChanged) {
      await store.revokeSessions(accountScopeV1(accountId), now.toISOString());
      await revokeChallengesV1(tx, accountId, now);
    }
    await authAuditV1(
      store,
      next,
      auditKindV1(operation, command),
      now,
      command.idempotencyKey,
      actor,
    );
    const operationId = crypto.randomUUID();
    await store.saveIdempotency({
      key: command.idempotencyKey,
      actorId: receiptActor,
      requestDigest: digest,
      operationId,
      version: next.version,
      expiresAt: new Date(now.getTime() + 86_400_000).toISOString(),
    });
    // Account reset's public result is only a receipt; QR access uses a separate reprint command.
    return {
      operationId,
      version: next.version,
      ...(operation.startsWith('qr-') ? { qr } : {}),
    };
  }

  async command(actorId: string, input: unknown) {
    const actor = z.uuid().parse(actorId).toLowerCase();
    const command = parseQrCommandV1(input);
    const operation = command.operation;
    const accountId = command.accountId.toLowerCase();
    const digest = createHash('sha256')
      .update(JSON.stringify({ ...command, accountId }))
      .digest('hex');
    const receiptActor = `${operation}:${actor}`;

    return authTransactionV1(this.sql, async (tx, store) => {
      await store.lockAccounts([accountId]);
      const now = await authNowV1(tx);
      const receipt = await store.readIdempotency(command.idempotencyKey, receiptActor);
      const account = await store.findAccount(accountId);
      if (!account?.link || account.closedAt !== null)
        throw new Error('student-portal-qr-forbidden');

      if (receipt && Date.parse(receipt.expiresAt) > now.getTime())
        return this.replayReceiptV1(store, receipt, account, operation, digest, accountId);
      if (receipt)
        await tx.unsafe(
          'DELETE FROM student_portal.operation_receipt WHERE idempotency_key=$1 AND actor_id=$2',
          [command.idempotencyKey, receiptActor],
        );
      if (account.version !== command.expectedVersion)
        throw new Error('student-portal-qr-version-conflict');

      const credential = await store.readCredentials(accountId);
      const active = credential?.state === 'active' ? credential : null;
      await this.assertRecoveryReadyV1(tx, store, account, accountId, operation);
      validateCredentialOperationV1(operation, credential, active);

      const flags = mutationFlagsV1(operation, command, account, active);
      const qr = await this.applyQrMutationV1(
        tx,
        accountId,
        active,
        operation,
        flags.newQr,
        now,
      );
      if (flags.resetPassword)
        await tx.unsafe(
          'UPDATE student_portal.password_credential SET password_verifier=NULL,updated_at=statement_timestamp() WHERE account_id=$1::uuid',
          [accountId],
        );

      return this.finalizeMutationV1(
        tx,
        store,
        account,
        command,
        operation,
        accountId,
        actor,
        receiptActor,
        digest,
        now,
        qr,
        flags.changed,
        flags.securityChanged,
      );
    });
  }
}
