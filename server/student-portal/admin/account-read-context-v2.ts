import { z } from 'zod';
import { adminAccountReadV2 } from '../../../shared/student-portal-contracts/admin-read-v2';
import {
  academicBindingSchemaV1,
  resolveEligibilityV1,
} from '../../../shared/gradebook-contracts/student-portal/eligibility-v1';
import { resolvePolicySnapshotRowsV1 } from '../policies/policy-service-v1';
import { sessionExpiryV1 } from '../policies/calendar-v1';
import { adminInstantV1 } from './common-v1';

/** Shared bounded account/policy snapshot; never a second academic rule. */
export const ADMIN_ACCOUNT_FIELDS_V2 = `a.id,a.gradebook_student_id,a.auth_state,a.eligibility,a.blocked,
    a.version::text AS account_version,a.security_version::text,a.closed_at,
    COALESCE(s.name,'') AS name,COALESCE(b.class_name,'') AS class_name,b.class_id,
    (b.class_id IS NOT NULL AND a.closed_at IS NULL AND a.gradebook_student_id IS NOT NULL) AS resolved,
    (SELECT academic_generation||':'||academic_counter::text FROM student_portal.academic_revision WHERE academic_year=2026) AS data_version,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('academicYear',bb.academic_year,'studentId',bb.student_id,
      'classId',bb.class_id,'status',bb.status)) FROM student_portal.academic_binding_v1 bb
      WHERE bb.academic_year=2026 AND bb.student_id=a.gradebook_student_id),'[]'::jsonb) AS bindings,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('scope_key',p.scope_key,'field_key',p.field_key,
      'value_json',p.value_json,'source_scope_json',p.source_scope_json,'version',p.version))
      FROM student_portal.setting p WHERE p.scope_key='school:2026'
        OR p.scope_key='class:2026:'||b.class_id::text OR p.scope_key='account:2026:'||a.id::text),'[]'::jsonb) AS settings_rows,
    (SELECT d.birth_year FROM student_portal.account_access_data d WHERE d.account_id=a.id) AS birth_year,
    (SELECT d.confirmation FROM student_portal.account_access_data d WHERE d.account_id=a.id) AS birth_confirmation,
    EXISTS(SELECT 1 FROM student_portal.qr_credential q WHERE q.account_id=a.id AND q.state='active') AS qr_issued,
    EXISTS(SELECT 1 FROM student_portal.password_credential c WHERE c.account_id=a.id AND c.pin_verifier IS NOT NULL) AS pin_registered,
    EXISTS(SELECT 1 FROM student_portal.password_credential c WHERE c.account_id=a.id AND c.pin_verifier IS NOT NULL
      AND c.pin_version=a.pin_version) AS pin_current`;

function firstAccessV2(row: Record<string, unknown>) {
  const qrIssued = row.qr_issued === true;
  const recoveryReady =
    row.birth_year !== null &&
    row.birth_confirmation === 'confirmed' &&
    row.pin_registered === true &&
    row.pin_current === true;
  if (row.auth_state === 'active')
    return { state: 'not-required' as const, qrIssued, recoveryReady };
  if (row.birth_year === null) return { state: 'birth-missing' as const, qrIssued, recoveryReady };
  if (row.birth_confirmation !== 'confirmed')
    return { state: 'birth-unconfirmed' as const, qrIssued, recoveryReady };
  if (row.pin_registered !== true)
    return { state: 'pin-missing' as const, qrIssued, recoveryReady };
  if (row.pin_current !== true) return { state: 'pin-outdated' as const, qrIssued, recoveryReady };
  if (!qrIssued) return { state: 'qr-missing' as const, qrIssued, recoveryReady };
  return { state: 'ready' as const, qrIssued, recoveryReady };
}

export async function accountReadContextV2(row: Record<string, unknown>, now: Date) {
  const accountId = z.uuid().parse(row.id);
  const link =
    row.gradebook_student_id === null
      ? null
      : {
          academicYear: 2026 as const,
          studentId: z.number().int().positive().safe().parse(row.gradebook_student_id),
        };
  const eligibility =
    link === null
      ? 'unlinked'
      : resolveEligibilityV1(
          link,
          z.string().parse(row.data_version),
          z.array(academicBindingSchemaV1).parse(row.bindings),
        ).state;
  let policy: Awaited<ReturnType<typeof resolvePolicySnapshotRowsV1>> | null = null;
  let access: z.infer<typeof adminAccountReadV2>['access'] = {
    state: 'unresolved',
    enabled: null,
    source: null,
    settingsVersion: null,
    accessPermitted: false,
  };
  if (row.resolved === true) {
    policy = await resolvePolicySnapshotRowsV1({ kind: 'account', academicYear: 2026, accountId }, [
      row,
    ]);
    const accessPermitted =
      eligibility === 'eligible' &&
      row.eligibility === 'eligible' &&
      row.blocked === false &&
      sessionExpiryV1(policy.enforcedValue, now, false) !== null;
    access = {
      state: 'resolved',
      enabled: policy.enforcedValue.accessEnabled,
      source: policy.settings.sources.accessEnabled,
      settingsVersion: policy.settings.version,
      accessPermitted,
    };
  }
  const item = adminAccountReadV2.parse({
    accountId,
    link,
    linkClosed: row.closed_at !== null,
    name: row.name,
    classLabel: row.class_name,
    classId: row.class_id,
    state: row.auth_state,
    eligibility,
    blocked: row.blocked,
    version: Number(row.account_version),
    access,
    lastAuthenticationAt:
      row.last_authentication == null ? null : adminInstantV1(row.last_authentication),
    validSessionCount: 0,
    firstAccess: firstAccessV2(row),
  });
  return {
    item,
    policy,
    securityVersion: z.coerce.number().int().nonnegative().safe().parse(row.security_version),
  };
}
