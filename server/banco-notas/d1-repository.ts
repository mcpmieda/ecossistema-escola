import type {
  AssignmentInput,
  AssignmentPatch,
  BancoNotasRepository,
  DataSource,
  SchoolYear,
  SchoolYearInput,
  SourceAssignment,
  SourceInput,
  SourcePatch,
  Teacher,
} from '../../shared/banco-notas-contract';

type Row = Record<string, string | number | null>;

function source(row: Row): DataSource {
  return {
    id: String(row.id),
    schoolYearId: String(row.school_year_id),
    type: row.type as DataSource['type'],
    name: String(row.name),
    description: String(row.description ?? ''),
    status: String(row.status),
    migrationState: String(row.migration_state),
    environment: String(row.environment),
  };
}
function assignment(row: Row): SourceAssignment {
  return {
    id: String(row.id),
    schoolYearId: String(row.school_year_id),
    sourceId: String(row.data_source_id),
    teacherId: row.teacher_id ? String(row.teacher_id) : null,
    scope: row.scope as SourceAssignment['scope'],
    authorityMode: row.authority as SourceAssignment['authorityMode'],
    status: String(row.status),
    syncEnabled: Boolean(row.sync_enabled),
    effectiveFrom: String(row.effective_from),
    effectiveTo: row.effective_to ? String(row.effective_to) : null,
    reason: String(row.reason),
    operatorId: String(row.operator_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class D1BancoNotasRepository implements BancoNotasRepository {
  constructor(private readonly db: D1Database) {}
  private audit(
    action: string,
    entityType: string,
    entityId: string,
    actor: string,
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO audit_events
      (id, action, entity_type, entity_id, actor_id, correlation_id, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        action,
        entityType,
        entityId,
        actor,
        crypto.randomUUID(),
        new Date().toISOString(),
      );
  }
  async listSchoolYears(): Promise<SchoolYear[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM school_years ORDER BY year DESC')
      .all<Row>();
    return results.map((row) => ({
      id: String(row.id),
      year: Number(row.year),
      name: String(row.name),
      status: String(row.status),
      startsOn: String(row.starts_on),
      endsOn: String(row.ends_on),
    }));
  }
  async createSchoolYear(input: SchoolYearInput, actor: string): Promise<SchoolYear> {
    const id = crypto.randomUUID();
    await this.db.batch([
      this.db
        .prepare(
          'INSERT INTO school_years (id, year, name, starts_on, ends_on) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(id, input.year, input.name, input.startsOn, input.endsOn),
      this.audit('school_year.created', 'school_year', id, actor),
    ]);
    return { id, ...input, status: 'planning' };
  }
  async listTeachers(): Promise<Teacher[]> {
    const { results } = await this.db
      .prepare('SELECT id, display_name, status FROM teachers ORDER BY display_name')
      .all<Row>();
    return results.map((row) => ({
      id: String(row.id),
      displayName: String(row.display_name),
      status: String(row.status),
    }));
  }
  async listSources(schoolYearId?: string): Promise<DataSource[]> {
    const statement = schoolYearId
      ? this.db
          .prepare('SELECT * FROM data_sources WHERE school_year_id = ? ORDER BY name')
          .bind(schoolYearId)
      : this.db.prepare('SELECT * FROM data_sources ORDER BY name');
    return (await statement.all<Row>()).results.map(source);
  }
  async createSource(input: SourceInput, actor: string): Promise<DataSource> {
    const id = crypto.randomUUID();
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO data_sources (id, school_year_id, type, name, description, created_by)
        VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, input.schoolYearId, input.type, input.name, input.description, actor),
      this.audit('source.created', 'data_source', id, actor),
    ]);
    return {
      id,
      ...input,
      status: 'active',
      migrationState: 'not_started',
      environment: 'homologation',
    };
  }
  async patchSource(id: string, input: SourcePatch, actor: string): Promise<DataSource | null> {
    const current = await this.db
      .prepare('SELECT * FROM data_sources WHERE id = ?')
      .bind(id)
      .first<Row>();
    if (!current) return null;
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE data_sources SET name = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        )
        .bind(
          input.name ?? current.name,
          input.description ?? current.description,
          input.status ?? current.status,
          id,
        ),
      this.audit('source.updated', 'data_source', id, actor),
    ]);
    return source({
      ...current,
      name: input.name ?? current.name ?? null,
      description: input.description ?? current.description ?? null,
      status: input.status ?? current.status ?? null,
    });
  }
  async listAssignments(schoolYearId?: string): Promise<SourceAssignment[]> {
    const statement = schoolYearId
      ? this.db
          .prepare(
            'SELECT * FROM source_assignments WHERE school_year_id = ? ORDER BY effective_from DESC',
          )
          .bind(schoolYearId)
      : this.db.prepare('SELECT * FROM source_assignments ORDER BY effective_from DESC');
    return (await statement.all<Row>()).results.map(assignment);
  }
  async createAssignment(input: AssignmentInput, actor: string): Promise<SourceAssignment> {
    const id = crypto.randomUUID();
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO source_assignments
        (id, school_year_id, data_source_id, teacher_id, scope, authority, sync_enabled, effective_from, effective_to, operator_id, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          input.schoolYearId,
          input.sourceId,
          input.teacherId,
          input.scope,
          input.authorityMode,
          input.syncEnabled ? 1 : 0,
          input.effectiveFrom,
          input.effectiveTo,
          actor,
          input.reason,
        ),
      this.audit('source_assignment.created', 'source_assignment', id, actor),
    ]);
    const now = new Date().toISOString();
    return {
      id,
      ...input,
      status: 'active',
      operatorId: actor,
      createdAt: now,
      updatedAt: now,
    };
  }
  async patchAssignment(
    id: string,
    input: AssignmentPatch,
    actor: string,
  ): Promise<SourceAssignment | null> {
    const current = await this.db
      .prepare('SELECT * FROM source_assignments WHERE id = ?')
      .bind(id)
      .first<Row>();
    if (!current) return null;
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE source_assignments SET authority = ?, sync_enabled = ?, effective_from = ?, effective_to = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        )
        .bind(
          input.authorityMode ?? current.authority,
          input.syncEnabled === undefined ? current.sync_enabled : input.syncEnabled ? 1 : 0,
          input.effectiveFrom ?? current.effective_from,
          input.effectiveTo === undefined ? current.effective_to : input.effectiveTo,
          input.status ?? current.status,
          id,
        ),
      this.audit('source_assignment.updated', 'source_assignment', id, actor),
    ]);
    return assignment({
      ...current,
      authority: input.authorityMode ?? current.authority ?? null,
      sync_enabled:
        input.syncEnabled === undefined ? (current.sync_enabled ?? 0) : input.syncEnabled ? 1 : 0,
      effective_from: input.effectiveFrom ?? current.effective_from ?? null,
      effective_to:
        input.effectiveTo === undefined ? (current.effective_to ?? null) : input.effectiveTo,
      status: input.status ?? current.status ?? null,
    });
  }
}
