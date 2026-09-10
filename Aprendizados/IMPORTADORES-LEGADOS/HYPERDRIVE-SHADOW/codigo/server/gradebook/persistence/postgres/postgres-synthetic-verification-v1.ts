import type {
  AcademicYearId,
  SchoolId,
  StudentId,
} from '../../../../shared/gradebook-contracts/entities';
import type { AuditOccurrenceId } from '../../../../shared/gradebook-contracts/audit/audit-contract-v1';
import type { ImportBatchId } from '../../../../shared/gradebook-contracts/imports/import-ids-v1';
import type { AcademicEntityRecordV1 } from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type { GradebookPostgresDatabaseV1 } from './postgres-database-v1';
import { createGradebookPostgresTransactionalUnitOfWorkV2 } from './postgres-persistence-unit-of-work-v1';

class SyntheticRollbackV1 extends Error {
  constructor() {
    super('gradebook-postgres-synthetic-rollback');
    this.name = 'SyntheticRollbackV1';
  }
}

function milliseconds(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

function student(id: StudentId, displayName: string): AcademicEntityRecordV1 {
  return {
    kind: 'student',
    value: {
      id,
      displayName,
      sourceNames: [displayName.toUpperCase()],
      sourceIdentityMarks: ['synthetic-verification'],
    },
  };
}

export interface GradebookPostgresSyntheticVerificationV1 {
  readonly version: 1;
  readonly state: 'passed';
  readonly syntheticOnly: true;
  readonly committed: false;
  readonly checks: {
    readonly create: 'passed';
    readonly update: 'passed';
    readonly noChanges: 'passed';
    readonly staleCas: 'passed';
    readonly imports: 'passed';
    readonly audit: 'passed';
    readonly rollback: 'passed';
  };
  readonly timingsMs: {
    readonly transaction: number;
    readonly rollbackVerification: number;
    readonly total: number;
  };
}

/** Executes only generated synthetic writes and deliberately rolls the transaction back. */
export async function verifyGradebookPostgresAdaptersSyntheticV1(
  database: GradebookPostgresDatabaseV1,
): Promise<GradebookPostgresSyntheticVerificationV1> {
  const totalStartedAt = performance.now();
  const token = crypto.randomUUID();
  const academicYearId = `academic-year:postgres-verification:${token}` as AcademicYearId;
  const schoolId = `school:postgres-verification:${token}` as SchoolId;
  const studentId = `student:postgres-verification:${token}` as StudentId;
  const context = { academicYearId };
  const now = new Date().toISOString();
  const transactionStartedAt = performance.now();

  try {
    await database.transaction(async (transactionDatabase) => {
      const unit = createGradebookPostgresTransactionalUnitOfWorkV2(transactionDatabase, {
        now: () => now,
      });
      const year = await unit.entities.appendVersion(
        context,
        {
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
        },
        { expectedVersion: null },
      );
      if (year.status !== 'written' || year.record.version !== 1) {
        throw new Error('synthetic-create-failed');
      }

      const firstValue = student(studentId, 'Estudante Sintético A');
      const created = await unit.entities.appendVersion(context, firstValue, {
        expectedVersion: null,
      });
      if (created.status !== 'written' || created.record.version !== 1) {
        throw new Error('synthetic-create-failed');
      }
      const current = await unit.entities.get(context, { kind: 'student', id: studentId });
      if (!current || JSON.stringify(current.value) !== JSON.stringify(firstValue)) {
        throw new Error('synthetic-no-change-failed');
      }

      const updated = await unit.entities.appendVersion(
        context,
        student(studentId, 'Estudante Sintético B'),
        { expectedVersion: 1 },
      );
      if (updated.status !== 'written' || updated.record.version !== 2) {
        throw new Error('synthetic-update-failed');
      }
      const stale = await unit.entities.appendVersion(
        context,
        student(studentId, 'Estudante Sintético C'),
        { expectedVersion: 1 },
      );
      if (stale.status !== 'version-conflict' || stale.currentVersion !== 2) {
        throw new Error('synthetic-cas-failed');
      }

      const batch = await unit.imports.appendImportBatchVersion(
        context,
        {
          id: `import-batch:postgres-verification:${token}` as ImportBatchId,
          status: 'approved',
          receivedAt: now,
          updatedAt: now,
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
        },
        { expectedVersion: null },
      );
      if (batch.status !== 'written') throw new Error('synthetic-import-failed');

      const occurrenceId = `audit-occurrence:postgres-verification:${token}` as AuditOccurrenceId;
      const audit = await unit.audit.appendVersion(
        context,
        { kind: 'occurrence', id: occurrenceId },
        {
          kind: 'occurrence',
          value: {
            id: occurrenceId,
            severity: 'information',
            category: 'synthetic-postgres-verification',
            message: 'Ocorrência sintética de verificação',
            createdAt: now,
            state: 'open',
            stateHistory: [],
          },
        },
        { expectedVersion: null },
      );
      if (audit.status !== 'written') throw new Error('synthetic-audit-failed');
      throw new SyntheticRollbackV1();
    });
    throw new Error('synthetic-rollback-not-enforced');
  } catch (cause) {
    if (!(cause instanceof SyntheticRollbackV1)) throw cause;
  }
  const transaction = milliseconds(transactionStartedAt);

  const rollbackStartedAt = performance.now();
  const row = await database
    .prepare('SELECT COUNT(*) AS count FROM academic_years WHERE academic_year_id = ?')
    .bind(academicYearId)
    .first<Record<string, unknown>>();
  if (row?.count !== 0) throw new Error('synthetic-rollback-failed');
  const rollbackVerification = milliseconds(rollbackStartedAt);

  return {
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
    timingsMs: {
      transaction,
      rollbackVerification,
      total: milliseconds(totalStartedAt),
    },
  };
}
