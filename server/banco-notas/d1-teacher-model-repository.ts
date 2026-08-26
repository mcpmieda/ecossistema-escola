export type TeacherModelState =
  | 'draft'
  | 'validated'
  | 'ready_to_share'
  | 'shared'
  | 'connected'
  | 'suspended'
  | 'archived';

export type TeacherModelMapping = {
  gradeKey: string;
  sheetKey: string;
  cellAddress: string;
  field: string;
};

export type PersistValidatedTeacherModelInput = {
  schoolYearId: string;
  teacherId: string;
  modelHash: string;
  definitionVersion: string;
  mappingVersion: number;
  provenance: Record<string, unknown>;
  mappings: TeacherModelMapping[];
  actor: string;
};

export type PersistedTeacherModelVersion = {
  teacherModelId: string;
  teacherModelVersionId: string;
  version: number;
  state: 'validated';
  modelHash: string;
  definitionVersion: string;
  mappingVersion: number;
};

export type ReadyTeacherModelShare = {
  teacherModelId: string;
  teacherId: string;
  teacherEntraObjectId: string;
  state: 'ready_to_share';
  modelHash: string;
  definitionVersion: string;
  mappingVersion: number;
  version: number;
};

export type TeacherModelShareRecord = {
  teacherModelId: string;
  recipientEntraObjectId: string;
  recipientUpn: string;
  correlationId: string;
  actor: string;
  driveItemId?: string;
  safeError?: string;
  details?: Record<string, unknown>;
};

type Row = Record<string, string | number | null>;

type ExistingTeacherModel = {
  id: string;
  state: TeacherModelState;
  syncEnabled: boolean;
  environment: string;
};

const sha256Pattern = /^[a-f0-9]{64}$/u;

function assertText(value: string, code: string): void {
  if (!value.trim()) throw new Error(code);
}

function assertHomologation(environment: string): void {
  if (environment !== 'homologation') throw new Error('teacher_model_homologation_required');
}

function assertSyncDisabled(syncEnabled: boolean): void {
  if (syncEnabled) throw new Error('teacher_model_sync_must_be_disabled');
}

function assertValidatedModelInput(input: PersistValidatedTeacherModelInput): void {
  assertText(input.schoolYearId, 'teacher_model_school_year_required');
  assertText(input.teacherId, 'teacher_model_teacher_required');
  assertText(input.definitionVersion, 'teacher_model_definition_version_required');
  assertText(input.actor, 'teacher_model_actor_required');
  if (!sha256Pattern.test(input.modelHash)) throw new Error('teacher_model_hash_invalid');
  if (!Number.isInteger(input.mappingVersion) || input.mappingVersion < 1) {
    throw new Error('teacher_model_mapping_version_invalid');
  }
  if (input.mappings.length === 0) throw new Error('teacher_model_mappings_required');

  const gradeTargets = input.mappings.map((mapping) => `${mapping.gradeKey}::${mapping.field}`);
  if (new Set(gradeTargets).size !== gradeTargets.length) {
    throw new Error('teacher_model_grade_mapping_duplicate');
  }

  const cellTargets = input.mappings.map(
    (mapping) => `${mapping.sheetKey}::${mapping.cellAddress}`,
  );
  if (new Set(cellTargets).size !== cellTargets.length) {
    throw new Error('teacher_model_cell_mapping_duplicate');
  }

  for (const mapping of input.mappings) {
    assertText(mapping.gradeKey, 'teacher_model_grade_key_required');
    assertText(mapping.sheetKey, 'teacher_model_sheet_key_required');
    assertText(mapping.cellAddress, 'teacher_model_cell_address_required');
    assertText(mapping.field, 'teacher_model_field_required');
  }
}

function detailsJson(details: Record<string, unknown> | undefined): string {
  return JSON.stringify(details ?? {});
}

export class D1TeacherModelRepository {
  constructor(private readonly db: D1Database) {}

  private audit(
    action: string,
    entityId: string,
    actor: string,
    correlationId: string,
    details: Record<string, unknown> = {},
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO audit_events
          (id, action, entity_type, entity_id, actor_id, correlation_id, details_json, occurred_at)
         VALUES (?, ?, 'teacher_model', ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        action,
        entityId,
        actor,
        correlationId,
        JSON.stringify(details),
        new Date().toISOString(),
      );
  }

  private shareAudit(
    result: 'requested' | 'succeeded' | 'failed' | 'revoked',
    input: TeacherModelShareRecord,
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO share_audit
          (id, teacher_model_id, recipient_object_id, recipient_upn, result,
           correlation_id, details_json, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        input.teacherModelId,
        input.recipientEntraObjectId,
        input.recipientUpn,
        result,
        input.correlationId,
        detailsJson(input.details),
        new Date().toISOString(),
      );
  }

  private async existingModel(
    schoolYearId: string,
    teacherId: string,
  ): Promise<ExistingTeacherModel | null> {
    const row = await this.db
      .prepare(
        `SELECT id, state, sync_enabled, environment
         FROM teacher_models
         WHERE school_year_id = ? AND teacher_id = ?`,
      )
      .bind(schoolYearId, teacherId)
      .first<Row>();
    if (!row) return null;
    return {
      id: String(row.id),
      state: String(row.state) as TeacherModelState,
      syncEnabled: Boolean(row.sync_enabled),
      environment: String(row.environment),
    };
  }

  async persistValidatedModelVersion(
    input: PersistValidatedTeacherModelInput,
  ): Promise<PersistedTeacherModelVersion> {
    assertValidatedModelInput(input);

    const schoolYear = await this.db
      .prepare('SELECT id FROM school_years WHERE id = ?')
      .bind(input.schoolYearId)
      .first<Row>();
    if (!schoolYear) throw new Error('teacher_model_school_year_not_found');

    const teacher = await this.db
      .prepare('SELECT id FROM teachers WHERE id = ?')
      .bind(input.teacherId)
      .first<Row>();
    if (!teacher) throw new Error('teacher_model_teacher_not_found');

    const existing = await this.existingModel(input.schoolYearId, input.teacherId);
    if (existing) {
      assertHomologation(existing.environment);
      assertSyncDisabled(existing.syncEnabled);
      if (!['draft', 'validated'].includes(existing.state)) {
        throw new Error('teacher_model_version_locked_by_state');
      }
    }

    const teacherModelId = existing?.id ?? crypto.randomUUID();
    const latest = await this.db
      .prepare(
        `SELECT id, version, model_hash, mapping_version, provenance_json
         FROM teacher_model_versions
         WHERE teacher_model_id = ?
         ORDER BY version DESC
         LIMIT 1`,
      )
      .bind(teacherModelId)
      .first<Row>();

    if (
      latest &&
      String(latest.model_hash) === input.modelHash &&
      Number(latest.mapping_version) === input.mappingVersion
    ) {
      const provenance = JSON.parse(String(latest.provenance_json)) as Record<string, unknown>;
      if (provenance.definitionVersion !== input.definitionVersion) {
        throw new Error('teacher_model_version_idempotency_conflict');
      }
      return {
        teacherModelId,
        teacherModelVersionId: String(latest.id),
        version: Number(latest.version),
        state: 'validated',
        modelHash: input.modelHash,
        definitionVersion: input.definitionVersion,
        mappingVersion: input.mappingVersion,
      };
    }

    const version = latest ? Number(latest.version) + 1 : 1;
    const teacherModelVersionId = crypto.randomUUID();
    const correlationId = crypto.randomUUID();
    const provenance = {
      ...input.provenance,
      definitionVersion: input.definitionVersion,
    };
    const statements: D1PreparedStatement[] = [];

    if (!existing) {
      const createModel = this.db
        .prepare(
          `INSERT INTO teacher_models
            (id, school_year_id, teacher_id, state, sync_enabled, environment)
           VALUES (?, ?, ?, 'validated', 0, 'homologation')`,
        )
        .bind(teacherModelId, input.schoolYearId, input.teacherId);
      statements.push(createModel);
    } else if (existing.state === 'draft') {
      const validateModel = this.db
        .prepare(
          `UPDATE teacher_models
           SET state = 'validated', updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND state = 'draft'`,
        )
        .bind(teacherModelId);
      statements.push(validateModel);
    }

    const createVersion = this.db
      .prepare(
        `INSERT INTO teacher_model_versions
          (id, teacher_model_id, version, model_hash, mapping_version, provenance_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        teacherModelVersionId,
        teacherModelId,
        version,
        input.modelHash,
        input.mappingVersion,
        JSON.stringify(provenance),
      );
    statements.push(createVersion);

    for (const mapping of input.mappings) {
      const createMapping = this.db
        .prepare(
          `INSERT INTO cell_mappings
            (id, teacher_model_version_id, grade_key, sheet_key, cell_address, field)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          teacherModelVersionId,
          mapping.gradeKey,
          mapping.sheetKey,
          mapping.cellAddress,
          mapping.field,
        );
      statements.push(createMapping);
    }

    const audit = this.audit(
      'teacher_model.version_validated',
      teacherModelId,
      input.actor,
      correlationId,
      {
        teacherModelVersionId,
        version,
        modelHash: input.modelHash,
        mappingVersion: input.mappingVersion,
        definitionVersion: input.definitionVersion,
      },
    );
    statements.push(audit);
    await this.db.batch(statements);

    return {
      teacherModelId,
      teacherModelVersionId,
      version,
      state: 'validated',
      modelHash: input.modelHash,
      definitionVersion: input.definitionVersion,
      mappingVersion: input.mappingVersion,
    };
  }

  async prepareShare(teacherModelId: string, actor: string): Promise<ReadyTeacherModelShare> {
    assertText(teacherModelId, 'teacher_model_id_required');
    assertText(actor, 'teacher_model_actor_required');

    const row = await this.db
      .prepare(
        `SELECT model.id, model.teacher_id, model.state, model.sync_enabled, model.environment,
                teacher.status AS teacher_status, teacher.entra_object_id,
                version.id AS version_id, version.version, version.model_hash,
                version.mapping_version, version.provenance_json
         FROM teacher_models model
         JOIN teachers teacher ON teacher.id = model.teacher_id
         LEFT JOIN teacher_model_versions version
           ON version.id = (
             SELECT latest.id
             FROM teacher_model_versions latest
             WHERE latest.teacher_model_id = model.id
             ORDER BY latest.version DESC
             LIMIT 1
           )
         WHERE model.id = ?`,
      )
      .bind(teacherModelId)
      .first<Row>();
    if (!row) throw new Error('teacher_model_not_found');

    assertHomologation(String(row.environment));
    assertSyncDisabled(Boolean(row.sync_enabled));
    if (String(row.teacher_status) !== 'active') {
      throw new Error('teacher_model_active_teacher_required');
    }
    if (!row.entra_object_id) throw new Error('teacher_model_entra_identity_required');
    if (!row.version_id) throw new Error('teacher_model_version_required');

    const state = String(row.state) as TeacherModelState;
    if (!['validated', 'ready_to_share'].includes(state)) {
      throw new Error('teacher_model_not_ready_for_share');
    }

    const mappingCount = await this.db
      .prepare('SELECT COUNT(*) AS total FROM cell_mappings WHERE teacher_model_version_id = ?')
      .bind(String(row.version_id))
      .first<Row>();
    if (!mappingCount || Number(mappingCount.total) < 1) {
      throw new Error('teacher_model_mappings_required_for_share');
    }

    const provenance = JSON.parse(String(row.provenance_json)) as Record<string, unknown>;
    const definitionVersion = provenance.definitionVersion;
    if (typeof definitionVersion !== 'string' || !definitionVersion.trim()) {
      throw new Error('teacher_model_definition_version_required_for_share');
    }

    if (state === 'validated') {
      const correlationId = crypto.randomUUID();
      const markReady = this.db
        .prepare(
          `UPDATE teacher_models
           SET state = 'ready_to_share', updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND state = 'validated' AND sync_enabled = 0
             AND environment = 'homologation'`,
        )
        .bind(teacherModelId);
      const audit = this.audit(
        'teacher_model.ready_to_share',
        teacherModelId,
        actor,
        correlationId,
        {
          teacherModelVersionId: String(row.version_id),
          version: Number(row.version),
        },
      );
      await this.db.batch([markReady, audit]);
    }

    return {
      teacherModelId,
      teacherId: String(row.teacher_id),
      teacherEntraObjectId: String(row.entra_object_id),
      state: 'ready_to_share',
      modelHash: String(row.model_hash),
      definitionVersion,
      mappingVersion: Number(row.mapping_version),
      version: Number(row.version),
    };
  }

  async recordShareRequested(input: TeacherModelShareRecord): Promise<void> {
    const model = await this.db
      .prepare('SELECT state FROM teacher_models WHERE id = ?')
      .bind(input.teacherModelId)
      .first<Row>();
    if (!model) throw new Error('teacher_model_not_found');
    if (String(model.state) !== 'ready_to_share') {
      throw new Error('teacher_model_not_ready_for_share');
    }

    const audit = this.audit(
      'teacher_model.share_requested',
      input.teacherModelId,
      input.actor,
      input.correlationId,
      { recipientEntraObjectId: input.recipientEntraObjectId },
    );
    await this.db.batch([this.shareAudit('requested', input), audit]);
  }

  async recordShareSucceeded(input: TeacherModelShareRecord): Promise<void> {
    if (!input.driveItemId) throw new Error('teacher_model_drive_item_required');
    const model = await this.db
      .prepare(
        `SELECT model.state, model.sync_enabled, model.environment, teacher.entra_object_id
         FROM teacher_models model
         JOIN teachers teacher ON teacher.id = model.teacher_id
         WHERE model.id = ?`,
      )
      .bind(input.teacherModelId)
      .first<Row>();
    if (!model) throw new Error('teacher_model_not_found');
    if (String(model.state) !== 'ready_to_share') {
      throw new Error('teacher_model_not_ready_for_share');
    }
    assertSyncDisabled(Boolean(model.sync_enabled));
    assertHomologation(String(model.environment));
    if (String(model.entra_object_id ?? '') !== input.recipientEntraObjectId) {
      throw new Error('teacher_model_recipient_identity_mismatch');
    }

    const markShared = this.db
      .prepare(
        `UPDATE teacher_models
         SET state = 'shared', drive_item_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND state = 'ready_to_share' AND sync_enabled = 0
           AND environment = 'homologation'`,
      )
      .bind(input.driveItemId, input.teacherModelId);
    const audit = this.audit(
      'teacher_model.shared',
      input.teacherModelId,
      input.actor,
      input.correlationId,
      {
        driveItemId: input.driveItemId,
        recipientEntraObjectId: input.recipientEntraObjectId,
      },
    );
    await this.db.batch([markShared, this.shareAudit('succeeded', input), audit]);
  }

  async recordShareFailed(input: TeacherModelShareRecord): Promise<void> {
    const model = await this.db
      .prepare('SELECT id FROM teacher_models WHERE id = ?')
      .bind(input.teacherModelId)
      .first<Row>();
    if (!model) throw new Error('teacher_model_not_found');

    const failed = this.shareAudit('failed', {
      ...input,
      details: {
        ...input.details,
        safeError: input.safeError,
      },
    });
    const audit = this.audit(
      'teacher_model.share_failed',
      input.teacherModelId,
      input.actor,
      input.correlationId,
      {
        safeError: input.safeError,
        ...input.details,
      },
    );
    await this.db.batch([failed, audit]);
  }
}
