import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync, StatementSync } from 'node:sqlite';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import type {
  AcademicYearId,
  EnrollmentId,
  StudentId,
} from '../../../../shared/gradebook-contracts/entities';
import type { SourceFileManifestId } from '../../../../shared/gradebook-contracts/imports/import-ids-v1';
import type {
  AssessmentComponentId,
  GradeEntryId,
} from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import { academicRecordStreamKeyV1 } from '../../../../server/gradebook/application/import/import-reconciliation-v1';
import {
  createGradebookD1ReadAdapterV1,
  GradebookD1ReadErrorV1,
  type D1ReadDatabaseV1,
  type D1ReadResultV1,
  type D1ReadStatementV1,
} from '../../../../server/gradebook/persistence/d1/read/d1-read-adapter-v1';
import { GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS } from '../../../../server/gradebook/persistence/d1/schema/migrations';
import type {
  AcademicPersistenceContextV1,
  AcademicRecordStreamV1,
  AcademicRecordV1,
  LogicalSourceIdV1,
  SourceFileVersionV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';

const migrationDirectory = join(process.cwd(), 'migrations', 'gradebook');
const yearId = 'academic-year:synthetic:2026' as AcademicYearId;
const otherYearId = 'academic-year:synthetic:2027' as AcademicYearId;
const logicalSourceId = 'logical-source:synthetic:001' as LogicalSourceIdV1;
const manifestId = 'manifest:synthetic:001' as SourceFileManifestId;
const studentId = 'student:synthetic:001' as StudentId;
const enrollmentId = 'enrollment:synthetic:001' as EnrollmentId;
const assessmentComponentId = 'assessment-component:synthetic:001' as AssessmentComponentId;
const instant = '2026-08-31T18:00:00.000Z';
const firstHash = 'a'.repeat(64);
const currentHash = 'b'.repeat(64);
const context = { academicYearId: yearId } satisfies AcademicPersistenceContextV1;

const gradeStream = {
  kind: 'grade-entry',
  studentId,
  enrollmentId,
  assessmentComponentId,
} satisfies AcademicRecordStreamV1;
const gradeStreamKey = academicRecordStreamKeyV1(gradeStream);

const sourceEvidence = {
  provenance: {
    fileName: 'synthetic-gradebook-v2.xlsx',
    fileSha256: currentHash,
    sheetName: 'Synthetic1º',
    cellAddress: 'R10',
  },
  classification: 'manual-positive-number' as const,
  rawValue: 8,
};

const academicRecord = {
  kind: 'grade-entry',
  value: {
    id: 'grade-entry:synthetic:001' as GradeEntryId,
    academicYearId: yearId,
    studentId,
    enrollmentId,
    assessmentComponentId,
    value: {
      imported: {
        value: { state: 'numeric', value: 8 },
        evidence: [sourceEvidence],
      },
      calculated: { value: { state: 'numeric', value: 8 } },
    },
    authorityMode: 'imported-source',
    ruleVersion: 'synthetic-grade-rule-v1',
    version: 1,
  },
} satisfies AcademicRecordV1;

function sourceFileVersion(hash: string, version: number): SourceFileVersionV1 {
  return {
    manifest: {
      id: manifestId,
      fileName: `synthetic-gradebook-v${version}.xlsx`,
      extension: 'xlsx',
      reportedMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 512 + version,
      lastModifiedAt: instant,
      sha256: hash,
      sourceContractVersion: 1,
      parserVersion: 'synthetic-parser-v1',
      readAt: instant,
      confirmedAcademicYearId: yearId,
    },
    logicalSource: { state: 'confirmed', logicalSourceId },
  };
}

type SqlValue = string | number | null;

class SqliteD1Statement implements D1ReadStatementV1 {
  constructor(
    private readonly statement: StatementSync,
    private readonly values: readonly SqlValue[] = [],
  ) {}

  bind(...values: SqlValue[]): D1ReadStatementV1 {
    return new SqliteD1Statement(this.statement, values);
  }

  async first<Row extends Record<string, unknown>>(): Promise<Row | null> {
    return (this.statement.get(...this.values) as Row | undefined) ?? null;
  }

  async all<Row extends Record<string, unknown>>(): Promise<D1ReadResultV1<Row>> {
    return { results: this.statement.all(...this.values) as Row[] };
  }
}

class SqliteD1Database implements D1ReadDatabaseV1 {
  constructor(private readonly database: DatabaseSync) {}

  prepare(query: string): D1ReadStatementV1 {
    return new SqliteD1Statement(this.database.prepare(query));
  }
}

let databases: DatabaseSync[] = [];
let DatabaseSyncConstructor: typeof DatabaseSync;

beforeAll(async () => {
  const sqliteModuleName = 'node:sqlite';
  const sqlite = await import(/* @vite-ignore */ sqliteModuleName);
  DatabaseSyncConstructor = sqlite.DatabaseSync;
});

afterEach(() => {
  for (const database of databases) database.close();
  databases = [];
});

function openDatabase(): DatabaseSync {
  const database = new DatabaseSyncConstructor(':memory:');
  database.exec('PRAGMA foreign_keys = ON;');
  databases.push(database);
  return database;
}

function applyMigrations(database: DatabaseSync): void {
  for (const migration of GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS) {
    database.exec(readFileSync(join(migrationDirectory, migration.fileName), 'utf8'));
  }
}

function insertAcademicYear(database: DatabaseSync, id: AcademicYearId, year: number): void {
  database
    .prepare(
      `INSERT INTO academic_years (
        academic_year_id, school_id, year, current_version, created_at
      ) VALUES (?, ?, ?, 1, ?)`,
    )
    .run(id, `school:synthetic:${year}`, year, instant);
}

function insertEntityStream(database: DatabaseSync, kind: string, id: string): void {
  database
    .prepare(
      `INSERT INTO academic_entity_streams (
        academic_year_id, entity_kind, entity_id, current_version, created_at
      ) VALUES (?, ?, ?, 1, ?)`,
    )
    .run(yearId, kind, id, instant);
}

function seedDatabase(database: DatabaseSync): void {
  insertAcademicYear(database, yearId, 2026);
  database
    .prepare(
      `INSERT INTO logical_sources (
        academic_year_id, logical_source_id, source_context, created_at
      ) VALUES (?, ?, 'synthetic-teacher-year-context', ?)`,
    )
    .run(yearId, logicalSourceId, instant);

  insertEntityStream(database, 'student', studentId);
  insertEntityStream(database, 'enrollment', enrollmentId);
  insertEntityStream(database, 'assessment-component', assessmentComponentId);

  database
    .prepare(
      `INSERT INTO source_file_streams (
        academic_year_id, manifest_id, current_version, current_sha256, created_at
      ) VALUES (?, ?, 2, ?, ?)`,
    )
    .run(yearId, manifestId, currentHash, instant);

  const firstSourceVersion = sourceFileVersion(firstHash, 1);
  const currentSourceVersion = sourceFileVersion(currentHash, 2);
  for (const [version, previousVersion, source] of [
    [1, null, firstSourceVersion],
    [2, 1, currentSourceVersion],
  ] as const) {
    database
      .prepare(
        `INSERT INTO source_file_versions (
          academic_year_id, manifest_id, version, previous_version, file_name, extension,
          reported_mime_type, size_bytes, last_modified_at, sha256,
          source_contract_version, parser_version, read_at, confirmed_academic_year_id,
          logical_source_state, confirmed_logical_source_id, payload_json, recorded_at
        ) VALUES (
          ?, ?, ?, ?, ?, 'xlsx', ?, ?, ?, ?, 1, ?, ?, ?,
          'confirmed', ?, ?, ?
        )`,
      )
      .run(
        yearId,
        manifestId,
        version,
        previousVersion,
        source.manifest.fileName,
        source.manifest.reportedMimeType,
        source.manifest.sizeBytes,
        source.manifest.lastModifiedAt,
        source.manifest.sha256,
        source.manifest.parserVersion,
        source.manifest.readAt,
        yearId,
        logicalSourceId,
        JSON.stringify(source),
        instant,
      );
  }

  database
    .prepare(
      `INSERT INTO academic_record_streams (
        academic_year_id, record_kind, stream_key, current_version,
        student_id, enrollment_id, assessment_component_ref_kind,
        assessment_component_id, created_at
      ) VALUES (
        ?, 'grade-entry', ?, 1, ?, ?, 'assessment-component', ?, ?
      )`,
    )
    .run(yearId, gradeStreamKey, studentId, enrollmentId, assessmentComponentId, instant);
  database
    .prepare(
      `INSERT INTO academic_record_versions (
        academic_year_id, record_kind, stream_key, version, previous_version,
        record_id, authority_mode, rule_version, payload_json, recorded_at
      ) VALUES (
        ?, 'grade-entry', ?, 1, NULL, ?, 'imported-source', ?, ?, ?
      )`,
    )
    .run(
      yearId,
      gradeStreamKey,
      academicRecord.value.id,
      academicRecord.value.ruleVersion,
      JSON.stringify(academicRecord),
      instant,
    );

  database
    .prepare(
      `INSERT INTO logical_source_record_streams (
        academic_year_id, logical_source_id, record_kind, stream_key,
        current_version, current_state, created_at
      ) VALUES (?, ?, 'grade-entry', ?, 1, 'active', ?)`,
    )
    .run(yearId, logicalSourceId, gradeStreamKey, instant);
  database
    .prepare(
      `INSERT INTO logical_source_record_versions (
        academic_year_id, logical_source_id, record_kind, stream_key,
        version, previous_version, association_state,
        source_manifest_id, source_manifest_version, recorded_at
      ) VALUES (?, ?, 'grade-entry', ?, 1, NULL, 'active', ?, 2, ?)`,
    )
    .run(yearId, logicalSourceId, gradeStreamKey, manifestId, instant);
}

function migratedDatabase(): DatabaseSync {
  const database = openDatabase();
  applyMigrations(database);
  return database;
}

function seededDatabase(): DatabaseSync {
  const database = migratedDatabase();
  seedDatabase(database);
  return database;
}

describe('migration 0003 e adaptador D1 local de leitura V1', () => {
  it('ordena e reaplica 0001–0005 sem cascades destrutivos', () => {
    const database = migratedDatabase();
    applyMigrations(database);

    expect(GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS.map(({ version }) => version)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(
      database
        .prepare('SELECT version, name FROM gradebook_schema_migrations ORDER BY version')
        .all(),
    ).toEqual([
      { version: 1, name: 'gradebook_context_entities_imports_v1' },
      { version: 2, name: 'gradebook_records_audit_v1' },
      { version: 3, name: 'logical_source_record_catalog_v1' },
      { version: 4, name: 'bulletin_council_durability_v1' },
      { version: 5, name: 'council_session_durability_v2' },
    ]);

    const tableNames = database
      .prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'table' AND name LIKE 'logical_source_record_%'
         ORDER BY name`,
      )
      .all()
      .map(({ name }) => name);
    expect(tableNames).toEqual(['logical_source_record_streams', 'logical_source_record_versions']);

    const migration = readFileSync(
      join(migrationDirectory, '0003_logical_source_record_catalog_v1.sql'),
      'utf8',
    );
    expect(migration).not.toContain('ON DELETE CASCADE');
  });

  it('isola associações por ano, preserva histórico e usa o índice de atuais', () => {
    const database = seededDatabase();
    insertAcademicYear(database, otherYearId, 2027);
    database
      .prepare(
        `INSERT INTO logical_sources (
          academic_year_id, logical_source_id, source_context, created_at
        ) VALUES (?, ?, 'synthetic-other-year-context', ?)`,
      )
      .run(otherYearId, logicalSourceId, instant);

    expect(() =>
      database
        .prepare(
          `INSERT INTO logical_source_record_streams (
            academic_year_id, logical_source_id, record_kind, stream_key,
            current_version, current_state, created_at
          ) VALUES (?, ?, 'grade-entry', ?, 1, 'active', ?)`,
        )
        .run(otherYearId, logicalSourceId, gradeStreamKey, instant),
    ).toThrow(/FOREIGN KEY constraint failed/);

    expect(() =>
      database
        .prepare(
          `DELETE FROM academic_record_streams
           WHERE academic_year_id = ? AND record_kind = 'grade-entry' AND stream_key = ?`,
        )
        .run(yearId, gradeStreamKey),
    ).toThrow(/FOREIGN KEY constraint failed/);

    expect(
      database
        .prepare(
          `SELECT association_state, source_manifest_version
           FROM logical_source_record_versions
           WHERE academic_year_id = ? AND logical_source_id = ?`,
        )
        .get(yearId, logicalSourceId),
    ).toEqual({ association_state: 'active', source_manifest_version: 2 });

    const queryPlan = database
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT record_kind, stream_key
         FROM logical_source_record_streams
         WHERE academic_year_id = ? AND logical_source_id = ? AND current_state = 'active'
         ORDER BY record_kind, stream_key`,
      )
      .all(yearId, logicalSourceId)
      .map(({ detail }) => String(detail));
    expect(
      queryPlan.some((detail) => detail.includes('idx_logical_source_record_streams_current')),
    ).toBe(true);
  });

  it('reconstrói fonte e registro atuais sem perder versão, autoridade, regra ou payload', async () => {
    const database = seededDatabase();
    const adapter = createGradebookD1ReadAdapterV1(new SqliteD1Database(database));

    await expect(adapter.imports.findSourceFileByHash(context, firstHash)).resolves.toBeNull();
    await expect(adapter.imports.findSourceFileByHash(context, currentHash)).resolves.toEqual({
      value: sourceFileVersion(currentHash, 2),
      version: 2,
      recordedAt: instant,
    });
    await expect(adapter.imports.getSourceFileVersion(context, manifestId)).resolves.toEqual({
      value: sourceFileVersion(currentHash, 2),
      version: 2,
      recordedAt: instant,
    });
    await expect(
      adapter.imports.getSourceFileVersion({ academicYearId: otherYearId }, manifestId),
    ).resolves.toBeNull();

    await expect(adapter.academicRecords.getCurrent(context, gradeStream)).resolves.toEqual({
      value: academicRecord,
      version: 1,
      recordedAt: instant,
    });
    await expect(
      adapter.logicalSourceRecords.listCurrentStreams(context, logicalSourceId),
    ).resolves.toEqual([gradeStream]);
  });

  it('lista somente associações ativas e não desativa ausências automaticamente', async () => {
    const database = seededDatabase();
    const adapter = createGradebookD1ReadAdapterV1(new SqliteD1Database(database));

    database
      .prepare(
        `INSERT INTO source_file_versions (
          academic_year_id, manifest_id, version, previous_version, file_name, extension,
          size_bytes, sha256, source_contract_version, parser_version, read_at,
          confirmed_academic_year_id, logical_source_state, confirmed_logical_source_id,
          payload_json, recorded_at
        ) VALUES (
          ?, ?, 3, 2, 'synthetic-gradebook-v3.xlsx', 'xlsx', 515, ?, 1,
          'synthetic-parser-v1', ?, ?, 'confirmed', ?, ?, ?
        )`,
      )
      .run(
        yearId,
        manifestId,
        'c'.repeat(64),
        instant,
        yearId,
        logicalSourceId,
        JSON.stringify(sourceFileVersion('c'.repeat(64), 3)),
        instant,
      );

    await expect(
      adapter.logicalSourceRecords.listCurrentStreams(context, logicalSourceId),
    ).resolves.toEqual([gradeStream]);
    expect(
      database
        .prepare(
          `SELECT current_state FROM logical_source_record_streams
           WHERE academic_year_id = ? AND logical_source_id = ?`,
        )
        .get(yearId, logicalSourceId),
    ).toEqual({ current_state: 'active' });

    database
      .prepare(
        `UPDATE logical_source_record_streams SET current_state = 'inactive'
         WHERE academic_year_id = ? AND logical_source_id = ?
           AND record_kind = 'grade-entry' AND stream_key = ?`,
      )
      .run(yearId, logicalSourceId, gradeStreamKey);
    await expect(
      adapter.logicalSourceRecords.listCurrentStreams(context, logicalSourceId),
    ).resolves.toEqual([]);
    expect(
      database.prepare('SELECT COUNT(*) AS count FROM logical_source_record_versions').get(),
    ).toEqual({ count: 1 });
  });

  it('produz erros controlados para JSON inválido, shape incompatível e referência quebrada', async () => {
    const database = seededDatabase();
    const adapter = createGradebookD1ReadAdapterV1(new SqliteD1Database(database));

    database.exec('PRAGMA ignore_check_constraints = ON;');
    database
      .prepare(
        `UPDATE academic_record_versions SET payload_json = ?
         WHERE academic_year_id = ? AND record_kind = 'grade-entry' AND stream_key = ?`,
      )
      .run('synthetic-private-invalid-json', yearId, gradeStreamKey);
    await expect(adapter.academicRecords.getCurrent(context, gradeStream)).rejects.toMatchObject({
      code: 'invalid-json',
      message: 'Os dados acadêmicos persistidos não puderam ser reconstruídos.',
    });

    database
      .prepare(
        `UPDATE academic_record_versions SET payload_json = '{}'
         WHERE academic_year_id = ? AND record_kind = 'grade-entry' AND stream_key = ?`,
      )
      .run(yearId, gradeStreamKey);
    await expect(adapter.academicRecords.getCurrent(context, gradeStream)).rejects.toMatchObject({
      code: 'incompatible-row',
      message: 'O registro acadêmico persistido possui formato incompatível.',
    });

    database.exec('PRAGMA foreign_keys = OFF;');
    database
      .prepare(
        `DELETE FROM academic_record_versions
         WHERE academic_year_id = ? AND record_kind = 'grade-entry' AND stream_key = ?`,
      )
      .run(yearId, gradeStreamKey);
    database.exec('PRAGMA foreign_keys = ON;');
    await expect(adapter.academicRecords.getCurrent(context, gradeStream)).rejects.toMatchObject({
      code: 'broken-reference',
      message: 'Uma referência acadêmica persistida está inconsistente.',
    });
  });

  it('sanitiza falhas do binding e não descobre associações por JSON ou nome de arquivo', async () => {
    const database = {
      prepare: () => {
        throw new Error('synthetic-private-payload');
      },
    } satisfies D1ReadDatabaseV1;
    const adapter = createGradebookD1ReadAdapterV1(database);

    const read = adapter.imports.findSourceFileByHash(context, currentHash);
    await expect(read).rejects.toBeInstanceOf(GradebookD1ReadErrorV1);
    await expect(read).rejects.toMatchObject({
      code: 'database-read-failed',
      message: 'Não foi possível consultar os dados acadêmicos persistidos.',
    });

    const source = readFileSync(
      join(process.cwd(), 'server/gradebook/persistence/d1/read/d1-read-adapter-v1.ts'),
      'utf8',
    );
    expect(source).toContain('FROM logical_source_record_streams c');
    expect(source).toContain('LEFT JOIN academic_record_streams r');
    expect(source).not.toContain('json_extract');
    expect(source).not.toContain('file_name');
  });
});