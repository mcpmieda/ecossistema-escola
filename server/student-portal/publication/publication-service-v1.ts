import { z } from 'zod';
import { adminCommandV1 } from '../../../shared/student-portal-contracts/admin-v1';
import { type ScopeV1 } from '../../../shared/student-portal-contracts/core-v1';
import type { StudentPortalPostgresSqlV1 } from '../persistence/postgres-persistence-v1';
import { authNowV1, authTransactionV1 } from '../auth/transaction-v1';
import { enqueueJobsV1, type JobInputV1 } from '../jobs/queue-v1';
import { currentRevisionV1, jobMaskV1, jobPublicationVersionV1, normalizePublicationRowsV1, PERIODS_V1,
  publicationAccountsV1, publicationDigestV1, publicationMaskV1, publicationScopeVersionV1 } from './state-v1';

export class PublicationServiceV1 {
  constructor(private readonly sql: StudentPortalPostgresSqlV1) {}

  /** Internal scope/CAS metadata; the admin facade owns its frozen HTTP response. */
  async read(scope: ScopeV1) {
    return authTransactionV1(this.sql, async (tx) => {
      const accounts = await publicationAccountsV1(tx, scope);
      const ids = JSON.stringify(accounts.map((account) => account.id));
      const rows = await tx.unsafe(`SELECT period,state,available_revision,published_revision,version::text FROM student_portal.publication
        WHERE account_id IN (SELECT value::uuid FROM jsonb_array_elements_text($1::text::jsonb))`, [ids]);
      const version = await publicationScopeVersionV1(tx);
      const currentRevision = await currentRevisionV1(tx);
      return { version, count: accounts.length, items: PERIODS_V1.map((period) => {
        const selected = rows.filter((row) => row.period === period);
        const revisions = [...new Set(selected.map((row) => row.published_revision).filter((value) => value !== null))];
        const published = revisions.length > 0;
        const pending = selected.some((row) => row.state === 'update-pending'
          || (row.published_revision !== null && row.published_revision !== currentRevision));
        return { period, state: pending ? 'update-pending' as const : published ? 'published' as const
          : selected.some((row) => row.state === 'available') ? 'available' as const : 'no-data' as const,
        // There is no historical source store: the only approvable source is the current revision.
        availableRevision: selected.some((row) => row.available_revision !== null) ? currentRevision : null,
        publishedRevision: revisions.length === 1 ? String(revisions[0]) : revisions.length > 1 ? `mixed:${publicationDigestV1(revisions.sort())}` : null,
        version }; // Frozen admin DTO exposes this scope CAS on every period item.
      }) };
    });
  }

  async command(actorId: string, input: unknown) {
    const actor = z.uuid().parse(actorId).toLowerCase();
    const command = adminCommandV1.parse(input);
    if (!['publish', 'publish-update', 'unpublish'].includes(command.operation)
      || !('period' in command) || !('scope' in command)) throw new Error('student-portal-publication-command-invalid');
    const scope = command.scope.kind === 'account' ? { ...command.scope, accountId: command.scope.accountId.toLowerCase() } : command.scope;
    const digest = publicationDigestV1({ ...command, scope });
    const receiptActor = `${command.operation}:${actor}`;
    return authTransactionV1(this.sql, async (tx, store) => {
      const now = await authNowV1(tx);
      const receipt = await store.readIdempotency(command.idempotencyKey, receiptActor);
      if (receipt && Date.parse(receipt.expiresAt) > now.getTime()) {
        if (receipt.requestDigest !== digest) throw new Error('student-portal-publication-idempotency-conflict');
        return { operationId: receipt.operationId, version: receipt.version };
      }
      if (receipt) await tx.unsafe('DELETE FROM student_portal.operation_receipt WHERE idempotency_key=$1 AND actor_id=$2', [command.idempotencyKey, receiptActor]);
      if (await publicationScopeVersionV1(tx) !== command.expectedVersion) throw new Error('student-portal-publication-version-conflict');
      const revision = await currentRevisionV1(tx);
      if ('targetDataVersion' in command && command.targetDataVersion !== revision) throw new Error('student-portal-publication-source-conflict');
      const accounts = await publicationAccountsV1(tx, scope);
      if (accounts.length === 0) throw new Error('student-portal-publication-forbidden');
      await store.lockAccounts(accounts.map((account) => account.id));
      const ids = JSON.stringify(accounts.map((account) => account.id));
      // Lifecycle deletes the projection on class change. Its old period approvals cannot seed a new class.
      await tx.unsafe(`UPDATE student_portal.publication p SET published_revision=NULL,
        state=CASE WHEN available_revision IS NULL THEN 'no-data' ELSE 'available' END
        WHERE p.account_id IN (SELECT value::uuid FROM jsonb_array_elements_text($1::text::jsonb))
          AND p.published_revision IS NOT NULL AND NOT EXISTS
          (SELECT 1 FROM student_portal.published_projection s WHERE s.account_id=p.account_id)`, [ids]);
      const stored = await tx.unsafe(`SELECT account_id,period,state,available_revision,published_revision,version::text
        FROM student_portal.publication WHERE account_id IN (SELECT value::uuid FROM jsonb_array_elements_text($1::text::jsonb))`, [ids]);
      const before = new Map(accounts.map((account) => [account.id, normalizePublicationRowsV1(stored.filter((row) => row.account_id === account.id))]));
      if (command.operation === 'publish-update' && accounts.some((account) => !before.get(account.id)!.find((row) => row.period === command.period)!.publishedRevision))
        throw new Error('student-portal-publication-not-published');
      const queued = await tx.unsafe(`SELECT account_id,data_version,policy_version,publication_version FROM student_portal.publication_job
        WHERE account_id IN (SELECT value::uuid FROM jsonb_array_elements_text($1::text::jsonb)) AND state IN ('queued','running')`, [ids]);
      const removed = command.operation === 'unpublish';
      await tx.unsafe(`INSERT INTO student_portal.publication(scope_key,scope_kind,academic_year,account_id,period,state,available_revision,published_revision,version)
        SELECT 'account:2026:'||value,'account',2026,value::uuid,$2,'available',$3,NULL,1
        FROM jsonb_array_elements_text($1::text::jsonb)
        ON CONFLICT(scope_key,period) DO UPDATE SET version=publication.version+1,available_revision=$3,
          published_revision=CASE WHEN $4 THEN NULL ELSE publication.published_revision END,
          state=CASE WHEN $4 OR publication.published_revision IS NULL THEN 'available' ELSE 'update-pending' END,updated_at=$5::timestamptz`,
      [ids, command.period, revision, removed, now.toISOString()]);
      await tx.unsafe(`UPDATE student_portal.publication_job SET state='failed',lease_until=NULL,updated_at=$2::timestamptz
        WHERE account_id IN (SELECT value::uuid FROM jsonb_array_elements_text($1::text::jsonb)) AND state IN ('queued','running')`, [ids, now.toISOString()]);
      if (removed) {
        // Revoke the stored data itself in one bounded SQL operation; re-publish cannot resurrect it.
        await tx.unsafe(`UPDATE student_portal.published_projection p SET payload_json=jsonb_set(jsonb_set(jsonb_set(p.payload_json,
          '{subjects}',f.subjects),'{state}',CASE WHEN jsonb_array_length(f.subjects)=0 THEN '"no-publication"'::jsonb ELSE '"ready"'::jsonb END),
          '{profile,result}',CASE WHEN p.payload_json#>>'{profile,academicState}'='assisted' THEN '"not-applicable"'::jsonb ELSE '"in-progress"'::jsonb END),updated_at=$3::timestamptz
          FROM (SELECT p2.account_id,COALESCE(jsonb_agg(s.subject) FILTER (WHERE jsonb_array_length(s.subject->'periods')>0),'[]'::jsonb) AS subjects
            FROM student_portal.published_projection p2 LEFT JOIN LATERAL (
              SELECT (value-'officialOutcome')||jsonb_build_object('periods',COALESCE((SELECT jsonb_agg(period)
                FROM jsonb_array_elements(value->'periods') period WHERE period->>'period'<>$2),'[]'::jsonb)) AS subject
              FROM jsonb_array_elements(p2.payload_json->'subjects')) s ON true
            WHERE p2.account_id IN (SELECT value::uuid FROM jsonb_array_elements_text($1::text::jsonb)) GROUP BY p2.account_id) f
          WHERE p.account_id=f.account_id`, [ids, command.period, now.toISOString()]);
      }
      const settings = await tx.unsafe("SELECT count(*)::integer AS fields,count(DISTINCT version)::integer AS epochs,min(version)::text AS epoch FROM student_portal.setting WHERE scope_key='school:2026'");
      if (settings[0]?.fields !== 7 || settings[0]?.epochs !== 1) throw new Error('student-portal-policy-defaults-unavailable');
      const jobs: JobInputV1[] = [];
      const bit = publicationMaskV1(command.period);
      for (const account of accounts) {
        const old = before.get(account.id)!;
        const updated = old.map((row) => row.period === command.period ? { ...row, version: row.version + 1 } : row);
        const policyVersion = `epoch:${settings[0]!.epoch}:account:${account.version}`;
        // Preserve unrelated pending approvals at their exact source target when this command changes the fencing vector.
        for (const pending of queued.filter((job) => job.account_id === account.id)) {
          const mask = jobMaskV1(String(pending.publication_version));
          const retained = mask & ~bit;
          if (!retained || pending.publication_version !== jobPublicationVersionV1(mask, old)) continue;
          jobs.push({ accountId: account.id, dataVersion: String(pending.data_version), policyVersion,
            publicationVersion: jobPublicationVersionV1(retained, updated) });
        }
        if (!removed) jobs.push({ accountId: account.id, dataVersion: revision, policyVersion, publicationVersion: jobPublicationVersionV1(bit, updated) });
      }
      await enqueueJobsV1(tx, jobs, now);
      const operationId = crypto.randomUUID();
      const version = await publicationScopeVersionV1(tx);
      await store.appendAudit({ eventId: crypto.randomUUID(), at: now.toISOString(), actorId: actor,
        accountId: scope.kind === 'account' ? scope.accountId : null, scope,
        kind: removed ? 'unpublished' : 'published', result: 'success', requestId: command.idempotencyKey, version, maskedIp: null });
      await store.saveIdempotency({ key: command.idempotencyKey, actorId: receiptActor, requestDigest: digest,
        operationId, version, expiresAt: new Date(now.getTime() + 86400_000).toISOString() });
      return { operationId, version };
    });
  }
}
