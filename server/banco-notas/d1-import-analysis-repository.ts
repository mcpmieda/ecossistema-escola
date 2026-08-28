import {
  importAnalysisSchema,
  type ImportAnalysis,
  type ImportAnalysisCommit,
  type ImportAnalysisRepository,
} from '../../shared/banco-notas-import-analysis';

type Row = Record<string, string | number | null>;

function analysisFromRow(row: Row): ImportAnalysis {
  return importAnalysisSchema.parse({
    id: String(row.id),
    importJobId: String(row.import_job_id),
    analyzerId: String(row.analyzer_id),
    analysisVersion: String(row.analysis_version),
    sourceHash: String(row.source_hash),
    sourceFormat: String(row.source_format),
    schoolYear: Number(row.school_year),
    model: JSON.parse(String(row.model_json)) as unknown,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
  });
}

function sameAnalysis(existing: ImportAnalysis, input: ImportAnalysisCommit): boolean {
  return (
    existing.importJobId === input.importJobId &&
    existing.analyzerId === input.analyzerId &&
    existing.analysisVersion === input.analysisVersion &&
    existing.sourceHash === input.sourceHash &&
    existing.sourceFormat === input.sourceFormat &&
    existing.schoolYear === input.schoolYear &&
    JSON.stringify(existing.model) === JSON.stringify(input.model)
  );
}

export class D1ImportAnalysisRepository implements ImportAnalysisRepository {
  constructor(private readonly db: D1Database) {}

  async findImportAnalysis(importJobId: string): Promise<ImportAnalysis | null> {
    const row = await this.db
      .prepare('SELECT * FROM import_analyses WHERE import_job_id = ?')
      .bind(importJobId)
      .first<Row>();
    return row ? analysisFromRow(row) : null;
  }

  async commitImportAnalysis(input: ImportAnalysisCommit): Promise<ImportAnalysis> {
    const existing = await this.findImportAnalysis(input.importJobId);
    if (existing) {
      if (!sameAnalysis(existing, input)) throw new Error('import_analysis_idempotency_conflict');
      return existing;
    }

    const job = await this.db
      .prepare(
        `SELECT job.id, job.state, job.source_hash, job.provenance_json,
                school_year.year AS school_year
         FROM import_jobs job
         JOIN school_years school_year ON school_year.id = job.school_year_id
         WHERE job.id = ?`,
      )
      .bind(input.importJobId)
      .first<Row>();
    if (!job) throw new Error('import_job_not_found');
    if (String(job.state) !== 'draft') {
      throw new Error(`invalid_import_job_transition:${String(job.state)}:analyzed`);
    }

    const currentProvenance = JSON.parse(String(job.provenance_json)) as Record<string, unknown>;
    if (
      String(job.source_hash) !== input.sourceHash ||
      Number(job.school_year) !== input.schoolYear ||
      currentProvenance.sourceFormat !== input.sourceFormat
    ) {
      throw new Error('import_analysis_provenance_mismatch');
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const analysis = importAnalysisSchema.parse({
      id,
      importJobId: input.importJobId,
      analyzerId: input.analyzerId,
      analysisVersion: input.analysisVersion,
      sourceHash: input.sourceHash,
      sourceFormat: input.sourceFormat,
      schoolYear: input.schoolYear,
      model: input.model,
      createdBy: input.createdBy,
      createdAt,
    });

    const findings = input.findings.map((finding) => ({ id: crypto.randomUUID(), ...finding }));
    const nextProvenance = {
      ...currentProvenance,
      analysis: {
        id,
        analyzerId: input.analyzerId,
        analysisVersion: input.analysisVersion,
        sourceHash: input.sourceHash,
        sourceFormat: input.sourceFormat,
        classCount: input.model.classes.length,
        componentCount: input.model.components.length,
        studentCount: input.model.students.length,
        gradeSlotCount: input.model.gradeSlots.length,
      },
    };

    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO import_analyses
           (id, import_job_id, analyzer_id, analysis_version, source_hash, source_format,
            school_year, model_json, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          input.importJobId,
          input.analyzerId,
          input.analysisVersion,
          input.sourceHash,
          input.sourceFormat,
          input.schoolYear,
          JSON.stringify(input.model),
          input.createdBy,
          createdAt,
        ),
      ...findings.map((finding) =>
        this.db
          .prepare(
            `INSERT INTO import_findings
             (id, import_job_id, severity, code, location_json, details_json)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            finding.id,
            input.importJobId,
            finding.severity,
            finding.code,
            JSON.stringify(finding.location),
            JSON.stringify(finding.details),
          ),
      ),
      this.db
        .prepare(
          `UPDATE import_jobs
           SET state = 'analyzed', provenance_json = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(JSON.stringify(nextProvenance), createdAt, input.importJobId),
      this.db
        .prepare(
          `INSERT INTO audit_events
           (id, action, entity_type, entity_id, actor_id, correlation_id, details_json, occurred_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          'import_job.analyzed',
          'import_job',
          input.importJobId,
          input.createdBy,
          crypto.randomUUID(),
          JSON.stringify({
            reason: input.reason,
            analysisId: id,
            analyzerId: input.analyzerId,
            analysisVersion: input.analysisVersion,
            sourceHash: input.sourceHash,
            sourceFormat: input.sourceFormat,
            findingCount: findings.length,
          }),
          createdAt,
        ),
    ]);

    return analysis;
  }
}
