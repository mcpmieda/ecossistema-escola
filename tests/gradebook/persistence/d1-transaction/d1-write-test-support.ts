import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync, StatementSync } from 'node:sqlite';

import type {
  AcademicYearId,
  EnrollmentId,
  StudentId,
} from '../../../../shared/gradebook-contracts/entities';
import type {
  ImportBatchId,
  ImportFileId,
  SourceFileManifestId,
} from '../../../../shared/gradebook-contracts/imports/import-ids-v1';
import type {
  AssessmentComponentId,
  GradeEntryId,
} from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import type {
  D1WriteDatabaseV1,
  D1WriteRunResultV1,
  D1WriteStatementV1,
  D1WriteValueV1,
} from '../../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import { GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS } from '../../../../server/gradebook/persistence/d1/schema/migrations';
import type {
  AcademicPersistenceContextV1,
  AcademicRecordStreamV1,
  AcademicRecordV1,
  LogicalSourceIdV1,
  SourceFileVersionV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';

export const instant = '2026-09-01T02:00:00.000Z';
export const academicYearId = 'academic-year:d1-write:2026' as AcademicYearId;
export const otherAcademicYearId = 'academic-year:d1-write:2027' as AcademicYearId;
export const logicalSourceId = 'logical-source:d1-write:001' as LogicalSourceIdV1;
export const studentId = 'student:d1-write:001' as StudentId;
export const enrollmentId = 'enrollment:d1-write:001' as EnrollmentId;
export const assessmentComponentId = 'assessment-component:d1-write:001' as AssessmentComponentId;
export const importBatchId = 'import-batch:d1-write:001' as ImportBatchId;
export const importFileId = 'import-file:d1-write:001' as ImportFileId;
export const context = { academicYearId } satisfies AcademicPersistenceContextV1;

export const gradeStream = {
  kind: 'grade-entry',
  studentId,
  enrollmentId,
  assessmentComponentId,
} satisfies AcademicRecordStreamV1;

export class SqliteD1Statement implements D1WriteStatementV1 {
  constructor(
    private readonly statement: StatementSync,
    private readonly values: readonly D1WriteValueV1[] = [],
  ) {}

  bind(...values: D1WriteValueV1[]): D1WriteStatementV1 {
    return new SqliteD1Statement(this.statement, values);
  }

  async first<Row extends Record<string, unknown>>(): Promise<Row | null> {
    return (this.statement.get(...this.values) as Row | undefined) ?? null;
  }

  async all<Row extends Record<string, unknown>>(): Promise<{ readonly results: readonly Row[] }> {
    return { results: this.statement.all(...this.values) as Row[] };
  }

  async run(): Promise<D1WriteRunResultV1> {
    const result = this.statement.run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

export class SqliteD1Database implements D1WriteDatabaseV1 {
  constructor(readonly raw: DatabaseSync) {}

  prepare(query: string): D1WriteStatementV1 {
    return new SqliteD1Statement(this.raw.prepare(query));
  }

  exec(query: string): void {
    this.raw.exec(query);
  }
}

export async function openMigratedDatabase(): Promise<SqliteD1Database> {
  const sqliteModuleName = 'node:sqlite';
  const sqlite = await import(/* @vite-ignore */ sqliteModuleName);
  const raw = new sqlite.DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON;');
  const migrationDirectory = join(process.cwd(), 'migrations', 'gradebook');
  for (const migration of GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS) {
    raw.exec(readFileSync(join(migrationDirectory, migration.fileName), 'utf8'));
  }
  return new SqliteD1Database(raw);
}

export function seedContext(database: SqliteD1Database): void {
  database.raw
    .prepare(
      `INSERT INTO academic_years (
         academic_year_id, school_id, year, current_version, created_at
       ) VALUES (?, 'school:d1-write:001', 2026, 1, ?)`,
    )
    .run(academicYearId, instant);
  database.raw
    .prepare(
      `INSERT INTO logical_sources (
         academic_year_id, logical_source_id, source_context, created_at
       ) VALUES (?, ?, 'synthetic-write-context', ?)`,
    )
    .run(academicYearId, logicalSourceId, instant);
  for (const [kind, id] of [
    ['student', studentId],
    ['enrollment', enrollmentId],
    ['assessment-component', assessmentComponentId],
  ] as const) {
    database.raw
      .prepare(
        `INSERT INTO academic_entity_streams (
           academic_year_id, entity_kind, entity_id, current_version, created_at
         ) VALUES (?, ?, ?, 1, ?)`,
      )
      .run(academicYearId, kind, id, instant);
  }
}

export function seedBatch(
  database: SqliteD1Database,
  files: readonly {
    readonly id: ImportFileId;
    readonly status: 'approved' | 'review-required';
  }[] = [{ id: importFileId, status: 'approved' }],
): void {
  database.raw
    .prepare(
      `INSERT INTO import_batch_streams (
         academic_year_id, import_batch_id, current_version, created_at
       ) VALUES (?, ?, 1, ?)`,
    )
    .run(academicYearId, importBatchId, instant);
  database.raw
    .prepare(
      `INSERT INTO import_batch_versions (
         academic_year_id, import_batch_id, version, previous_version, status,
         received_at, updated_at, summary_json, payload_json, recorded_at
       ) VALUES (?, ?, 1, NULL, 'approved', ?, ?, '{}', '{}', ?)`,
    )
    .run(academicYearId, importBatchId, instant, instant, instant);
  for (const file of files) {
    database.raw
      .prepare(
        `INSERT INTO import_batch_files (
           academic_year_id, import_batch_id, batch_version, import_file_id,
           status, file_name, extension, size_bytes, payload_json
         ) VALUES (?, ?, 1, ?, ?, 'synthetic-gradebook.xlsx', 'xlsx', 64, '{}')`,
      )
      .run(academicYearId, importBatchId, file.id, file.status);
  }
}

export function sourceFileVersion(
  hashCharacter = 'a',
  fileName = 'synthetic-gradebook.xlsx',
): SourceFileVersionV1 {
  const sha256 = hashCharacter.repeat(64);
  return {
    manifest: {
      id: `source-file-manifest:${sha256}` as SourceFileManifestId,
      fileName,
      extension: 'xlsx',
      reportedMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 64,
      lastModifiedAt: instant,
      sha256,
      sourceContractVersion: 1,
      parserVersion: 'synthetic-parser-v1',
      readAt: instant,
      confirmedAcademicYearId: academicYearId,
    },
    logicalSource: { state: 'confirmed', logicalSourceId },
  };
}

export function gradeRecord(
  value: number,
  suffix = '001',
): Extract<AcademicRecordV1, { readonly kind: 'grade-entry' }> {
  const sha256 = 'a'.repeat(64);
  return {
    kind: 'grade-entry',
    value: {
      id: `grade-entry:d1-write:${suffix}` as GradeEntryId,
      academicYearId,
      studentId,
      enrollmentId,
      assessmentComponentId,
      value: {
        imported: {
          value: { state: 'numeric', value },
          evidence: [
            {
              provenance: {
                fileName: 'synthetic-gradebook.xlsx',
                fileSha256: sha256,
                sheetName: 'Synthetic1º',
                cellAddress: 'R10',
              },
              classification: 'manual-positive-number',
              rawValue: value,
            },
          ],
        },
        calculated: { value: { state: 'numeric', value } },
      },
      authorityMode: 'imported-source',
      ruleVersion: 'synthetic-grade-rule-v1',
      version: Number.parseInt(suffix, 10),
    },
  };
}
