import { readFileSync } from 'node:fs';
import { installResetSchemaFixtureV1 } from '../year-reset/schema-fixture';
import { PolicyServiceV1 } from '../../../server/student-portal/policies/policy-service-v1';
import { initialPolicyDefaultsV1 } from '../../../server/student-portal/policies/defaults-v1';
import { PortalAdminApiV1 } from '../../../server/student-portal/admin/api-v1';
import { PortalCryptoV1 } from '../../../server/student-portal/crypto/crypto-v1';
import type { StudentPortalPostgresSqlV1 } from '../../../server/student-portal/persistence/postgres-persistence-v1';

export const READ_ACTOR_V2 = '74600000-0000-4000-8000-000000000001';
export const READ_TENANT_V2 = '74600000-0000-4000-8000-000000000002';
export const readAccountIdV2 = (index: number) =>
  `74600000-0000-4000-8000-${String(index).padStart(12, '0')}`;
export const READ_CLASS_V2 = { kind: 'class', academicYear: 2026, classId: 746001 } as const;
export const READ_SCHOOL_V2 = { kind: 'school', academicYear: 2026 } as const;
export const readContextV2 = () => ({
  actorId: READ_ACTOR_V2,
  tenantId: READ_TENANT_V2,
  requestId: crypto.randomUUID(),
  authenticatedAt: new Date().toISOString(),
  capability: 'platform.settings.read' as const,
});
export function readApiV2(sql: StudentPortalPostgresSqlV1) {
  return new PortalAdminApiV1(sql, {
    tenantId: READ_TENANT_V2,
    cursorSecret: 'synthetic-admin-read-746-cursor-secret-'.repeat(3),
    cryptoPort: new PortalCryptoV1(
      new Map([[1, new Uint8Array(32).fill(7)]]),
      new Map([[1, new Uint8Array(32).fill(8)]]),
    ),
    qrKeyVersion: 1,
    pepperVersion: 1,
  });
}

/** Entirely synthetic, fresh disposable database only. No production fallback. */
export async function installAdminReadFixtureV2(
  database: { exec(sql: string): Promise<unknown> },
  sql: StudentPortalPostgresSqlV1,
) {
  await database.exec(
    readFileSync('migrations/gradebook-simplified/0001_current_schema.sql', 'utf8'),
  );
  await installResetSchemaFixtureV1(database);
  await database.exec(`
    INSERT INTO gradebook.ano_letivo VALUES (2026,60000,2),(2025,60000,2);
    INSERT INTO gradebook.turma(id,ano,codigo,nome,etapa,turno)
      SELECT 746000+n,2026,'R746-'||lpad(n::text,3,'0'),'SYNTHETIC READ CLASS '||n,6,'TESTE' FROM generate_series(1,106) n;
    INSERT INTO gradebook.turma(id,ano,codigo,nome,etapa,turno) VALUES(745999,2025,'OTHER YEAR','SYNTHETIC OTHER YEAR',6,'TESTE');
    INSERT INTO gradebook.aluno(id,ano,nome)
      SELECT 746000+n,2026,'SYNTHETIC READ STUDENT '||lpad(n::text,3,'0') FROM generate_series(1,106) n;
    INSERT INTO gradebook.vinculo(ano,turma_id,numero,aluno_id)
      SELECT 2026,746001,n,746000+n FROM generate_series(1,106) n;
    INSERT INTO student_portal.account(id,gradebook_student_id,auth_state,eligibility)
      SELECT ('74600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,746000+n,
        CASE WHEN n=1 THEN 'active' ELSE 'pending-activation' END,'eligible' FROM generate_series(1,105) n;
    INSERT INTO student_portal.account(id,gradebook_student_id,auth_state,eligibility,closed_at)
      VALUES('74600000-0000-4000-8000-000000000200',NULL,'pending-activation','unlinked',now());
    GRANT USAGE ON SCHEMA gradebook TO gradebook_app;
    GRANT SELECT ON gradebook.ano_letivo,gradebook.turma,gradebook.aluno,gradebook.vinculo,gradebook.professor,gradebook.disciplina TO gradebook_app;
  `);
  await new PolicyServiceV1(sql).initializeDefaults();
}

export async function resetAdminReadFixtureV2(sql: StudentPortalPostgresSqlV1) {
  await sql.unsafe(`DELETE FROM student_portal.session`);
  await sql.unsafe(`DELETE FROM student_portal.audit_event`);
  await sql.unsafe(`DELETE FROM student_portal.setting WHERE scope_kind<>'school'`);
  await sql.unsafe(
    `UPDATE student_portal.setting SET value_json='false'::jsonb WHERE scope_key='school:2026' AND field_key='accessEnabled'`,
  );
  await sql.unsafe(
    "UPDATE student_portal.setting SET value_json=$1::text::jsonb WHERE scope_key='school:2026' AND field_key='calendar'",
    [JSON.stringify(initialPolicyDefaultsV1().calendar)],
  );
  await sql.unsafe(`DELETE FROM gradebook.vinculo WHERE turma_id<>746001 AND ano=2026`);
  await sql.unsafe(`UPDATE student_portal.account SET blocked=false WHERE academic_year=2026`);
}
