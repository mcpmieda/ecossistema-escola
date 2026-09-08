import type { D1WriteDatabaseV1 } from '../d1/write/d1-write-adapter-v1';

type PostgresFactoryV1 = typeof import('postgres');
type RowV1 = Record<string, unknown>;

interface PostgresResultV1 extends ReadonlyArray<RowV1> {
  readonly count?: number | null;
}

export interface GradebookBackfillQuerySqlV1 {
  unsafe(query: string, parameters?: readonly unknown[]): PromiseLike<PostgresResultV1>;
  typed?(value: string, oid: number): unknown;
}

export interface GradebookBackfillSqlV1 extends GradebookBackfillQuerySqlV1 {
  begin<T>(operation: (sql: GradebookBackfillQuerySqlV1) => Promise<T>): Promise<T>;
  end?(options?: { readonly timeout?: number }): Promise<void>;
}

export interface GradebookBackfillFamilyV1 {
  readonly name: string;
  readonly columns: readonly string[];
  readonly primaryKey: readonly string[];
}

function family(name: string, columns: string, primaryKey: string): GradebookBackfillFamilyV1 {
  return {
    name,
    columns: columns.split(','),
    primaryKey: primaryKey.split(','),
  };
}

/**
 * Topological order is intentional: every referenced row is copied before its
 * dependants. The allowlist is also the complete SQL-injection boundary for the
 * private backfill endpoint.
 */
export const GRADEBOOK_BACKFILL_FAMILIES_V1 = [
  family(
    'academic_years',
    'academic_year_id,school_id,year,current_version,created_at',
    'academic_year_id',
  ),
  family(
    'academic_year_configuration_versions',
    'academic_year_id,configuration_id,version,previous_version,evaluation_profile_id,payload_json,recorded_at',
    'academic_year_id,configuration_id,version',
  ),
  family(
    'academic_year_versions',
    'academic_year_id,version,previous_version,status,starts_on,ends_on,active_evaluation_profile_id,configuration_id,configuration_version,payload_json,recorded_at',
    'academic_year_id,version',
  ),
  family(
    'academic_entity_streams',
    'academic_year_id,entity_kind,entity_id,current_version,created_at',
    'academic_year_id,entity_kind,entity_id',
  ),
  family(
    'academic_entity_versions',
    'academic_year_id,entity_kind,entity_id,version,previous_version,teacher_ref_kind,teacher_id,class_group_ref_kind,class_group_id,subject_ref_kind,subject_id,student_ref_kind,student_id,enrollment_ref_kind,enrollment_id,teaching_assignment_ref_kind,teaching_assignment_id,term,display_code,lifecycle_state,payload_json,recorded_at',
    'academic_year_id,entity_kind,entity_id,version',
  ),
  family(
    'logical_sources',
    'academic_year_id,logical_source_id,teacher_ref_kind,teacher_id,class_group_ref_kind,class_group_id,subject_ref_kind,subject_id,source_context,created_at',
    'academic_year_id,logical_source_id',
  ),
  family(
    'source_file_streams',
    'academic_year_id,manifest_id,current_version,current_sha256,created_at',
    'academic_year_id,manifest_id',
  ),
  family(
    'source_file_versions',
    'academic_year_id,manifest_id,version,previous_version,file_name,extension,reported_mime_type,size_bytes,last_modified_at,sha256,source_contract_version,parser_version,read_at,suggested_academic_year,confirmed_academic_year_id,suggested_teacher_name,confirmed_teacher_ref_kind,confirmed_teacher_id,logical_source_state,confirmed_logical_source_id,payload_json,recorded_at',
    'academic_year_id,manifest_id,version',
  ),
  family(
    'source_file_logical_source_candidates',
    'academic_year_id,manifest_id,source_file_version,logical_source_id',
    'academic_year_id,manifest_id,source_file_version,logical_source_id',
  ),
  family(
    'import_batch_streams',
    'academic_year_id,import_batch_id,current_version,created_at',
    'academic_year_id,import_batch_id',
  ),
  family(
    'import_batch_versions',
    'academic_year_id,import_batch_id,version,previous_version,status,received_at,updated_at,summary_json,payload_json,recorded_at',
    'academic_year_id,import_batch_id,version',
  ),
  family(
    'import_batch_files',
    'academic_year_id,import_batch_id,batch_version,import_file_id,manifest_id,manifest_version,status,file_name,extension,reported_mime_type,size_bytes,last_modified_at,payload_json',
    'academic_year_id,import_batch_id,batch_version,import_file_id',
  ),
  family(
    'import_diagnostics',
    'academic_year_id,import_batch_id,batch_version,diagnostic_id,import_file_id,manifest_id,manifest_version,severity,code,message,location_kind,sheet_name,cell_address,entity_kind,entity_id,source_evidence_json,payload_json',
    'academic_year_id,import_batch_id,batch_version,diagnostic_id',
  ),
  family(
    'academic_record_streams',
    'academic_year_id,record_kind,stream_key,current_version,student_ref_kind,student_id,enrollment_ref_kind,enrollment_id,assessment_component_ref_kind,assessment_component_id,teaching_assignment_ref_kind,teaching_assignment_id,term,created_at',
    'academic_year_id,record_kind,stream_key',
  ),
  family(
    'academic_record_versions',
    'academic_year_id,record_kind,stream_key,version,previous_version,record_id,authority_mode,rule_version,payload_json,recorded_at',
    'academic_year_id,record_kind,stream_key,version',
  ),
  family(
    'audit_record_streams',
    'academic_year_id,audit_kind,audit_record_id,current_version,created_at',
    'academic_year_id,audit_kind,audit_record_id',
  ),
  family(
    'audit_record_versions',
    'academic_year_id,audit_kind,audit_record_id,version,previous_version,import_batch_id,severity,category,occurrence_state,reconciliation_status,target_kind,target_record_id,target_stream_key,difference,tolerance,rule_version,entity_kind,entity_id,source_manifest_id,source_manifest_version,source_sheet_name,source_cell_address,payload_json,recorded_at',
    'academic_year_id,audit_kind,audit_record_id,version',
  ),
  family(
    'audit_occurrence_transitions',
    'academic_year_id,audit_kind,occurrence_id,transition_sequence,previous_state,next_state,actor_id,occurred_at,note,justification',
    'academic_year_id,occurrence_id,transition_sequence',
  ),
  family(
    'logical_source_record_streams',
    'academic_year_id,logical_source_id,record_kind,stream_key,current_version,current_state,created_at',
    'academic_year_id,logical_source_id,record_kind,stream_key',
  ),
  family(
    'logical_source_record_versions',
    'academic_year_id,logical_source_id,record_kind,stream_key,version,previous_version,association_state,source_manifest_id,source_manifest_version,recorded_at',
    'academic_year_id,logical_source_id,record_kind,stream_key,version',
  ),
  family(
    'bulletin_snapshot_streams',
    'series_key,academic_year_id,snapshot_id,current_version,class_group_id,student_id,enrollment_id,created_at',
    'series_key',
  ),
  family(
    'bulletin_snapshot_versions',
    'series_key,academic_year_id,snapshot_id,version,previous_version,class_group_id,student_id,enrollment_id,emitted_at,payload_json',
    'snapshot_id,version',
  ),
  family(
    'council_decision_streams',
    'academic_year_id,class_reference,student_reference,current_version,created_at',
    'academic_year_id,class_reference,student_reference',
  ),
  family(
    'council_decision_versions',
    'academic_year_id,class_reference,student_reference,version,previous_version,decision_reference,decision_outcome,resulting_state,justification,actor_reference,decided_at,payload_json',
    'academic_year_id,class_reference,student_reference,version',
  ),
  family(
    'council_session_streams',
    'academic_year_id,class_reference,current_version,state',
    'academic_year_id,class_reference',
  ),
  family(
    'council_session_versions',
    'academic_year_id,class_reference,version,previous_version,state,closure_reference,payload_json',
    'academic_year_id,class_reference,version',
  ),
  family(
    'gradebook_import_stage_sessions',
    'session_id,academic_year_id,source_sha256,expected_chunk_count,state,metadata_json,meta_write_json,result_json,created_at,updated_at,expires_at,committed_at',
    'session_id',
  ),
  family(
    'gradebook_import_stage_chunks',
    'session_id,chunk_index,chunk_hash,payload_json,incoming_keys_json,entity_write_count,academic_record_write_count,association_write_count,created_at',
    'session_id,chunk_index',
  ),
] as const;

const FAMILY_BY_NAME = new Map(
  GRADEBOOK_BACKFILL_FAMILIES_V1.map((definition) => [definition.name, definition]),
);
const POSTGRES_TEXT_OID_V1 = 25;

export function gradebookBackfillFamilyV1(name: string): GradebookBackfillFamilyV1 | null {
  return FAMILY_BY_NAME.get(name) ?? null;
}

function integer(value: unknown): number {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'bigint') {
    const result = Number(value);
    if (Number.isSafeInteger(result)) return result;
  }
  if (typeof value === 'string' && /^\d+$/u.test(value)) {
    const result = Number(value);
    if (Number.isSafeInteger(result)) return result;
  }
  throw new Error('gradebook-backfill-result-invalid');
}

function quote(identifier: string): string {
  if (!/^[a-z][a-z0-9_]*$/u.test(identifier)) {
    throw new Error('gradebook-backfill-identifier-invalid');
  }
  return `"${identifier}"`;
}

function jsonParameter(sql: GradebookBackfillQuerySqlV1, value: string): unknown {
  return sql.typed ? sql.typed(value, POSTGRES_TEXT_OID_V1) : value;
}

function sourceRowsJson(
  rows: readonly RowV1[],
  familyDefinition: GradebookBackfillFamilyV1,
): string {
  const projected = rows.map((row) =>
    Object.fromEntries(familyDefinition.columns.map((column) => [column, row[column] ?? null])),
  );
  const value = JSON.stringify(projected);
  if (!value) throw new Error('gradebook-backfill-json-invalid');
  return value;
}

export interface GradebookBackfillPageInputV1 {
  readonly family: GradebookBackfillFamilyV1;
  readonly afterRowId: number;
  readonly limit: number;
}

export interface GradebookBackfillPageResultV1 {
  readonly family: string;
  readonly read: number;
  readonly changed: number;
  readonly afterRowId: number;
  readonly complete: boolean;
}

/**
 * Copies and verifies one bounded page. D1 is only accessed through all(); the
 * PostgreSQL upsert and the exact composite-row comparison share one transaction.
 */
export async function backfillGradebookFamilyPageV1(
  source: D1WriteDatabaseV1,
  target: GradebookBackfillSqlV1,
  input: GradebookBackfillPageInputV1,
): Promise<GradebookBackfillPageResultV1> {
  const { family: definition, afterRowId, limit } = input;
  if (!Number.isSafeInteger(afterRowId) || afterRowId < 0) {
    throw new Error('gradebook-backfill-cursor-invalid');
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) {
    throw new Error('gradebook-backfill-limit-invalid');
  }

  const columns = definition.columns.map(quote).join(', ');
  const sourceResult = await source
    .prepare(
      `SELECT rowid AS __backfill_rowid, ${columns} FROM ${quote(definition.name)} WHERE rowid > ? ORDER BY rowid LIMIT ?`,
    )
    .bind(afterRowId, limit)
    .all<RowV1>();
  const rows = sourceResult.results;
  if (rows.length === 0) {
    return { family: definition.name, read: 0, changed: 0, afterRowId, complete: true };
  }

  const lastRowId = integer(rows.at(-1)?.__backfill_rowid);
  const body = sourceRowsJson(rows, definition);
  const relation = `gradebook.${quote(definition.name)}`;
  const recordset = `jsonb_populate_recordset(NULL::${relation}, $1::jsonb)`;
  const conflictColumns = definition.primaryKey.map(quote).join(', ');
  const mutableColumns = definition.columns.filter(
    (column) => !definition.primaryKey.includes(column),
  );
  const assignments = mutableColumns
    .map((column) => `${quote(column)} = EXCLUDED.${quote(column)}`)
    .join(', ');
  const distinctColumns = definition.columns
    .map((column) => `persisted.${quote(column)} IS DISTINCT FROM EXCLUDED.${quote(column)}`)
    .join(' OR ');
  const changed = await target.begin(async (transaction) => {
    await transaction.unsafe(
      `SELECT set_config('statement_timeout', '40000', true), ` +
        `set_config('lock_timeout', '5000', true), ` +
        `set_config('idle_in_transaction_session_timeout', '10000', true)`,
    );
    const parameter = jsonParameter(transaction, body);
    const applied = await transaction.unsafe(
      `INSERT INTO ${relation} AS persisted (${columns}) SELECT ${columns} FROM ${recordset} ` +
        `ON CONFLICT (${conflictColumns}) DO UPDATE SET ${assignments} WHERE ${distinctColumns} RETURNING 1`,
      [parameter],
    );
    // The conflict WHERE compares every target column. A successful statement
    // therefore leaves every incoming row exact: inserts/changes are returned,
    // while only already-identical conflicts can be omitted from RETURNING.
    return typeof applied.count === 'number' ? applied.count : applied.length;
  });

  return {
    family: definition.name,
    read: rows.length,
    changed,
    afterRowId: lastRowId,
    complete: rows.length < limit,
  };
}

export interface GradebookBackfillFamilyCountV1 {
  readonly family: string;
  readonly source: number;
  readonly target: number;
}

export async function inspectGradebookBackfillCountsV1(
  source: D1WriteDatabaseV1,
  target: GradebookBackfillQuerySqlV1,
): Promise<readonly GradebookBackfillFamilyCountV1[]> {
  const counts: GradebookBackfillFamilyCountV1[] = [];
  for (const definition of GRADEBOOK_BACKFILL_FAMILIES_V1) {
    const sourceRow = await source
      .prepare(`SELECT COUNT(*) AS count FROM ${quote(definition.name)}`)
      .first<RowV1>();
    const targetRows = await target.unsafe(
      `SELECT COUNT(*) AS count FROM gradebook.${quote(definition.name)}`,
    );
    counts.push({
      family: definition.name,
      source: integer(sourceRow?.count),
      target: integer(targetRows[0]?.count),
    });
  }
  return counts;
}

const VERSION_INVARIANTS_V1 = [
  ['academic_years', 'academic_year_versions', 'academic_year_id'],
  ['academic_entity_streams', 'academic_entity_versions', 'academic_year_id,entity_kind,entity_id'],
  ['source_file_streams', 'source_file_versions', 'academic_year_id,manifest_id'],
  ['import_batch_streams', 'import_batch_versions', 'academic_year_id,import_batch_id'],
  [
    'academic_record_streams',
    'academic_record_versions',
    'academic_year_id,record_kind,stream_key',
  ],
  ['audit_record_streams', 'audit_record_versions', 'academic_year_id,audit_kind,audit_record_id'],
  [
    'logical_source_record_streams',
    'logical_source_record_versions',
    'academic_year_id,logical_source_id,record_kind,stream_key',
  ],
  ['bulletin_snapshot_streams', 'bulletin_snapshot_versions', 'snapshot_id'],
  [
    'council_decision_streams',
    'council_decision_versions',
    'academic_year_id,class_reference,student_reference',
  ],
  ['council_session_streams', 'council_session_versions', 'academic_year_id,class_reference'],
] as const;

export interface GradebookBackfillIntegrityV1 {
  readonly state: 'passed' | 'failed';
  readonly families: readonly GradebookBackfillFamilyCountV1[];
  readonly countDivergences: number;
  readonly versionDivergences: number;
  readonly invalidAuthorityRows: number;
  readonly unvalidatedForeignKeys: number;
}

export async function verifyGradebookBackfillIntegrityV1(
  source: D1WriteDatabaseV1,
  target: GradebookBackfillQuerySqlV1,
): Promise<GradebookBackfillIntegrityV1> {
  const families = await inspectGradebookBackfillCountsV1(source, target);
  let versionDivergences = 0;
  for (const [streams, versions, keyList] of VERSION_INVARIANTS_V1) {
    const keys = keyList.split(',').map(quote);
    const join = keys.map((key) => `streams.${key} = versions.${key}`).join(' AND ');
    const group = keys.map((key) => `streams.${key}`).join(', ');
    const rows = await target.unsafe(
      `SELECT COUNT(*) AS count FROM (` +
        `SELECT ${group}, streams.current_version, MAX(versions.version) AS maximum_version ` +
        `FROM gradebook.${quote(streams)} AS streams ` +
        `LEFT JOIN gradebook.${quote(versions)} AS versions ON ${join} ` +
        `GROUP BY ${group}, streams.current_version ` +
        `HAVING streams.current_version IS DISTINCT FROM MAX(versions.version)) AS divergent`,
    );
    versionDivergences += integer(rows[0]?.count);
  }
  const authority = await target.unsafe(
    `SELECT COUNT(*) AS count FROM gradebook.academic_record_versions WHERE authority_mode <> 'imported-source'`,
  );
  const constraints = await target.unsafe(
    `SELECT COUNT(*) AS count FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace ` +
      `WHERE n.nspname = 'gradebook' AND c.contype = 'f' AND NOT c.convalidated`,
  );
  const countDivergences = families.filter((value) => value.source !== value.target).length;
  const invalidAuthorityRows = integer(authority[0]?.count);
  const unvalidatedForeignKeys = integer(constraints[0]?.count);
  return {
    state:
      countDivergences === 0 &&
      versionDivergences === 0 &&
      invalidAuthorityRows === 0 &&
      unvalidatedForeignKeys === 0
        ? 'passed'
        : 'failed',
    families,
    countDivergences,
    versionDivergences,
    invalidAuthorityRows,
    unvalidatedForeignKeys,
  };
}

function postgresModuleDefault(module: unknown): PostgresFactoryV1 {
  if (typeof module === 'function') return module as PostgresFactoryV1;
  if (
    module !== null &&
    typeof module === 'object' &&
    'default' in module &&
    typeof module.default === 'function'
  ) {
    return module.default as PostgresFactoryV1;
  }
  throw new Error('gradebook-backfill-driver-load-failed');
}

export async function createGradebookBackfillSqlV1(
  connectionString: string,
): Promise<GradebookBackfillSqlV1> {
  if (connectionString.trim().length === 0) {
    throw new Error('gradebook-backfill-connection-string-missing');
  }
  const postgres = postgresModuleDefault(await import('postgres'));
  return postgres(connectionString, {
    max: 2,
    fetch_types: false,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 2,
    max_lifetime: 60,
    connection: {
      application_name: 'ecossistema-escola-gradebook-backfill',
      statement_timeout: 45_000,
      lock_timeout: 5_000,
      idle_in_transaction_session_timeout: 45_000,
    },
  }) as unknown as GradebookBackfillSqlV1;
}
