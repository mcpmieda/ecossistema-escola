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
    details: unknown = {},
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO audit_events
      (id, action, entity_type, entity_id, actor_id, correlation_id, details_json, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        action,
        entityType,
        entityId,
        actor,
        crypto.randomUUID(),
        JSON.stringify(details),
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
      this.audit('school_year.created', 'school_year', id, actor, { after: input }),
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
      this.audit('source.created', 'data_source', id, actor, { after: input }),
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
    const next = {
      name: input.name ?? String(current.name),
      description: input.description ?? String(current.description ?? ''),
      status: input.status ?? String(current.status),
      environment: input.environment ?? String(current.environment),
      migrationState: input.migrationState ?? String(current.migration_state),
    };
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE data_sources
           SET name = ?, description = ?, status = ?, environment = ?, migration_state = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(
          next.name,
          next.description,
          next.status,
          next.environment,
          next.migrationState,
          id,
        ),
      this.audit('source.updated', 'data_source', id, actor, {
        reason: input.reason,
        before: source(current),
        after: { ...source(current), ...next },
      }),
    ]);
    return source({
      ...current,
      name: next.name,
      description: next.description,
      status: next.status,
      environment: next.environment,
      migration_state: next.migrationState,
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
    const assignedSource = await this.db
      .prepare('SELECT school_year_id FROM data_sources WHERE id = ?')
      .bind(input.sourceId)
      .first<Row>();
    if (!assignedSource) throw new Error('data_source_not_found');
    if (String(assignedSource.school_year_id) !== input.schoolYearId) {
      throw new Error('source_assignment_year_mismatch');
    }

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
      this.audit('source_assignment.created', 'source_assignment', id, actor, { after: input }),
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
    const next = {
      authorityMode: input.authorityMode ?? String(current.authority),
      syncEnabled:
        input.syncEnabled === undefined ? Boolean(current.sync_enabled) : input.syncEnabled,
      effectiveFrom: input.effectiveFrom ?? String(current.effective_from),
      effectiveTo:
        input.effectiveTo === undefined
          ? current.effective_to
            ? String(current.effective_to)
            : null
          : input.effectiveTo,
      status: input.status ?? String(current.status),
      reason: input.reason,
    };
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE source_assignments
           SET authority = ?, sync_enabled = ?, effective_from = ?, effective_to = ?, status = ?, operator_id = ?, reason = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(
          next.authorityMode,
          next.syncEnabled ? 1 : 0,
          next.effectiveFrom,
          next.effectiveTo,
          next.status,
          actor,
          next.reason,
          id,
        ),
      this.audit('source_assignment.updated', 'source_assignment', id, actor, {
        reason: input.reason,
        before: assignment(current),
        after: { ...assignment(current), ...next, operatorId: actor },
      }),
    ]);
    return assignment({
      ...current,
      authority: next.authorityMode,
      sync_enabled: next.syncEnabled ? 1 : 0,
      effective_from: next.effectiveFrom,
      effective_to: next.effectiveTo,
      status: next.status,
      reason: next.reason,
      operator_id: actor,
    });
  }
}
