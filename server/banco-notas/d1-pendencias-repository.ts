import type {
  PendenciasFilterQuery,
  PendenciasListQuery,
  PendenciasRepository,
  PendenciasSummary,
  PendingContextLink,
  PendingItem,
  PendingKind,
} from '../../shared/banco-notas-pendencias';
import type { PageResult } from '../../shared/banco-notas-turmas-alunos';
import { classifyOperationalPending, pendingKindsBySeverity } from './operational-attention';

type Row = Record<string, string | number | null>;

const pendingFactsCte = `
WITH pending_facts AS (
  SELECT 'import_error:' || job.id AS pending_id, 'import_error' AS pending_kind,
         year.id AS school_year_id, year.name AS school_year_label,
         teacher.id AS teacher_id, teacher.display_name AS teacher_name,
         NULL AS class_group_id, NULL AS class_group_name,
         NULL AS component_id, NULL AS component_name,
         NULL AS model_state, source.name AS source_name,
         job.state AS factual_code, job.created_at, job.updated_at
  FROM import_jobs job
  JOIN school_years year ON year.id = job.school_year_id
  JOIN data_sources source ON source.id = job.data_source_id
  LEFT JOIN teachers teacher ON teacher.id = job.teacher_id
  WHERE job.state = 'failed'

  UNION ALL
  SELECT 'finding_' || finding.severity || ':' || finding.id,
         'finding_' || finding.severity,
         year.id, year.name, teacher.id, teacher.display_name,
         NULL, NULL, NULL, NULL, NULL, source.name,
         finding.code, finding.created_at, finding.created_at
  FROM import_findings finding
  JOIN import_jobs job ON job.id = finding.import_job_id
  JOIN school_years year ON year.id = job.school_year_id
  JOIN data_sources source ON source.id = job.data_source_id
  LEFT JOIN teachers teacher ON teacher.id = job.teacher_id
  LEFT JOIN import_finding_resolutions resolution
    ON resolution.import_finding_id = finding.id
  WHERE resolution.id IS NULL

  UNION ALL
  SELECT 'model_suspended:' || model.id, 'model_suspended',
         year.id, year.name, teacher.id, teacher.display_name,
         NULL, NULL, NULL, NULL, model.state, NULL,
         model.state, model.created_at, model.updated_at
  FROM teacher_models model
  JOIN school_years year ON year.id = model.school_year_id
  JOIN teachers teacher ON teacher.id = model.teacher_id
  WHERE model.state = 'suspended'

  UNION ALL
  SELECT 'model_missing:' || assignment.id, 'model_missing',
         year.id, year.name, teacher.id, teacher.display_name,
         class_group.id, class_group.name, component.id, component.name,
         NULL, NULL, 'missing', assignment.created_at, assignment.updated_at
  FROM teacher_assignments assignment
  JOIN school_years year ON year.id = assignment.school_year_id
  JOIN teachers teacher ON teacher.id = assignment.teacher_id
  JOIN class_groups class_group ON class_group.id = assignment.class_group_id
  JOIN components component ON component.id = assignment.component_id
  WHERE assignment.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM teacher_models model
      WHERE model.school_year_id = assignment.school_year_id
        AND model.teacher_id = assignment.teacher_id
    )

  UNION ALL
  SELECT 'identity_missing:' || model.id, 'identity_missing',
         year.id, year.name, teacher.id, teacher.display_name,
         NULL, NULL, NULL, NULL, model.state, NULL,
         'identity_required', model.created_at, model.updated_at
  FROM teacher_models model
  JOIN school_years year ON year.id = model.school_year_id
  JOIN teachers teacher ON teacher.id = model.teacher_id
  WHERE teacher.entra_object_id IS NULL
    AND model.state IN ('validated', 'ready_to_share', 'shared', 'connected')

  UNION ALL
  SELECT 'source_missing:' || assignment.id, 'source_missing',
         year.id, year.name, teacher.id, teacher.display_name,
         class_group.id, class_group.name, component.id, component.name,
         model.state, NULL, 'authority_missing', assignment.created_at, assignment.updated_at
  FROM teacher_assignments assignment
  JOIN school_years year ON year.id = assignment.school_year_id
  JOIN teachers teacher ON teacher.id = assignment.teacher_id
  JOIN class_groups class_group ON class_group.id = assignment.class_group_id
  JOIN components component ON component.id = assignment.component_id
  LEFT JOIN teacher_models model
    ON model.school_year_id = assignment.school_year_id
   AND model.teacher_id = assignment.teacher_id
  WHERE assignment.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM source_assignments authority
      WHERE authority.school_year_id = assignment.school_year_id
        AND authority.status = 'active'
        AND authority.authority = 'authoritative'
        AND authority.effective_from <= date('now')
        AND (authority.effective_to IS NULL OR authority.effective_to >= date('now'))
        AND (authority.teacher_id = assignment.teacher_id OR authority.teacher_id IS NULL)
    )

  UNION ALL
  SELECT 'inactive_teacher_assignment:' || assignment.id, 'inactive_teacher_assignment',
         year.id, year.name, teacher.id, teacher.display_name,
         class_group.id, class_group.name, component.id, component.name,
         model.state, NULL, teacher.status, assignment.created_at, assignment.updated_at
  FROM teacher_assignments assignment
  JOIN school_years year ON year.id = assignment.school_year_id
  JOIN teachers teacher ON teacher.id = assignment.teacher_id
  JOIN class_groups class_group ON class_group.id = assignment.class_group_id
  JOIN components component ON component.id = assignment.component_id
  LEFT JOIN teacher_models model
    ON model.school_year_id = assignment.school_year_id
   AND model.teacher_id = assignment.teacher_id
  WHERE assignment.status = 'active' AND teacher.status = 'inactive'

  UNION ALL
  SELECT 'orphan_assignment:' || assignment.id, 'orphan_assignment',
         assignment.school_year_id, year.name,
         assignment.teacher_id, teacher.display_name,
         assignment.class_group_id, class_group.name,
         assignment.component_id, component.name,
         NULL, NULL, 'incomplete_relation', assignment.created_at, assignment.updated_at
  FROM teacher_assignments assignment
  LEFT JOIN school_years year ON year.id = assignment.school_year_id
  LEFT JOIN teachers teacher ON teacher.id = assignment.teacher_id
  LEFT JOIN class_groups class_group ON class_group.id = assignment.class_group_id
  LEFT JOIN components component ON component.id = assignment.component_id
  WHERE year.id IS NULL OR teacher.id IS NULL OR class_group.id IS NULL OR component.id IS NULL

  UNION ALL
  SELECT 'model_without_assignment:' || model.id, 'model_without_assignment',
         year.id, year.name, teacher.id, teacher.display_name,
         NULL, NULL, NULL, NULL, model.state, NULL,
         'assignment_missing', model.created_at, model.updated_at
  FROM teacher_models model
  JOIN school_years year ON year.id = model.school_year_id
  JOIN teachers teacher ON teacher.id = model.teacher_id
  WHERE model.state <> 'archived'
    AND NOT EXISTS (
      SELECT 1 FROM teacher_assignments assignment
      WHERE assignment.school_year_id = model.school_year_id
        AND assignment.teacher_id = model.teacher_id
        AND assignment.status = 'active'
    )

  UNION ALL
  SELECT 'model_not_connected:' || model.id, 'model_not_connected',
         year.id, year.name, teacher.id, teacher.display_name,
         NULL, NULL, NULL, NULL, model.state, NULL,
         model.state, model.created_at, model.updated_at
  FROM teacher_models model
  JOIN school_years year ON year.id = model.school_year_id
  JOIN teachers teacher ON teacher.id = model.teacher_id
  WHERE model.state IN ('draft', 'validated', 'ready_to_share', 'shared')

  UNION ALL
  SELECT 'import_analysis_pending:' || job.id, 'import_analysis_pending',
         year.id, year.name, teacher.id, teacher.display_name,
         NULL, NULL, NULL, NULL, NULL, source.name,
         job.state, job.created_at, job.updated_at
  FROM import_jobs job
  JOIN school_years year ON year.id = job.school_year_id
  JOIN data_sources source ON source.id = job.data_source_id
  LEFT JOIN teachers teacher ON teacher.id = job.teacher_id
  LEFT JOIN import_analyses analysis ON analysis.import_job_id = job.id
  WHERE job.state = 'draft' AND analysis.id IS NULL

  UNION ALL
  SELECT 'sync_conflict:' || attempt.request_id, 'sync_conflict',
         year.id, year.name, teacher.id, teacher.display_name,
         NULL, NULL, NULL, NULL, model.state, NULL,
         COALESCE(attempt.reason_code, attempt.status), attempt.created_at, attempt.completed_at
  FROM sync_attempts attempt
  JOIN teacher_models model ON model.id = attempt.teacher_model_id
  JOIN school_years year ON year.id = model.school_year_id
  JOIN teachers teacher ON teacher.id = model.teacher_id
  WHERE attempt.status = 'conflict' AND (attempt.reason_code IS NULL OR attempt.reason_code <> 'BASELINE_STALE')

  UNION ALL
  SELECT 'sync_failed:' || attempt.request_id, 'sync_failed',
         year.id, year.name, teacher.id, teacher.display_name,
         NULL, NULL, NULL, NULL, model.state, NULL,
         COALESCE(attempt.reason_code, attempt.status), attempt.created_at, attempt.completed_at
  FROM sync_attempts attempt
  JOIN teacher_models model ON model.id = attempt.teacher_model_id
  JOIN school_years year ON year.id = model.school_year_id
  JOIN teachers teacher ON teacher.id = model.teacher_id
  WHERE attempt.status = 'failed'
    AND NOT EXISTS (
      SELECT 1 FROM sync_attempts committed
      WHERE committed.request_id = attempt.request_id
        AND committed.actor_id IS attempt.actor_id
        AND committed.status = 'committed'
    )
    AND NOT EXISTS (
      SELECT 1 FROM sync_attempts later_failure
      WHERE later_failure.request_id = attempt.request_id
        AND later_failure.actor_id IS attempt.actor_id
        AND later_failure.status = 'failed'
        AND (
          later_failure.created_at > attempt.created_at
          OR (later_failure.created_at = attempt.created_at AND later_failure.attempt_id > attempt.attempt_id)
        )
    )

  UNION ALL
  SELECT 'sync_rejected_stale:' || attempt.request_id, 'sync_rejected_stale',
         year.id, year.name, teacher.id, teacher.display_name,
         NULL, NULL, NULL, NULL, model.state, NULL,
         attempt.reason_code, attempt.created_at, attempt.completed_at
  FROM sync_attempts attempt
  JOIN teacher_models model ON model.id = attempt.teacher_model_id
  JOIN school_years year ON year.id = model.school_year_id
  JOIN teachers teacher ON teacher.id = model.teacher_id
  WHERE attempt.reason_code = 'BASELINE_STALE'
)
`;

const quotedKinds = (kinds: readonly PendingKind[]) => kinds.map((kind) => `'${kind}'`).join(', ');

const severityOrder = `CASE
  WHEN pending_kind IN (${quotedKinds(pendingKindsBySeverity.error)}) THEN 0
  WHEN pending_kind IN (${quotedKinds(pendingKindsBySeverity.warning)}) THEN 1
  ELSE 2 END`;

const labels: Record<PendingKind, { title: string; origin: string }> = {
  import_error: { title: 'Importação com erro', origin: 'Estado persistido da importação' },
  finding_error: { title: 'Finding de erro aberto', origin: 'Finding append-only da importação' },
  finding_warning: {
    title: 'Finding de atenção aberto',
    origin: 'Finding append-only da importação',
  },
  finding_info: {
    title: 'Finding informativo aberto',
    origin: 'Finding append-only da importação',
  },
  model_suspended: { title: 'Modelo suspenso', origin: 'Estado persistido do modelo docente' },
  model_missing: {
    title: 'Modelo ausente para a atribuição',
    origin: 'Atribuição docente sem modelo no mesmo ano',
  },
  identity_missing: {
    title: 'Identidade institucional necessária ausente',
    origin: 'Modelo em etapa que exige identidade institucional',
  },
  source_missing: {
    title: 'Fonte autoritativa ausente',
    origin: 'Atribuição ativa sem autoridade vigente',
  },
  inactive_teacher_assignment: {
    title: 'Professor inativo com atribuição ativa',
    origin: 'Status persistido do professor e da atribuição',
  },
  orphan_assignment: {
    title: 'Atribuição com relação incompleta',
    origin: 'Integridade factual da atribuição docente',
  },
  model_without_assignment: {
    title: 'Modelo sem atribuição válida',
    origin: 'Modelo docente sem atribuição ativa no mesmo ano',
  },
  model_not_connected: {
    title: 'Modelo ainda não conectado',
    origin: 'Estado persistido do modelo docente',
  },
  import_analysis_pending: {
    title: 'Análise de importação pendente',
    origin: 'Importação em rascunho sem análise verificada',
  },
  sync_conflict: {
    title: 'Conflito de sincronização',
    origin: 'Ledger append-only de tentativas de sincronização',
  },
  sync_failed: {
    title: 'Falha de sincronização',
    origin: 'Ledger append-only de tentativas de sincronização',
  },
  sync_rejected_stale: {
    title: 'Baseline de sincronização desatualizada',
    origin: 'Ledger append-only de tentativas de sincronização',
  },
};

function context(row: Row): string {
  return [row.school_year_label, row.teacher_name, row.class_group_name, row.component_name]
    .filter(Boolean)
    .map(String)
    .join(' · ');
}

function ref(id: unknown, label: unknown) {
  return id && label ? { id: String(id), label: String(label) } : null;
}

function links(row: Row): PendingContextLink[] {
  const result: PendingContextLink[] = [];
  if (row.teacher_id && row.teacher_name) {
    result.push({
      kind: 'professor',
      label: 'Ver professor',
      href: `/banco-de-notas/professores/${String(row.teacher_id)}`,
    });
  }
  if (row.class_group_id && row.class_group_name) {
    result.push({
      kind: 'turma',
      label: 'Ver turma',
      href: `/banco-de-notas/turmas/${String(row.class_group_id)}`,
    });
    result.push({
      kind: 'acompanhamento',
      label: 'Abrir Acompanhamento',
      href: `/banco-de-notas/acompanhamento/turmas/${String(row.class_group_id)}`,
    });
  }
  return result;
}

function mapPending(row: Row): PendingItem {
  const kind = String(row.pending_kind) as PendingKind;
  const classification = classifyOperationalPending(kind);
  const definition = labels[kind];
  const evidence = row.factual_code
    ? `${classification.reason} · código/estado: ${String(row.factual_code)}`
    : classification.reason;
  return {
    id: String(row.pending_id),
    kind,
    severity: classification.severity,
    status: 'open',
    title: definition.title,
    description: context(row) || 'Contexto institucional não disponível para esta evidência.',
    evidence,
    origin: definition.origin,
    schoolYear: ref(row.school_year_id, row.school_year_label),
    teacher: ref(row.teacher_id, row.teacher_name),
    classGroup: ref(row.class_group_id, row.class_group_name),
    component: ref(row.component_id, row.component_name),
    modelState: row.model_state ? String(row.model_state) : null,
    sourceName: row.source_name ? String(row.source_name) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    contextLinks: links(row),
  };
}

function filtered(query: PendenciasFilterQuery): {
  sql: string;
  values: Array<string | number>;
} {
  const conditions: string[] = [];
  const values: Array<string | number> = [];
  const add = (condition: string, value: string | number) => {
    conditions.push(condition);
    values.push(value);
  };
  if (query.schoolYearId) add('school_year_id = ?', query.schoolYearId);
  if (query.kind) add('pending_kind = ?', query.kind);
  if (query.teacherId) add('teacher_id = ?', query.teacherId);
  if (query.classGroupId) add('class_group_id = ?', query.classGroupId);
  if (query.componentId) add('component_id = ?', query.componentId);
  if (query.severity) {
    conditions.push(`pending_kind IN (${quotedKinds(pendingKindsBySeverity[query.severity])})`);
  }
  if (query.q) {
    const term = `%${query.q.toLocaleLowerCase('pt-BR')}%`;
    conditions.push(`(
      lower(COALESCE(school_year_label, '')) LIKE ? OR
      lower(COALESCE(teacher_name, '')) LIKE ? OR
      lower(COALESCE(class_group_name, '')) LIKE ? OR
      lower(COALESCE(component_name, '')) LIKE ? OR
      lower(COALESCE(source_name, '')) LIKE ? OR
      lower(COALESCE(factual_code, '')) LIKE ?
    )`);
    values.push(term, term, term, term, term, term);
  }
  return {
    sql: conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '',
    values,
  };
}

export class D1PendenciasRepository implements PendenciasRepository {
  constructor(private readonly db: D1Database) {}

  async summary(query: PendenciasFilterQuery): Promise<PendenciasSummary> {
    const filter = filtered(query);
    const [counts, years, teachers, classes, components] = await Promise.all([
      this.db
        .prepare(
          `${pendingFactsCte}
           SELECT pending_kind, COUNT(*) AS total
           FROM pending_facts${filter.sql}
           GROUP BY pending_kind`,
        )
        .bind(...filter.values)
        .all<Row>(),
      this.db
        .prepare('SELECT id, name AS label FROM school_years ORDER BY year DESC, id')
        .all<Row>(),
      this.db
        .prepare('SELECT id, display_name AS label FROM teachers ORDER BY display_name, id')
        .all<Row>(),
      this.db
        .prepare(
          `SELECT id, name AS label, school_year_id
           FROM class_groups ORDER BY name, id`,
        )
        .all<Row>(),
      this.db
        .prepare(
          `SELECT id, name AS label, school_year_id
           FROM components ORDER BY name, id`,
        )
        .all<Row>(),
    ]);
    const byKind = counts.results.map((row) => ({
      kind: String(row.pending_kind) as PendingKind,
      total: Number(row.total),
    }));
    const totals = { error: 0, warning: 0, info: 0 };
    byKind.forEach((item) => {
      totals[classifyOperationalPending(item.kind).severity] += item.total;
    });
    return {
      total: totals.error + totals.warning + totals.info,
      ...totals,
      byKind,
      filters: {
        schoolYears: years.results.map((row) => ({ id: String(row.id), label: String(row.label) })),
        teachers: teachers.results.map((row) => ({ id: String(row.id), label: String(row.label) })),
        classGroups: classes.results.map((row) => ({
          id: String(row.id),
          label: String(row.label),
          schoolYearId: String(row.school_year_id),
        })),
        components: components.results.map((row) => ({
          id: String(row.id),
          label: String(row.label),
          schoolYearId: String(row.school_year_id),
        })),
      },
    };
  }

  async list(query: PendenciasListQuery): Promise<PageResult<PendingItem>> {
    const filter = filtered(query);
    const offset = (query.page - 1) * query.pageSize;
    const [count, rows] = await Promise.all([
      this.db
        .prepare(`${pendingFactsCte} SELECT COUNT(*) AS total FROM pending_facts${filter.sql}`)
        .bind(...filter.values)
        .first<Row>(),
      this.db
        .prepare(
          `${pendingFactsCte}
           SELECT * FROM pending_facts${filter.sql}
           ORDER BY ${severityOrder}, updated_at DESC, pending_id
           LIMIT ? OFFSET ?`,
        )
        .bind(...filter.values, query.pageSize, offset)
        .all<Row>(),
    ]);
    const total = Number(count?.total ?? 0);
    return {
      items: rows.results.map(mapPending),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async detail(id: string): Promise<PendingItem | null> {
    const row = await this.db
      .prepare(`${pendingFactsCte} SELECT * FROM pending_facts WHERE pending_id = ? LIMIT 1`)
      .bind(id)
      .first<Row>();
    return row ? mapPending(row) : null;
  }
}
