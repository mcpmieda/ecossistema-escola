import { adminReadResponseV2, type AdminReadQueryV2 } from '../../../shared/student-portal-contracts/admin-read-v2';
import type { StudentPortalPostgresQueryV1 } from '../persistence/postgres-persistence-v1';
import type { AdminCursorV1 } from './cursor-v1';
import { adminInstantV1 } from './common-v1';
import { ACCOUNT_JOIN_V1 } from './queries-v1';

/** #827: one bounded read, no per-student requests, mutation, materialization or inferred origin.
 * Publication precedence mirrors SCOPED_SELECTION_V2: latest committed applicable scope wins.
 * "current" describes a decision, never a promise that grades are visible to a student. */
export async function readCustomizationsV1(
  tx: StudentPortalPostgresQueryV1,
  query: AdminReadQueryV2,
  actor: string,
  requestId: string,
  now: Date,
  cursor: AdminCursorV1,
) {
  if (query.operation !== 'customizations-read') throw new Error('student-portal-cursor-invalid-request');
  const after = await cursor.read(query, actor, now);
  if (after?.at) throw new Error('student-portal-cursor-invalid-request');
  const args: unknown[] = [query.scope.academicYear];
  const bind = (value: unknown) => { args.push(value); return `$${args.length}`; };
  const where = ['TRUE'];
  if (query.scope.kind === 'class') where.push(`d.current_class_id=${bind(query.scope.classId)}`);
  if (query.scope.kind === 'account')
    where.push(`d.scope_kind='account' AND d.account_id=${bind(query.scope.accountId)}::uuid`);
  if (query.nameSearch !== undefined)
    where.push(`position(lower(${bind(query.nameSearch)}) in lower(d.label||' '||d.class_label))>0`);
  if (after) where.push(`d.scope_key COLLATE "C">${bind(after.id)} COLLATE "C"`);
  const limit = bind(query.page.limit + 1);
  const rows = await tx.unsafe(`WITH owned_options AS (
    SELECT st.scope_key,st.scope_kind,st.class_id,st.account_id,
      jsonb_object_agg(st.field_key,st.value_json) AS value,max(st.updated_at) AS updated_at
    FROM student_portal.setting st WHERE st.academic_year=$1 AND st.scope_kind IN('class','account')
      AND st.source_scope_json=CASE WHEN st.scope_kind='class'
        THEN jsonb_build_object('kind','class','academicYear',st.academic_year,'classId',st.class_id)
        ELSE jsonb_build_object('kind','account','academicYear',st.academic_year,'accountId',st.account_id::text) END
    GROUP BY st.scope_key,st.scope_kind,st.class_id,st.account_id
  ), accounts AS (
    SELECT a.id,a.blocked,a.closed_at,a.updated_at,s.name,b.class_id,b.class_name
    ${ACCOUNT_JOIN_V1} WHERE a.academic_year=$1
  ), classes AS (
    SELECT class_id,min(class_name) AS name FROM student_portal.academic_binding_v1
    WHERE academic_year=$1 AND status IS DISTINCT FROM 6 GROUP BY class_id
  ), entries AS (
    SELECT scope_key,scope_kind,class_id,account_id,updated_at FROM owned_options
    UNION ALL
    SELECT scope_key,scope_kind,class_id,account_id,released_at FROM student_portal.publication_release_v2
      WHERE academic_year=$1 AND scope_kind IN('class','account')
    UNION ALL
    SELECT 'account:2026:'||id::text,'account',NULL::integer,id,updated_at FROM accounts WHERE blocked
  ), owners AS (
    SELECT scope_key,scope_kind,class_id,account_id,max(updated_at) AS updated_at FROM entries
    GROUP BY scope_key,scope_kind,class_id,account_id
  ), described AS (
    SELECT g.*,CASE WHEN g.scope_kind='class' THEN g.class_id ELSE a.class_id END AS current_class_id,
      CASE WHEN g.scope_kind='class' THEN COALESCE(c.name,'Turma '||g.class_id::text)
        ELSE COALESCE(a.name,'Aluno sem vínculo atual') END AS label,
      COALESCE(CASE WHEN g.scope_kind='class' THEN c.name ELSE a.class_name END,'') AS class_label,
      COALESCE(a.blocked,false) AS blocked,a.closed_at
    FROM owners g LEFT JOIN accounts a ON a.id=g.account_id LEFT JOIN classes c ON c.class_id=g.class_id
  ), selected AS (
    SELECT d.* FROM described d WHERE ${where.join(' AND ')}
    ORDER BY d.scope_key COLLATE "C" LIMIT ${limit}
  ) SELECT d.*,o.value,COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'period',r.period,'action',CASE WHEN r.target_revision IS NULL THEN 'unpublish' ELSE 'publish' END,
      'version',r.version,'decidedAt',to_char(r.released_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'relevance',CASE
        WHEN r.scope_kind='account' AND (d.current_class_id IS NULL OR d.closed_at IS NOT NULL) THEN 'unlinked'
        WHEN r.scope_kind='account' AND r.target_revision IS NOT NULL AND r.bound_class_id IS DISTINCT FROM d.current_class_id THEN 'other-class'
        WHEN broader.version>r.version THEN 'superseded'
        WHEN control.enabled IS NULL THEN 'source-unavailable'
        WHEN NOT control.enabled THEN 'disabled'
        WHEN r.target_revision IS NOT NULL AND head.generation IS NULL THEN 'source-unavailable'
        WHEN r.target_revision IS NOT NULL AND split_part(r.target_revision,':',1)<>head.generation::text THEN 'other-generation'
        ELSE 'current' END,
      'broaderDecision',CASE WHEN broader.scope_key IS NULL THEN NULL ELSE jsonb_build_object(
        'scope',CASE WHEN broader.scope_kind='school' THEN jsonb_build_object('kind','school','academicYear',$1::integer)
          ELSE jsonb_build_object('kind','class','academicYear',$1::integer,'classId',broader.class_id) END,
        'action',CASE WHEN broader.target_revision IS NULL THEN 'unpublish' ELSE 'publish' END,
        'version',broader.version,'decidedAt',to_char(broader.released_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) END
    ) ORDER BY CASE r.period WHEN 'T1' THEN 1 WHEN 'T2' THEN 2 WHEN 'T3' THEN 3 WHEN 'REC1' THEN 4 WHEN 'REC2' THEN 5 ELSE 6 END)
    FROM student_portal.publication_release_v2 r
    LEFT JOIN student_portal.publication_control_v2 control ON control.academic_year=r.academic_year
    LEFT JOIN student_portal.publication_source_head_v2 head ON head.academic_year=r.academic_year
    LEFT JOIN LATERAL (
      SELECT b.* FROM student_portal.publication_release_v2 b
      WHERE b.academic_year=r.academic_year AND b.period=r.period AND
        (b.scope_key='school:2026' OR (r.scope_kind='account' AND b.scope_key='class:2026:'||d.current_class_id::text))
      ORDER BY b.version DESC LIMIT 1
    ) broader ON true
    WHERE r.scope_key=d.scope_key AND r.academic_year=$1
  ),'[]'::jsonb) AS publications
  FROM selected d LEFT JOIN owned_options o ON o.scope_key=d.scope_key ORDER BY d.scope_key COLLATE "C"`, args);
  const selected = rows.slice(0, query.page.limit);
  return adminReadResponseV2.parse({
    contractVersion: 2, state: 'customizations-read', requestId, observedAt: now.toISOString(), scope: query.scope,
    items: selected.map((row) => ({
      id: row.scope_key,
      scope: row.scope_kind === 'class'
        ? { kind: 'class', academicYear: query.scope.academicYear, classId: row.class_id }
        : { kind: 'account', academicYear: query.scope.academicYear, accountId: row.account_id },
      classId: row.current_class_id, label: row.label, classLabel: row.class_label,
      value: row.value, blocked: row.blocked, publications: row.publications,
      updatedAt: adminInstantV1(row.updated_at),
    })),
    nextCursor: rows.length > query.page.limit
      ? await cursor.next(query, actor, now, String(selected.at(-1)!.scope_key)) : null,
  });
}
