import {
  importAnalysisProfileCreateSchema,
  type ImportAnalysisProfile,
  type ImportAnalysisProfileAttach,
  type ImportAnalysisProfileCreate,
  type ImportAnalysisProfileRepository,
} from '../../shared/banco-notas-import-analysis-profile';

type Row = Record<string, string | number | null>;

function profileFromRow(row: Row): ImportAnalysisProfile {
  const input = importAnalysisProfileCreateSchema.parse({
    schoolYearId: String(row.school_year_id),
    dataSourceId: String(row.data_source_id),
    profile: JSON.parse(String(row.profile_json)) as unknown,
    reason: String(row.reason),
  });
  return {
    id: String(row.id),
    schoolYearId: input.schoolYearId,
    dataSourceId: input.dataSourceId,
    sourceFormat: 'xlsx',
    profileId: String(row.profile_id),
    analysisVersion: String(row.analysis_version),
    profileHash: String(row.profile_hash),
    profile: input.profile,
    createdBy: String(row.created_by),
    reason: input.reason,
    createdAt: String(row.created_at),
  };
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class D1ImportAnalysisProfileRepository implements ImportAnalysisProfileRepository {
  constructor(private readonly db: D1Database) {}

  async listProfiles(
    schoolYearId?: string,
    dataSourceId?: string,
  ): Promise<ImportAnalysisProfile[]> {
    let statement: D1PreparedStatement;
    if (schoolYearId && dataSourceId) {
      statement = this.db
        .prepare(
          `SELECT * FROM import_analysis_profiles
           WHERE school_year_id = ? AND data_source_id = ?
           ORDER BY created_at DESC, id DESC`,
        )
        .bind(schoolYearId, dataSourceId);
    } else if (schoolYearId) {
      statement = this.db
        .prepare(
          `SELECT * FROM import_analysis_profiles
           WHERE school_year_id = ? ORDER BY created_at DESC, id DESC`,
        )
        .bind(schoolYearId);
    } else if (dataSourceId) {
      statement = this.db
        .prepare(
          `SELECT * FROM import_analysis_profiles
           WHERE data_source_id = ? ORDER BY created_at DESC, id DESC`,
        )
        .bind(dataSourceId);
    } else {
      statement = this.db.prepare(
        'SELECT * FROM import_analysis_profiles ORDER BY created_at DESC, id DESC',
      );
    }
    const rows = (await statement.all<Row>()).results;
    return rows.map(profileFromRow);
  }

  async findProfile(id: string): Promise<ImportAnalysisProfile | null> {
    const row = await this.db
      .prepare('SELECT * FROM import_analysis_profiles WHERE id = ?')
      .bind(id)
      .first<Row>();
    return row ? profileFromRow(row) : null;
  }

  async createProfile(
    inputValue: ImportAnalysisProfileCreate,
    actor: string,
  ): Promise<ImportAnalysisProfile> {
    const input = importAnalysisProfileCreateSchema.parse(inputValue);
    const source = await this.db
      .prepare('SELECT school_year_id, type FROM data_sources WHERE id = ?')
      .bind(input.dataSourceId)
      .first<Row>();
    if (!source) throw new Error('data_source_not_found');
    if (String(source.school_year_id) !== input.schoolYearId) {
      throw new Error('import_analysis_profile_year_mismatch');
    }
    if (String(source.type) !== 'legacy_import') {
      throw new Error('import_analysis_profile_source_type_invalid');
    }

    const profileJson = JSON.stringify(input.profile);
    const profileHash = await sha256Text(profileJson);
    const existing = await this.db
      .prepare(
        `SELECT * FROM import_analysis_profiles
         WHERE data_source_id = ? AND profile_id = ? AND analysis_version = ?`,
      )
      .bind(input.dataSourceId, input.profile.profileId, input.profile.analysisVersion)
      .first<Row>();
    if (existing) {
      if (
        String(existing.school_year_id) !== input.schoolYearId ||
        String(existing.profile_hash) !== profileHash
      ) {
        throw new Error('import_analysis_profile_idempotency_conflict');
      }
      return profileFromRow(existing);
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO import_analysis_profiles
           (id, school_year_id, data_source_id, source_format, profile_id, analysis_version,
            profile_hash, profile_json, created_by, reason, created_at)
           VALUES (?, ?, ?, 'xlsx', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          input.schoolYearId,
          input.dataSourceId,
          input.profile.profileId,
          input.profile.analysisVersion,
          profileHash,
          profileJson,
          actor,
          input.reason,
          createdAt,
        ),
      this.db
        .prepare(
          `INSERT INTO audit_events
           (id, action, entity_type, entity_id, actor_id, correlation_id, details_json, occurred_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          'import_analysis_profile.created',
          'import_analysis_profile',
          id,
          actor,
          crypto.randomUUID(),
          JSON.stringify({
            reason: input.reason,
            schoolYearId: input.schoolYearId,
            dataSourceId: input.dataSourceId,
            sourceFormat: 'xlsx',
            profileId: input.profile.profileId,
            analysisVersion: input.profile.analysisVersion,
            profileHash,
          }),
          createdAt,
        ),
    ]);

    return {
      id,
      schoolYearId: input.schoolYearId,
      dataSourceId: input.dataSourceId,
      sourceFormat: 'xlsx',
      profileId: input.profile.profileId,
      analysisVersion: input.profile.analysisVersion,
      profileHash,
      profile: input.profile,
      createdBy: actor,
      reason: input.reason,
      createdAt,
    };
  }

  async findForJob(importJobId: string): Promise<ImportAnalysisProfile | null> {
    const row = await this.db
      .prepare(
        `SELECT profile.*
         FROM import_job_analysis_profiles link
         JOIN import_analysis_profiles profile ON profile.id = link.analysis_profile_id
         WHERE link.import_job_id = ?`,
      )
      .bind(importJobId)
      .first<Row>();
    return row ? profileFromRow(row) : null;
  }

  async attachToJob(
    importJobId: string,
    input: ImportAnalysisProfileAttach,
    actor: string,
  ): Promise<ImportAnalysisProfile> {
    const existingLink = await this.db
      .prepare(
        `SELECT analysis_profile_id FROM import_job_analysis_profiles
         WHERE import_job_id = ?`,
      )
      .bind(importJobId)
      .first<Row>();
    if (existingLink) {
      if (String(existingLink.analysis_profile_id) !== input.profileId) {
        throw new Error('import_analysis_profile_attachment_conflict');
      }
      const existingProfile = await this.findProfile(input.profileId);
      if (!existingProfile) throw new Error('import_analysis_profile_not_found');
      return existingProfile;
    }

    const job = await this.db
      .prepare(
        `SELECT id, school_year_id, data_source_id, state, provenance_json
         FROM import_jobs WHERE id = ?`,
      )
      .bind(importJobId)
      .first<Row>();
    if (!job) throw new Error('import_job_not_found');
    const profile = await this.findProfile(input.profileId);
    if (!profile) throw new Error('import_analysis_profile_not_found');
    if (String(job.state) !== 'draft') throw new Error('import_analysis_profile_job_not_draft');
    if (
      String(job.school_year_id) !== profile.schoolYearId ||
      String(job.data_source_id) !== profile.dataSourceId
    ) {
      throw new Error('import_analysis_profile_job_mismatch');
    }
    const provenance = JSON.parse(String(job.provenance_json)) as Record<string, unknown>;
    if (provenance.sourceFormat !== 'xlsx') {
      throw new Error('import_analysis_profile_requires_xlsx_job');
    }

    const attachedAt = new Date().toISOString();
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO import_job_analysis_profiles
           (import_job_id, analysis_profile_id, attached_by, reason, attached_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(importJobId, input.profileId, actor, input.reason, attachedAt),
      this.db
        .prepare(
          `INSERT INTO audit_events
           (id, action, entity_type, entity_id, actor_id, correlation_id, details_json, occurred_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          'import_job.analysis_profile_attached',
          'import_job',
          importJobId,
          actor,
          crypto.randomUUID(),
          JSON.stringify({
            reason: input.reason,
            analysisProfileId: input.profileId,
            profileId: profile.profileId,
            analysisVersion: profile.analysisVersion,
            profileHash: profile.profileHash,
          }),
          attachedAt,
        ),
    ]);
    return profile;
  }
}
