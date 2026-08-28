import type {
  AlunoDetail,
  AlunoListItem,
  AlunosListQuery,
  PageResult,
  TurmaDetail,
  TurmaListItem,
  TurmasAlunosFilters,
  TurmasAlunosRepository,
  TurmasListQuery,
} from '../../shared/banco-notas-turmas-alunos';
import { D1AcompanhamentoRepository } from './d1-acompanhamento-repository';

type Row = Record<string, string | number | null>;

// A roster row exists only when a mapping in the latest model version has the exact,
// canonical gradeKey for an active assignment. This intentionally avoids fuzzy parsing.
export const canonicalRosterCte = `
WITH latest_model_versions AS (
  SELECT version.*
  FROM teacher_model_versions version
  WHERE version.version = (
    SELECT MAX(candidate.version)
    FROM teacher_model_versions candidate
    WHERE candidate.teacher_model_id = version.teacher_model_id
  )
), canonical_roster AS (
  SELECT DISTINCT sy.id AS school_year_id, sy.year AS school_year,
         sy.name AS school_year_name, cg.id AS class_group_id,
         cg.name AS class_group_name, student.id AS student_id,
         student.display_name, student.status AS student_status,
         component.id AS component_id, component.name AS component_name,
         teacher.id AS teacher_id, teacher.display_name AS teacher_name,
         mapping.grade_key, mapping.field
  FROM teacher_models model
  JOIN latest_model_versions version ON version.teacher_model_id = model.id
  JOIN cell_mappings mapping ON mapping.teacher_model_version_id = version.id
  JOIN teacher_assignments assignment
    ON assignment.school_year_id = model.school_year_id
   AND assignment.teacher_id = model.teacher_id
   AND assignment.status = 'active'
  JOIN school_years sy ON sy.id = assignment.school_year_id
  JOIN class_groups cg ON cg.id = assignment.class_group_id
  JOIN components component ON component.id = assignment.component_id
  JOIN teachers teacher ON teacher.id = assignment.teacher_id
  JOIN students student
    ON mapping.grade_key = CAST(sy.year AS TEXT) || '|' || cg.id || '|' || component.id || '|' || student.id
  WHERE model.state <> 'archived'
)`;

function strings(value: Row[string] | undefined): string[] {
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

function page<T>(
  items: T[],
  query: { page: number; pageSize: number },
  total: number,
): PageResult<T> {
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  };
}

export class D1TurmasAlunosRepository implements TurmasAlunosRepository {
  constructor(private readonly db: D1Database) {}

  async filters(): Promise<TurmasAlunosFilters> {
    const [years, groups, teachers, components] = await Promise.all([
      this.db.prepare('SELECT id, name FROM school_years ORDER BY year DESC').all<Row>(),
      this.db.prepare('SELECT id, name, school_year_id FROM class_groups ORDER BY name').all<Row>(),
      this.db
        .prepare(
          `SELECT DISTINCT teacher.id, teacher.display_name FROM teachers teacher
        JOIN teacher_assignments assignment ON assignment.teacher_id = teacher.id
        WHERE assignment.status = 'active' ORDER BY teacher.display_name`,
        )
        .all<Row>(),
      this.db
        .prepare(
          `SELECT DISTINCT component.id, component.name, component.school_year_id FROM components component
        JOIN teacher_assignments assignment ON assignment.component_id = component.id
        WHERE assignment.status = 'active' ORDER BY component.name`,
        )
        .all<Row>(),
    ]);
    return {
      schoolYears: years.results.map((row) => ({ id: String(row.id), label: String(row.name) })),
      classGroups: groups.results.map((row) => ({
        id: String(row.id),
        label: String(row.name),
        schoolYearId: String(row.school_year_id),
      })),
      teachers: teachers.results.map((row) => ({
        id: String(row.id),
        label: String(row.display_name),
      })),
      components: components.results.map((row) => ({
        id: String(row.id),
        label: String(row.name),
        schoolYearId: String(row.school_year_id),
      })),
    };
  }

  async listTurmas(query: TurmasListQuery): Promise<PageResult<TurmaListItem>> {
    const where: string[] = [];
    const values: Array<string | number> = [];
    if (query.schoolYearId) {
      where.push('cg.school_year_id = ?');
      values.push(query.schoolYearId);
    }
    if (query.status) {
      where.push('cg.status = ?');
      values.push(query.status);
    }
    if (query.teacherId) {
      where.push(`EXISTS (SELECT 1 FROM teacher_assignments scoped
        WHERE scoped.class_group_id = cg.id AND scoped.teacher_id = ? AND scoped.status = 'active')`);
      values.push(query.teacherId);
    }
    if (query.componentId) {
      where.push(`EXISTS (SELECT 1 FROM teacher_assignments scoped
        WHERE scoped.class_group_id = cg.id AND scoped.component_id = ? AND scoped.status = 'active')`);
      values.push(query.componentId);
    }
    if (query.q) {
      where.push('LOWER(cg.name) LIKE ?');
      values.push(`%${query.q.toLocaleLowerCase('pt-BR')}%`);
    }
    const attentionSql = `NOT EXISTS (SELECT 1 FROM teacher_assignments scoped
      WHERE scoped.class_group_id = cg.id AND scoped.status = 'active')
      OR EXISTS (SELECT 1 FROM teacher_assignments scoped
      LEFT JOIN teacher_models scoped_model ON scoped_model.school_year_id = scoped.school_year_id
       AND scoped_model.teacher_id = scoped.teacher_id
      WHERE scoped.class_group_id = cg.id AND scoped.status = 'active'
       AND (scoped_model.id IS NULL OR scoped_model.state <> 'connected'))
      OR EXISTS (SELECT 1 FROM import_jobs job JOIN teacher_assignments scoped
       ON scoped.school_year_id = job.school_year_id AND scoped.teacher_id = job.teacher_id
       JOIN import_findings finding ON finding.import_job_id = job.id
       LEFT JOIN import_finding_resolutions resolution ON resolution.import_finding_id = finding.id
      WHERE scoped.class_group_id = cg.id AND scoped.status = 'active' AND resolution.id IS NULL)`;
    if (query.attention === 'needs_attention') where.push(`(${attentionSql})`);
    if (query.attention === 'normal') where.push(`NOT (${attentionSql})`);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const totalRow = await this.db
      .prepare(`SELECT COUNT(*) AS total FROM class_groups cg ${whereSql}`)
      .bind(...values)
      .first<Row>();
    const rows = await this.db
      .prepare(
        `${canonicalRosterCte}, roster_rollup AS (
        SELECT roster.class_group_id, COUNT(DISTINCT roster.student_id) AS students,
               COUNT(DISTINCT roster.grade_key || '|' || roster.field) AS mapped_fields,
               MAX(snapshot.updated_at) AS snapshot_updated_at
        FROM canonical_roster roster
        LEFT JOIN grade_snapshots snapshot ON snapshot.grade_key = roster.grade_key AND snapshot.field = roster.field
        GROUP BY roster.class_group_id
      ), assignment_rollup AS (
        SELECT assignment.class_group_id,
               COUNT(DISTINCT assignment.component_id) AS components,
               COUNT(DISTINCT assignment.teacher_id) AS teachers,
               COUNT(DISTINCT assignment.teacher_id) AS models,
               COUNT(DISTINCT CASE WHEN model.state = 'connected' THEN assignment.teacher_id END) AS connected_models,
               MAX(model.updated_at) AS model_updated_at
        FROM teacher_assignments assignment
        LEFT JOIN teacher_models model ON model.school_year_id = assignment.school_year_id AND model.teacher_id = assignment.teacher_id
        WHERE assignment.status = 'active' GROUP BY assignment.class_group_id
      ), finding_rollup AS (
        SELECT assignment.class_group_id,
               COUNT(DISTINCT CASE WHEN resolution.id IS NULL THEN finding.id END) AS open_findings,
               MAX(job.updated_at) AS import_updated_at
        FROM teacher_assignments assignment
        LEFT JOIN import_jobs job ON job.school_year_id = assignment.school_year_id AND job.teacher_id = assignment.teacher_id
        LEFT JOIN import_findings finding ON finding.import_job_id = job.id
        LEFT JOIN import_finding_resolutions resolution ON resolution.import_finding_id = finding.id
        WHERE assignment.status = 'active' GROUP BY assignment.class_group_id
      )
      SELECT cg.id, cg.name, cg.status, sy.id AS school_year_id, sy.year AS school_year,
             sy.name AS school_year_name, COALESCE(roster.students, 0) AS students,
             COALESCE(assignment.components, 0) AS components,
             COALESCE(assignment.teachers, 0) AS teachers,
             COALESCE(roster.mapped_fields, 0) AS mapped_fields,
             COALESCE(assignment.models, 0) AS models,
             COALESCE(assignment.connected_models, 0) AS connected_models,
             COALESCE(finding.open_findings, 0) AS open_findings,
             roster.snapshot_updated_at, assignment.model_updated_at, finding.import_updated_at
      FROM class_groups cg JOIN school_years sy ON sy.id = cg.school_year_id
      LEFT JOIN roster_rollup roster ON roster.class_group_id = cg.id
      LEFT JOIN assignment_rollup assignment ON assignment.class_group_id = cg.id
      LEFT JOIN finding_rollup finding ON finding.class_group_id = cg.id
      ${whereSql}
      ORDER BY sy.year DESC, cg.name
      LIMIT ? OFFSET ?`,
      )
      .bind(...values, query.pageSize, (query.page - 1) * query.pageSize)
      .all<Row>();
    return page(
      rows.results.map((row) => {
        const reasons: string[] = [];
        if (Number(row.models) === 0) reasons.push('Nenhuma atribuição docente ativa');
        else if (Number(row.connected_models) < Number(row.models))
          reasons.push('Modelo ausente ou não conectado');
        if (Number(row.open_findings) > 0) reasons.push('Pendência de importação');
        return {
          id: String(row.id),
          name: String(row.name),
          status: String(row.status),
          schoolYearId: String(row.school_year_id),
          schoolYear: Number(row.school_year),
          schoolYearName: String(row.school_year_name),
          students: Number(row.students),
          components: Number(row.components),
          teachers: Number(row.teachers),
          mappedFields: Number(row.mapped_fields),
          models: Number(row.models),
          connectedModels: Number(row.connected_models),
          openFindings: Number(row.open_findings),
          attentionLevel:
            Number(row.open_findings) > 0 ? 'error' : reasons.length ? 'warning' : 'normal',
          attentionReasons: reasons,
          lastUpdatedAt: latest([
            row.snapshot_updated_at ? String(row.snapshot_updated_at) : null,
            row.model_updated_at ? String(row.model_updated_at) : null,
            row.import_updated_at ? String(row.import_updated_at) : null,
          ]),
        };
      }),
      query,
      Number(totalRow?.total ?? 0),
    );
  }

  async turmaDetail(classGroupId: string): Promise<TurmaDetail | null> {
    const group = await this.db
      .prepare(
        `SELECT cg.id, cg.name, cg.status, sy.id AS school_year_id, sy.year,
      sy.name AS school_year_name FROM class_groups cg JOIN school_years sy ON sy.id = cg.school_year_id WHERE cg.id = ?`,
      )
      .bind(classGroupId)
      .first<Row>();
    if (!group) return null;
    const students = await this.db
      .prepare(
        `${canonicalRosterCte}
      SELECT roster.student_id, roster.display_name, roster.student_status,
             GROUP_CONCAT(DISTINCT roster.component_name) AS component_names,
             GROUP_CONCAT(DISTINCT roster.teacher_name) AS teacher_names,
             COUNT(DISTINCT roster.grade_key || '|' || roster.field) AS mapped_fields,
             COUNT(DISTINCT CASE WHEN snapshot.is_absent = 0 THEN snapshot.grade_key || '|' || snapshot.field END) AS present_values,
             COUNT(DISTINCT CASE WHEN snapshot.is_absent = 1 THEN snapshot.grade_key || '|' || snapshot.field END) AS absent_values,
             COUNT(DISTINCT CASE WHEN snapshot.is_absent = 0 AND snapshot.value_numeric = 0 THEN snapshot.grade_key || '|' || snapshot.field END) AS numeric_zero_values,
             MAX(snapshot.updated_at) AS last_updated_at
      FROM canonical_roster roster
      LEFT JOIN grade_snapshots snapshot ON snapshot.grade_key = roster.grade_key AND snapshot.field = roster.field
      WHERE roster.class_group_id = ? GROUP BY roster.student_id ORDER BY roster.display_name`,
      )
      .bind(classGroupId)
      .all<Row>();
    const operational = await new D1AcompanhamentoRepository(this.db).detail(classGroupId);
    return {
      classGroup: {
        id: String(group.id),
        name: String(group.name),
        status: String(group.status),
        schoolYearId: String(group.school_year_id),
        schoolYear: Number(group.year),
        schoolYearName: String(group.school_year_name),
      },
      students: students.results.map((row) => ({
        id: String(row.student_id),
        displayName: String(row.display_name),
        status: String(row.student_status),
        components: strings(row.component_names),
        teachers: strings(row.teacher_names),
        mappedFields: Number(row.mapped_fields),
        presentValues: Number(row.present_values),
        absentValues: Number(row.absent_values),
        numericZeroValues: Number(row.numeric_zero_values),
        lastUpdatedAt: row.last_updated_at ? String(row.last_updated_at) : null,
      })),
      assignments: (operational?.assignments ?? []).map((assignment) => ({
        teacherId: assignment.teacherId,
        teacherName: assignment.teacherName,
        componentName: assignment.componentName,
        assignmentStatus: assignment.assignmentStatus,
        modelState: assignment.modelState,
        modelSyncEnabled: assignment.modelSyncEnabled,
        sourceName: assignment.sourceName,
        sourceAuthority: assignment.sourceAuthority,
      })),
      findings: (operational?.findings ?? []).map((finding) => ({
        severity: finding.severity,
        code: finding.code,
        status: finding.status,
        occurredAt: finding.occurredAt,
      })),
      lastUpdatedAt: latest([
        operational?.notes.lastUpdatedAt,
        ...(operational?.assignments.map((assignment) => assignment.lastActivityAt) ?? []),
        ...(operational?.findings.map((finding) => finding.occurredAt) ?? []),
      ]),
    };
  }

  async listAlunos(query: AlunosListQuery): Promise<PageResult<AlunoListItem>> {
    const conditions: string[] = [];
    const values: Array<string | number> = [];
    if (query.status) {
      conditions.push('student.status = ?');
      values.push(query.status);
    }
    if (query.q) {
      conditions.push(
        `(LOWER(student.display_name) LIKE ? OR LOWER(COALESCE(student.external_id, '')) LIKE ?)`,
      );
      const pattern = `%${query.q.toLocaleLowerCase('pt-BR')}%`;
      values.push(pattern, pattern);
    }
    if (query.schoolYearId) {
      conditions.push(
        'EXISTS (SELECT 1 FROM canonical_roster scoped WHERE scoped.student_id = student.id AND scoped.school_year_id = ?)',
      );
      values.push(query.schoolYearId);
    }
    if (query.classGroupId) {
      conditions.push(
        'EXISTS (SELECT 1 FROM canonical_roster scoped WHERE scoped.student_id = student.id AND scoped.class_group_id = ?)',
      );
      values.push(query.classGroupId);
    }
    if (query.relationship === 'related') {
      conditions.push(
        'EXISTS (SELECT 1 FROM canonical_roster scoped WHERE scoped.student_id = student.id)',
      );
    }
    if (query.relationship === 'unrelated') {
      conditions.push(
        'NOT EXISTS (SELECT 1 FROM canonical_roster scoped WHERE scoped.student_id = student.id)',
      );
    }
    const snapshotEvidence = `EXISTS (SELECT 1 FROM canonical_roster scoped
      JOIN grade_snapshots scoped_snapshot ON scoped_snapshot.grade_key = scoped.grade_key
       AND scoped_snapshot.field = scoped.field WHERE scoped.student_id = student.id)`;
    if (query.snapshots === 'present') conditions.push(snapshotEvidence);
    if (query.snapshots === 'none') conditions.push(`NOT ${snapshotEvidence}`);
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const totalRow = await this.db
      .prepare(`${canonicalRosterCte} SELECT COUNT(*) AS total FROM students student ${whereSql}`)
      .bind(...values)
      .first<Row>();
    const rows = await this.db
      .prepare(
        `${canonicalRosterCte}
      SELECT student.id, student.display_name, student.external_id, student.status,
             COUNT(DISTINCT roster.class_group_id) AS class_groups,
             COUNT(DISTINCT roster.school_year_id) AS school_years,
             COUNT(DISTINCT roster.grade_key || '|' || roster.field) AS mapped_fields,
             COUNT(DISTINCT snapshot.grade_key || '|' || snapshot.field) AS snapshots,
             MAX(snapshot.updated_at) AS last_updated_at
      FROM students student LEFT JOIN canonical_roster roster ON roster.student_id = student.id
      LEFT JOIN grade_snapshots snapshot ON snapshot.grade_key = roster.grade_key AND snapshot.field = roster.field
      ${whereSql} GROUP BY student.id ORDER BY student.display_name LIMIT ? OFFSET ?`,
      )
      .bind(...values, query.pageSize, (query.page - 1) * query.pageSize)
      .all<Row>();
    return page(
      rows.results.map((row) => ({
        id: String(row.id),
        displayName: String(row.display_name),
        externalId: row.external_id ? String(row.external_id) : null,
        status: String(row.status),
        classGroups: Number(row.class_groups),
        schoolYears: Number(row.school_years),
        mappedFields: Number(row.mapped_fields),
        snapshots: Number(row.snapshots),
        lastUpdatedAt: row.last_updated_at ? String(row.last_updated_at) : null,
      })),
      query,
      Number(totalRow?.total ?? 0),
    );
  }

  async alunoDetail(studentId: string): Promise<AlunoDetail | null> {
    const student = await this.db
      .prepare('SELECT id, display_name, external_id, status FROM students WHERE id = ?')
      .bind(studentId)
      .first<Row>();
    if (!student) return null;
    const contexts = await this.db
      .prepare(
        `${canonicalRosterCte}
      SELECT roster.class_group_id, roster.class_group_name, roster.school_year_id, roster.school_year, roster.school_year_name,
             GROUP_CONCAT(DISTINCT roster.component_name) AS component_names,
             GROUP_CONCAT(DISTINCT roster.teacher_name) AS teacher_names,
             COUNT(DISTINCT roster.grade_key || '|' || roster.field) AS mapped_fields,
             COUNT(DISTINCT CASE WHEN snapshot.is_absent = 0 THEN snapshot.grade_key || '|' || snapshot.field END) AS present_values,
             COUNT(DISTINCT CASE WHEN snapshot.is_absent = 1 THEN snapshot.grade_key || '|' || snapshot.field END) AS absent_values,
             COUNT(DISTINCT CASE WHEN snapshot.is_absent = 0 AND snapshot.value_numeric = 0 THEN snapshot.grade_key || '|' || snapshot.field END) AS numeric_zero_values,
             (SELECT COUNT(DISTINCT finding.id) FROM teacher_assignments context_assignment
                JOIN import_jobs job ON job.school_year_id = context_assignment.school_year_id
                 AND job.teacher_id = context_assignment.teacher_id
                JOIN import_findings finding ON finding.import_job_id = job.id
                LEFT JOIN import_finding_resolutions resolution ON resolution.import_finding_id = finding.id
               WHERE context_assignment.class_group_id = roster.class_group_id
                 AND context_assignment.status = 'active' AND resolution.id IS NULL) AS open_findings,
             MAX(snapshot.updated_at) AS last_updated_at
      FROM canonical_roster roster LEFT JOIN grade_snapshots snapshot ON snapshot.grade_key = roster.grade_key AND snapshot.field = roster.field
      WHERE roster.student_id = ? GROUP BY roster.school_year_id, roster.class_group_id ORDER BY roster.school_year DESC, roster.class_group_name`,
      )
      .bind(studentId)
      .all<Row>();
    const snapshots = await this.db
      .prepare(
        `${canonicalRosterCte}
      SELECT roster.class_group_id, roster.component_name, roster.field,
             snapshot.value_numeric, snapshot.value_text, snapshot.is_absent,
             source.name AS source_name, snapshot.updated_at
      FROM canonical_roster roster
      JOIN grade_snapshots snapshot ON snapshot.grade_key = roster.grade_key AND snapshot.field = roster.field
      JOIN data_sources source ON source.id = snapshot.source_id
      WHERE roster.student_id = ?
      ORDER BY roster.school_year DESC, roster.class_group_name, roster.component_name, roster.field`,
      )
      .bind(studentId)
      .all<Row>();
    return {
      student: {
        id: String(student.id),
        displayName: String(student.display_name),
        externalId: student.external_id ? String(student.external_id) : null,
        status: String(student.status),
      },
      contexts: contexts.results.map((row) => ({
        classGroupId: String(row.class_group_id),
        classGroupName: String(row.class_group_name),
        schoolYearId: String(row.school_year_id),
        schoolYear: Number(row.school_year),
        schoolYearName: String(row.school_year_name),
        components: strings(row.component_names),
        teachers: strings(row.teacher_names),
        mappedFields: Number(row.mapped_fields),
        presentValues: Number(row.present_values),
        absentValues: Number(row.absent_values),
        numericZeroValues: Number(row.numeric_zero_values),
        openFindings: Number(row.open_findings),
        lastUpdatedAt: row.last_updated_at ? String(row.last_updated_at) : null,
        snapshots: snapshots.results
          .filter((snapshot) => snapshot.class_group_id === row.class_group_id)
          .map((snapshot) => ({
            componentName: String(snapshot.component_name),
            field: String(snapshot.field),
            valueNumeric: snapshot.value_numeric === null ? null : Number(snapshot.value_numeric),
            valueText: snapshot.value_text === null ? null : String(snapshot.value_text),
            isAbsent: Number(snapshot.is_absent) === 1,
            sourceName: String(snapshot.source_name),
            updatedAt: String(snapshot.updated_at),
          })),
      })),
    };
  }
}
