import { readFileSync } from 'node:fs';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  ClassGroupId,
  EnrollmentId,
  SchoolId,
  StudentId,
  TeacherId,
} from '../../../shared/gradebook-contracts/entities';
import {
  BULLETIN_CONTRACT_VERSION_V1,
  BULLETIN_MODEL_VERSION_V1,
  type BulletinDataVersionV1,
  type BulletinIssuerIdV1,
  type BulletinSnapshotIdV1,
  type BulletinSnapshotV1,
} from '../../../shared/gradebook-contracts/bulletins/bulletin-contract-v1';
import type { CouncilReviewReferenceV2 } from '../../../shared/gradebook-contracts/council/council-institutional-contract-v2';
import type {
  AuditOccurrenceId,
  AuditOccurrenceV1,
} from '../../../shared/gradebook-contracts/audit/audit-contract-v1';
import type {
  CouncilActorReferenceV1,
  CouncilClassReferenceV1,
  CouncilStudentReferenceV1,
} from '../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import type { BulletinSnapshotSeriesKeyV1 } from '../../../server/gradebook/application/bulletins/bulletin-snapshot-repository-v1';
import type {
  ImportBatchResultV1,
  SourceFileManifestV1,
} from '../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  ImportBatchId,
  ImportFileId,
  SourceFileManifestId,
} from '../../../shared/gradebook-contracts/imports/import-ids-v1';
import type {
  AcademicEntityRecordV1,
  AuditRecordV1,
  SourceFileVersionV1,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type {
  ImportBootstrapTransactionRequestV2,
  LogicalSourceV2,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import { createGradebookPostgresAdaptersV1 } from '../../../server/gradebook/persistence/postgres/postgres-adapters-v1';
import { createGradebookD1PersistenceUnitOfWorkV2 } from '../../../server/gradebook/persistence/d1/composition/d1-persistence-unit-of-work-v1';
import { verifyGradebookPostgresAdaptersSyntheticV1 } from '../../../server/gradebook/persistence/postgres/postgres-synthetic-verification-v1';
import {
  createGradebookPostgresDatabaseFromSqlV1,
  type GradebookPostgresQuerySqlV1,
  type GradebookPostgresSqlV1,
} from '../../../server/gradebook/persistence/postgres/postgres-database-v1';
import {
  createGradebookPostgresPersistenceUnitOfWorkV2,
  createGradebookPostgresTransactionalUnitOfWorkV2,
} from '../../../server/gradebook/persistence/postgres/postgres-persistence-unit-of-work-v1';
import { openMigratedDatabase } from '../persistence/d1-transaction/d1-write-test-support';

interface QueryableV1 {
  query<T extends Record<string, unknown>>(
    query: string,
    parameters?: unknown[],
  ): Promise<{ readonly rows: readonly T[]; readonly affectedRows?: number }>;
}

class PGliteQuerySqlV1 implements GradebookPostgresQuerySqlV1 {
  constructor(protected readonly client: QueryableV1) {}

  async unsafe(query: string, parameters: readonly unknown[] = []) {
    try {
      const response = await this.client.query(query, Array.from(parameters));
      return Object.assign([...response.rows], {
        count: response.affectedRows ?? response.rows.length,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`${message}\n${query}`, { cause });
    }
  }
}

class PGliteSqlV1 extends PGliteQuerySqlV1 implements GradebookPostgresSqlV1 {
  constructor(private readonly postgres: PGlite) {
    super({ query: (query, parameters) => postgres.query(query, parameters) });
  }

  begin<T>(operation: (sql: GradebookPostgresQuerySqlV1) => Promise<T>): Promise<T> {
    return this.postgres.transaction((transaction: Transaction) =>
      operation(
        new PGliteQuerySqlV1({
          query: (query, parameters) => transaction.query(query, parameters),
        }),
      ),
    );
  }

  end(): Promise<void> {
    return this.postgres.close();
  }
}

const academicYearId = 'academic-year:postgres:2026' as AcademicYearId;
const context = { academicYearId };
const schoolId = 'school:postgres:synthetic' as SchoolId;
const teacherId = 'teacher:postgres:synthetic' as TeacherId;
const studentId = 'student:postgres:synthetic' as StudentId;
const instant = '2026-09-08T12:00:00Z';

function bulletinSnapshot(): BulletinSnapshotV1 {
  return {
    contractVersion: BULLETIN_CONTRACT_VERSION_V1,
    snapshotId: 'snapshot:postgres:synthetic' as BulletinSnapshotIdV1,
    snapshotVersion: 1,
    modelVersion: BULLETIN_MODEL_VERSION_V1,
    dataVersion: 'bulletin-data:postgres:synthetic:1' as BulletinDataVersionV1,
    emittedAt: instant,
    issuerId: 'issuer:postgres:synthetic' as BulletinIssuerIdV1,
    presentation: { locale: 'pt-BR', dateStyle: 'short' },
    model: {
      contractVersion: BULLETIN_CONTRACT_VERSION_V1,
      modelVersion: BULLETIN_MODEL_VERSION_V1,
      modelKind: 'synthetic',
      academicYearId,
      period: { kind: 'annual' },
      student: {
        id: studentId,
        enrollmentId: 'enrollment:postgres:synthetic' as EnrollmentId,
        displayName: 'Estudante Sintético',
      },
      classGroup: {
        id: 'class-group:postgres:synthetic' as ClassGroupId,
        code: 'SYN',
      },
      authorityMode: 'imported-source',
      subjects: [],
    },
  };
}

function academicYear(): AcademicEntityRecordV1 {
  return {
    kind: 'academic-year',
    value: {
      id: academicYearId,
      schoolId,
      year: 2026,
      status: 'active',
      startsOn: '2026-02-01',
      endsOn: '2026-12-20',
      activeEvaluationProfileId: 'evaluation-profile:2026',
      configurationVersion: '1',
    },
  };
}

function teacher(): AcademicEntityRecordV1 {
  return {
    kind: 'teacher',
    value: {
      id: teacherId,
      displayName: 'Docente Sintético PostgreSQL',
      sourceNames: ['DOCENTE SINTÉTICO POSTGRESQL'],
      status: 'active',
    },
  };
}

function student(displayName: string): AcademicEntityRecordV1 {
  return {
    kind: 'student',
    value: {
      id: studentId,
      displayName,
      sourceNames: [displayName.toUpperCase()],
      sourceIdentityMarks: ['synthetic-position:1'],
    },
  };
}

function sourceFile(): SourceFileVersionV1 {
  const manifest: SourceFileManifestV1 = {
    id: 'manifest:postgres:synthetic' as SourceFileManifestId,
    fileName: 'synthetic.xlsx',
    extension: 'xlsx',
    reportedMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sizeBytes: 1024,
    lastModifiedAt: instant,
    sha256: 'a'.repeat(64),
    sourceContractVersion: 1,
    parserVersion: 'synthetic-parser-v1',
    readAt: instant,
    confirmedAcademicYearId: academicYearId,
    confirmedTeacherId: teacherId,
  };
  return { manifest, logicalSource: { state: 'unmatched' } };
}

function approvedEmptyBatch(): ImportBatchResultV1 {
  return {
    id: 'import-batch:postgres:synthetic' as ImportBatchId,
    status: 'approved',
    receivedAt: instant,
    updatedAt: instant,
    files: [],
    diagnostics: [],
    summary: {
      totalFileCount: 0,
      processedFileCount: 0,
      approvedFileCount: 0,
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

function approvedSourceBatch(source = sourceFile()): ImportBatchResultV1 {
  return {
    id: 'import-batch:postgres:bulk' as ImportBatchId,
    status: 'approved',
    receivedAt: instant,
    updatedAt: instant,
    files: [
      {
        id: 'import-file:postgres:bulk' as ImportFileId,
        sourceFile: {
          fileName: source.manifest.fileName,
          extension: source.manifest.extension,
          reportedMimeType: source.manifest.reportedMimeType,
          sizeBytes: source.manifest.sizeBytes,
          lastModifiedAt: source.manifest.lastModifiedAt,
        },
        manifest: source.manifest,
        status: 'approved',
        diagnosticIds: [],
      },
    ],
    diagnostics: [],
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

function occurrence(): AuditRecordV1 {
  const value: AuditOccurrenceV1 = {
    id: 'audit-occurrence:postgres:synthetic' as AuditOccurrenceId,
    severity: 'information',
    category: 'synthetic-postgres-verification',
    message: 'Ocorrência sintética PostgreSQL',
    createdAt: instant,
    state: 'open',
    stateHistory: [],
  };
  return { kind: 'occurrence', value };
}

describe('gradebook PostgreSQL persistence integration', () => {
  let postgres: PGlite;
  let database: ReturnType<typeof createGradebookPostgresDatabaseFromSqlV1>;

  beforeEach(async () => {
    postgres = await PGlite.create();
    await postgres.exec(
      readFileSync('migrations/postgres/0002_gradebook_production_v1.sql', 'utf8'),
    );
    await postgres.exec('SET search_path TO gradebook, pg_temp');
    database = createGradebookPostgresDatabaseFromSqlV1(new PGliteSqlV1(postgres));
  }, 30_000);

  afterEach(async () => {
    await database.close();
  });

  it('preserves create, update, no-change planning, stale CAS, history and import/audit families', async () => {
    const unit = createGradebookPostgresPersistenceUnitOfWorkV2(database, { now: () => instant });

    expect(
      await unit.entities.appendVersion(context, academicYear(), { expectedVersion: null }),
    ).toMatchObject({
      status: 'written',
      record: { version: 1 },
    });
    await unit.entities.appendVersion(context, teacher(), { expectedVersion: null });
    await unit.entities.appendVersion(context, student('Estudante Sintético A'), {
      expectedVersion: null,
    });
    const currentBefore = await unit.entities.get(context, { kind: 'student', id: studentId });
    expect(currentBefore?.version).toBe(1);

    // The application can make the no-change decision from the current provider-independent value.
    expect(currentBefore?.value).toEqual(student('Estudante Sintético A'));

    expect(
      await unit.entities.appendVersion(context, student('Estudante Sintético B'), {
        expectedVersion: 1,
      }),
    ).toMatchObject({ status: 'written', record: { version: 2 } });
    expect(
      await unit.entities.appendVersion(context, student('Estudante Sintético C'), {
        expectedVersion: 1,
      }),
    ).toEqual({ status: 'version-conflict', currentVersion: 2 });

    const listed = await unit.entities.list(context, 'student', { limit: 10 });
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]?.version).toBe(2);

    expect(
      await unit.imports.appendSourceFileVersion(context, sourceFile(), {
        expectedVersion: null,
      }),
    ).toMatchObject({ status: 'written', record: { version: 1 } });
    expect(
      await unit.imports.appendImportBatchVersion(context, approvedEmptyBatch(), {
        expectedVersion: null,
      }),
    ).toMatchObject({ status: 'written', record: { version: 1 } });

    const audit = occurrence();
    expect(
      await unit.audit.appendVersion(
        context,
        { kind: 'occurrence', id: audit.value.id as AuditOccurrenceId },
        audit,
        { expectedVersion: null },
      ),
    ).toMatchObject({ status: 'written', record: { version: 1 } });

    const durability = createGradebookPostgresAdaptersV1(database).durability;
    const classReference = 'class:postgres:synthetic' as CouncilClassReferenceV1;
    const studentReference = 'student:postgres:synthetic' as CouncilStudentReferenceV1;
    const decision = await durability.councilDecisions.append({
      academicYearId,
      classReference,
      studentReference,
      expectedVersion: 0,
      decision: { outcome: 'approved', resultingState: 'approved-by-council' },
      justification: 'Decisão sintética de integração',
      actorReference: 'actor:postgres:synthetic' as CouncilActorReferenceV1,
      decidedAt: instant,
    });
    expect(decision).toMatchObject({ status: 'applied', record: { version: 1 } });
    expect(
      await durability.councilDecisions.getCurrent({
        academicYearId,
        classReference,
        studentReference,
      }),
    ).toMatchObject({ version: 1 });
  }, 30_000);

  it('rolls back every family written inside a failed PostgreSQL transaction', async () => {
    const unit = createGradebookPostgresPersistenceUnitOfWorkV2(database, { now: () => instant });
    await unit.entities.appendVersion(context, academicYear(), { expectedVersion: null });

    await expect(
      database.transaction(async (transactionDatabase) => {
        const transaction = createGradebookPostgresTransactionalUnitOfWorkV2(transactionDatabase, {
          now: () => instant,
        });
        await transaction.entities.appendVersion(context, teacher(), { expectedVersion: null });
        await transaction.entities.appendVersion(context, student('Estudante em rollback'), {
          expectedVersion: null,
        });
        throw new Error('synthetic-rollback');
      }),
    ).rejects.toThrow('synthetic-rollback');

    expect(await unit.entities.get(context, { kind: 'teacher', id: teacherId })).toBeNull();
    expect(await unit.entities.get(context, { kind: 'student', id: studentId })).toBeNull();
  }, 30_000);

  it('commits the bounded import bootstrap through PostgreSQL set operations', async () => {
    const adapters = createGradebookPostgresAdaptersV1(database, { now: () => instant });
    await adapters.unitOfWork.entities.appendVersion(context, academicYear(), {
      expectedVersion: null,
    });
    await adapters.unitOfWork.entities.appendVersion(context, teacher(), { expectedVersion: null });

    const logicalSource = {
      id: 'logical-source:postgres:synthetic',
      academicYearId,
      teacherId,
      sourceContext: 'teacher-year-gradebook',
      createdAt: instant,
    } as LogicalSourceV2;
    const source = {
      ...sourceFile(),
      logicalSource: { state: 'confirmed', logicalSourceId: logicalSource.id },
    } satisfies SourceFileVersionV1;
    const batch = approvedSourceBatch(source);
    const importFileId = batch.files[0]!.id;
    const request = {
      logicalSource: { kind: 'create', value: logicalSource },
      plannedSourceFileManifestIds: [source.manifest.id],
      sourceManifestVersions: [{ manifestId: source.manifest.id, version: 1 }],
      batchWrite: { value: batch, expectedVersion: null },
      promotionRequest: {
        importBatchId: batch.id,
        approvedImportFileIds: [importFileId],
        expectedBatchVersion: 1,
      },
    } satisfies ImportBootstrapTransactionRequestV2;

    const result = await adapters.importBootstrapTransaction.runImportBootstrap(
      context,
      request,
      async (unit) => {
        await unit.logicalSources.createInitial(context, logicalSource);
        await unit.imports.appendSourceFileVersion(context, source, { expectedVersion: null });
        await unit.imports.appendImportBatchVersion(context, batch, { expectedVersion: null });
        await unit.entities.appendVersion(context, student('Estudante Sintético Bulk'), {
          expectedVersion: null,
        });
        return { state: 'applied' as const };
      },
    );

    expect(result).toEqual({ state: 'applied' });
    const persistedSource = await adapters.unitOfWork.logicalSources.get(context, logicalSource.id);
    expect(persistedSource).toMatchObject({
      ...logicalSource,
      createdAt: '2026-09-08T12:00:00.000Z',
    });
    expect(Date.parse(persistedSource!.createdAt)).toBe(Date.parse(logicalSource.createdAt));
    expect(
      await adapters.unitOfWork.imports.getSourceFileVersion(context, source.manifest.id),
    ).toMatchObject({ version: 1 });
    expect(await adapters.unitOfWork.imports.getImportBatch(context, batch.id)).toMatchObject({
      version: 1,
    });
    expect(
      await adapters.unitOfWork.entities.get(context, { kind: 'student', id: studentId }),
    ).toMatchObject({ version: 1 });
  }, 30_000);

  it('preserves staging, bulletin snapshots and institutional council sessions', async () => {
    const adapters = createGradebookPostgresAdaptersV1(database, { now: () => instant });
    await adapters.unitOfWork.entities.appendVersion(context, academicYear(), {
      expectedVersion: null,
    });

    await adapters.staging.begin({
      sessionId: 'stage-session:postgres:synthetic',
      academicYearId,
      sourceSha256: 'a'.repeat(64),
      expectedChunkCount: 1,
      metadataJson: JSON.stringify({ transportVersion: 8 }),
      createdAt: instant,
      expiresAt: '2026-09-08T13:00:00Z',
    });
    await expect(
      adapters.staging.getSession('stage-session:postgres:synthetic'),
    ).resolves.toMatchObject({ state: 'preparing', expectedChunkCount: 1 });

    const series = 'series:postgres:synthetic' as BulletinSnapshotSeriesKeyV1;
    await expect(
      adapters.durability.bulletinSnapshots.append(series, bulletinSnapshot(), 0),
    ).resolves.toMatchObject({ status: 'appended', snapshot: { snapshotVersion: 1 } });
    await expect(adapters.durability.bulletinSnapshots.getLatest(series)).resolves.toMatchObject({
      snapshotVersion: 1,
      model: { authorityMode: 'imported-source' },
    });

    const sessionKey = {
      academicYearId,
      classReference: 'class:postgres:session' as CouncilClassReferenceV1,
    };
    await expect(
      adapters.durability.councilSessions.recordVote({
        ...sessionKey,
        studentReference: 'student:postgres:session' as CouncilStudentReferenceV1,
        expectedVersion: 0,
        approvedVotes: 3,
        failedVotes: 1,
        actorReference: 'actor:postgres:session' as CouncilActorReferenceV1,
        recordedAt: instant,
      }),
    ).resolves.toMatchObject({ status: 'applied', version: 1 });
    await expect(
      adapters.durability.councilSessions.close({
        ...sessionKey,
        expectedVersion: 1,
        reviewReference: 'review:postgres:session' as CouncilReviewReferenceV2,
        items: [],
        actorReference: 'actor:postgres:session' as CouncilActorReferenceV1,
        closedAt: '2026-09-08T12:01:00Z',
      }),
    ).resolves.toMatchObject({ status: 'closed', snapshot: { version: 2 } });
    await expect(adapters.durability.councilSessions.getState(sessionKey)).resolves.toMatchObject({
      state: 'closed',
      version: 2,
    });
  }, 30_000);

  it('produces the same sanitized logical state as the D1 adapter', async () => {
    const sqlite = await openMigratedDatabase();
    try {
      const d1 = createGradebookD1PersistenceUnitOfWorkV2(sqlite, { now: () => instant });
      const postgresUnit = createGradebookPostgresPersistenceUnitOfWorkV2(database, {
        now: () => instant,
      });

      for (const unit of [d1, postgresUnit]) {
        await unit.entities.appendVersion(context, academicYear(), { expectedVersion: null });
        await unit.entities.appendVersion(context, teacher(), { expectedVersion: null });
        await unit.entities.appendVersion(context, student('Estudante Sintético Paridade'), {
          expectedVersion: null,
        });
        await unit.imports.appendSourceFileVersion(context, sourceFile(), {
          expectedVersion: null,
        });
        await unit.imports.appendImportBatchVersion(context, approvedEmptyBatch(), {
          expectedVersion: null,
        });
        const audit = occurrence();
        await unit.audit.appendVersion(
          context,
          { kind: 'occurrence', id: audit.value.id as AuditOccurrenceId },
          audit,
          { expectedVersion: null },
        );
      }

      const project = async (unit: typeof d1) => {
        const [studentRecord, sourceRecord, batchRecord, auditRecord] = await Promise.all([
          unit.entities.get(context, { kind: 'student', id: studentId }),
          unit.imports.getSourceFileVersion(context, sourceFile().manifest.id),
          unit.imports.getImportBatch(context, approvedEmptyBatch().id),
          unit.audit.getCurrent(context, {
            kind: 'occurrence',
            id: occurrence().value.id as AuditOccurrenceId,
          }),
        ]);
        return {
          student: { kind: studentRecord?.value.kind, version: studentRecord?.version },
          source: {
            state: sourceRecord?.value.logicalSource.state,
            version: sourceRecord?.version,
          },
          batch: { status: batchRecord?.value.status, version: batchRecord?.version },
          audit: {
            kind: auditRecord?.value.kind,
            state: auditRecord?.value.kind === 'occurrence' ? auditRecord.value.value.state : null,
            version: auditRecord?.version,
          },
        };
      };

      expect(await project(postgresUnit)).toEqual(await project(d1));
    } finally {
      sqlite.raw.close();
    }
  }, 30_000);

  it('returns only aggregate pass states from the production synthetic rollback verifier', async () => {
    const verification = await verifyGradebookPostgresAdaptersSyntheticV1(database);

    expect(verification).toMatchObject({
      version: 1,
      state: 'passed',
      syntheticOnly: true,
      committed: false,
      checks: {
        create: 'passed',
        update: 'passed',
        noChanges: 'passed',
        staleCas: 'passed',
        imports: 'passed',
        audit: 'passed',
        rollback: 'passed',
      },
    });
    expect(JSON.stringify(verification)).not.toMatch(/student|teacher|manifest|payload|hash/iu);
  }, 30_000);
});
