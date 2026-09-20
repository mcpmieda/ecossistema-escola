import { withAuditSqlV1 } from '../observability/audit-context-v1';
import type { AuthBurstGuardV1 } from '../observability/auth-burst-v1';
import { z } from 'zod';
import {
  activateRequestV1,
  challengeRequestV1,
  challengeResponseV1,
  loginRequestV1,
  qrUrlV1,
} from '../../../shared/student-portal-contracts/auth-v1';
import type { FailureV1 } from '../../../shared/student-portal-contracts/core-v1';
import type {
  AttemptRecordV1,
  CredentialRecordV1,
  CryptoPortV1,
  PortalTransactionV1,
  VerifierV1,
} from '../../../shared/student-portal-contracts/ports-v1';
import type {
  StudentPortalPostgresQueryV1,
  StudentPortalPostgresSqlV1,
} from '../persistence/postgres-persistence-v1';
import {
  accessContextV1,
  authAuditV1,
  authNowV1,
  accountTransactionV1,
  revokeChallengesV1,
  type AccessContextV1,
} from './transaction-v1';
import { createSessionV1 } from './session-service-v1';
import type { RiskVerifierV1 } from './turnstile-v1';

const denied = (requestId: string): FailureV1 => ({
  contractVersion: 1,
  requestId,
  state: 'unauthenticated',
});
function required(requestId: string, next: 'pin' | 'password' | 'risk') {
  return challengeResponseV1.parse({
    contractVersion: 1,
    requestId,
    state: 'credential-required',
    next,
  });
}
export function parseQrV1(input: string) {
  const url = new URL(qrUrlV1.parse(input));
  const [, credentialId, keyVersion, signature] = url.hash.slice(1).split('.');
  return { credentialId: credentialId!, keyVersion: Number(keyVersion), signature: signature! };
}
async function attempts(
  store: PortalTransactionV1,
  context: AccessContextV1,
): Promise<AttemptRecordV1> {
  const previous = await store.readAttempts(context.account.id);
  if (
    previous &&
    previous.blockedUntil !== null &&
    Date.parse(previous.blockedUntil) > context.now.getTime()
  )
    return previous;
  if (
    !previous ||
    (previous.blockedUntil !== null &&
      Date.parse(previous.blockedUntil) <= context.now.getTime()) ||
    Date.parse(previous.windowStartedAt) +
      context.policy.settings.value.risk.failureWindowSeconds * 1000 <=
      context.now.getTime()
  ) {
    return {
      accountId: context.account.id,
      failures: 0,
      windowStartedAt: context.now.toISOString(),
      blockedUntil: null,
      version: previous?.version ?? 0,
    };
  }
  return previous;
}
function blocked(
  attempt: AttemptRecordV1,
  context: AccessContextV1,
  requestId: string,
): FailureV1 | null {
  if (attempt.blockedUntil === null || Date.parse(attempt.blockedUntil) <= context.now.getTime())
    return null;
  return {
    contractVersion: 1,
    requestId,
    state: 'rate-limited',
    retryAfterSeconds: Math.min(
      86400,
      Math.max(1, Math.ceil((Date.parse(attempt.blockedUntil) - context.now.getTime()) / 1000)),
    ),
  };
}
async function failed(
  store: PortalTransactionV1,
  context: AccessContextV1,
  previous: AttemptRecordV1,
  requestId: string,
) {
  const failures = previous.failures + 1;
  const attempt = {
    ...previous,
    failures,
    version: previous.version + 1,
    blockedUntil:
      failures >= context.policy.settings.value.risk.blockAfter
        ? new Date(
            context.now.getTime() + context.policy.settings.value.risk.blockSeconds * 1000,
          ).toISOString()
        : null,
  };
  await store.saveAttempts(attempt);
  await authAuditV1(
    store,
    context.account,
    'login-failed',
    context.now,
    requestId,
    context.account.id,
    'denied',
  );
  // Return, never throw: a failed credential must commit its durable counter.
  return blocked(attempt, context, requestId) ?? denied(requestId);
}
async function clearAttempts(
  store: PortalTransactionV1,
  context: AccessContextV1,
  previous: AttemptRecordV1,
) {
  await store.saveAttempts({
    ...previous,
    failures: 0,
    windowStartedAt: context.now.toISOString(),
    blockedUntil: null,
    version: previous.version + 1,
  });
}
async function auditedDenied(
  store: PortalTransactionV1,
  account: AccessContextV1['account'],
  now: Date,
  requestId: string,
) {
  await authAuditV1(store, account, 'login-failed', now, requestId, account.id, 'denied');
  return denied(requestId);
}

function sameVerifier(left: VerifierV1, right: VerifierV1): boolean {
  const parameters = (value: VerifierV1) =>
    Object.entries(value.parameters).sort(([a], [b]) => a.localeCompare(b));
  return left.algorithm === right.algorithm
    && left.salt === right.salt
    && left.pepperVersion === right.pepperVersion
    && left.digest === right.digest
    && JSON.stringify(parameters(left)) === JSON.stringify(parameters(right));
}

type QrIdentityV1 = ReturnType<typeof parseQrV1>;
type CredentialProofV1 = { accountId: string; verifier: VerifierV1; valid: boolean };

async function activeQrAccountIdV1(
  sql: StudentPortalPostgresQueryV1,
  qr: QrIdentityV1,
): Promise<string | null> {
  const rows = await sql.unsafe(
    "SELECT account_id FROM student_portal.qr_credential WHERE credential_id=$1 AND key_version=$2 AND state='active'",
    [qr.credentialId, qr.keyVersion],
  );
  return rows.length === 1 ? z.uuid().parse(rows[0]!.account_id) : null;
}

async function lockedCredentialV1(store: PortalTransactionV1, accountId: string) {
  await store.lockAccounts([accountId]);
  const account = await store.findAccount(accountId);
  if (!account) return null;
  return { account, credential: await store.readCredentials(accountId) };
}

type QrAuthStateV1 =
  | { result: FailureV1 }
  | {
      accountId: string;
      context: AccessContextV1;
      credential: CredentialRecordV1;
      attempt: AttemptRecordV1;
    };

async function qrAuthStateV1(
  sql: StudentPortalPostgresSqlV1,
  tx: StudentPortalPostgresQueryV1,
  store: PortalTransactionV1,
  qr: QrIdentityV1,
  requestId: string,
): Promise<QrAuthStateV1> {
  const accountId = await activeQrAccountIdV1(tx, qr);
  if (!accountId) return { result: denied(requestId) };
  const locked = await lockedCredentialV1(store, accountId);
  if (!locked) return { result: denied(requestId) };
  const { account, credential } = locked;
  const context = await accessContextV1(sql, tx, store, accountId);
  if (!context)
    return { result: await auditedDenied(store, account, await authNowV1(tx), requestId) };
  if (
    credential?.state !== 'active' ||
    credential.credentialId !== qr.credentialId ||
    credential.keyVersion !== qr.keyVersion
  )
    return { result: await auditedDenied(store, context.account, context.now, requestId) };
  return { accountId, context, credential, attempt: await attempts(store, context) };
}

async function credentialProofV1(
  sql: StudentPortalPostgresSqlV1,
  cryptoPort: CryptoPortV1,
  qr: QrIdentityV1,
  secret: string,
  kind: 'pin' | 'password',
  requestId: string,
  riskPassed: boolean,
): Promise<CredentialProofV1 | null> {
  const snapshot = await accountTransactionV1(sql, async (tx, store) => {
    const accountId = await activeQrAccountIdV1(tx, qr);
    if (!accountId) return null;
    const locked = await lockedCredentialV1(store, accountId);
    if (!locked) return null;
    const { account, credential } = locked;
    const stateAllowed =
      kind === 'password'
        ? account.state === 'active'
        : account.state === 'pending-activation' || account.state === 'reset-required';
    if (
      !stateAllowed ||
      credential?.state !== 'active' ||
      credential.credentialId !== qr.credentialId ||
      credential.keyVersion !== qr.keyVersion
    )
      return null;
    const context = await accessContextV1(sql, tx, store, accountId);
    if (!context) return null;
    const attempt = await attempts(store, context);
    if (blocked(attempt, context, requestId)) return null;
    if (attempt.failures >= context.policy.settings.value.risk.challengeAfter && !riskPassed)
      return null;
    const verifier = kind === 'pin' ? credential.pin : credential.password;
    return verifier ? { accountId, verifier } : null;
  });
  if (!snapshot) return null;
  return {
    ...snapshot,
    valid: await cryptoPort.verifySecret(secret, snapshot.verifier),
  };
}

type ActivationStateV1 = {
  accountId: string;
  context: AccessContextV1;
  credential: CredentialRecordV1;
  attempt: AttemptRecordV1;
};

async function activationStateV1(
  sql: StudentPortalPostgresSqlV1,
  tx: StudentPortalPostgresQueryV1,
  store: PortalTransactionV1,
  hash: string,
  requestId: string,
): Promise<ActivationStateV1 | FailureV1> {
  const rows = await tx.unsafe(
    `SELECT account_id,
    (consumed_at IS NULL AND expires_at>statement_timestamp()) AS usable
    FROM student_portal.auth_challenge WHERE token_hash=$1`,
    [hash],
  );
  if (rows.length !== 1) return denied(requestId);
  const accountId = z.uuid().parse(rows[0]!.account_id);
  const locked = await lockedCredentialV1(store, accountId);
  if (!locked) return denied(requestId);
  const { account, credential } = locked;
  const context = await accessContextV1(sql, tx, store, accountId);
  const birth = await store.readBirth(accountId);
  if (!context) return auditedDenied(store, account, await authNowV1(tx), requestId);
  if (
    rows[0]!.usable !== true ||
    context.account.state === 'active' ||
    credential?.state !== 'active' ||
    !credential.pin ||
    credential.pinVersion !== context.account.pinVersion ||
    !birth?.year ||
    birth.confirmation !== 'confirmed'
  )
    return auditedDenied(store, context.account, context.now, requestId);
  const attempt = await attempts(store, context);
  const limited = blocked(attempt, context, requestId);
  if (limited) return limited;
  const valid = await tx.unsafe(
    `SELECT token_hash FROM student_portal.auth_challenge WHERE token_hash=$1
    AND account_id=$2::uuid AND security_version=$3 AND pin_version=$4
    AND consumed_at IS NULL AND expires_at>statement_timestamp()`,
    [hash, accountId, context.account.securityVersion, context.account.pinVersion],
  );
  if (valid.length !== 1) return auditedDenied(store, context.account, context.now, requestId);
  return { accountId, context, credential, attempt };
}

export class AuthServiceV1 {
  constructor(
    private readonly sql: StudentPortalPostgresSqlV1,
    private readonly cryptoPort: CryptoPortV1,
    private readonly pepperVersion: number,
    private readonly risk: RiskVerifierV1,
    clientIp?: string | null,
    private readonly burst?: AuthBurstGuardV1,
  ) {
    if (clientIp !== undefined) this.sql = withAuditSqlV1(sql, clientIp);
    z.number().int().positive().safe().parse(pepperVersion);
  }

  private async qrAccount(qr: string) {
    const payload = parseQrV1(qr);
    if (
      !(await this.cryptoPort.verifyQr(payload.credentialId, payload.keyVersion, payload.signature))
    )
      return null;
    return payload;
  }

  async challenge(input: unknown, requestId: string) {
    const request = challengeRequestV1.parse(input);
    if (this.burst && !(await this.burst(request.qr)))
      return {
        contractVersion: 1 as const,
        requestId,
        state: 'rate-limited' as const,
        retryAfterSeconds: 60,
      };
    const qr = await this.qrAccount(request.qr);
    if (!qr) return denied(requestId);
    // Remote verification finishes before acquiring any database lock.
    const riskPassed =
      request.riskToken === undefined ? false : await this.risk.verify(request.riskToken);
    const pinProof = request.pin === undefined
      ? null
      : await credentialProofV1(
          this.sql,
          this.cryptoPort,
          qr,
          request.pin,
          'pin',
          requestId,
          riskPassed,
        );
    return accountTransactionV1(this.sql, async (tx, store) => {
      const locked = await qrAuthStateV1(this.sql, tx, store, qr, requestId);
      if ('result' in locked) return locked.result;
      const { accountId, context, credential, attempt } = locked;
      const limited = blocked(attempt, context, requestId);
      if (limited) return limited;
      if (context.account.state === 'active') {
        if (attempt.failures >= context.policy.settings.value.risk.challengeAfter && !riskPassed)
          return required(requestId, 'risk');
        return required(requestId, 'password');
      }
      const birth = await store.readBirth(accountId);
      if (
        !birth?.year ||
        birth.confirmation !== 'confirmed' ||
        !credential.pin ||
        credential.pinVersion !== context.account.pinVersion
      )
        return auditedDenied(store, context.account, context.now, requestId);
      if (attempt.failures >= context.policy.settings.value.risk.challengeAfter && !riskPassed)
        return required(requestId, 'risk');
      if (request.pin === undefined) return required(requestId, 'pin');
      if (
        !pinProof ||
        pinProof.accountId !== accountId ||
        !sameVerifier(pinProof.verifier, credential.pin)
      )
        return auditedDenied(store, context.account, context.now, requestId);
      if (!pinProof.valid) return failed(store, context, attempt, requestId);
      context.now = await authNowV1(tx);
      const token = this.cryptoPort.randomToken(32);
      const expiresAt = new Date(
        Math.min(
          context.now.getTime() + context.policy.settings.value.risk.challengeTtlSeconds * 1000,
          Date.parse(context.policy.settings.value.calendar.yearEndsAt!),
        ),
      ).toISOString();
      if (Date.parse(expiresAt) <= context.now.getTime())
        return auditedDenied(store, context.account, context.now, requestId);
      // A retry of the same PIN request replaces its earlier proof; only the latest response can activate.
      await revokeChallengesV1(tx, accountId, context.now);
      await store.saveChallenge({
        tokenHash: await this.cryptoPort.hashOpaqueToken(token),
        accountId,
        securityVersion: context.account.securityVersion,
        pinVersion: context.account.pinVersion,
        expiresAt,
        consumedAt: null,
      });
      return challengeResponseV1.parse({
        contractVersion: 1,
        requestId,
        state: 'password-creation',
        challenge: token,
        expiresAt,
      });
    });
  }

  async activate(input: unknown, requestId: string) {
    const request = activateRequestV1.parse(input);
    if (this.burst && !(await this.burst(request.challenge)))
      return {
        contractVersion: 1 as const,
        requestId,
        state: 'rate-limited' as const,
        retryAfterSeconds: 60,
      };
    const hash = await this.cryptoPort.hashOpaqueToken(request.challenge);
    const preflight = await accountTransactionV1(
      this.sql,
      (tx, store) => activationStateV1(this.sql, tx, store, hash, requestId),
    );
    if ('contractVersion' in preflight) return preflight;

    const password = await this.cryptoPort.deriveVerifier(request.password, this.pepperVersion);

    return accountTransactionV1(this.sql, async (tx, store) => {
      const current = await activationStateV1(this.sql, tx, store, hash, requestId);
      if ('contractVersion' in current) return current;
      if (current.accountId !== preflight.accountId) return denied(requestId);
      current.context.now = await authNowV1(tx);
      if (
        !(await store.consumeChallenge(
          hash,
          current.context.account.securityVersion,
          current.context.account.pinVersion,
          current.context.now.toISOString(),
        ))
      )
        return auditedDenied(store, current.context.account, current.context.now, requestId);
      const expectedVersion = current.context.account.version;
      current.context.account = {
        ...current.context.account,
        state: 'active',
        version: expectedVersion + 1,
      };
      if (!(await store.compareAndSetAccount(current.context.account, expectedVersion)))
        throw new Error('student-portal-auth-conflict');
      await store.saveCredentials({ ...current.credential, password });
      await revokeChallengesV1(tx, current.accountId, current.context.now);
      await clearAttempts(store, current.context, current.attempt);
      await authAuditV1(
        store,
        current.context.account,
        'activated',
        current.context.now,
        requestId,
      );
      return createSessionV1(
        store,
        current.context,
        this.cryptoPort,
        request.keepConnected,
        requestId,
      );
    });
  }

  async login(input: unknown, requestId: string) {
    const request = loginRequestV1.parse(input);
    if (this.burst && !(await this.burst(request.qr)))
      return {
        contractVersion: 1 as const,
        requestId,
        state: 'rate-limited' as const,
        retryAfterSeconds: 60,
      };
    const qr = await this.qrAccount(request.qr);
    if (!qr) return denied(requestId);
    const riskPassed =
      request.riskToken === undefined ? false : await this.risk.verify(request.riskToken);
    const passwordProof = await credentialProofV1(
      this.sql,
      this.cryptoPort,
      qr,
      request.password,
      'password',
      requestId,
      riskPassed,
    );
    return accountTransactionV1(this.sql, async (tx, store) => {
      const locked = await qrAuthStateV1(this.sql, tx, store, qr, requestId);
      if ('result' in locked) return locked.result;
      const { accountId, context, credential, attempt } = locked;
      if (context.account.state !== 'active' || !credential.password)
        return auditedDenied(store, context.account, context.now, requestId);
      const limited = blocked(attempt, context, requestId);
      if (limited) return limited;
      if (attempt.failures >= context.policy.settings.value.risk.challengeAfter && !riskPassed)
        return auditedDenied(store, context.account, context.now, requestId);
      if (
        !passwordProof ||
        passwordProof.accountId !== accountId ||
        !sameVerifier(passwordProof.verifier, credential.password)
      )
        return auditedDenied(store, context.account, context.now, requestId);
      if (!passwordProof.valid) return failed(store, context, attempt, requestId);
      context.now = await authNowV1(tx);
      await clearAttempts(store, context, attempt);
      await authAuditV1(store, context.account, 'login', context.now, requestId);
      return createSessionV1(store, context, this.cryptoPort, request.keepConnected, requestId);
    });
  }
}
