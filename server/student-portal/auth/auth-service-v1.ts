import { withAuditSqlV1 } from '../observability/audit-context-v1';
import type { AuthBurstGuardV1 } from '../observability/auth-burst-v1';
import { z } from 'zod';
import { activateRequestV1, challengeRequestV1, challengeResponseV1, loginRequestV1, qrUrlV1 } from '../../../shared/student-portal-contracts/auth-v1';
import type { FailureV1 } from '../../../shared/student-portal-contracts/core-v1';
import type { AttemptRecordV1, CryptoPortV1, PortalTransactionV1 } from '../../../shared/student-portal-contracts/ports-v1';
import type { StudentPortalPostgresSqlV1 } from '../persistence/postgres-persistence-v1';
import { accessContextV1, authAuditV1, authNowV1, authTransactionV1, revokeChallengesV1, type AccessContextV1 } from './transaction-v1';
import { createSessionV1 } from './session-service-v1';
import type { RiskVerifierV1 } from './turnstile-v1';

const denied = (requestId: string): FailureV1 => ({ contractVersion: 1, requestId, state: 'unauthenticated' });
function required(requestId: string, next: 'pin' | 'password' | 'risk') {
  return challengeResponseV1.parse({ contractVersion: 1, requestId, state: 'credential-required', next });
}
export function parseQrV1(input: string) {
  const url = new URL(qrUrlV1.parse(input));
  const [, credentialId, keyVersion, signature] = url.hash.slice(1).split('.');
  return { credentialId: credentialId!, keyVersion: Number(keyVersion), signature: signature! };
}
async function attempts(store: PortalTransactionV1, context: AccessContextV1): Promise<AttemptRecordV1> {
  const previous = await store.readAttempts(context.account.id);
  if (previous && previous.blockedUntil !== null && Date.parse(previous.blockedUntil) > context.now.getTime()) return previous;
  if (!previous || (previous.blockedUntil !== null && Date.parse(previous.blockedUntil) <= context.now.getTime())
    || Date.parse(previous.windowStartedAt) + context.policy.settings.value.risk.failureWindowSeconds * 1000 <= context.now.getTime()) {
    return { accountId: context.account.id, failures: 0, windowStartedAt: context.now.toISOString(), blockedUntil: null, version: previous?.version ?? 0 };
  }
  return previous;
}
function blocked(attempt: AttemptRecordV1, context: AccessContextV1, requestId: string): FailureV1 | null {
  if (attempt.blockedUntil === null || Date.parse(attempt.blockedUntil) <= context.now.getTime()) return null;
  return { contractVersion: 1, requestId, state: 'rate-limited',
    retryAfterSeconds: Math.min(86400, Math.max(1, Math.ceil((Date.parse(attempt.blockedUntil) - context.now.getTime()) / 1000))) };
}
async function failed(store: PortalTransactionV1, context: AccessContextV1, previous: AttemptRecordV1, requestId: string) {
  const failures = previous.failures + 1;
  const attempt = { ...previous, failures, version: previous.version + 1,
    blockedUntil: failures >= context.policy.settings.value.risk.blockAfter
      ? new Date(context.now.getTime() + context.policy.settings.value.risk.blockSeconds * 1000).toISOString() : null };
  await store.saveAttempts(attempt);
  await authAuditV1(store, context.account, 'login-failed', context.now, requestId, context.account.id, 'denied');
  // Return, never throw: a failed credential must commit its durable counter.
  return blocked(attempt, context, requestId) ?? denied(requestId);
}
async function clearAttempts(store: PortalTransactionV1, context: AccessContextV1, previous: AttemptRecordV1) {
  await store.saveAttempts({ ...previous, failures: 0, windowStartedAt: context.now.toISOString(), blockedUntil: null, version: previous.version + 1 });
}

export class AuthServiceV1 {
  constructor(private readonly sql: StudentPortalPostgresSqlV1, private readonly cryptoPort: CryptoPortV1,
    private readonly pepperVersion: number, private readonly risk: RiskVerifierV1, clientIp?: string | null, private readonly burst?: AuthBurstGuardV1) {
    if (clientIp !== undefined) this.sql = withAuditSqlV1(sql, clientIp);
    z.number().int().positive().safe().parse(pepperVersion);
  }

  private async qrAccount(qr: string) {
    const payload = parseQrV1(qr);
    if (!await this.cryptoPort.verifyQr(payload.credentialId, payload.keyVersion, payload.signature)) return null;
    return payload;
  }

  async challenge(input: unknown, requestId: string) {
    const request = challengeRequestV1.parse(input);
    if (this.burst && !await this.burst(request.qr)) return { contractVersion: 1 as const, requestId, state: 'rate-limited' as const, retryAfterSeconds: 60 };
    const qr = await this.qrAccount(request.qr);
    if (!qr) return denied(requestId);
    // Remote verification finishes before acquiring any database lock.
    const riskPassed = request.riskToken === undefined ? false : await this.risk.verify(request.riskToken);
    return authTransactionV1(this.sql, async (tx, store) => {
      const rows = await tx.unsafe('SELECT account_id FROM student_portal.qr_credential WHERE credential_id=$1 AND key_version=$2 AND state=\'active\'', [qr.credentialId, qr.keyVersion]);
      if (rows.length !== 1) return denied(requestId);
      const accountId = z.uuid().parse(rows[0]!.account_id);
      await store.lockAccounts([accountId]);
      const context = await accessContextV1(this.sql, tx, store, accountId);
      const credential = await store.readCredentials(accountId);
      if (!context || !credential || credential.state !== 'active' || credential.credentialId !== qr.credentialId || credential.keyVersion !== qr.keyVersion) return denied(requestId);
      const attempt = await attempts(store, context);
      const limited = blocked(attempt, context, requestId);
      if (limited) return limited;
      if (attempt.failures >= context.policy.settings.value.risk.challengeAfter && !riskPassed) return required(requestId, 'risk');
      if (context.account.state === 'active') return required(requestId, 'password');
      if (request.pin === undefined) return required(requestId, 'pin');
      const birth = await store.readBirth(accountId);
      if (!birth?.year || birth.confirmation !== 'confirmed' || !credential.pin || credential.pinVersion !== context.account.pinVersion) return denied(requestId);
      if (!await this.cryptoPort.verifySecret(request.pin, credential.pin)) return failed(store, context, attempt, requestId);
      context.now = await authNowV1(tx);
      const token = this.cryptoPort.randomToken(32);
      const expiresAt = new Date(Math.min(context.now.getTime() + context.policy.settings.value.risk.challengeTtlSeconds * 1000,
        Date.parse(context.policy.settings.value.calendar.yearEndsAt!))).toISOString();
      if (Date.parse(expiresAt) <= context.now.getTime()) return denied(requestId);
      await store.saveChallenge({ tokenHash: await this.cryptoPort.hashOpaqueToken(token), accountId,
        securityVersion: context.account.securityVersion, pinVersion: context.account.pinVersion, expiresAt, consumedAt: null });
      return challengeResponseV1.parse({ contractVersion: 1, requestId, state: 'password-creation', challenge: token, expiresAt });
    });
  }

  async activate(input: unknown, requestId: string) {
    const request = activateRequestV1.parse(input);
    if (this.burst && !await this.burst(request.challenge)) return { contractVersion: 1 as const, requestId, state: 'rate-limited' as const, retryAfterSeconds: 60 };
    const hash = await this.cryptoPort.hashOpaqueToken(request.challenge);
    return authTransactionV1(this.sql, async (tx, store) => {
      const rows = await tx.unsafe(`SELECT account_id FROM student_portal.auth_challenge WHERE token_hash=$1
        AND consumed_at IS NULL AND expires_at>statement_timestamp()`, [hash]);
      if (rows.length !== 1) return denied(requestId);
      const accountId = z.uuid().parse(rows[0]!.account_id);
      await store.lockAccounts([accountId]);
      const context = await accessContextV1(this.sql, tx, store, accountId);
      const credential = await store.readCredentials(accountId);
      const birth = await store.readBirth(accountId);
      if (!context || context.account.state === 'active' || !credential || credential.state !== 'active' || !credential.pin
        || credential.pinVersion !== context.account.pinVersion || !birth?.year || birth.confirmation !== 'confirmed') return denied(requestId);
      const attempt = await attempts(store, context);
      const limited = blocked(attempt, context, requestId);
      if (limited) return limited;
      // Check proof versions before spending KDF CPU, then consume again at the commit boundary.
      const valid = await tx.unsafe(`SELECT token_hash FROM student_portal.auth_challenge WHERE token_hash=$1
        AND account_id=$2::uuid AND security_version=$3 AND pin_version=$4 AND consumed_at IS NULL AND expires_at>statement_timestamp()`,
      [hash, accountId, context.account.securityVersion, context.account.pinVersion]);
      if (valid.length !== 1) return denied(requestId);
      const password = await this.cryptoPort.deriveVerifier(request.password, this.pepperVersion);
      context.now = await authNowV1(tx);
      if (!await store.consumeChallenge(hash, context.account.securityVersion, context.account.pinVersion, context.now.toISOString())) return denied(requestId);
      const expectedVersion = context.account.version;
      context.account = { ...context.account, state: 'active', version: expectedVersion + 1 };
      if (!await store.compareAndSetAccount(context.account, expectedVersion)) throw new Error('student-portal-auth-conflict');
      await store.saveCredentials({ ...credential, password });
      await revokeChallengesV1(tx, accountId, context.now);
      await clearAttempts(store, context, attempt);
      await authAuditV1(store, context.account, 'activated', context.now, requestId);
      return createSessionV1(store, context, this.cryptoPort, request.keepConnected, requestId);
    });
  }

  async login(input: unknown, requestId: string) {
    const request = loginRequestV1.parse(input);
    if (this.burst && !await this.burst(request.qr)) return { contractVersion: 1 as const, requestId, state: 'rate-limited' as const, retryAfterSeconds: 60 };
    const qr = await this.qrAccount(request.qr);
    if (!qr) return denied(requestId);
    const riskPassed = request.riskToken === undefined ? false : await this.risk.verify(request.riskToken);
    return authTransactionV1(this.sql, async (tx, store) => {
      const rows = await tx.unsafe('SELECT account_id FROM student_portal.qr_credential WHERE credential_id=$1 AND key_version=$2 AND state=\'active\'', [qr.credentialId, qr.keyVersion]);
      if (rows.length !== 1) return denied(requestId);
      const accountId = z.uuid().parse(rows[0]!.account_id);
      await store.lockAccounts([accountId]);
      const context = await accessContextV1(this.sql, tx, store, accountId);
      const credential = await store.readCredentials(accountId);
      if (!context || context.account.state !== 'active' || !credential?.password || credential.state !== 'active'
        || credential.credentialId !== qr.credentialId || credential.keyVersion !== qr.keyVersion) return denied(requestId);
      const attempt = await attempts(store, context);
      const limited = blocked(attempt, context, requestId);
      if (limited) return limited;
      if (attempt.failures >= context.policy.settings.value.risk.challengeAfter && !riskPassed) return denied(requestId);
      if (!await this.cryptoPort.verifySecret(request.password, credential.password)) return failed(store, context, attempt, requestId);
      context.now = await authNowV1(tx);
      await clearAttempts(store, context, attempt);
      await authAuditV1(store, context.account, 'login', context.now, requestId);
      return createSessionV1(store, context, this.cryptoPort, request.keepConnected, requestId);
    });
  }
}
