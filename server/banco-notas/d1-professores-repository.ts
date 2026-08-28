import type {
  ProfessorActivity,
  ProfessorAssignmentContext,
  ProfessorDetail,
  ProfessorDetailQuery,
  ProfessorListItem,
  ProfessorModel,
  ProfessorPending,
  ProfessoresFilters,
  ProfessoresListQuery,
  ProfessoresRepository,
} from '../../shared/banco-notas-professores';
import type { PageResult } from '../../shared/banco-notas-turmas-alunos';
import { deriveOperationalAttention } from './operational-attention';

type Row = Record<string, string | number | null>;

const scopedReadModelCte = `
WITH params AS (SELECT ? AS school_year_id),
scoped_assignments AS (
  SELECT assignment.*, class_group.name AS class_group_name,
         component.name AS component_name
  FROM teacher_assignments assignment
  JOIN class_groups class_group ON class_group.id = assignment.class_group_id
  JOIN components component ON component.id = assignment.component_id
  CROSS JOIN params
  WHERE params.school_year_id IS NULL OR assignment.school_year_id = params.school_year_id
), assignment_rollup AS (
  SELECT assignment.teacher_id,
         COUNT(CASE WHEN assignment.status = 'active' THEN 1 END) AS active_assignments,
         COUNT(DISTINCT CASE WHEN assignment.status = 'active' THEN assignment.class_group_id END) AS class_groups,
         COUNT(DISTINCT CASE WHEN assignment.status = 'active' THEN assignment.component_id END) AS components,
         SUM(CASE WHEN assignment.status = 'active' AND NOT EXISTS (
           SELECT 1 FROM source_assignments source
           WHERE source.school_year_id = assignment.school_year_id
             AND source.status = 'active' AND source.authority = 'authoritative'
             AND source.effective_from <= date('now')
             AND (source.effective_to IS NULL OR source.effective_to >= date('now'))
             AND (source.teacher_id = assignment.teacher_id OR source.teacher_id IS NULL)
         ) THEN 1 ELSE 0 END) AS missing_sources
  FROM scoped_assignments assignment GROUP BY assignment.teacher_id
), assignment_years AS (
  SELECT DISTINCT teacher_id, school_year_id FROM scoped_assignments WHERE status = 'active'
), scoped_models AS (
  SELECT model.* FROM teacher_models model CROSS JOIN params
  WHERE params.school_year_id IS NULL OR model.school_year_id = params.school_year_id
), model_rollup AS (
  SELECT model.teacher_id, COUNT(*) AS models,
         COUNT(CASE WHEN model.state = 'connected' THEN 1 END) AS connected_models,
         COUNT(CASE WHEN model.state = 'suspended' THEN 1 END) AS suspended_models,
         COUNT(CASE WHEN model.state <> 'connected' THEN 1 END) AS non_connected_models,
         COUNT(CASE WHEN model.state IN ('validated','ready_to_share','shared','connected') THEN 1 END) AS identity_required_models,
         COUNT(CASE WHEN NOT EXISTS (
           SELECT 1 FROM scoped_assignments assignment
           WHERE assignment.teacher_id = model.teacher_id
             AND assignment.school_year_id = model.school_year_id
             AND assignment.status = 'active'
         ) THEN 1 END) AS models_without_assignments,
         GROUP_CONCAT(DISTINCT model.state) AS model_states,
         MAX(model.updated_at) AS model_updated_at,
         MAX(model.last_reconciled_at) AS reconciled_at
  FROM scoped_models model GROUP BY model.teacher_id
), missing_models AS (
  SELECT years.teacher_id, COUNT(*) AS missing_model_contexts
  FROM assignment_years years
  WHERE NOT EXISTS (
    SELECT 1 FROM scoped_models model
    WHERE model.teacher_id = years.teacher_id AND model.school_year_id = years.school_year_id
  )
  GROUP BY years.teacher_id
), scoped_imports AS (
  SELECT job.* FROM import_jobs job CROSS JOIN params
  WHERE params.school_year_id IS NULL OR job.school_year_id = params.school_year_id
), import_rollup AS (
  SELECT job.teacher_id,
         COUNT(DISTINCT CASE WHEN job.state = 'failed' THEN job.id END) AS failed_imports,
         COUNT(DISTINCT CASE WHEN finding.severity = 'error' AND resolution.id IS NULL THEN finding.id END) AS open_errors,
         COUNT(DISTINCT CASE WHEN finding.id IS NOT NULL AND resolution.id IS NULL THEN finding.id END) AS open_findings,
         MAX(job.updated_at) AS import_updated_at
  FROM scoped_imports job
  LEFT JOIN import_findings finding ON finding.import_job_id = job.id
  LEFT JOIN import_finding_resolutions resolution ON resolution.import_finding_id = finding.id
  GROUP BY job.teacher_id
), activity_rollup AS (
  SELECT teacher_id, MAX(occurred_at) AS last_activity_at FROM (
    SELECT model.teacher_id, model.updated_at AS occurred_at FROM scoped_models model
    UNION ALL
    SELECT job.teacher_id, job.updated_at FROM scoped_imports job WHERE job.teacher_id IS NOT NULL
    UNION ALL
    SELECT model.teacher_id, run.started_at FROM reconciliation_runs run
      JOIN scoped_models model ON model.id = run.teacher_model_id
    UNION ALL
    SELECT model.teacher_id, event.occurred_at FROM grade_events event
      JOIN scoped_models model ON model.id = event.teacher_model_id
    UNION ALL
    SELECT source.teacher_id, source.updated_at FROM source_assignments source CROSS JOIN params
      WHERE source.teacher_id IS NOT NULL
        AND (params.school_year_id IS NULL OR source.school_year_id = params.school_year_id)
  ) activity GROUP BY teacher_id
), teacher_rows AS (
  SELECT teacher.id, teacher.display_name, teacher.status,
         CASE WHEN teacher.entra_object_id IS NULL THEN 0 ELSE 1 END AS identity_linked,
         COALESCE(assignment.active_assignments, 0) AS active_assignments,
         COALESCE(assignment.class_groups, 0) AS class_groups,
         COALESCE(assignment.components, 0) AS components,
         COALESCE(assignment.missing_sources, 0) AS missing_sources,
         COALESCE(model.models, 0) AS models,
         COALESCE(model.connected_models, 0) AS connected_models,
         COALESCE(model.suspended_models, 0) AS suspended_models,
         COALESCE(model.non_connected_models, 0) AS non_connected_models,
         COALESCE(model.identity_required_models, 0) AS identity_required_models,
         COALESCE(model.models_without_assignments, 0) AS models_without_assignments,
         model.model_states,
         COALESCE(missing.missing_model_contexts, 0) AS missing_model_contexts,
         COALESCE(imports.failed_imports, 0) AS failed_imports,
         COALESCE(imports.open_errors, 0) AS open_errors,
         COALESCE(imports.open_findings, 0) AS open_findings,
         activity.last_activity_at
  FROM teachers teacher
  LEFT JOIN assignment_rollup assignment ON assignment.teacher_id = teacher.id
  LEFT JOIN model_rollup model ON model.teacher_id = teacher.id
  LEFT JOIN missing_models missing ON missing.teacher_id = teacher.id
  LEFT JOIN import_rollup imports ON imports.teacher_id = teacher.id
  LEFT JOIN activity_rollup activity ON activity.teacher_id = teacher.id
)`;

const errorCondition = `(teacher_rows.failed_imports > 0 OR teacher_rows.open_errors > 0
  OR teacher_rows.suspended_models > 0)`;
const warningCondition = `(teacher_rows.open_findings > 0 OR teacher_rows.missing_model_contexts > 0
  OR teacher_rows.missing_sources > 0 OR teacher_rows.models_without_assignments > 0
  OR (teacher_rows.identity_linked = 0 AND teacher_rows.identity_required_models > 0)
  OR (teacher_rows.status = 'inactive' AND teacher_rows.active_assignments > 0))`;

function strings(value: string | number | null | undefined): string[] {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function latest(values: Array<string | null | undefined>): string | null {
  return (
    values
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null
  );
}

function attentionFromRow(row: Row) {
  return deriveOperationalAttention({
    activeAssignments: Number(row.active_assignments ?? 0),
    teacherInactive: row.status === 'inactive',
    failedImports: Number(row.failed_imports ?? 0),
    openErrorFindings: Number(row.open_errors ?? 0),
    openFindings: Number(row.open_findings ?? 0),
    models: Number(row.models ?? 0),
    missingModelContexts: Number(row.missing_model_contexts ?? 0),
    suspendedModels: Number(row.suspended_models ?? 0),
    nonConnectedModels: Number(row.non_connected_models ?? 0),
    missingSources: Number(row.missing_sources ?? 0),
    identityMissingForRequiredModel:
      Number(row.identity_linked ?? 0) === 0 && Number(row.identity_required_models ?? 0) > 0,
    modelsWithoutAssignments: Number(row.models_without_assignments ?? 0),
  });
}

function listItem(row: Row): ProfessorListItem {
  const state = attentionFromRow(row);
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    status: String(row.status),
    identityState: Number(row.identity_linked) === 1 ? 'linked' : 'missing',
    classGroups: Number(row.class_groups),
    components: Number(row.components),
    assignments: Number(row.active_assignments),
    models: Number(row.models),
    connectedModels: Number(row.connected_models),
    modelStates: strings(row.model_states),
    openFindings: Number(row.open_findings),
    attentionLevel: state.level,
    attentionReasons: state.reasons,
    lastActivityAt: row.last_activity_at ? String(row.last_activity_at) : null,
  };
}

export class D1ProfessoresRepository implements ProfessoresRepository {
  constructor(private readonly db: D1Database) {}

  async filters(): Promise<ProfessoresFilters> {
    const [years, groups, components, diagnostics] = await Promise.all([
      this.db.prepare('SELECT id, name FROM school_years ORDER BY year DESC').all<Row>(),
      this.db
        .prepare(
          `SELECT DISTINCT class_group.id, class_group.name, class_group.school_year_id
           FROM class_groups class_group JOIN teacher_assignments assignment
             ON assignment.class_group_id = class_group.id
           ORDER BY class_group.name`,
        )
        .all<Row>(),
      this.db
        .prepare(
          `SELECT DISTINCT component.id, component.name, component.school_year_id
           FROM components component JOIN teacher_assignments assignment
             ON assignment.component_id = component.id
           ORDER BY component.name`,
        )
        .all<Row>(),
      this.db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM teacher_assignments assignment
              LEFT JOIN teachers teacher ON teacher.id = assignment.teacher_id
              WHERE teacher.id IS NULL) AS orphan_assignments,
             (SELECT COUNT(*) FROM teacher_models model WHERE NOT EXISTS (
               SELECT 1 FROM teacher_assignments assignment
               WHERE assignment.teacher_id = model.teacher_id
                 AND assignment.school_year_id = model.school_year_id
                 AND assignment.status = 'active')) AS models_without_assignments,
             (SELECT COUNT(DISTINCT teacher.id) FROM teachers teacher
              JOIN teacher_assignments assignment ON assignment.teacher_id = teacher.id
              WHERE teacher.status = 'inactive' AND assignment.status = 'active') AS inactive_with_assignments,
             (SELECT COUNT(*) FROM teacher_assignments assignment
              WHERE assignment.status = 'active' AND NOT EXISTS (
                SELECT 1 FROM source_assignments source
                WHERE source.school_year_id = assignment.school_year_id
                  AND source.status = 'active' AND source.authority = 'authoritative'
                  AND source.effective_from <= date('now')
                  AND (source.effective_to IS NULL OR source.effective_to >= date('now'))
                  AND (source.teacher_id = assignment.teacher_id OR source.teacher_id IS NULL)
              )) AS assignments_without_source`,
        )
        .first<Row>(),
    ]);
    return {
      schoolYears: years.results.map((row) => ({ id: String(row.id), label: String(row.name) })),
      classGroups: groups.results.map((row) => ({
        id: String(row.id),
        label: String(row.name),
        schoolYearId: String(row.school_year_id),
      })),
      components: components.results.map((row) => ({
        id: String(row.id),
        label: String(row.name),
        schoolYearId: String(row.school_year_id),
      })),
      diagnostics: {
        orphanAssignments: Number(diagnostics?.orphan_assignments ?? 0),
        modelsWithoutAssignments: Number(diagnostics?.models_without_assignments ?? 0),
        inactiveTeachersWithActiveAssignments: Number(diagnostics?.inactive_with_assignments ?? 0),
        assignmentsWithoutSource: Number(diagnostics?.assignments_without_source ?? 0),
      },
    };
  }

  async list(query: ProfessoresListQuery): Promise<PageResult<ProfessorListItem>> {
    const where: string[] = [];
    const values: Array<string | number> = [];
    if (query.status) {
      where.push('teacher_rows.status = ?');
      values.push(query.status);
    }
    if (query.identity === 'linked') where.push('teacher_rows.identity_linked = 1');
    if (query.identity === 'missing') where.push('teacher_rows.identity_linked = 0');
    if (query.assignment === 'with') where.push('teacher_rows.active_assignments > 0');
    if (query.assignment === 'without') where.push('teacher_rows.active_assignments = 0');
    if (query.classGroupId) {
      where.push(
        `EXISTS (SELECT 1 FROM scoped_assignments scoped
          WHERE scoped.teacher_id = teacher_rows.id AND scoped.class_group_id = ? AND scoped.status = 'active')`,
      );
      values.push(query.classGroupId);
    }
    if (query.componentId) {
      where.push(
        `EXISTS (SELECT 1 FROM scoped_assignments scoped
          WHERE scoped.teacher_id = teacher_rows.id AND scoped.component_id = ? AND scoped.status = 'active')`,
      );
      values.push(query.componentId);
    }
    if (query.modelState === 'missing') {
      where.push('teacher_rows.missing_model_contexts > 0');
    } else if (query.modelState) {
      where.push(
        `EXISTS (SELECT 1 FROM scoped_models scoped
          WHERE scoped.teacher_id = teacher_rows.id AND scoped.state = ?)`,
      );
      values.push(query.modelState);
    }
    if (query.attention === 'needs_attention')
      where.push(`(${errorCondition} OR ${warningCondition})`);
    if (query.attention === 'normal') where.push(`NOT (${errorCondition} OR ${warningCondition})`);
    if (query.q) {
      where.push('LOWER(teacher_rows.display_name) LIKE ?');
      values.push(`%${query.q.toLocaleLowerCase('pt-BR')}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const bindings = [query.schoolYearId ?? null, ...values];
    const totalRow = await this.db
      .prepare(`${scopedReadModelCte} SELECT COUNT(*) AS total FROM teacher_rows ${whereSql}`)
      .bind(...bindings)
      .first<Row>();
    const rows = await this.db
      .prepare(
        `${scopedReadModelCte}
         SELECT * FROM teacher_rows ${whereSql}
         ORDER BY LOWER(display_name), id LIMIT ? OFFSET ?`,
      )
      .bind(...bindings, query.pageSize, (query.page - 1) * query.pageSize)
      .all<Row>();
    const total = Number(totalRow?.total ?? 0);
    return {
      items: rows.results.map(listItem),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async detail(teacherId: string, query: ProfessorDetailQuery): Promise<ProfessorDetail | null> {
    const teacher = await this.db
      .prepare(
        `SELECT id, display_name, status,
                CASE WHEN entra_object_id IS NULL THEN 0 ELSE 1 END AS identity_linked,
                updated_at
         FROM teachers WHERE id = ?`,
      )
      .bind(teacherId)
      .first<Row>();
    if (!teacher) return null;
    const year = query.schoolYearId ?? null;
    const [availableYears, contextRows, modelRows, findingRows, activityRows, importFacts] =
      await Promise.all([
        this.db
          .prepare(
            `SELECT year.id, year.name, year.year FROM school_years year
             WHERE EXISTS (SELECT 1 FROM teacher_assignments assignment
                           WHERE assignment.teacher_id = ? AND assignment.school_year_id = year.id)
                OR EXISTS (SELECT 1 FROM teacher_models model
                           WHERE model.teacher_id = ? AND model.school_year_id = year.id)
             ORDER BY year.year DESC`,
          )
          .bind(teacherId, teacherId)
          .all<Row>(),
        this.db
          .prepare(
            `SELECT assignment.id AS assignment_id, year.id AS school_year_id, year.year,
                    year.name AS school_year_name, class_group.id AS class_group_id,
                    class_group.name AS class_group_name, component.id AS component_id,
                    component.name AS component_name, assignment.status AS assignment_status,
                    model.state AS model_state, model.sync_enabled AS model_sync_enabled,
                    model.updated_at AS model_updated_at, model.last_reconciled_at,
                    (SELECT MAX(version.version) FROM teacher_model_versions version
                     WHERE version.teacher_model_id = model.id) AS model_version,
                    source.name AS source_name, authority.authority AS source_authority,
                    (SELECT MAX(job.updated_at) FROM import_jobs job
                     WHERE job.teacher_id = assignment.teacher_id
                       AND job.school_year_id = assignment.school_year_id) AS import_updated_at,
                    (SELECT MAX(event.occurred_at) FROM grade_events event
                     WHERE event.teacher_model_id = model.id) AS grade_updated_at
             FROM teacher_assignments assignment
             JOIN school_years year ON year.id = assignment.school_year_id
             JOIN class_groups class_group ON class_group.id = assignment.class_group_id
             JOIN components component ON component.id = assignment.component_id
             LEFT JOIN teacher_models model ON model.teacher_id = assignment.teacher_id
               AND model.school_year_id = assignment.school_year_id
             LEFT JOIN source_assignments authority ON authority.id = (
               SELECT candidate.id FROM source_assignments candidate
               WHERE candidate.school_year_id = assignment.school_year_id
                 AND candidate.status = 'active' AND candidate.authority = 'authoritative'
                 AND candidate.effective_from <= date('now')
                 AND (candidate.effective_to IS NULL OR candidate.effective_to >= date('now'))
                 AND (candidate.teacher_id = assignment.teacher_id OR candidate.teacher_id IS NULL)
               ORDER BY CASE WHEN candidate.teacher_id IS NULL THEN 1 ELSE 0 END,
                        candidate.updated_at DESC LIMIT 1)
             LEFT JOIN data_sources source ON source.id = authority.data_source_id
             WHERE assignment.teacher_id = ? AND (? IS NULL OR assignment.school_year_id = ?)
             ORDER BY year.year DESC, class_group.name, component.name, assignment.id`,
          )
          .bind(teacherId, year, year)
          .all<Row>(),
        this.db
          .prepare(
            `SELECT model.id, year.id AS school_year_id, year.name AS school_year_name,
                    model.state, model.sync_enabled, model.drive_item_id,
                    model.updated_at, model.last_reconciled_at,
                    (SELECT MAX(version.version) FROM teacher_model_versions version
                     WHERE version.teacher_model_id = model.id) AS current_version,
                    (SELECT COUNT(*) FROM teacher_assignments assignment
                     WHERE assignment.teacher_id = model.teacher_id
                       AND assignment.school_year_id = model.school_year_id
                       AND assignment.status = 'active') AS assignments,
                    (SELECT COUNT(DISTINCT finding.id) FROM import_jobs job
                     JOIN import_findings finding ON finding.import_job_id = job.id
                     LEFT JOIN import_finding_resolutions resolution
                       ON resolution.import_finding_id = finding.id
                     WHERE job.teacher_id = model.teacher_id
                       AND job.school_year_id = model.school_year_id
                       AND resolution.id IS NULL) AS open_findings,
                    (SELECT MAX(job.updated_at) FROM import_jobs job
                     WHERE job.teacher_id = model.teacher_id
                       AND job.school_year_id = model.school_year_id) AS import_updated_at,
                    (SELECT MAX(event.occurred_at) FROM grade_events event
                     WHERE event.teacher_model_id = model.id) AS grade_updated_at
             FROM teacher_models model JOIN school_years year ON year.id = model.school_year_id
             WHERE model.teacher_id = ? AND (? IS NULL OR model.school_year_id = ?)
             ORDER BY year.year DESC`,
          )
          .bind(teacherId, year, year)
          .all<Row>(),
        this.db
          .prepare(
            `SELECT finding.severity, finding.code, finding.created_at,
                    year.id AS school_year_id, year.name AS school_year_name,
                    job.state AS import_state
             FROM import_jobs job JOIN school_years year ON year.id = job.school_year_id
             JOIN import_findings finding ON finding.import_job_id = job.id
             LEFT JOIN import_finding_resolutions resolution
               ON resolution.import_finding_id = finding.id
             WHERE job.teacher_id = ? AND resolution.id IS NULL
               AND (? IS NULL OR job.school_year_id = ?)
             ORDER BY CASE finding.severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
                      finding.created_at DESC LIMIT 100`,
          )
          .bind(teacherId, year, year)
          .all<Row>(),
        this.db
          .prepare(
            `SELECT kind, label, status, occurred_at FROM (
               SELECT 'model' AS kind, 'Modelo · ' || year.name AS label,
                      model.state AS status, model.updated_at AS occurred_at
               FROM teacher_models model JOIN school_years year ON year.id = model.school_year_id
               WHERE model.teacher_id = ? AND (? IS NULL OR model.school_year_id = ?)
               UNION ALL
               SELECT 'import', 'Importação · ' || year.name, job.state, job.updated_at
               FROM import_jobs job JOIN school_years year ON year.id = job.school_year_id
               WHERE job.teacher_id = ? AND (? IS NULL OR job.school_year_id = ?)
               UNION ALL
               SELECT 'reconciliation', 'Reconciliação · ' || year.name, run.status, run.started_at
               FROM reconciliation_runs run JOIN teacher_models model ON model.id = run.teacher_model_id
               JOIN school_years year ON year.id = model.school_year_id
               WHERE model.teacher_id = ? AND (? IS NULL OR model.school_year_id = ?)
               UNION ALL
               SELECT 'grade', 'Atividade de notas · ' || year.name, event.status, event.occurred_at
               FROM grade_events event JOIN teacher_models model ON model.id = event.teacher_model_id
               JOIN school_years year ON year.id = model.school_year_id
               WHERE model.teacher_id = ? AND (? IS NULL OR model.school_year_id = ?)
               UNION ALL
               SELECT 'source', 'Fonte · ' || year.name, source.authority, source.updated_at
               FROM source_assignments source JOIN school_years year ON year.id = source.school_year_id
               WHERE source.teacher_id = ? AND (? IS NULL OR source.school_year_id = ?)
             ) activity ORDER BY occurred_at DESC LIMIT 20`,
          )
          .bind(
            teacherId,
            year,
            year,
            teacherId,
            year,
            year,
            teacherId,
            year,
            year,
            teacherId,
            year,
            year,
            teacherId,
            year,
            year,
          )
          .all<Row>(),
        this.db
          .prepare(
            `SELECT COUNT(DISTINCT CASE WHEN job.state = 'failed' THEN job.id END) AS failed_imports,
                    COUNT(DISTINCT CASE WHEN finding.severity = 'error' AND resolution.id IS NULL
                                  THEN finding.id END) AS open_errors
             FROM import_jobs job
             LEFT JOIN import_findings finding ON finding.import_job_id = job.id
             LEFT JOIN import_finding_resolutions resolution
               ON resolution.import_finding_id = finding.id
             WHERE job.teacher_id = ? AND (? IS NULL OR job.school_year_id = ?)`,
          )
          .bind(teacherId, year, year)
          .first<Row>(),
      ]);

    const contexts: ProfessorAssignmentContext[] = contextRows.results.map((row) => ({
      assignmentId: String(row.assignment_id),
      schoolYearId: String(row.school_year_id),
      schoolYear: Number(row.year),
      schoolYearName: String(row.school_year_name),
      classGroupId: String(row.class_group_id),
      classGroupName: String(row.class_group_name),
      componentId: String(row.component_id),
      componentName: String(row.component_name),
      assignmentStatus: String(row.assignment_status),
      modelState: row.model_state ? String(row.model_state) : null,
      modelVersion: row.model_version === null ? null : Number(row.model_version),
      modelSyncEnabled: Number(row.model_sync_enabled ?? 0) === 1,
      sourceName: row.source_name ? String(row.source_name) : null,
      sourceAuthority: row.source_authority ? String(row.source_authority) : null,
      lastActivityAt: latest([
        row.model_updated_at ? String(row.model_updated_at) : null,
        row.last_reconciled_at ? String(row.last_reconciled_at) : null,
        row.import_updated_at ? String(row.import_updated_at) : null,
        row.grade_updated_at ? String(row.grade_updated_at) : null,
      ]),
    }));
    const models: ProfessorModel[] = modelRows.results.map((row) => ({
      schoolYearId: String(row.school_year_id),
      schoolYearName: String(row.school_year_name),
      state: String(row.state),
      currentVersion: row.current_version === null ? null : Number(row.current_version),
      fileAvailable: Boolean(row.drive_item_id),
      syncEnabled: Number(row.sync_enabled) === 1,
      lastReconciledAt: row.last_reconciled_at ? String(row.last_reconciled_at) : null,
      lastActivityAt: latest([
        row.updated_at ? String(row.updated_at) : null,
        row.last_reconciled_at ? String(row.last_reconciled_at) : null,
        row.import_updated_at ? String(row.import_updated_at) : null,
        row.grade_updated_at ? String(row.grade_updated_at) : null,
      ]),
      assignments: Number(row.assignments),
      openFindings: Number(row.open_findings),
    }));
    const pending: ProfessorPending[] = findingRows.results.map((row) => ({
      severity: String(row.severity) as 'info' | 'warning' | 'error',
      code: String(row.code),
      context: `Importação · ${String(row.school_year_name)} · ${String(row.import_state)}`,
      status: 'open',
      schoolYearId: String(row.school_year_id),
      classGroupId: null,
      classGroupName: null,
      componentName: null,
      occurredAt: String(row.created_at),
    }));
    const pushPending = (item: ProfessorPending) => {
      if (
        !pending.some((current) => current.code === item.code && current.context === item.context)
      )
        pending.push(item);
    };
    const activeContexts = contexts.filter((context) => context.assignmentStatus === 'active');
    if (teacher.status === 'inactive' && activeContexts.length > 0)
      pushPending({
        severity: 'warning',
        code: 'PROFESSOR_INATIVO_COM_ATRIBUICAO',
        context: 'Professor inativo com atribuição ativa',
        status: 'open',
        schoolYearId: null,
        classGroupId: null,
        classGroupName: null,
        componentName: null,
        occurredAt: null,
      });
    for (const context of activeContexts) {
      if (!context.modelState)
        pushPending({
          severity: 'warning',
          code: 'MODELO_AUSENTE',
          context: `${context.schoolYearName} · ${context.classGroupName} · ${context.componentName}`,
          status: 'open',
          schoolYearId: context.schoolYearId,
          classGroupId: context.classGroupId,
          classGroupName: context.classGroupName,
          componentName: context.componentName,
          occurredAt: null,
        });
      if (!context.sourceName)
        pushPending({
          severity: 'warning',
          code: 'FONTE_AUTORITATIVA_AUSENTE',
          context: `${context.schoolYearName} · ${context.classGroupName} · ${context.componentName}`,
          status: 'open',
          schoolYearId: context.schoolYearId,
          classGroupId: context.classGroupId,
          classGroupName: context.classGroupName,
          componentName: context.componentName,
          occurredAt: null,
        });
    }
    for (const model of models) {
      if (model.state === 'suspended')
        pushPending({
          severity: 'error',
          code: 'MODELO_SUSPENSO',
          context: model.schoolYearName,
          status: 'open',
          schoolYearId: model.schoolYearId,
          classGroupId: null,
          classGroupName: null,
          componentName: null,
          occurredAt: model.lastActivityAt,
        });
      if (model.assignments === 0)
        pushPending({
          severity: 'warning',
          code: 'MODELO_SEM_ATRIBUICAO',
          context: model.schoolYearName,
          status: 'open',
          schoolYearId: model.schoolYearId,
          classGroupId: null,
          classGroupName: null,
          componentName: null,
          occurredAt: model.lastActivityAt,
        });
    }
    const requiresIdentity = models.some((model) =>
      ['validated', 'ready_to_share', 'shared', 'connected'].includes(model.state),
    );
    if (Number(teacher.identity_linked) === 0 && requiresIdentity)
      pushPending({
        severity: 'warning',
        code: 'IDENTIDADE_INSTITUCIONAL_AUSENTE',
        context: 'Identidade necessária para o estágio atual do modelo',
        status: 'open',
        schoolYearId: null,
        classGroupId: null,
        classGroupName: null,
        componentName: null,
        occurredAt: null,
      });

    const activity: ProfessorActivity[] = activityRows.results.map((row) => ({
      kind: String(row.kind) as ProfessorActivity['kind'],
      label: String(row.label),
      status: String(row.status),
      occurredAt: String(row.occurred_at),
    }));
    const uniqueGroups = new Set(activeContexts.map((context) => context.classGroupId)).size;
    const uniqueComponents = new Set(activeContexts.map((context) => context.componentId)).size;
    const openErrors = pending.filter((item) => item.severity === 'error').length;
    const state = deriveOperationalAttention({
      activeAssignments: activeContexts.length,
      teacherInactive: teacher.status === 'inactive',
      failedImports: Number(importFacts?.failed_imports ?? 0),
      openErrorFindings: Number(importFacts?.open_errors ?? openErrors),
      openFindings: findingRows.results.length,
      models: models.length,
      missingModelContexts: new Set(
        activeContexts
          .filter((context) => !context.modelState)
          .map((context) => context.schoolYearId),
      ).size,
      suspendedModels: models.filter((model) => model.state === 'suspended').length,
      nonConnectedModels: models.filter((model) => model.state !== 'connected').length,
      missingSources: activeContexts.filter((context) => !context.sourceName).length,
      identityMissingForRequiredModel: Number(teacher.identity_linked) === 0 && requiresIdentity,
      modelsWithoutAssignments: models.filter((model) => model.assignments === 0).length,
    });
    return {
      teacher: {
        id: String(teacher.id),
        displayName: String(teacher.display_name),
        status: String(teacher.status),
        identityState: Number(teacher.identity_linked) === 1 ? 'linked' : 'missing',
        attentionLevel: state.level,
        attentionReasons: state.reasons,
        lastActivityAt: activity[0]?.occurredAt ?? String(teacher.updated_at),
      },
      selectedSchoolYearId: query.schoolYearId ?? null,
      availableSchoolYears: availableYears.results.map((row) => ({
        id: String(row.id),
        label: String(row.name),
      })),
      summary: {
        classGroups: uniqueGroups,
        components: uniqueComponents,
        assignments: activeContexts.length,
        models: models.length,
        connectedModels: models.filter((model) => model.state === 'connected').length,
        openFindings: pending.length,
      },
      contexts,
      models,
      pending,
      activity,
    };
  }
}
