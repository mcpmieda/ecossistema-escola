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
import type {
  ImportFinding,
  ImportJob,
  ImportJobCreate,
  ImportJobState,
  ImportJobTransition,
} from '../../shared/banco-notas-import-jobs';
import { assertImportJobGate, assertImportJobTransition } from './import-jobs';

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

function importJob(row: Row, findings: ImportFinding[] = []): ImportJob {
  return {
    id: String(row.id),
    schoolYearId: String(row.school_year_id),
    teacherId: String(row.teacher_id),
    dataSourceId: String(row.data_source_id),
    idempotencyKey: String(row.idempotency_key),
    sourceHash: String(row.source_hash),
    state: String(row.state) as ImportJobState,
    provenance: JSON.parse(String(row.provenance_json)) as Record<string, unknown>,
    requestedBy: String(row.requested_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    findings,
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
        .bind(next.name, next.description, next.status, next.environment, next.migrationState, id),
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
      effectiveTo: input.clearEffectiveTo
        ? null
        : input.effectiveTo === undefined
          ? current.effective_to
            ? String(current.effective_to)
            : null
          : input.effectiveTo,
      status: input.status ?? String(current.status),
      reason: input.reason,
    };
    if (next.effectiveTo && next.effectiveFrom > next.effectiveTo) {
      throw new Error('invalid_effective_period');
    }
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

  private async importFindings(jobId: string): Promise<ImportFinding[]> {
    const { results } = await this.db
      .prepare(
        `SELECT finding.id, finding.severity, finding.code, finding.location_json,
                finding.details_json, resolution.resolved_at
         FROM import_findings finding
         LEFT JOIN import_finding_resolutions resolution
           ON resolution.import_finding_id = finding.id
         WHERE finding.import_job_id = ?
         ORDER BY finding.created_at, finding.id`,
      )
      .bind(jobId)
      .all<Row>();
    return results.map((row) => ({
      id: String(row.id),
      severity: String(row.severity) as ImportFinding['severity'],
      code: String(row.code),
      location: JSON.parse(String(row.location_json)) as Record<string, unknown>,
      details: JSON.parse(String(row.details_json)) as Record<string, unknown>,
      resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    }));
  }

  async listImportJobs(schoolYearId?: string): Promise<ImportJob[]> {
    const statement = schoolYearId
      ? this.db
          .prepare('SELECT * FROM import_jobs WHERE school_year_id = ? ORDER BY created_at DESC')
          .bind(schoolYearId)
      : this.db.prepare('SELECT * FROM import_jobs ORDER BY created_at DESC');
    const rows = (await statement.all<Row>()).results;
    return Promise.all(
      rows.map(async (row) => importJob(row, await this.importFindings(String(row.id)))),
    );
  }

  async findImportJob(id: string): Promise<ImportJob | null> {
    const row = await this.db
      .prepare('SELECT * FROM import_jobs WHERE id = ?')
      .bind(id)
      .first<Row>();
    return row ? importJob(row, await this.importFindings(id)) : null;
  }

  async createImportJob(input: ImportJobCreate, actor: string): Promise<ImportJob> {
    const existing = await this.db
      .prepare(
        `SELECT * FROM import_jobs
         WHERE idempotency_key = ? OR (data_source_id = ? AND source_hash = ?)
         ORDER BY CASE WHEN idempotency_key = ? THEN 0 ELSE 1 END LIMIT 1`,
      )
      .bind(input.idempotencyKey, input.dataSourceId, input.sourceHash, input.idempotencyKey)
      .first<Row>();
    if (existing) {
      if (
        String(existing.source_hash) !== input.sourceHash ||
        String(existing.school_year_id) !== input.schoolYearId ||
        String(existing.teacher_id) !== input.teacherId ||
        String(existing.data_source_id) !== input.dataSourceId
      ) {
        throw new Error('import_job_idempotency_conflict');
      }
      return importJob(existing, await this.importFindings(String(existing.id)));
    }

    const id = crypto.randomUUID();
    const provenance = { ...input.provenance, sourceFormat: input.sourceFormat };
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO import_jobs
           (id, school_year_id, teacher_id, data_source_id, idempotency_key, source_hash, provenance_json, requested_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          input.schoolYearId,
          input.teacherId,
          input.dataSourceId,
          input.idempotencyKey,
          input.sourceHash,
          JSON.stringify(provenance),
          actor,
        ),
      this.audit('import_job.created', 'import_job', id, actor, {
        sourceHash: input.sourceHash,
        sourceFormat: input.sourceFormat,
      }),
    ]);
    const now = new Date().toISOString();
    return {
      id,
      schoolYearId: input.schoolYearId,
      teacherId: input.teacherId,
      dataSourceId: input.dataSourceId,
      idempotencyKey: input.idempotencyKey,
      sourceHash: input.sourceHash,
      state: 'draft',
      provenance,
      requestedBy: actor,
      createdAt: now,
      updatedAt: now,
      findings: [],
    };
  }

  async transitionImportJob(
    id: string,
    input: ImportJobTransition,
    actor: string,
  ): Promise<ImportJob | null> {
    const current = await this.db
      .prepare('SELECT * FROM import_jobs WHERE id = ?')
      .bind(id)
      .first<Row>();
    if (!current) return null;
    const currentState = String(current.state) as ImportJobState;
    assertImportJobTransition(currentState, input.targetState);

    const currentFindings = await this.importFindings(id);
    const unresolvedFindingIds = new Set(
      currentFindings.filter((finding) => !finding.resolvedAt).map((finding) => finding.id),
    );
    for (const findingId of input.resolvedFindingIds) {
      if (!unresolvedFindingIds.has(findingId)) {
        throw new Error('import_finding_not_resolvable');
      }
    }

    const resolvedAt = new Date().toISOString();
    const resolvedIds = new Set(input.resolvedFindingIds);
    const existingAfterResolution = currentFindings.map((finding) =>
      resolvedIds.has(finding.id) ? { ...finding, resolvedAt } : finding,
    );
    const newFindings: ImportFinding[] = input.findings.map((finding) => ({
      id: crypto.randomUUID(),
      ...finding,
      resolvedAt: null,
    }));
    const allFindings = [...existingAfterResolution, ...newFindings];
    assertImportJobGate({
      targetState: input.targetState,
      unresolvedErrorFindingCount: allFindings.filter(
        (finding) => finding.severity === 'error' && !finding.resolvedAt,
      ).length,
    });

    const provenance = {
      ...(JSON.parse(String(current.provenance_json)) as Record<string, unknown>),
      ...input.provenance,
    };
    const findingStatements = newFindings.map((finding) =>
      this.db
        .prepare(
          `INSERT INTO import_findings
           (id, import_job_id, severity, code, location_json, details_json)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          finding.id,
          id,
          finding.severity,
          finding.code,
          JSON.stringify(finding.location),
          JSON.stringify(finding.details),
        ),
    );
    const resolutionStatements = input.resolvedFindingIds.map((findingId) =>
      this.db
        .prepare(
          `INSERT INTO import_finding_resolutions
           (id, import_finding_id, resolved_by, reason, resolved_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), findingId, actor, input.reason, resolvedAt),
    );
    const updatedAt = new Date().toISOString();
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE import_jobs SET state = ?, provenance_json = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(input.targetState, JSON.stringify(provenance), id),
      ...findingStatements,
      ...resolutionStatements,
      this.audit('import_job.transitioned', 'import_job', id, actor, {
        reason: input.reason,
        before: currentState,
        after: input.targetState,
        resolvedFindingIds: input.resolvedFindingIds,
      }),
    ]);
    return importJob(
      {
        ...current,
        state: input.targetState,
        provenance_json: JSON.stringify(provenance),
        updated_at: updatedAt,
      },
      allFindings,
    );
  }
}
