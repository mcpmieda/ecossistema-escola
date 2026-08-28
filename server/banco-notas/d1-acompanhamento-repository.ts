import type {
  AcompanhamentoDetail,
  AcompanhamentoListItem,
  AcompanhamentoListQuery,
  AcompanhamentoListResult,
  AcompanhamentoRepository,
  AcompanhamentoSummary,
} from '../../shared/banco-notas-acompanhamento';
import { deriveOperationalAttention } from './operational-attention';

type Row = Record<string, string | number | null>;

const effectiveAssignmentSql = `
  SELECT assignment.id
  FROM source_assignments assignment
  WHERE assignment.school_year_id = ta.school_year_id
    AND assignment.status = 'active'
    AND assignment.authority = 'authoritative'
    AND assignment.effective_from <= date('now')
    AND (assignment.effective_to IS NULL OR assignment.effective_to >= date('now'))
    AND (assignment.teacher_id = ta.teacher_id OR assignment.teacher_id IS NULL)
  ORDER BY CASE WHEN assignment.teacher_id IS NULL THEN 1 ELSE 0 END,
           assignment.updated_at DESC
  LIMIT 1`;

const operationalCte = `
WITH import_state AS (
  SELECT job.school_year_id,
         job.teacher_id,
         MAX(job.updated_at) AS import_updated_at,
         COUNT(DISTINCT CASE WHEN job.state = 'failed' THEN job.id END) AS failed_imports,
         SUM(CASE WHEN finding.severity = 'error' AND resolution.id IS NULL THEN 1 ELSE 0 END) AS open_errors,
         SUM(CASE WHEN finding.id IS NOT NULL AND resolution.id IS NULL THEN 1 ELSE 0 END) AS open_findings
  FROM import_jobs job
  LEFT JOIN import_findings finding ON finding.import_job_id = job.id
  LEFT JOIN import_finding_resolutions resolution ON resolution.import_finding_id = finding.id
  GROUP BY job.school_year_id, job.teacher_id
), operational AS (
  SELECT cg.id AS class_group_id,
         cg.name AS class_group_name,
         sy.id AS school_year_id,
         sy.year AS school_year,
         sy.name AS school_year_name,
         teacher.id AS teacher_id,
         teacher.display_name AS teacher_name,
         teacher.entra_object_id AS teacher_entra_object_id,
         GROUP_CONCAT(DISTINCT component.name) AS components,
         model.id AS model_id,
         model.state AS model_state,
         model.sync_enabled AS model_sync_enabled,
         model.updated_at AS model_updated_at,
         model.last_reconciled_at,
         (${effectiveAssignmentSql}) AS source_assignment_id,
         COALESCE(import_state.failed_imports, 0) AS failed_imports,
         COALESCE(import_state.open_errors, 0) AS open_errors,
         COALESCE(import_state.open_findings, 0) AS open_findings,
         import_state.import_updated_at
  FROM teacher_assignments ta
  JOIN class_groups cg ON cg.id = ta.class_group_id
  JOIN school_years sy ON sy.id = ta.school_year_id
  JOIN teachers teacher ON teacher.id = ta.teacher_id
  JOIN components component ON component.id = ta.component_id
  LEFT JOIN teacher_models model
    ON model.school_year_id = ta.school_year_id AND model.teacher_id = ta.teacher_id
  LEFT JOIN import_state
    ON import_state.school_year_id = ta.school_year_id AND import_state.teacher_id = ta.teacher_id
  WHERE ta.status = 'active'
  GROUP BY cg.id, sy.id, teacher.id, model.id, import_state.school_year_id, import_state.teacher_id
)`;

function bool(value: string | number | null | undefined): boolean {
  return Number(value ?? 0) === 1;
}

function attention(row: Row) {
  return deriveOperationalAttention({
    activeAssignments: 1,
    failedImports: Number(row.failed_imports ?? 0),
    openErrorFindings: Number(row.open_errors ?? 0),
    openFindings: Number(row.open_findings ?? 0),
    models: row.model_id ? 1 : 0,
    missingModelContexts: row.model_id ? 0 : 1,
    suspendedModels: row.model_state === 'suspended' ? 1 : 0,
    nonConnectedModels: row.model_id && row.model_state !== 'connected' ? 1 : 0,
    missingSources: row.source_assignment_id ? 0 : 1,
    identityMissingForRequiredModel:
      !row.teacher_entra_object_id &&
      ['validated', 'ready_to_share', 'shared', 'connected'].includes(String(row.model_state)),
  });
}

function item(row: Row): AcompanhamentoListItem {
  const state = attention(row);
  return {
    classGroupId: String(row.class_group_id),
    classGroupName: String(row.class_group_name),
    schoolYearId: String(row.school_year_id),
    schoolYear: Number(row.school_year),
    schoolYearName: String(row.school_year_name),
    teacherId: String(row.teacher_id),
    teacherName: String(row.teacher_name),
    components: String(row.components ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    modelState: row.model_state ? String(row.model_state) : null,
    sourceName: row.source_name ? String(row.source_name) : null,
    sourceType: row.source_type ? String(row.source_type) : null,
    syncEnabled: bool(row.model_sync_enabled ?? row.source_sync_enabled),
    openFindings: Number(row.open_findings ?? 0),
    lastActivityAt: row.last_activity_at ? String(row.last_activity_at) : null,
    attentionLevel: state.level,
    attentionReasons: state.reasons,
  };
}

export class D1AcompanhamentoRepository implements AcompanhamentoRepository {
  constructor(private readonly db: D1Database) {}

  async summary(): Promise<AcompanhamentoSummary> {
    const totals = await this.db
      .prepare(
        `${operationalCte}
         SELECT COUNT(DISTINCT class_group_id) AS class_groups,
                COUNT(*) AS tracked_items,
                COUNT(DISTINCT teacher_id) AS teachers,
                COUNT(DISTINCT model_id) AS models,
                COUNT(DISTINCT CASE WHEN model_state = 'connected' THEN model_id END) AS connected_models,
                COUNT(DISTINCT CASE WHEN model_sync_enabled = 1 THEN model_id END) AS sync_enabled,
                (SELECT COUNT(*) FROM import_findings finding
                 LEFT JOIN import_finding_resolutions resolution
                   ON resolution.import_finding_id = finding.id
                 WHERE resolution.id IS NULL) AS open_findings,
                SUM(CASE WHEN failed_imports > 0 OR open_findings > 0 OR model_state = 'suspended'
                              OR model_id IS NULL OR source_assignment_id IS NULL
                              OR (teacher_entra_object_id IS NULL
                                  AND model_state IN ('validated', 'ready_to_share'))
                         THEN 1 ELSE 0 END) AS needs_attention
         FROM operational`,
      )
      .first<Row>();

    const states = await this.db
      .prepare(
        `SELECT state, COUNT(*) AS total
         FROM teacher_models
         GROUP BY state
         ORDER BY state`,
      )
      .all<Row>();

    const activity = await this.db
      .prepare(
        `SELECT kind, label, status, occurred_at
         FROM (
           SELECT 'model' AS kind, teacher.display_name AS label, model.state AS status,
                  model.updated_at AS occurred_at
           FROM teacher_models model JOIN teachers teacher ON teacher.id = model.teacher_id
           UNION ALL
           SELECT 'import', teacher.display_name, job.state, job.updated_at
           FROM import_jobs job LEFT JOIN teachers teacher ON teacher.id = job.teacher_id
           UNION ALL
           SELECT 'reconciliation', teacher.display_name, run.status, run.started_at
           FROM reconciliation_runs run
           JOIN teacher_models model ON model.id = run.teacher_model_id
           JOIN teachers teacher ON teacher.id = model.teacher_id
         ) recent
         ORDER BY occurred_at DESC
         LIMIT 10`,
      )
      .all<Row>();

    const schoolYears = await this.db
      .prepare('SELECT id, name FROM school_years ORDER BY year DESC')
      .all<Row>();
    const classGroups = await this.db
      .prepare(
        `SELECT DISTINCT cg.id, cg.name, cg.school_year_id
         FROM class_groups cg
         JOIN teacher_assignments assignment ON assignment.class_group_id = cg.id
         WHERE assignment.status = 'active'
         ORDER BY cg.name`,
      )
      .all<Row>();
    const teachers = await this.db
      .prepare(
        `SELECT DISTINCT teacher.id, teacher.display_name
         FROM teachers teacher
         JOIN teacher_assignments assignment ON assignment.teacher_id = teacher.id
         WHERE assignment.status = 'active'
         ORDER BY teacher.display_name`,
      )
      .all<Row>();

    return {
      classGroups: Number(totals?.class_groups ?? 0),
      trackedItems: Number(totals?.tracked_items ?? 0),
      teachers: Number(totals?.teachers ?? 0),
      models: Number(totals?.models ?? 0),
      connectedModels: Number(totals?.connected_models ?? 0),
      syncEnabled: Number(totals?.sync_enabled ?? 0),
      openFindings: Number(totals?.open_findings ?? 0),
      needsAttention: Number(totals?.needs_attention ?? 0),
      modelStates: states.results.map((row) => ({
        state: String(row.state),
        total: Number(row.total),
      })),
      filters: {
        schoolYears: schoolYears.results.map((row) => ({
          id: String(row.id),
          label: String(row.name),
        })),
        classGroups: classGroups.results.map((row) => ({
          id: String(row.id),
          label: String(row.name),
          schoolYearId: String(row.school_year_id),
        })),
        teachers: teachers.results.map((row) => ({
          id: String(row.id),
          label: String(row.display_name),
        })),
      },
      recentActivity: activity.results.map((row) => ({
        kind: String(row.kind) as 'model' | 'import' | 'reconciliation',
        label: String(row.label ?? 'Atividade do Banco de Notas'),
        status: String(row.status),
        occurredAt: String(row.occurred_at),
      })),
    };
  }

  async list(query: AcompanhamentoListQuery): Promise<AcompanhamentoListResult> {
    const where: string[] = [];
    const bindings: Array<string | number> = [];
    const add = (clause: string, value?: string | number) => {
      where.push(clause);
      if (value !== undefined) bindings.push(value);
    };
    if (query.schoolYearId) add('operational.school_year_id = ?', query.schoolYearId);
    if (query.classGroupId) add('operational.class_group_id = ?', query.classGroupId);
    if (query.teacherId) add('operational.teacher_id = ?', query.teacherId);
    if (query.modelState === 'missing') add('operational.model_id IS NULL');
    else if (query.modelState) add('operational.model_state = ?', query.modelState);
    if (query.sync === 'enabled') add('operational.model_sync_enabled = 1');
    if (query.sync === 'disabled') add('COALESCE(operational.model_sync_enabled, 0) = 0');
    if (query.attention === 'needs_attention') {
      add(`(operational.failed_imports > 0 OR operational.open_errors > 0
            OR operational.model_state = 'suspended' OR operational.model_id IS NULL
            OR operational.source_assignment_id IS NULL)`);
    }
    if (query.attention === 'normal') {
      add(`(operational.failed_imports = 0 AND operational.open_errors = 0
            AND operational.model_state <> 'suspended' AND operational.model_id IS NOT NULL
            AND operational.source_assignment_id IS NOT NULL)`);
    }
    if (query.q) {
      add(
        `(LOWER(operational.class_group_name) LIKE ? OR LOWER(operational.teacher_name) LIKE ?
          OR LOWER(operational.components) LIKE ?)`,
      );
      const pattern = `%${query.q.toLocaleLowerCase('pt-BR')}%`;
      bindings.push(pattern, pattern, pattern);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const totalRow = await this.db
      .prepare(`${operationalCte} SELECT COUNT(*) AS total FROM operational ${whereSql}`)
      .bind(...bindings)
      .first<Row>();
    const offset = (query.page - 1) * query.pageSize;
    const rows = await this.db
      .prepare(
        `${operationalCte}
         SELECT operational.*, source.id AS source_id, source.name AS source_name, source.type AS source_type,
                assignment.sync_enabled AS source_sync_enabled,
                MAX(COALESCE(operational.model_updated_at, ''),
                    COALESCE(operational.import_updated_at, ''),
                    COALESCE(operational.last_reconciled_at, '')) AS last_activity_at
         FROM operational
         LEFT JOIN source_assignments assignment ON assignment.id = operational.source_assignment_id
         LEFT JOIN data_sources source ON source.id = assignment.data_source_id
         ${whereSql}
         GROUP BY operational.class_group_id, operational.teacher_id
         ORDER BY operational.school_year DESC, operational.class_group_name, operational.teacher_name
         LIMIT ? OFFSET ?`,
      )
      .bind(...bindings, query.pageSize, offset)
      .all<Row>();
    const total = Number(totalRow?.total ?? 0);
    return {
      items: rows.results.map(item),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async detail(classGroupId: string): Promise<AcompanhamentoDetail | null> {
    const group = await this.db
      .prepare(
        `SELECT cg.id, cg.name, cg.status, sy.id AS school_year_id, sy.year, sy.name AS school_year_name
         FROM class_groups cg JOIN school_years sy ON sy.id = cg.school_year_id
         WHERE cg.id = ?`,
      )
      .bind(classGroupId)
      .first<Row>();
    if (!group) return null;

    const assignments = await this.db
      .prepare(
        `SELECT teacher.id AS teacher_id, teacher.display_name AS teacher_name,
                component.name AS component_name, ta.status AS assignment_status,
                model.state AS model_state, model.sync_enabled AS model_sync_enabled,
                model.last_reconciled_at,
                source.name AS source_name, source.type AS source_type,
                authority.authority AS source_authority,
                MAX(COALESCE(model.updated_at, ''), COALESCE(model.last_reconciled_at, '')) AS last_activity_at
         FROM teacher_assignments ta
         JOIN teachers teacher ON teacher.id = ta.teacher_id
         JOIN components component ON component.id = ta.component_id
         LEFT JOIN teacher_models model
           ON model.school_year_id = ta.school_year_id AND model.teacher_id = ta.teacher_id
         LEFT JOIN source_assignments authority
           ON authority.id = (
             SELECT candidate.id FROM source_assignments candidate
             WHERE candidate.school_year_id = ta.school_year_id
               AND candidate.status = 'active' AND candidate.authority = 'authoritative'
               AND candidate.effective_from <= date('now')
               AND (candidate.effective_to IS NULL OR candidate.effective_to >= date('now'))
               AND (candidate.teacher_id = ta.teacher_id OR candidate.teacher_id IS NULL)
              ORDER BY CASE WHEN candidate.teacher_id IS NULL THEN 1 ELSE 0 END,
                      candidate.updated_at DESC LIMIT 1
           )
         LEFT JOIN data_sources source ON source.id = authority.data_source_id
         WHERE ta.class_group_id = ?
         ORDER BY teacher.display_name, component.name`,
      )
      .bind(classGroupId)
      .all<Row>();

    const students = await this.db
      .prepare(
        `WITH class_grade_keys AS (
           SELECT DISTINCT mapping.grade_key
           FROM teacher_assignments ta
           JOIN teacher_models model
             ON model.school_year_id = ta.school_year_id AND model.teacher_id = ta.teacher_id
           JOIN teacher_model_versions version ON version.teacher_model_id = model.id
             AND version.version = (
               SELECT MAX(latest.version) FROM teacher_model_versions latest
               WHERE latest.teacher_model_id = model.id
             )
           JOIN cell_mappings mapping ON mapping.teacher_model_version_id = version.id
           JOIN school_years sy ON sy.id = ta.school_year_id
           WHERE ta.class_group_id = ?
             AND mapping.grade_key LIKE CAST(sy.year AS TEXT) || '|' || ta.class_group_id || '|%'
         )
         SELECT student.id, student.display_name,
                COUNT(DISTINCT snapshot.field) AS fields_available,
                SUM(CASE WHEN snapshot.is_absent = 0 THEN 1 ELSE 0 END) AS present_values,
                SUM(CASE WHEN snapshot.is_absent = 1 THEN 1 ELSE 0 END) AS absent_values,
                SUM(CASE WHEN snapshot.is_absent = 0 AND snapshot.value_numeric = 0 THEN 1 ELSE 0 END) AS numeric_zero_values,
                MAX(snapshot.updated_at) AS last_updated_at
         FROM class_grade_keys key
         JOIN students student ON key.grade_key LIKE '%|' || student.id
         LEFT JOIN grade_snapshots snapshot ON snapshot.grade_key = key.grade_key
         GROUP BY student.id, student.display_name
         ORDER BY student.display_name`,
      )
      .bind(classGroupId)
      .all<Row>();

    const findings = await this.db
      .prepare(
        `SELECT finding.severity, finding.code,
                CASE WHEN resolution.id IS NULL THEN 'open' ELSE 'resolved' END AS status,
                job.state AS import_state, finding.created_at AS occurred_at
         FROM teacher_assignments ta
         JOIN import_jobs job
           ON job.school_year_id = ta.school_year_id AND job.teacher_id = ta.teacher_id
         JOIN import_findings finding ON finding.import_job_id = job.id
         LEFT JOIN import_finding_resolutions resolution ON resolution.import_finding_id = finding.id
         WHERE ta.class_group_id = ?
         GROUP BY finding.id
         ORDER BY CASE finding.severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
                  finding.created_at DESC
         LIMIT 100`,
      )
      .bind(classGroupId)
      .all<Row>();

    const noteTotals = await this.db
      .prepare(
        `SELECT COUNT(*) AS snapshots,
                SUM(CASE WHEN snapshot.is_absent = 0 THEN 1 ELSE 0 END) AS present_values,
                SUM(CASE WHEN snapshot.is_absent = 1 THEN 1 ELSE 0 END) AS absent_values,
                SUM(CASE WHEN snapshot.is_absent = 0 AND snapshot.value_numeric = 0 THEN 1 ELSE 0 END) AS numeric_zero_values,
                MAX(snapshot.updated_at) AS last_updated_at
         FROM grade_snapshots snapshot
         JOIN school_years sy ON snapshot.grade_key LIKE CAST(sy.year AS TEXT) || '|%'
         WHERE snapshot.grade_key LIKE CAST(sy.year AS TEXT) || '|' || ? || '|%'`,
      )
      .bind(classGroupId)
      .first<Row>();

    const noteFields = await this.db
      .prepare(
        `SELECT snapshot.field, COUNT(*) AS snapshots,
                SUM(CASE WHEN snapshot.is_absent = 0 THEN 1 ELSE 0 END) AS present_values,
                SUM(CASE WHEN snapshot.is_absent = 1 THEN 1 ELSE 0 END) AS absent_values,
                SUM(CASE WHEN snapshot.is_absent = 0 AND snapshot.value_numeric = 0 THEN 1 ELSE 0 END) AS numeric_zero_values,
                MAX(snapshot.updated_at) AS last_updated_at
         FROM grade_snapshots snapshot
         JOIN school_years sy ON snapshot.grade_key LIKE CAST(sy.year AS TEXT) || '|%'
         WHERE snapshot.grade_key LIKE CAST(sy.year AS TEXT) || '|' || ? || '|%'
         GROUP BY snapshot.field
         ORDER BY snapshot.field`,
      )
      .bind(classGroupId)
      .all<Row>();

    return {
      classGroup: {
        id: String(group.id),
        name: String(group.name),
        status: String(group.status),
        schoolYearId: String(group.school_year_id),
        schoolYear: Number(group.year),
        schoolYearName: String(group.school_year_name),
      },
      assignments: assignments.results.map((row) => ({
        teacherId: String(row.teacher_id),
        teacherName: String(row.teacher_name),
        componentName: String(row.component_name),
        assignmentStatus: String(row.assignment_status),
        modelState: row.model_state ? String(row.model_state) : null,
        modelSyncEnabled: bool(row.model_sync_enabled),
        sourceName: row.source_name ? String(row.source_name) : null,
        sourceType: row.source_type ? String(row.source_type) : null,
        sourceAuthority: row.source_authority ? String(row.source_authority) : null,
        lastReconciledAt: row.last_reconciled_at ? String(row.last_reconciled_at) : null,
        lastActivityAt: row.last_activity_at ? String(row.last_activity_at) : null,
      })),
      students: students.results.map((row) => ({
        id: String(row.id),
        displayName: String(row.display_name),
        fieldsAvailable: Number(row.fields_available ?? 0),
        presentValues: Number(row.present_values ?? 0),
        absentValues: Number(row.absent_values ?? 0),
        numericZeroValues: Number(row.numeric_zero_values ?? 0),
        lastUpdatedAt: row.last_updated_at ? String(row.last_updated_at) : null,
      })),
      findings: findings.results.map((row) => ({
        severity: String(row.severity) as 'info' | 'warning' | 'error',
        code: String(row.code),
        status: String(row.status) as 'open' | 'resolved',
        importState: String(row.import_state),
        occurredAt: String(row.occurred_at),
      })),
      notes: {
        snapshots: Number(noteTotals?.snapshots ?? 0),
        presentValues: Number(noteTotals?.present_values ?? 0),
        absentValues: Number(noteTotals?.absent_values ?? 0),
        numericZeroValues: Number(noteTotals?.numeric_zero_values ?? 0),
        lastUpdatedAt: noteTotals?.last_updated_at ? String(noteTotals.last_updated_at) : null,
        byField: noteFields.results.map((row) => ({
          field: String(row.field),
          snapshots: Number(row.snapshots ?? 0),
          presentValues: Number(row.present_values ?? 0),
          absentValues: Number(row.absent_values ?? 0),
          numericZeroValues: Number(row.numeric_zero_values ?? 0),
          lastUpdatedAt: row.last_updated_at ? String(row.last_updated_at) : null,
        })),
      },
    };
  }
}
