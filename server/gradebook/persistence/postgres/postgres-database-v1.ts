import type {
  D1WriteDatabaseV1,
  D1WriteRunResultV1,
  D1WriteStatementV1,
  D1WriteValueV1,
} from '../d1/write/d1-write-adapter-v1';
import { replaceImportSqlParametersV1 } from '../d1/transaction/d1-bounded-import-transport-v1';

type PostgresFactoryV1 = typeof import('postgres');
type PostgresRowV1 = Record<string, unknown>;

interface PostgresQueryResultV1 extends ReadonlyArray<PostgresRowV1> {
  readonly count?: number | null;
}

export interface GradebookPostgresQuerySqlV1 {
  unsafe(query: string, parameters?: readonly unknown[]): PromiseLike<PostgresQueryResultV1>;
  typed?(value: string, oid: number): unknown;
}

export interface GradebookPostgresSqlV1 extends GradebookPostgresQuerySqlV1 {
  begin<T>(operation: (sql: GradebookPostgresQuerySqlV1) => Promise<T>): Promise<T>;
  end?(options?: { readonly timeout?: number }): Promise<void>;
}

const NUMERIC_COLUMNS =
  /(?:^|_)(?:count|version|term|year|size_bytes|sequence|index|write_count)$/u;
const JSON_COLUMNS = /(?:^|_)(?:json|intent)$/u;
const CHANGE_GUARD = /changes\(\)\s*=\s*\?/iu;
const POSTGRES_TEXT_OID_V1 = 25;
const GRADEBOOK_TABLE_NAMES_V1 = [
  'academic_entity_streams',
  'academic_entity_versions',
  'academic_record_streams',
  'academic_record_versions',
  'academic_year_configuration_versions',
  'academic_year_versions',
  'academic_years',
  'audit_occurrence_transitions',
  'audit_record_streams',
  'audit_record_versions',
  'bulletin_snapshot_streams',
  'bulletin_snapshot_versions',
  'council_decision_streams',
  'council_decision_versions',
  'council_session_streams',
  'council_session_versions',
  'gradebook_import_stage_chunks',
  'gradebook_import_stage_sessions',
  'gradebook_schema_migrations',
  'import_batch_files',
  'import_batch_streams',
  'import_batch_versions',
  'import_diagnostics',
  'logical_source_record_streams',
  'logical_source_record_versions',
  'logical_sources',
  'source_file_logical_source_candidates',
  'source_file_streams',
  'source_file_versions',
] as const;
const GRADEBOOK_RELATION_V1 = new RegExp(
  `\\b(FROM|INTO|JOIN|TABLE|UPDATE)\\s+(?!gradebook\\.)(${GRADEBOOK_TABLE_NAMES_V1.join('|')})\\b`,
  'giu',
);

export interface GradebookPostgresDatabaseOptionsV1 {
  readonly maximumConnections?: number;
  readonly connectTimeoutSeconds?: number;
  readonly idleTimeoutSeconds?: number;
  readonly maximumLifetimeSeconds?: number;
  readonly statementTimeoutMilliseconds?: number;
  readonly lockTimeoutMilliseconds?: number;
  readonly idleInTransactionTimeoutMilliseconds?: number;
}

export interface GradebookPostgresDatabaseV1 extends D1WriteDatabaseV1 {
  transaction<T>(operation: (database: D1WriteDatabaseV1) => Promise<T>): Promise<T>;
  lastFailure(): GradebookPostgresFailureDiagnosticV1 | null;
  close(): Promise<void>;
}

export interface GradebookPostgresFailureDiagnosticV1 {
  readonly operation: string;
  readonly relation: string | null;
  readonly errorType: string;
  readonly sqlState?: string;
  readonly category:
    | 'connection-parameter'
    | 'jsonb-cast'
    | 'permission'
    | 'relation-missing'
    | 'timeout'
    | 'unknown';
}

interface GradebookPostgresFailureStateV1 {
  value: GradebookPostgresFailureDiagnosticV1 | null;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause ?? '');
}

function failureDiagnostic(query: string, cause: unknown): GradebookPostgresFailureDiagnosticV1 {
  const message = errorMessage(cause);
  const operation = /^\s*([A-Za-z]+)/u.exec(query)?.[1]?.toUpperCase() ?? 'UNKNOWN';
  const relation =
    /\b(?:FROM|INTO|TABLE|UPDATE)\s+(?:gradebook\.)?([A-Za-z_][A-Za-z0-9_]*)/iu.exec(query)?.[1] ??
    null;
  const code =
    cause !== null && typeof cause === 'object' && 'code' in cause ? cause.code : undefined;
  const sqlState = typeof code === 'string' && /^[0-9A-Z]{5}$/u.test(code) ? code : undefined;
  const category = /search_path|startup parameter/iu.test(message)
    ? 'connection-parameter'
    : /jsonb.*text|text.*jsonb|type jsonb/iu.test(message)
      ? 'jsonb-cast'
      : /permission denied|insufficient privilege/iu.test(message)
        ? 'permission'
        : /relation .* does not exist/iu.test(message)
          ? 'relation-missing'
          : /timeout|timed out|57014/iu.test(message)
            ? 'timeout'
            : 'unknown';
  return {
    operation,
    relation,
    errorType: cause instanceof Error ? cause.name : 'unknown',
    ...(sqlState ? { sqlState } : {}),
    category,
  };
}

function serializedJsonText(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[[{]/u.test(value.trimStart())) return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function castSerializedJsonParameters(query: string, values: readonly unknown[]): string {
  let translated = query;
  values.forEach((value, index) => {
    if (!serializedJsonText(value)) return;
    const placeholder = `\\$${String(index + 1)}`;
    translated = translated.replace(
      new RegExp(`${placeholder}(?!\\d)(?!\\s*::\\s*jsonb\\b)`, 'giu'),
      `$${String(index + 1)}::jsonb`,
    );
  });
  return translated;
}

function safeInteger(value: bigint): number | string {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : value.toString();
}

function normalizeValue(column: string, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return safeInteger(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (JSON_COLUMNS.test(column) && value !== null && typeof value !== 'string') {
    return JSON.stringify(value);
  }
  if (NUMERIC_COLUMNS.test(column) && typeof value === 'string' && /^-?\d+$/u.test(value)) {
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : value;
  }
  return value;
}

function normalizeRow(row: PostgresRowV1): PostgresRowV1 {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([column, value]) => [column, normalizeValue(column, value)]),
  );
  const parseObject = (column: string): Record<string, unknown> | null => {
    const value = normalized[column];
    if (typeof value !== 'string') return null;
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };
  const payload = parseObject('payload_json');
  const filePayload = parseObject('file_payload_json');
  const setWhenPresent = (column: string, value: unknown) => {
    if (column in normalized && (typeof value === 'string' || value === null)) {
      normalized[column] = value;
    }
  };

  if (payload) {
    setWhenPresent('received_at', payload.receivedAt);
    setWhenPresent('updated_at', payload.updatedAt);
    setWhenPresent('emitted_at', payload.emittedAt);
    setWhenPresent('decided_at', payload.decidedAt);
    const manifest = payload.manifest;
    if (manifest !== null && typeof manifest === 'object' && !Array.isArray(manifest)) {
      const sourceManifest = manifest as Record<string, unknown>;
      setWhenPresent('last_modified_at', sourceManifest.lastModifiedAt);
      setWhenPresent('read_at', sourceManifest.readAt);
    }
  }
  const sourceFile = filePayload?.sourceFile;
  if (sourceFile !== null && typeof sourceFile === 'object' && !Array.isArray(sourceFile)) {
    setWhenPresent('last_modified_at', (sourceFile as Record<string, unknown>).lastModifiedAt);
  }
  return normalized;
}

function appendOnConflictDoNothing(query: string): string {
  if (!/\bINSERT\s+OR\s+IGNORE\s+INTO\b/iu.test(query)) return query;
  const translated = query.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/giu, 'INSERT INTO');
  if (/\bON\s+CONFLICT\b/iu.test(translated)) return translated;
  const returning = translated.search(/\bRETURNING\b/iu);
  if (returning >= 0) {
    return `${translated.slice(0, returning)}ON CONFLICT DO NOTHING ${translated.slice(returning)}`;
  }
  return `${translated.replace(/;\s*$/u, '')} ON CONFLICT DO NOTHING`;
}

function postgresJsonPath(path: string): string {
  if (path === '$') return '{}';
  const parts = path
    .replace(/^\$\.?/u, '')
    .replace(/\[(\d+)\]/gu, '.$1')
    .split('.')
    .filter(Boolean);
  if (parts.some((part) => !/^[A-Za-z0-9_-]+$/u.test(part))) {
    throw new Error('gradebook-postgres-json-path-invalid');
  }
  return `{${parts.join(',')}}`;
}

function translateJsonExtract(query: string): string {
  const booleanAware = query.replace(
    /json_extract\(\s*([^,()]+?)\s*,\s*'\$\.knownIdenticalContent'\s*\)/giu,
    "COALESCE(($1::jsonb #>> '{knownIdenticalContent}')::boolean, false)",
  );
  return booleanAware.replace(
    /json_extract\(\s*([^,()]+?)\s*,\s*'(\$(?:\.[A-Za-z0-9_-]+|\[\d+\])*)'\s*\)/giu,
    (_match, expression: string, path: string) =>
      `(${expression.trim()}::jsonb #>> '${postgresJsonPath(path)}')`,
  );
}

function translateJsonEach(query: string): string {
  if (!/FROM\s+json_each\(\$\d+\)/iu.test(query)) return query;
  return query
    .replace(/CAST\(\s*key\s+AS\s+INTEGER\s*\)/giu, 'CAST(key - 1 AS INTEGER)')
    .replace(/CAST\(\s*value\s+AS\s+TEXT\s*\)/giu, "(value #>> '{}')")
    .replace(
      /FROM\s+json_each\((\$\d+)\)\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*)/giu,
      'FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS $2(value, key)',
    )
    .replace(
      /FROM\s+json_each\((\$\d+)\)/giu,
      'FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS json_each(value, key)',
    );
}

function qualifyGradebookRelations(query: string): string {
  return query.replace(GRADEBOOK_RELATION_V1, '$1 gradebook.$2');
}

/**
 * Converts the deliberately small SQLite surface used by the provider-independent
 * gradebook repositories into PostgreSQL syntax. Values remain parameters; this
 * function never interpolates application data.
 */
export function translateGradebookD1SqlToPostgresV1(query: string): string {
  let translated = query.trim().replace(/^BEGIN\s+IMMEDIATE$/iu, 'BEGIN');
  translated = appendOnConflictDoNothing(translated);
  translated = translated.replace(/\bchar\(0\)/giu, 'chr(31)');
  translated = translated.replace(
    /json\(\s*'([^']*gradebook_[^']*_failure)'\s*\)/giu,
    "CAST('$1' AS integer)",
  );
  translated = translateJsonExtract(translated);
  translated = translated.replace(
    /(\([^()\n]+::jsonb\s+#>>\s+'\{[^']*\}'\))\s+AS\s+([A-Za-z0-9_]+_at)\b/giu,
    '$1::timestamptz AS $2',
  );
  translated = translated.replace(
    /(\([^()\n]+::jsonb\s+#>>\s+'\{[^']*\}'\))\s+AS\s+([A-Za-z0-9_]+_json)\b/giu,
    '$1::jsonb AS $2',
  );
  translated = replaceImportSqlParametersV1(translated, (index) => `$${String(index + 1)}`);
  translated = translateJsonEach(translated);
  return qualifyGradebookRelations(translated);
}

class GradebookPostgresStatementV1 implements D1WriteStatementV1 {
  constructor(
    private readonly owner: GradebookPostgresFacadeV1,
    readonly sourceQuery: string,
    readonly values: readonly D1WriteValueV1[] = [],
  ) {}

  bind(...values: D1WriteValueV1[]): D1WriteStatementV1 {
    return new GradebookPostgresStatementV1(this.owner, this.sourceQuery, values);
  }

  async first<Row extends PostgresRowV1>(): Promise<Row | null> {
    const result = await this.owner.execute(this.sourceQuery, this.values);
    return (result.rows[0] as Row | undefined) ?? null;
  }

  async all<Row extends PostgresRowV1>(): Promise<{ readonly results: readonly Row[] }> {
    const result = await this.owner.execute(this.sourceQuery, this.values);
    return { results: result.rows as readonly Row[] };
  }

  async run(): Promise<D1WriteRunResultV1> {
    const result = await this.owner.execute(this.sourceQuery, this.values);
    return { success: true, changes: result.changes, meta: { changes: result.changes } };
  }
}

interface PostgresExecutionV1 {
  readonly rows: readonly PostgresRowV1[];
  readonly changes: number;
}

class GradebookPostgresFacadeV1 implements D1WriteDatabaseV1 {
  constructor(
    private readonly sql: GradebookPostgresQuerySqlV1,
    private readonly root: GradebookPostgresSqlV1,
    private readonly transactional: boolean,
    private readonly failureState: GradebookPostgresFailureStateV1,
  ) {}

  prepare(query: string): D1WriteStatementV1 {
    return new GradebookPostgresStatementV1(this, query);
  }

  async execute(query: string, values: readonly D1WriteValueV1[]): Promise<PostgresExecutionV1> {
    const translated = castSerializedJsonParameters(
      translateGradebookD1SqlToPostgresV1(query),
      values,
    );
    const parameters = values.map((value) =>
      serializedJsonText(value) && this.sql.typed
        ? this.sql.typed(value, POSTGRES_TEXT_OID_V1)
        : value,
    );
    let result: PostgresQueryResultV1;
    try {
      result = await this.sql.unsafe(translated, parameters);
    } catch (cause) {
      this.failureState.value = failureDiagnostic(translated, cause);
      throw cause;
    }
    return {
      rows: Array.from(result, normalizeRow),
      changes: typeof result.count === 'number' ? result.count : result.length,
    };
  }

  async exec(query: string): Promise<unknown> {
    return this.execute(query, []);
  }

  async batch(statements: readonly D1WriteStatementV1[]): Promise<readonly D1WriteRunResultV1[]> {
    const executeBatch = async (transactionSql: GradebookPostgresQuerySqlV1) => {
      const transaction = new GradebookPostgresFacadeV1(
        transactionSql,
        this.root,
        true,
        this.failureState,
      );
      const results: D1WriteRunResultV1[] = [];
      let previousChanges: number | null = null;

      for (const statement of statements) {
        if (!(statement instanceof GradebookPostgresStatementV1)) {
          throw new Error('gradebook-postgres-statement-invalid');
        }
        if (CHANGE_GUARD.test(statement.sourceQuery)) {
          const expected = statement.values[0];
          if (typeof expected !== 'number' || previousChanges !== expected) {
            const marker = /durability/iu.test(statement.sourceQuery)
              ? 'gradebook_durability_batch_guard_failure'
              : 'gradebook_atomic_batch_guard_failure';
            throw new Error(marker);
          }
          results.push({ success: true, changes: 0, meta: { changes: 0 } });
          continue;
        }

        const result = await transaction.execute(statement.sourceQuery, statement.values);
        previousChanges = result.changes;
        results.push({
          success: true,
          changes: result.changes,
          meta: { changes: result.changes },
        });
      }
      return results;
    };

    return this.transactional ? executeBatch(this.sql) : this.root.begin(executeBatch);
  }

  transaction<T>(operation: (database: D1WriteDatabaseV1) => Promise<T>): Promise<T> {
    if (this.transactional) return operation(this);
    return this.root.begin(async (transactionSql) =>
      operation(new GradebookPostgresFacadeV1(transactionSql, this.root, true, this.failureState)),
    );
  }
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
  throw new Error('gradebook-postgres-driver-load-failed');
}

export async function createGradebookPostgresDatabaseV1(
  connectionString: string,
  options: GradebookPostgresDatabaseOptionsV1 = {},
): Promise<GradebookPostgresDatabaseV1> {
  if (connectionString.trim().length === 0) {
    throw new Error('gradebook-postgres-connection-string-missing');
  }
  const postgres = postgresModuleDefault(await import('postgres'));
  const sql: GradebookPostgresSqlV1 = postgres(connectionString, {
    max: options.maximumConnections ?? 5,
    fetch_types: false,
    prepare: true,
    connect_timeout: options.connectTimeoutSeconds ?? 10,
    idle_timeout: options.idleTimeoutSeconds ?? 2,
    max_lifetime: options.maximumLifetimeSeconds ?? 60,
    connection: {
      application_name: 'ecossistema-escola-gradebook',
      statement_timeout: options.statementTimeoutMilliseconds ?? 30_000,
      lock_timeout: options.lockTimeoutMilliseconds ?? 5_000,
      idle_in_transaction_session_timeout: options.idleInTransactionTimeoutMilliseconds ?? 30_000,
    },
  });
  return createGradebookPostgresDatabaseFromSqlV1(sql);
}

export function createGradebookPostgresDatabaseFromSqlV1(
  sql: GradebookPostgresSqlV1,
): GradebookPostgresDatabaseV1 {
  const failureState: GradebookPostgresFailureStateV1 = { value: null };
  const facade = new GradebookPostgresFacadeV1(sql, sql, false, failureState);
  return {
    prepare: facade.prepare.bind(facade),
    exec: facade.exec.bind(facade),
    batch: facade.batch.bind(facade),
    transaction: facade.transaction.bind(facade),
    lastFailure: () => failureState.value,
    async close() {
      try {
        await sql.end?.({ timeout: 1 });
      } catch (cause) {
        if (!/connection.*closed|not.*open/iu.test(errorMessage(cause))) throw cause;
      }
    },
  };
}
