import { z } from 'zod';
import { adminCommandV1 } from '../../../shared/student-portal-contracts/admin-v1';
import { scopeV1, versionV1, type ScopeV1 } from '../../../shared/student-portal-contracts/core-v1';
import { effectiveSettingsV1, settingsValueV1, type EffectiveSettingsV1 } from '../../../shared/student-portal-contracts/policy-v1';
import type { EffectivePolicyPortV1 } from '../../../shared/student-portal-contracts/ports-v1';
import { StudentPortalPostgresPersistenceV1, type StudentPortalPostgresQueryV1, type StudentPortalPostgresSqlV1 } from '../persistence/postgres-persistence-v1';
import { initialPolicyDefaultsV1 } from './defaults-v1';
import { normalizeCalendarV1 } from './calendar-v1';

const FIELDS = ['accessEnabled', 'showPartials', 'autoUpdate', 'showFinalResult', 'allowedPeriods', 'risk', 'calendar'] as const;
type Field = typeof FIELDS[number];
const SCHOOL = { kind: 'school', academicYear: 2026 } as const;
const storedRow = z.object({ scope_key: z.string(), field_key: z.enum(FIELDS), value_json: z.unknown(), source_scope_json: scopeV1, version: versionV1 });

function normalizedScope(input: ScopeV1): ScopeV1 {
  const scope = scopeV1.parse(input);
  return scope.kind === 'account' ? { ...scope, accountId: scope.accountId.toLowerCase() } : scope;
}

function key(scope: ScopeV1): string {
  return scope.kind === 'school' ? 'school:2026' : scope.kind === 'class' ? `class:2026:${scope.classId}` : `account:2026:${scope.accountId}`;
}

function canonical(input: unknown): string {
  if (Array.isArray(input)) return `[${input.map(canonical).join(',')}]`;
  if (input !== null && typeof input === 'object') return `{${Object.entries(input).sort(([a], [b]) => a.localeCompare(b))
    .map(([field, value]) => `${JSON.stringify(field)}:${canonical(value)}`).join(',')}}`;
  return JSON.stringify(input);
}

async function hash(input: unknown): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(input))));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function lockYear(tx: StudentPortalPostgresQueryV1) {
  await tx.unsafe('SELECT pg_advisory_xact_lock_shared(613,0)');
  await tx.unsafe('SELECT pg_advisory_xact_lock(613,2026)');
}

async function writeField(tx: StudentPortalPostgresQueryV1, scope: ScopeV1, field: Field, value: unknown, version: number) {
  await tx.unsafe(`INSERT INTO student_portal.setting
    (scope_key,field_key,scope_kind,academic_year,class_id,account_id,value_json,source_scope_json,version)
    VALUES ($1,$2,$3,2026,$4,$5::uuid,$6::text::jsonb,$7::text::jsonb,$8)
    ON CONFLICT (scope_key,field_key) DO UPDATE SET value_json=EXCLUDED.value_json,
      source_scope_json=EXCLUDED.source_scope_json,version=EXCLUDED.version,updated_at=statement_timestamp()`,
  [key(scope), field, scope.kind, scope.kind === 'class' ? scope.classId : null,
    scope.kind === 'account' ? scope.accountId : null, JSON.stringify(value), JSON.stringify(scope), version]);
}

function immediateCalendarChange(previous: unknown, next: unknown, now: number): boolean {
  const before = normalizeCalendarV1(previous);
  const after = normalizeCalendarV1(next);
  const past = (value: string | null) => value !== null && Date.parse(value) <= now;
  const changedDate = (left: string | null, right: string | null) => left !== right && (past(left) || past(right));
  const dates = ['enrollmentStartsAt', 'yearStartsAt', 't1EndsAt', 't2EndsAt', 't3EndsAt',
    'recoveriesStartAt', 'yearEndsAt', 'finalDisclosureAt'] as const;
  if (dates.some((field) => changedDate(before[field], after[field]))) return true;
  const left = before.disclosure;
  const right = after.disclosure;
  if (left.mode !== right.mode) return true;
  if (left.mode === 'single' && right.mode === 'single') {
    return changedDate(left.at, right.at)
      || (canonical([...left.periods].sort()) !== canonical([...right.periods].sort()) && (past(left.at) || past(right.at)));
  }
  if (left.mode === 'per-period' && right.mode === 'per-period') {
    return (['T1', 'T2', 'T3', 'REC1', 'REC2', 'REC3'] as const).some((period) => changedDate(left.at[period], right.at[period]));
  }
  return false;
}

export class PolicyServiceV1 implements EffectivePolicyPortV1 {
  constructor(private readonly sql: StudentPortalPostgresSqlV1) {}

  async read(scope: ScopeV1): Promise<EffectiveSettingsV1> {
    return (await this.readSnapshotInTransaction(this.sql, scope)).settings;
  }

  async readSnapshot(scope: ScopeV1) {
    return this.readSnapshotInTransaction(this.sql, scope);
  }

  /** One SQL snapshot includes current class, account version, overrides and school epoch. */
  async readSnapshotInTransaction(tx: StudentPortalPostgresQueryV1, input: ScopeV1) {
    const scope = normalizedScope(input);
    const rows = await tx.unsafe(`WITH current_account AS (
      SELECT a.version::text AS account_version,b.class_id,b.matches FROM student_portal.account a
      CROSS JOIN LATERAL (SELECT min(class_id) AS class_id,count(*)::integer AS matches
        FROM student_portal.academic_binding_v1 WHERE academic_year=2026 AND student_id=a.gradebook_student_id
          AND status IS DISTINCT FROM 6) b
      WHERE a.id=$2::uuid AND a.academic_year=2026 AND a.closed_at IS NULL AND a.gradebook_student_id IS NOT NULL
    ), target AS (
      SELECT CASE WHEN $1='account' THEN (SELECT class_id FROM current_account) ELSE $3::integer END AS class_id,
        CASE WHEN $1='account' THEN COALESCE((SELECT matches=1 FROM current_account),false) ELSE true END AS resolved,
        CASE WHEN $1='account' THEN COALESCE((SELECT account_version FROM current_account),'0') ELSE '0' END AS account_version
    ) SELECT target.*,COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'scope_key',s.scope_key,'field_key',s.field_key,'value_json',s.value_json,'source_scope_json',s.source_scope_json,'version',s.version))
      FROM student_portal.setting s WHERE s.scope_key='school:2026'
        OR s.scope_key='class:2026:'||target.class_id::text
        OR ($1='account' AND s.scope_key='account:2026:'||$2::uuid::text)), '[]'::jsonb) AS settings_rows FROM target`,
    [scope.kind, scope.kind === 'account' ? scope.accountId : null, scope.kind === 'class' ? scope.classId : null]);
    if (rows.length !== 1 || rows[0]!.resolved !== true) throw new Error('student-portal-policy-target-unresolved');
    const target = rows[0]!;
    const records = z.array(storedRow).parse(target.settings_rows);
    const school = records.filter((row) => row.scope_key === key(SCHOOL));
    if (school.length !== FIELDS.length || new Set(school.map((row) => row.field_key)).size !== FIELDS.length
      || new Set(school.map((row) => row.version)).size !== 1) throw new Error('student-portal-policy-defaults-unavailable');
    if (school.some((row) => key(normalizedScope(row.source_scope_json)) !== key(SCHOOL))) throw new Error('student-portal-policy-defaults-unavailable');
    try {
      const defaults = settingsValueV1.parse(Object.fromEntries(school.map((row) => [row.field_key, row.value_json])));
      normalizeCalendarV1(defaults.calendar);
    } catch {
      throw new Error('student-portal-policy-defaults-unavailable');
    }
    const epoch = school[0]!.version;
    const classId = target.class_id === null ? null : z.number().int().positive().parse(target.class_id);
    const chain: ScopeV1[] = [SCHOOL];
    if (classId !== null) chain.push({ kind: 'class', academicYear: 2026, classId });
    if (scope.kind === 'account') chain.push(scope);
    const value: Record<string, unknown> = {};
    const sources: Record<string, ScopeV1> = {};
    for (const origin of chain) {
      for (const row of records.filter((item) => item.scope_key === key(origin))) {
        // Foundation snapshots may annotate inherited values. Only the owning scope overrides.
        if (key(normalizedScope(row.source_scope_json)) !== key(origin)) continue;
        value[row.field_key] = row.field_key === 'calendar' ? normalizeCalendarV1(row.value_json) : row.value_json;
        sources[row.field_key] = origin;
      }
    }
    const version = versionV1.parse(epoch + z.coerce.number().int().safe().nonnegative().parse(target.account_version));
    const settings = effectiveSettingsV1.parse({ scope, version, value, sources });
    return { settings, classId, epoch, policyVersion: `policy:${await hash({ settings, classId })}` };
  }

  async initializeDefaults() {
    return this.sql.begin(async (tx) => {
      await lockYear(tx);
      const rows = await tx.unsafe("SELECT field_key FROM student_portal.setting WHERE scope_key='school:2026' FOR UPDATE");
      if (rows.length === 0) {
        const defaults = initialPolicyDefaultsV1();
        for (const field of FIELDS) await writeField(tx, SCHOOL, field, defaults[field], 1);
      }
      return this.readSnapshotInTransaction(tx, SCHOOL);
    });
  }

  async mutate(actorId: string, input: unknown) {
    return this.sql.begin((tx) => this.mutateInTransaction(tx, actorId, input));
  }

  /** Composition can enqueue publication work on this same physical transaction before commit. */
  async mutateInTransaction(tx: StudentPortalPostgresQueryV1, actorId: string, input: unknown) {
    const actor = z.uuid().parse(actorId).toLowerCase();
    const command = adminCommandV1.parse(input);
    if (command.operation !== 'settings-set' && command.operation !== 'settings-inherit') throw new Error('student-portal-policy-command-invalid');
    const scope = normalizedScope(command.scope);
    if (command.operation === 'settings-inherit' && scope.kind === 'school') throw new Error('student-portal-school-cannot-inherit');
    await lockYear(tx);
    const store = new StudentPortalPostgresPersistenceV1({ unsafe: (query, parameters) => tx.unsafe(query, parameters), begin: (operation) => operation(tx) });
    return store.transaction(async (persistence) => {
      const clock = await tx.unsafe('SELECT statement_timestamp() AS now');
      const nowRaw = clock[0]!.now;
      const now = nowRaw instanceof Date ? nowRaw : new Date(z.string().parse(nowRaw));
      const receiptActor = `policy:${actor}`;
      const requestDigest = await hash({ ...command, scope });
      const existingReceipt = await persistence.readIdempotency(command.idempotencyKey, receiptActor);
      if (existingReceipt && Date.parse(existingReceipt.expiresAt) > now.getTime()) {
        if (existingReceipt.requestDigest !== requestDigest) throw new Error('student-portal-policy-idempotency-conflict');
        return { operationId: existingReceipt.operationId, version: existingReceipt.version };
      }
      if (existingReceipt) await tx.unsafe('DELETE FROM student_portal.operation_receipt WHERE idempotency_key=$1 AND actor_id=$2', [command.idempotencyKey, receiptActor]);
      if (scope.kind === 'account') await persistence.lockAccounts([scope.accountId]);
      const before = await this.readSnapshotInTransaction(tx, scope);
      if (before.settings.version !== command.expectedVersion) throw new Error('student-portal-policy-version-conflict');
      const stored = await tx.unsafe('SELECT field_key,value_json,source_scope_json FROM student_portal.setting WHERE scope_key=$1 FOR UPDATE', [key(scope)]);
      const nextEpoch = versionV1.parse(before.epoch + 1);
      let changed = false;
      if (command.operation === 'settings-set') {
        for (const field of FIELDS) {
          if (!(field in command.value)) continue;
          const value = field === 'calendar' ? normalizeCalendarV1(command.value.calendar) : command.value[field];
          const previous = stored.find((row) => row.field_key === field);
          if (previous && canonical(previous.value_json) === canonical(value) && canonical(previous.source_scope_json) === canonical(scope)) continue;
          if (!command.acknowledgeImmediateEffect && (field !== 'calendar' || immediateCalendarChange(before.settings.value.calendar, value, now.getTime()))) {
            throw new Error('student-portal-policy-immediate-confirmation-required');
          }
          await writeField(tx, scope, field, value, nextEpoch);
          changed = true;
        }
      } else {
        for (const field of command.keys) {
          const deleted = await tx.unsafe('DELETE FROM student_portal.setting WHERE scope_key=$1 AND field_key=$2 RETURNING field_key', [key(scope), field]);
          changed ||= deleted.length > 0;
        }
      }
      if (changed) {
        const advanced = await tx.unsafe("UPDATE student_portal.setting SET version=$1,updated_at=statement_timestamp() WHERE scope_key='school:2026' RETURNING field_key", [nextEpoch]);
        if (advanced.length !== FIELDS.length) throw new Error('student-portal-policy-defaults-unavailable');
        // Preserve the last published payload; the new policyVersion invalidates its authorization.
        await tx.unsafe("UPDATE student_portal.publication_job SET state='failed',lease_until=NULL,updated_at=statement_timestamp() WHERE state IN ('queued','running')");
      }
      const after = await this.readSnapshotInTransaction(tx, scope);
      const operationId = crypto.randomUUID();
      if (changed) await persistence.appendAudit({ eventId: crypto.randomUUID(), at: now.toISOString(), actorId: actor,
        accountId: scope.kind === 'account' ? scope.accountId : null, scope, kind: 'settings-changed', result: 'success',
        requestId: command.idempotencyKey, version: after.settings.version, maskedIp: null });
      await persistence.saveIdempotency({ key: command.idempotencyKey, actorId: receiptActor, requestDigest, operationId,
        version: after.settings.version, expiresAt: new Date(now.getTime() + 86400_000).toISOString() });
      return { operationId, version: after.settings.version };
    });
  }
}
