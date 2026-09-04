import { describe, expect, it } from 'vitest';
import type {
  EnrollmentId,
  StudentId,
  TeacherId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import type { ImportBatchResultV1 } from '../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  AssessmentComponentId,
  GradeEntryId,
  GradeEntryV1,
} from '../../../shared/gradebook-contracts/results/results-contract-v1';
import { academicRecordStreamKeyV1 } from '../../../server/gradebook/application/import/import-reconciliation-v1';
import { createGradebookD1PersistenceUnitOfWorkV2 } from '../../../server/gradebook/persistence/d1/composition/d1-persistence-unit-of-work-v1';
import {
  GradebookD1ImportBootstrapTransactionV2,
} from '../../../server/gradebook/persistence/d1/transaction/d1-import-bootstrap-transaction-v2';
import type {
  D1WriteDatabaseV1,
  D1WriteRunResultV1,
  D1WriteStatementV1,
} from '../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import type {
  AcademicEntityRecordV1,
  AcademicRecordStreamV1,
  AcademicRecordV1,
  LogicalSourceRecordAssociationStreamV1,
  LogicalSourceRecordAssociationV1,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type { ImportBootstrapTransactionRequestV2 } from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import {
  academicYearId,
  context,
  importBatchId,
  importFileId,
  instant,
  logicalSourceId,
  openMigratedDatabase,
  sourceFileVersion,
  type SqliteD1Database,
} from '../persistence/d1-transaction/d1-write-test-support';

const teacherId = 'teacher:bulk-commit:001' as TeacherId;
const assignmentId = 'teaching-assignment:bulk-commit:001' as TeachingAssignmentId;
const COMPONENT_COUNT = 468;
const RECORD_COUNT = 5_399;
const STUDENT_COUNT = Math.ceil(RECORD_COUNT / COMPONENT_COUNT);

class AtomicBatchSqliteDatabase implements D1WriteDatabaseV1 {
  batchCalls = 0;
  readonly statementCounts: number[] = [];

  constructor(
    private readonly delegate: SqliteD1Database,
    private readonly beforeBatch?: () => void,
  ) {}

  prepare(query: string): D1WriteStatementV1 {
    return this.delegate.prepare(query);
  }

  exec(query: string): void {
    this.delegate.exec(query);
  }

  async batch(
    statements: readonly D1WriteStatementV1[],
  ): Promise<readonly D1WriteRunResultV1[]> {
    this.batchCalls += 1;
    this.statementCounts.push(statements.length);
    this.beforeBatch?.();
    this.delegate.raw.exec('BEGIN IMMEDIATE');
    try {
      const results: D1WriteRunResultV1[] = [];
      for (const statement of statements) results.push(await statement.run());
      this.delegate.raw.exec('COMMIT');
      return results;
    } catch (cause) {
      this.delegate.raw.exec('ROLLBACK');
      throw cause;
    }
  }
}

function seedStream(
  database: SqliteD1Database,
  kind: string,
  id: string,
): void {
  database.raw
    .prepare(
      `INSERT INTO academic_entity_streams (
         academic_year_id, entity_kind, entity_id, current_version, created_at
       ) VALUES (?, ?, ?, 1, ?)`,
    )
    .run(academicYearId, kind, id, instant);
}

function seedRoot(database: SqliteD1Database, students = STUDENT_COUNT): void {
  database.raw
    .prepare(
      `INSERT INTO academic_years (
         academic_year_id, school_id, year, current_version, created_at
       ) VALUES (?, 'school:bulk-commit:001', 2026, 1, ?)`,
    )
    .run(academicYearId, instant);
  seedStream(database, 'teacher', teacherId);
  seedStream(database, 'teaching-assignment', assignmentId);
  for (let index = 0; index < students; index += 1) {
    seedStream(database, 'student', `student:bulk-commit:${index}`);
    seedStream(database, 'enrollment', `enrollment:bulk-commit:${index}`);
  }
  database.raw
    .prepare(
      `INSERT INTO logical_sources (
         academic_year_id, logical_source_id, teacher_ref_kind, teacher_id,
         class_group_ref_kind, class_group_id, subject_ref_kind, subject_id,
         source_context, created_at
       ) VALUES (?, ?, 'teacher', ?, NULL, NULL, NULL, NULL, 'teacher-year-gradebook', ?)`,
    )
    .run(academicYearId, logicalSourceId, teacherId, instant);
}

function component(index: number): AcademicEntityRecordV1 {
  return {
    kind: 'assessment-component',
    value: {
      id: `assessment-component:bulk-commit:${index}` as AssessmentComponentId,
      academicYearId,
      teachingAssignmentId: assignmentId,
      term: 1,
      type: 'written',
      name: `Avaliação sintética ${index}`,
      maximum: 10,
      order: index,
      applicability: { state: 'applicable' },
    },
  };
}

function stream(index: number): AcademicRecordStreamV1 {
  const studentIndex = Math.floor(index / COMPONENT_COUNT);
  const componentIndex = index % COMPONENT_COUNT;
  return {
    kind: 'grade-entry',
    studentId: `student:bulk-commit:${studentIndex}` as StudentId,
    enrollmentId: `enrollment:bulk-commit:${studentIndex}` as EnrollmentId,
    assessmentComponentId:
      `assessment-component:bulk-commit:${componentIndex}` as AssessmentComponentId,
  };
}

function gradeEntry(index: number, recordStream = stream(index)): GradeEntryV1 {
  if (recordStream.kind !== 'grade-entry') throw new Error('invalid-synthetic-stream');
  const value = (index % 10) + 1;
  return {
    id: `grade-entry:bulk-commit:${index}` as GradeEntryId,
    academicYearId,
    studentId: recordStream.studentId,
    enrollmentId: recordStream.enrollmentId,
    assessmentComponentId: recordStream.assessmentComponentId,
    value: {
      imported: {
        value: { state: 'numeric', value },
        evidence: [
          {
            classification: 'manual-positive-number',
            rawValue: value,
            provenance: {
              fileName: 'fixture-commit-bulk.xlsb',
              fileSha256: 'f'.repeat(64),
              sheetName: 'SINTETICA1ºD1',
              cellAddress: `R${index + 5}`,
            },
          },
        ],
      },
      calculated: { value: { state: 'numeric', value } },
    },
    authorityMode: 'imported-source',
    ruleVersion: 'synthetic-bulk-commit-v1',
    version: 1,
  };
}

function association(
  recordStream: AcademicRecordStreamV1,
  sourceManifestId: LogicalSourceRecordAssociationV1['sourceManifestId'],
): {
  readonly stream: LogicalSourceRecordAssociationStreamV1;
  readonly value: LogicalSourceRecordAssociationV1;
} {
  const stableKey = academicRecordStreamKeyV1(recordStream);
  return {
    stream: {
      logicalSourceId,
      academicRecordStream: recordStream,
      stableKey,
    },
    value: {
      academicYearId,
      logicalSourceId,
      academicRecordStream: recordStream,
      stableKey,
      state: 'active',
      sourceManifestId,
      sourceManifestVersion: 1,
    },
  };
}

function approvedBatch(): ImportBatchResultV1 {
  return {
    id: importBatchId,
    status: 'approved',
    files: [
      {
        id: importFileId,
        sourceFile: {
          fileName: 'fixture-commit-bulk.xlsb',
          extension: 'xlsb',
          reportedMimeType: null,
          sizeBytes: 2_000_000,
          lastModifiedAt: null,
        },
        manifest: null,
        status: 'approved',
        diagnosticIds: [],
      },
    ],
    diagnostics: [],
    receivedAt: instant,
    updatedAt: instant,
    summary: {
      totalFileCount: 1,
      processedFileCount: 1,
      approvedFileCount: 1,
      reviewRequiredFileCount: 0,
      rejectedFileCount: 0,
      failedFileCount: 0,
      informationCount: 0,
      warningCount: 0,
      blockingErrorCount: 0,
      criticalErrorCount: 0,
    },
  };
}

function transactionRequest(): ImportBootstrapTransactionRequestV2 {
  return {
    logicalSource: {
      kind: 'reuse',
      value: {
        id: logicalSourceId,
        academicYearId,
        teacherId,
        sourceContext: 'teacher-year-gradebook',
        createdAt: instant,
      },
    },
    plannedSourceFileManifestIds: [],
    batchWrite: { value: approvedBatch(), expectedVersion: null },
    promotionRequest: {
      importBatchId,
      expectedBatchVersion: 1,
      approvedImportFileIds: [importFileId],
    },
  };
}

function tableCount(database: SqliteD1Database, table: string, where = ''): number {
  return (
    database.raw.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get() as {
      count: number;
    }
  ).count;
}

describe('Import bootstrap D1 bulk commit at pilot scale', () => {
  it('commits 468 components + 5,399 records + 5,399 associations with a bounded statement set', async () => {
    const database = await openMigratedDatabase();
    try {
      seedRoot(database);
      const source = sourceFileVersion('f', 'fixture-commit-bulk.xlsb');
      const seedUnit = createGradebookD1PersistenceUnitOfWorkV2(database, { now: () => instant });
      expect(
        (await seedUnit.imports.appendSourceFileVersion(context, source, { expectedVersion: null }))
          .status,
      ).toBe('written');

      const remote = new AtomicBatchSqliteDatabase(database);
      const transaction = new GradebookD1ImportBootstrapTransactionV2(remote, {
        now: () => instant,
      });

      await transaction.runImportBootstrap(context, transactionRequest(), async (unitOfWork) => {
        for (let index = 0; index < COMPONENT_COUNT; index += 1) {
          expect(
            (await unitOfWork.entities.appendVersion(context, component(index), {
              expectedVersion: null,
            })).status,
          ).toBe('written');
        }

        const streams: AcademicRecordStreamV1[] = [];
        for (let index = 0; index < RECORD_COUNT; index += 1) {
          const recordStream = stream(index);
          streams.push(recordStream);
          const record: AcademicRecordV1 = { kind: 'grade-entry', value: gradeEntry(index, recordStream) };
          expect(
            (await unitOfWork.academicRecords.appendVersion(context, recordStream, record, {
              expectedVersion: null,
            })).status,
          ).toBe('written');
        }

        for (const recordStream of streams) {
          const current = association(recordStream, source.manifest.id);
          expect(
            (
              await unitOfWork.logicalSourceRecords.appendVersion(
                context,
                current.stream,
                current.value,
                { expectedVersion: null },
              )
            ).status,
          ).toBe('written');
        }
      });

      expect(remote.batchCalls).toBe(1);
      expect(remote.statementCounts).toHaveLength(1);
      expect(remote.statementCounts[0]).toBeLessThan(50);
      expect(
        tableCount(database, 'academic_entity_versions', "WHERE entity_kind='assessment-component'"),
      ).toBe(COMPONENT_COUNT);
      expect(tableCount(database, 'academic_record_versions')).toBe(RECORD_COUNT);
      expect(tableCount(database, 'logical_source_record_versions')).toBe(RECORD_COUNT);
    } finally {
      database.raw.close();
    }
  });

  it('rolls the whole atomic batch back when one changed stream loses its expected CAS version', async () => {
    const database = await openMigratedDatabase();
    try {
      seedRoot(database, 1);
      const existingId = 'assessment-component:bulk-commit:existing';
      seedStream(database, 'assessment-component', existingId);
      const newId = 'assessment-component:bulk-commit:new';
      const changed = {
        ...component(0),
        value: { ...component(0).value, id: existingId as AssessmentComponentId },
      } satisfies AcademicEntityRecordV1;
      const created = {
        ...component(1),
        value: { ...component(1).value, id: newId as AssessmentComponentId },
      } satisfies AcademicEntityRecordV1;

      const remote = new AtomicBatchSqliteDatabase(database, () => {
        database.raw
          .prepare(
            `UPDATE academic_entity_streams
             SET current_version = 2
             WHERE academic_year_id = ? AND entity_kind = 'assessment-component'
               AND entity_id = ?`,
          )
          .run(academicYearId, existingId);
      });
      const transaction = new GradebookD1ImportBootstrapTransactionV2(remote, {
        now: () => instant,
      });

      await expect(
        transaction.runImportBootstrap(context, transactionRequest(), async (unitOfWork) => {
          await unitOfWork.entities.appendVersion(context, changed, { expectedVersion: 1 });
          await unitOfWork.entities.appendVersion(context, created, { expectedVersion: null });
        }),
      ).rejects.toMatchObject({ code: 'batch-version-conflict' });

      expect(remote.batchCalls).toBe(1);
      expect(
        tableCount(
          database,
          'academic_entity_streams',
          `WHERE entity_kind='assessment-component' AND entity_id='${newId}'`,
        ),
      ).toBe(0);
      expect(
        tableCount(database, 'academic_entity_versions', "WHERE entity_kind='assessment-component'"),
      ).toBe(0);
      expect(
        (
          database.raw
            .prepare(
              `SELECT current_version FROM academic_entity_streams
               WHERE academic_year_id = ? AND entity_kind='assessment-component'
                 AND entity_id = ?`,
            )
            .get(academicYearId, existingId) as { current_version: number }
        ).current_version,
      ).toBe(2);
    } finally {
      database.raw.close();
    }
  });
});
