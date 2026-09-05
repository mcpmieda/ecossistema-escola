import type { GradebookImportPersistenceSummaryV2 } from '../../../../../shared/gradebook-contracts/imports/import-persistence-transport-v2';
import type { GradebookImportPersistenceResponseV6 } from '../../../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import type { AcademicPersistenceContextV1 } from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import { createGradebookD1PersistenceUnitOfWorkV2 } from '../composition/d1-persistence-unit-of-work-v1';
import {
  GradebookD1AtomicBatchRecorderV1,
  GradebookD1TransactionErrorV1,
  supportsAtomicBatch,
} from './d1-batch-promotion-transaction-v1';
import type { D1WriteDatabaseV1 } from '../write/d1-write-adapter-v1';
import type { GradebookImportStageSessionV1 } from '../imports/d1-import-staging-repository-v1';
import type { StagedImportMetaWritesV1 } from '../../../application/import/import-staging-capture-v1';

type Row = Record<string, unknown>;

type Preflight = {
  readonly chunkCount: number;
  readonly conflictingIntentCount: number;
  readonly missingSourceCount: number;
  readonly allKnownIdentical: boolean;
  readonly entityWrites: number;
  readonly componentNew: number;
  readonly componentChanged: number;
  readonly academicRecordNew: number;
  readonly academicRecordChanged: number;
  readonly associationWrites: number;
};

function integer(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : (() => {
        throw new Error('staged-promotion-preflight-invalid');
      })();
}

function bool(value: unknown): boolean {
  return value === 1 || value === true;
}

function writes(input: Omit<GradebookImportPersistenceSummaryV2['plannedWrites'], 'total'>) {
  return { ...input, total: Object.values(input).reduce((sum, value) => sum + value, 0) };
}

function summary(input: {
  readonly meta: StagedImportMetaWritesV1 | null;
  readonly preflight: Preflight;
  readonly committed: boolean;
}): GradebookImportPersistenceSummaryV2 {
  const logicalSources = input.meta?.logicalSourceCreates.length ?? 0;
  const sourceFileVersions = input.meta?.sourceFileWrites.length ?? 0;
  const importBatchVersions = input.meta?.importBatchWrites.length ?? 0;
  const planned = writes({
    logicalSources,
    sourceFileVersions,
    importBatchVersions,
    assessmentComponentVersions: input.preflight.componentNew + input.preflight.componentChanged,
    academicRecordVersions:
      input.preflight.academicRecordNew + input.preflight.academicRecordChanged,
    logicalSourceRecordAssociationVersions: input.preflight.associationWrites,
  });
  const committed = input.committed
    ? planned
    : writes({
        logicalSources: 0,
        sourceFileVersions: 0,
        importBatchVersions: 0,
        assessmentComponentVersions: 0,
        academicRecordVersions: 0,
        logicalSourceRecordAssociationVersions: 0,
      });
  return {
    assessmentDefinitions: {
      total: input.preflight.componentNew + input.preflight.componentChanged,
      resolved: input.preflight.componentNew + input.preflight.componentChanged,
      blocked: 0,
    },
    assessmentComponents: {
      unchanged: 0,
      new: input.preflight.componentNew,
      changed: input.preflight.componentChanged,
      blocked: 0,
    },
    academicRecords: {
      unchanged: 0,
      new: input.preflight.academicRecordNew,
      changed: input.preflight.academicRecordChanged,
      missingFromNewSource: input.preflight.missingSourceCount,
      blocked: 0,
    },
    plannedWrites: planned,
    committedWrites: committed,
  };
}

const PREFLIGHT_SQL = `WITH
entity_raw AS (
  SELECT json_extract(j.value, '$.record.kind') AS kind,
         json_extract(j.value, '$.record.value.id') AS stable_id,
         j.value AS intent
  FROM gradebook_import_stage_chunks c, json_each(c.payload_json, '$.writes.entities') j
  WHERE c.session_id = ?
),
record_raw AS (
  SELECT json_extract(j.value, '$.record.kind') AS kind,
         json_extract(j.value, '$.streamKey') AS stable_id,
         j.value AS intent
  FROM gradebook_import_stage_chunks c, json_each(c.payload_json, '$.writes.academicRecords') j
  WHERE c.session_id = ?
),
association_raw AS (
  SELECT json_extract(j.value, '$.stream.logicalSourceId') AS logical_source_id,
         json_extract(j.value, '$.streamKey') AS stable_id,
         j.value AS intent
  FROM gradebook_import_stage_chunks c, json_each(c.payload_json, '$.writes.associations') j
  WHERE c.session_id = ?
),
entity_unique AS (
  SELECT kind, stable_id, MIN(intent) AS intent, COUNT(DISTINCT intent) AS variants
  FROM entity_raw GROUP BY kind, stable_id
),
record_unique AS (
  SELECT kind, stable_id, MIN(intent) AS intent, COUNT(DISTINCT intent) AS variants
  FROM record_raw GROUP BY kind, stable_id
),
association_unique AS (
  SELECT logical_source_id, stable_id, MIN(intent) AS intent, COUNT(DISTINCT intent) AS variants
  FROM association_raw GROUP BY logical_source_id, stable_id
),
incoming AS (
  SELECT DISTINCT CAST(k.value AS TEXT) AS stable_key
  FROM gradebook_import_stage_chunks c, json_each(c.incoming_keys_json) k
  WHERE c.session_id = ?
),
session_meta AS (
  SELECT expected_chunk_count,
         json_extract(meta_write_json, '$.transactionRequest.logicalSource.value.id') AS logical_source_id
  FROM gradebook_import_stage_sessions WHERE session_id = ?
),
chunk_stats AS (
  SELECT COUNT(*) AS chunk_count,
         COALESCE(MIN(CASE WHEN json_extract(payload_json, '$.knownIdenticalContent') THEN 1 ELSE 0 END), 0) AS all_known_identical
  FROM gradebook_import_stage_chunks WHERE session_id = ?
),
missing AS (
  SELECT COUNT(*) AS count
  FROM logical_source_record_streams s, session_meta m
  WHERE m.logical_source_id IS NOT NULL
    AND s.logical_source_id = m.logical_source_id
    AND s.current_state = 'active'
    AND NOT EXISTS (SELECT 1 FROM incoming i WHERE i.stable_key = s.stream_key)
)
SELECT
  (SELECT chunk_count FROM chunk_stats) AS chunk_count,
  (SELECT COALESCE(SUM(variants - 1), 0) FROM entity_unique)
    + (SELECT COALESCE(SUM(variants - 1), 0) FROM record_unique)
    + (SELECT COALESCE(SUM(variants - 1), 0) FROM association_unique) AS conflicting_intent_count,
  CASE WHEN (SELECT all_known_identical FROM chunk_stats) = 1 THEN 0 ELSE (SELECT count FROM missing) END AS missing_source_count,
  (SELECT all_known_identical FROM chunk_stats) AS all_known_identical,
  (SELECT COUNT(*) FROM entity_unique) AS entity_writes,
  (SELECT COUNT(*) FROM entity_unique WHERE kind = 'assessment-component' AND json_extract(intent, '$.expectedVersion') IS NULL) AS component_new,
  (SELECT COUNT(*) FROM entity_unique WHERE kind = 'assessment-component' AND json_extract(intent, '$.expectedVersion') IS NOT NULL) AS component_changed,
  (SELECT COUNT(*) FROM record_unique WHERE json_extract(intent, '$.expectedVersion') IS NULL) AS academic_record_new,
  (SELECT COUNT(*) FROM record_unique WHERE json_extract(intent, '$.expectedVersion') IS NOT NULL) AS academic_record_changed,
  (SELECT COUNT(*) FROM association_unique) AS association_writes`;

function entityRequestedCte() {
  return `WITH raw AS (
    SELECT s.academic_year_id, j.value AS intent
    FROM gradebook_import_stage_chunks c
    JOIN gradebook_import_stage_sessions s ON s.session_id = c.session_id,
         json_each(c.payload_json, '$.writes.entities') j
    WHERE c.session_id = ?
  ), dedup AS (
    SELECT academic_year_id,
           json_extract(intent, '$.record.kind') AS entity_kind,
           json_extract(intent, '$.record.value.id') AS entity_id,
           MIN(intent) AS intent
    FROM raw GROUP BY academic_year_id, entity_kind, entity_id
  ), requested AS (
    SELECT academic_year_id, entity_kind, entity_id,
           CAST(json_extract(intent, '$.expectedVersion') AS INTEGER) AS expected_version,
           CAST(COALESCE(json_extract(intent, '$.expectedVersion'), 0) AS INTEGER) + 1 AS next_version,
           json_extract(intent, '$.record') AS record_json,
           json_extract(intent, '$.recordedAt') AS recorded_at
    FROM dedup
  ) `;
}

const ENTITY_STREAM_INSERT = `${entityRequestedCte()}
INSERT INTO academic_entity_streams (academic_year_id, entity_kind, entity_id, current_version, created_at)
SELECT academic_year_id, entity_kind, entity_id, next_version, recorded_at
FROM requested WHERE expected_version IS NULL`;

const ENTITY_STREAM_UPDATE = `${entityRequestedCte()}
UPDATE academic_entity_streams
SET current_version = (
  SELECT r.next_version FROM requested r
  WHERE r.academic_year_id = academic_entity_streams.academic_year_id
    AND r.entity_kind = academic_entity_streams.entity_kind
    AND r.entity_id = academic_entity_streams.entity_id
)
WHERE EXISTS (
  SELECT 1 FROM requested r
  WHERE r.expected_version IS NOT NULL
    AND r.academic_year_id = academic_entity_streams.academic_year_id
    AND r.entity_kind = academic_entity_streams.entity_kind
    AND r.entity_id = academic_entity_streams.entity_id
    AND r.expected_version = academic_entity_streams.current_version
)`;

const ENTITY_VERSION_INSERT = `${entityRequestedCte()}
INSERT INTO academic_entity_versions (
  academic_year_id, entity_kind, entity_id, version, previous_version,
  teacher_ref_kind, teacher_id, class_group_ref_kind, class_group_id,
  subject_ref_kind, subject_id, student_ref_kind, student_id,
  enrollment_ref_kind, enrollment_id, teaching_assignment_ref_kind, teaching_assignment_id,
  term, display_code, lifecycle_state, payload_json, recorded_at
)
SELECT academic_year_id, entity_kind, entity_id, next_version, expected_version,
  CASE WHEN entity_kind = 'teaching-assignment' THEN 'teacher' END,
  CASE WHEN entity_kind = 'teaching-assignment' THEN json_extract(record_json, '$.value.teacherId') END,
  CASE WHEN entity_kind IN ('teaching-assignment', 'enrollment') THEN 'class-group' END,
  CASE WHEN entity_kind IN ('teaching-assignment', 'enrollment') THEN json_extract(record_json, '$.value.classGroupId') END,
  CASE WHEN entity_kind = 'teaching-assignment' THEN 'subject' END,
  CASE WHEN entity_kind = 'teaching-assignment' THEN json_extract(record_json, '$.value.subjectId') END,
  CASE WHEN entity_kind = 'enrollment' THEN 'student' END,
  CASE WHEN entity_kind = 'enrollment' THEN json_extract(record_json, '$.value.studentId') END,
  CASE WHEN entity_kind = 'student-status-event' THEN 'enrollment' END,
  CASE WHEN entity_kind = 'student-status-event' THEN json_extract(record_json, '$.value.enrollmentId') END,
  CASE WHEN entity_kind = 'assessment-component' THEN 'teaching-assignment' END,
  CASE WHEN entity_kind = 'assessment-component' THEN json_extract(record_json, '$.value.teachingAssignmentId') END,
  CASE WHEN entity_kind = 'assessment-component' THEN CAST(json_extract(record_json, '$.value.term') AS INTEGER) END,
  CASE entity_kind
    WHEN 'teacher' THEN json_extract(record_json, '$.value.displayName')
    WHEN 'class-group' THEN json_extract(record_json, '$.value.code')
    WHEN 'subject' THEN json_extract(record_json, '$.value.code')
    WHEN 'teaching-assignment' THEN json_extract(record_json, '$.value.sourceDisciplineIndex')
    WHEN 'student' THEN json_extract(record_json, '$.value.displayName')
    WHEN 'enrollment' THEN CAST(json_extract(record_json, '$.value.sourcePosition') AS TEXT)
    WHEN 'student-status-event' THEN json_extract(record_json, '$.value.sourceReference')
    WHEN 'assessment-component' THEN json_extract(record_json, '$.value.name')
  END,
  CASE entity_kind
    WHEN 'teacher' THEN json_extract(record_json, '$.value.status')
    WHEN 'subject' THEN json_extract(record_json, '$.value.status')
    WHEN 'teaching-assignment' THEN json_extract(record_json, '$.value.confirmationOrigin')
    WHEN 'enrollment' THEN json_extract(record_json, '$.value.position')
    WHEN 'student-status-event' THEN json_extract(record_json, '$.value.status')
    WHEN 'assessment-component' THEN json_extract(record_json, '$.value.applicability.state')
  END,
  record_json, recorded_at
FROM requested`;

function recordRequestedCte() {
  return `WITH raw AS (
    SELECT s.academic_year_id, j.value AS intent
    FROM gradebook_import_stage_chunks c
    JOIN gradebook_import_stage_sessions s ON s.session_id = c.session_id,
         json_each(c.payload_json, '$.writes.academicRecords') j
    WHERE c.session_id = ?
  ), dedup AS (
    SELECT academic_year_id,
           json_extract(intent, '$.record.kind') AS record_kind,
           json_extract(intent, '$.streamKey') AS stream_key,
           MIN(intent) AS intent
    FROM raw GROUP BY academic_year_id, record_kind, stream_key
  ), requested AS (
    SELECT academic_year_id, record_kind, stream_key,
           CAST(json_extract(intent, '$.expectedVersion') AS INTEGER) AS expected_version,
           CAST(COALESCE(json_extract(intent, '$.expectedVersion'), 0) AS INTEGER) + 1 AS next_version,
           json_extract(intent, '$.stream') AS stream_json,
           json_extract(intent, '$.record') AS record_json,
           json_extract(intent, '$.recordedAt') AS recorded_at
    FROM dedup
  ) `;
}

const RECORD_STREAM_INSERT = `${recordRequestedCte()}
INSERT INTO academic_record_streams (
  academic_year_id, record_kind, stream_key, current_version,
  student_id, enrollment_id, assessment_component_ref_kind, assessment_component_id,
  teaching_assignment_ref_kind, teaching_assignment_id, term, created_at
)
SELECT academic_year_id, record_kind, stream_key, next_version,
  json_extract(stream_json, '$.studentId'), json_extract(stream_json, '$.enrollmentId'),
  CASE WHEN record_kind = 'grade-entry' THEN 'assessment-component' END,
  CASE WHEN record_kind = 'grade-entry' THEN json_extract(stream_json, '$.assessmentComponentId') END,
  CASE WHEN record_kind IN ('term-result', 'final-recovery', 'annual-result') THEN 'teaching-assignment' END,
  CASE WHEN record_kind IN ('term-result', 'final-recovery', 'annual-result') THEN json_extract(stream_json, '$.teachingAssignmentId') END,
  CASE
    WHEN record_kind = 'term-result' THEN CAST(json_extract(stream_json, '$.term') AS INTEGER)
    WHEN record_kind = 'final-recovery' THEN CAST(json_extract(stream_json, '$.recoveredTerm') AS INTEGER)
  END,
  recorded_at
FROM requested WHERE expected_version IS NULL`;

const RECORD_STREAM_UPDATE = `${recordRequestedCte()}
UPDATE academic_record_streams
SET current_version = (
  SELECT r.next_version FROM requested r
  WHERE r.academic_year_id = academic_record_streams.academic_year_id
    AND r.record_kind = academic_record_streams.record_kind
    AND r.stream_key = academic_record_streams.stream_key
)
WHERE EXISTS (
  SELECT 1 FROM requested r
  WHERE r.expected_version IS NOT NULL
    AND r.academic_year_id = academic_record_streams.academic_year_id
    AND r.record_kind = academic_record_streams.record_kind
    AND r.stream_key = academic_record_streams.stream_key
    AND r.expected_version = academic_record_streams.current_version
)`;

const RECORD_VERSION_INSERT = `${recordRequestedCte()}
INSERT INTO academic_record_versions (
  academic_year_id, record_kind, stream_key, version, previous_version,
  record_id, authority_mode, rule_version, payload_json, recorded_at
)
SELECT academic_year_id, record_kind, stream_key, next_version, expected_version,
  json_extract(record_json, '$.value.id'),
  json_extract(record_json, '$.value.authorityMode'),
  json_extract(record_json, '$.value.ruleVersion'),
  record_json, recorded_at
FROM requested`;

function associationRequestedCte() {
  return `WITH raw AS (
    SELECT s.academic_year_id, j.value AS intent
    FROM gradebook_import_stage_chunks c
    JOIN gradebook_import_stage_sessions s ON s.session_id = c.session_id,
         json_each(c.payload_json, '$.writes.associations') j
    WHERE c.session_id = ?
  ), dedup AS (
    SELECT academic_year_id,
           json_extract(intent, '$.stream.logicalSourceId') AS logical_source_id,
           json_extract(intent, '$.stream.academicRecordStream.kind') AS record_kind,
           json_extract(intent, '$.streamKey') AS stream_key,
           MIN(intent) AS intent
    FROM raw GROUP BY academic_year_id, logical_source_id, record_kind, stream_key
  ), requested AS (
    SELECT academic_year_id, logical_source_id, record_kind, stream_key,
           CAST(json_extract(intent, '$.expectedVersion') AS INTEGER) AS expected_version,
           CAST(COALESCE(json_extract(intent, '$.expectedVersion'), 0) AS INTEGER) + 1 AS next_version,
           json_extract(intent, '$.value') AS value_json,
           json_extract(intent, '$.recordedAt') AS recorded_at
    FROM dedup
  ) `;
}

const ASSOCIATION_STREAM_INSERT = `${associationRequestedCte()}
INSERT INTO logical_source_record_streams (
  academic_year_id, logical_source_id, record_kind, stream_key,
  current_version, current_state, created_at
)
SELECT academic_year_id, logical_source_id, record_kind, stream_key,
  next_version, json_extract(value_json, '$.state'), recorded_at
FROM requested WHERE expected_version IS NULL`;

const ASSOCIATION_STREAM_UPDATE = `${associationRequestedCte()}
UPDATE logical_source_record_streams
SET current_version = (
      SELECT r.next_version FROM requested r
      WHERE r.academic_year_id = logical_source_record_streams.academic_year_id
        AND r.logical_source_id = logical_source_record_streams.logical_source_id
        AND r.record_kind = logical_source_record_streams.record_kind
        AND r.stream_key = logical_source_record_streams.stream_key
    ),
    current_state = (
      SELECT json_extract(r.value_json, '$.state') FROM requested r
      WHERE r.academic_year_id = logical_source_record_streams.academic_year_id
        AND r.logical_source_id = logical_source_record_streams.logical_source_id
        AND r.record_kind = logical_source_record_streams.record_kind
        AND r.stream_key = logical_source_record_streams.stream_key
    )
WHERE EXISTS (
  SELECT 1 FROM requested r
  WHERE r.expected_version IS NOT NULL
    AND r.academic_year_id = logical_source_record_streams.academic_year_id
    AND r.logical_source_id = logical_source_record_streams.logical_source_id
    AND r.record_kind = logical_source_record_streams.record_kind
    AND r.stream_key = logical_source_record_streams.stream_key
    AND r.expected_version = logical_source_record_streams.current_version
)`;

const ASSOCIATION_VERSION_INSERT = `${associationRequestedCte()}
INSERT INTO logical_source_record_versions (
  academic_year_id, logical_source_id, record_kind, stream_key,
  version, previous_version, association_state,
  source_manifest_id, source_manifest_version, recorded_at
)
SELECT academic_year_id, logical_source_id, record_kind, stream_key,
  next_version, expected_version, json_extract(value_json, '$.state'),
  json_extract(value_json, '$.sourceManifestId'),
  CAST(json_extract(value_json, '$.sourceManifestVersion') AS INTEGER),
  recorded_at
FROM requested`;

function parseMeta(value: string | null): StagedImportMetaWritesV1 | null {
  if (value === null) return null;
  const parsed: unknown = JSON.parse(value);
  return parsed === null ? null : (parsed as StagedImportMetaWritesV1);
}

async function preflight(database: D1WriteDatabaseV1, sessionId: string): Promise<Preflight> {
  const row = await database
    .prepare(PREFLIGHT_SQL)
    .bind(sessionId, sessionId, sessionId, sessionId, sessionId, sessionId)
    .first<Row>();
  if (!row) throw new Error('staged-promotion-preflight-missing');
  return {
    chunkCount: integer(row.chunk_count),
    conflictingIntentCount: integer(row.conflicting_intent_count),
    missingSourceCount: integer(row.missing_source_count),
    allKnownIdentical: bool(row.all_known_identical),
    entityWrites: integer(row.entity_writes),
    componentNew: integer(row.component_new),
    componentChanged: integer(row.component_changed),
    academicRecordNew: integer(row.academic_record_new),
    academicRecordChanged: integer(row.academic_record_changed),
    associationWrites: integer(row.association_writes),
  };
}

export class GradebookD1ImportStagingPromotionV1 {
  constructor(
    private readonly database: D1WriteDatabaseV1,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async finalize(
    session: GradebookImportStageSessionV1,
  ): Promise<GradebookImportPersistenceResponseV6> {
    if (session.state === 'committed' && session.resultJson) {
      return JSON.parse(session.resultJson) as GradebookImportPersistenceResponseV6;
    }
    if (session.state !== 'preparing') {
      return { transportVersion: 6, state: 'conflict' };
    }
    const check = await preflight(this.database, session.sessionId);
    const meta = parseMeta(session.metaWriteJson);
    if (
      check.chunkCount !== session.expectedChunkCount ||
      check.conflictingIntentCount > 0 ||
      (!check.allKnownIdentical && meta === null)
    ) {
      return { transportVersion: 6, state: 'conflict' };
    }
    const plannedSummary = summary({ meta, preflight: check, committed: false });
    if (check.missingSourceCount > 0) {
      return {
        transportVersion: 6,
        state: 'review-required',
        summary: plannedSummary,
        issues: [{ code: 'missing-from-new-source', scope: 'file' }],
      };
    }
    if (!supportsAtomicBatch(this.database)) {
      return { transportVersion: 6, state: 'unavailable' };
    }

    const recorder = new GradebookD1AtomicBatchRecorderV1(this.database);
    const sessionId = session.sessionId;
    const entityNew = await this.countByExpected(sessionId, 'entities', null);
    const entityChanged = check.entityWrites - entityNew;
    const recordNew = check.academicRecordNew;
    const recordChanged = check.academicRecordChanged;
    const associationNew = await this.countByExpected(sessionId, 'associations', null);
    const associationChanged = check.associationWrites - associationNew;

    if (entityNew > 0) {
      recorder.recordMutation(this.database.prepare(ENTITY_STREAM_INSERT).bind(sessionId), entityNew);
    }
    if (entityChanged > 0) {
      recorder.recordMutation(this.database.prepare(ENTITY_STREAM_UPDATE).bind(sessionId), entityChanged);
    }
    if (check.entityWrites > 0) {
      recorder.recordMutation(
        this.database.prepare(ENTITY_VERSION_INSERT).bind(sessionId),
        check.entityWrites,
      );
    }

    if (meta) {
      const context = { academicYearId: session.academicYearId } satisfies AcademicPersistenceContextV1;
      const unit = createGradebookD1PersistenceUnitOfWorkV2(recorder, {
        now: this.now,
        bootstrapManifestVersions: new Map(
          meta.transactionRequest.plannedSourceFileManifestIds.map((id) => [id, 1]),
        ),
      });
      for (const source of meta.logicalSourceCreates) {
        const result = await unit.logicalSources.createInitial(context, source);
        if (result.status === 'resolution-conflict') {
          return { transportVersion: 6, state: 'conflict' };
        }
      }
      for (const write of meta.sourceFileWrites) {
        const result = await unit.imports.appendSourceFileVersion(context, write.value, {
          expectedVersion: write.expectedVersion,
        });
        if (result.status === 'version-conflict') return { transportVersion: 6, state: 'conflict' };
      }
      for (const write of meta.importBatchWrites) {
        const result = await unit.imports.appendImportBatchVersion(context, write.value, {
          expectedVersion: write.expectedVersion,
        });
        if (result.status === 'version-conflict') return { transportVersion: 6, state: 'conflict' };
      }
    }

    if (recordNew > 0) {
      recorder.recordMutation(this.database.prepare(RECORD_STREAM_INSERT).bind(sessionId), recordNew);
    }
    if (recordChanged > 0) {
      recorder.recordMutation(this.database.prepare(RECORD_STREAM_UPDATE).bind(sessionId), recordChanged);
    }
    if (recordNew + recordChanged > 0) {
      recorder.recordMutation(
        this.database.prepare(RECORD_VERSION_INSERT).bind(sessionId),
        recordNew + recordChanged,
      );
    }
    if (associationNew > 0) {
      recorder.recordMutation(
        this.database.prepare(ASSOCIATION_STREAM_INSERT).bind(sessionId),
        associationNew,
      );
    }
    if (associationChanged > 0) {
      recorder.recordMutation(
        this.database.prepare(ASSOCIATION_STREAM_UPDATE).bind(sessionId),
        associationChanged,
      );
    }
    if (check.associationWrites > 0) {
      recorder.recordMutation(
        this.database.prepare(ASSOCIATION_VERSION_INSERT).bind(sessionId),
        check.associationWrites,
      );
    }

    const committedSummary = summary({ meta, preflight: check, committed: true });
    const academicWrites =
      committedSummary.committedWrites.assessmentComponentVersions +
      committedSummary.committedWrites.academicRecordVersions +
      committedSummary.committedWrites.logicalSourceRecordAssociationVersions;
    const response: GradebookImportPersistenceResponseV6 = {
      transportVersion: 6,
      state: academicWrites > 0 ? 'applied' : 'no-changes',
      summary: committedSummary,
    };
    const committedAt = this.now();
    recorder.recordMutation(
      this.database
        .prepare(
          `UPDATE gradebook_import_stage_sessions
           SET state = 'committed', result_json = ?, committed_at = ?, updated_at = ?
           WHERE session_id = ? AND state = 'preparing'`,
        )
        .bind(JSON.stringify(response), committedAt, committedAt, sessionId),
      1,
    );

    try {
      await recorder.commit();
      return response;
    } catch (cause) {
      if (cause instanceof GradebookD1TransactionErrorV1) {
        return { transportVersion: 6, state: 'conflict' };
      }
      return { transportVersion: 6, state: 'unavailable' };
    }
  }

  private async countByExpected(
    sessionId: string,
    family: 'entities' | 'associations',
    expectedVersion: number | null,
  ): Promise<number> {
    const path = family === 'entities' ? '$.writes.entities' : '$.writes.associations';
    const key =
      family === 'entities'
        ? `json_extract(j.value, '$.record.kind') || char(0) || json_extract(j.value, '$.record.value.id')`
        : `json_extract(j.value, '$.stream.logicalSourceId') || char(0) || json_extract(j.value, '$.streamKey')`;
    const predicate =
      expectedVersion === null
        ? `json_extract(j.value, '$.expectedVersion') IS NULL`
        : `json_extract(j.value, '$.expectedVersion') = ?`;
    const sql = `SELECT COUNT(*) AS count FROM (
      SELECT ${key} AS stable_id
      FROM gradebook_import_stage_chunks c, json_each(c.payload_json, '${path}') j
      WHERE c.session_id = ? AND ${predicate}
      GROUP BY stable_id
    )`;
    const statement = this.database.prepare(sql);
    const row = expectedVersion === null
      ? await statement.bind(sessionId).first<Row>()
      : await statement.bind(sessionId, expectedVersion).first<Row>();
    return row ? integer(row.count) : 0;
  }
}
