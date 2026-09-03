import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  ClassGroupId,
  EnrollmentId,
  StudentId,
  SubjectId,
  TeacherId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import type { ImportBatchResultV1 } from '../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  ImportBatchId,
  ImportFileId,
  SourceFileManifestId,
} from '../../../shared/gradebook-contracts/imports/import-ids-v1';
import {
  GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V2,
  GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V2,
  GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_V2,
  inspectGradebookImportPersistenceRequestV2,
  isGradebookImportPersistenceRequestV2,
  isGradebookImportPersistenceResponseV2,
  type GradebookImportPersistenceRequestV2,
  type GradebookImportPersistenceSummaryV2,
} from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v2';
import {
  createImportBootstrapEnvelopeV2,
  IMPORT_BOOTSTRAP_WRITE_ORDER_V2,
} from '../../../server/gradebook/application/import/import-bootstrap-v2';
import type { ImportChangePlanV1 } from '../../../server/gradebook/application/import/import-reconciliation-v1';
import { resolveLogicalSourceForImportV2 } from '../../../server/gradebook/application/import/logical-source-resolution-v2';
import type {
  AcademicEntityRepositoryV1,
  AcademicPersistenceContextV1,
  LogicalSourceIdV1,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2,
  inspectImportBootstrapTransactionRequestV2,
  type ImportBootstrapTransactionPortV2,
  type ImportBootstrapTransactionRequestV2,
  type LogicalSourceRepositoryV2,
  type LogicalSourceV2,
  type PersistenceUnitOfWorkV2,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';

const academicYearId = 'academic-year:synthetic-2026' as AcademicYearId;
const teacherId = 'teacher:synthetic-001' as TeacherId;
const assignmentId = 'teaching-assignment:synthetic-001' as TeachingAssignmentId;
const logicalSourceId = 'logical-source:server-issued-001' as LogicalSourceIdV1;
const importBatchId = 'import-batch:server-issued-001' as ImportBatchId;
const importFileId = 'import-file:server-issued-001' as ImportFileId;
const manifestId = 'manifest:server-derived-001' as SourceFileManifestId;

function request(fileName = 'observacao-sintetica.xlsx'): GradebookImportPersistenceRequestV2 {
  return {
    transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V2,
    operation: GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V2,
    manifest: {
      fileName,
      extension: 'xlsx',
      reportedMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 1_024,
      lastModifiedAt: '2026-08-31T12:00:00.000Z',
      sha256: 'a'.repeat(64),
      sourceContractVersion: 2,
      parserVersion: 'synthetic-parser-v2',
      readAt: '2026-08-31T12:01:00.000Z',
    },
    recognizedSuggestions: { academicYear: 2026, teacherName: 'Rótulo sintético' },
    confirmedContext: { academicYearId },
    sourceResolution: { mode: 'resolve-or-create' },
    sheets: [
      {
        kind: 'recovery',
        sourceSheetName: 'REC-SINTETICA',
        recognizedContext: {
          classGroupLabel: 'Rótulo de turma sintética',
          subjectLabel: 'Rótulo de componente sintético',
          disciplineIndex: 'D1',
        },
        teachingAssignmentId: assignmentId,
        students: [
          {
            sourceRow: 5,
            confirmedStudent: {
              studentId: 'student:synthetic-001' as StudentId,
              enrollmentId: 'enrollment:synthetic-001' as EnrollmentId,
            },
            recovery: {
              trimester1: null,
              trimester2: null,
              trimester3: null,
              totalAfterRecovery: null,
              originalTrimester1: null,
              originalTrimester2: null,
              originalTrimester3: null,
              originalAnnual: null,
              eligibleTrimester1: false,
              eligibleTrimester2: false,
              eligibleTrimester3: false,
            },
          },
        ],
      },
    ],
    diagnostics: [{ severity: 'information', code: 'SYNTHETIC-READY', scope: 'file' }],
  } as unknown as GradebookImportPersistenceRequestV2;
}

function source(id = logicalSourceId): LogicalSourceV2 {
  return {
    id,
    academicYearId,
    teacherId,
    sourceContext: TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2,
    createdAt: '2026-08-31T12:02:00.000Z',
  };
}

function entities(
  teacherByAssignment: ReadonlyMap<TeachingAssignmentId, TeacherId> = new Map([
    [assignmentId, teacherId],
  ]),
): Pick<AcademicEntityRepositoryV1, 'get'> {
  return {
    async get(_context, reference) {
      if (reference.kind !== 'teaching-assignment') return null;
      const resolvedTeacherId = teacherByAssignment.get(reference.id);
      if (!resolvedTeacherId) return null;
      return {
        version: 1,
        recordedAt: '2026-08-01T00:00:00.000Z',
        value: {
          kind: 'teaching-assignment',
          value: {
            id: reference.id,
            academicYearId,
            teacherId: resolvedTeacherId,
            classGroupId: 'class-group:synthetic-001' as ClassGroupId,
            subjectId: 'subject:synthetic-001' as SubjectId,
            effectivePeriod: { startsOn: '2026-01-01', endsOn: '2026-12-31' },
            confirmationOrigin: 'user-confirmed',
          },
        },
      };
    },
  };
}

function logicalSources(
  items: readonly LogicalSourceV2[],
): Pick<LogicalSourceRepositoryV2, 'listByContext'> {
  return {
    async listByContext() {
      return { items, nextCursor: null };
    },
  };
}

function batch(): ImportBatchResultV1 {
  return {
    id: importBatchId,
    status: 'approved',
    files: [
      {
        id: importFileId,
        sourceFile: {
          fileName: 'observacao-sintetica.xlsx',
          extension: 'xlsx',
          reportedMimeType: null,
          sizeBytes: 1_024,
          lastModifiedAt: null,
        },
        manifest: {
          id: manifestId,
          fileName: 'observacao-sintetica.xlsx',
          extension: 'xlsx',
          reportedMimeType: null,
          sizeBytes: 1_024,
          lastModifiedAt: null,
          sha256: 'a'.repeat(64),
          sourceContractVersion: 2,
          parserVersion: 'synthetic-parser-v2',
          readAt: '2026-08-31T12:01:00.000Z',
          confirmedAcademicYearId: academicYearId,
          confirmedTeacherId: teacherId,
        },
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
    receivedAt: '2026-08-31T12:01:00.000Z',
    updatedAt: '2026-08-31T12:02:00.000Z',
  };
}

function plan(resolvedSource = source()): ImportChangePlanV1 {
  return {
    importBatchId,
    academicYearId,
    expectedBatchVersion: 1,
    status: 'ready-for-promotion',
    files: [
      {
        importFileId,
        sourceFileManifestId: manifestId,
        logicalSource: { state: 'confirmed', logicalSourceId: resolvedSource.id },
        sourceFileWrite: {
          kind: 'append-version',
          expectedVersion: null,
          value: {
            manifest: batch().files[0]!.manifest!,
            logicalSource: { state: 'confirmed', logicalSourceId: resolvedSource.id },
          },
        },
      },
    ],
    promotionRequest: {
      importBatchId,
      approvedImportFileIds: [importFileId],
      expectedBatchVersion: 1,
    },
  } as unknown as ImportChangePlanV1;
}

function writeCounts(
  overrides: Partial<GradebookImportPersistenceSummaryV2['plannedWrites']> = {},
) {
  const counts = {
    logicalSources: 0,
    sourceFileVersions: 0,
    importBatchVersions: 1,
    assessmentComponentVersions: 0,
    academicRecordVersions: 0,
    logicalSourceRecordAssociationVersions: 0,
    ...overrides,
  };
  return {
    ...counts,
    total:
      counts.logicalSources +
      counts.sourceFileVersions +
      counts.importBatchVersions +
      counts.assessmentComponentVersions +
      counts.academicRecordVersions +
      counts.logicalSourceRecordAssociationVersions,
  };
}

function summary(counts = writeCounts()): GradebookImportPersistenceSummaryV2 {
  return {
    assessmentDefinitions: { total: 0, resolved: 0, blocked: 0 },
    assessmentComponents: { unchanged: 0, new: 0, changed: 0, blocked: 0 },
    academicRecords: {
      unchanged: 1,
      new: 0,
      changed: 0,
      missingFromNewSource: 0,
      blocked: 0,
    },
    plannedWrites: counts,
    committedWrites: counts,
  };
}

class SyntheticAtomicBootstrapPort implements ImportBootstrapTransactionPortV2 {
  committedSteps: string[] = [];

  constructor(private readonly failAt: string | null = null) {}

  async runImportBootstrap<T>(
    context: AcademicPersistenceContextV1,
    transactionRequest: ImportBootstrapTransactionRequestV2,
    operation: (unitOfWork: PersistenceUnitOfWorkV2) => Promise<T>,
  ): Promise<T> {
    if (inspectImportBootstrapTransactionRequestV2(context, transactionRequest) !== 'ready') {
      throw new Error('invalid synthetic bootstrap request');
    }
    const pending: string[] = [];
    const record = (step: string) => {
      pending.push(step);
      if (this.failAt === step) throw new Error('synthetic transaction failure');
    };
    const unitOfWork = {
      logicalSources: {
        async createInitial(_context: unknown, value: LogicalSourceV2) {
          record('logical-source-if-new');
          return { status: 'created', value } as const;
        },
      },
      imports: {
        async appendSourceFileVersion(_context: unknown, value: unknown) {
          record('planned-source-file-version');
          return {
            status: 'written',
            record: { value, version: 1, recordedAt: '2026-08-31T12:04:00.000Z' },
          } as const;
        },
        async appendImportBatchVersion(_context: unknown, value: unknown) {
          record('import-batch-version');
          return {
            status: 'written',
            record: { value, version: 1, recordedAt: '2026-08-31T12:04:00.000Z' },
          } as const;
        },
      },
      entities: {
        async appendVersion(_context: unknown, value: unknown) {
          record('assessment-component-version');
          return {
            status: 'written',
            record: { value, version: 1, recordedAt: '2026-08-31T12:04:00.000Z' },
          } as const;
        },
      },
      academicRecords: {
        async appendVersion(_context: unknown, _stream: unknown, value: unknown) {
          record('academic-record-version');
          return {
            status: 'written',
            record: { value, version: 1, recordedAt: '2026-08-31T12:04:00.000Z' },
          } as const;
        },
      },
      logicalSourceRecords: {
        async appendVersion(_context: unknown, _stream: unknown, value: unknown) {
          record('logical-source-record-association-version');
          return {
            status: 'written',
            record: { value, version: 1, recordedAt: '2026-08-31T12:04:00.000Z' },
          } as const;
        },
      },
    } as unknown as PersistenceUnitOfWorkV2;
    const result = await operation(unitOfWork);
    this.committedSteps = pending;
    return result;
  }
}

describe('GradebookImportPersistenceTransportV2', () => {
  it('accepts a bounded first import without browser-provided logicalSourceId', () => {
    const value = request();
    expect(inspectGradebookImportPersistenceRequestV2(value)).toBe('ready');
    expect(isGradebookImportPersistenceRequestV2(value)).toBe(true);
    expect(JSON.stringify(value)).not.toContain('logicalSourceId');
    expect(GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_V2).toMatchObject({
      unit: 'one-recognized-source-file-per-request',
      bounds: { maxFilesSelectedInBrowser: 50, maxFilesPerRequest: 1 },
      sourceResolution: { mode: 'resolve-or-create', authority: 'server' },
      security: { capability: 'gradebook.persistence.admin', cacheControl: 'no-store' },
    });
  });

  it('rejects browser logical-source identity, CAS, and unknown resolution fields', () => {
    const identity = structuredClone(request()) as unknown as Record<string, unknown>;
    identity.logicalSourceId = logicalSourceId;
    expect(inspectGradebookImportPersistenceRequestV2(identity)).toBe('forbidden-client-payload');

    const cas = structuredClone(request()) as unknown as Record<string, unknown>;
    cas.expectedVersion = 1;
    expect(inspectGradebookImportPersistenceRequestV2(cas)).toBe('forbidden-client-payload');

    const resolution = structuredClone(request()) as unknown as Record<string, unknown>;
    (resolution.sourceResolution as Record<string, unknown>).candidateId = logicalSourceId;
    expect(inspectGradebookImportPersistenceRequestV2(resolution)).toBe('invalid-request');
  });

  it('distinguishes academic no-op from applied while allowing an atomic audit batch', () => {
    expect(
      isGradebookImportPersistenceResponseV2({
        transportVersion: 2,
        state: 'no-changes',
        summary: summary(),
      }),
    ).toBe(true);
    const appliedCounts = writeCounts({ academicRecordVersions: 1 });
    expect(
      isGradebookImportPersistenceResponseV2({
        transportVersion: 2,
        state: 'applied',
        summary: summary(appliedCounts),
      }),
    ).toBe(true);
    expect(
      isGradebookImportPersistenceResponseV2({
        transportVersion: 2,
        state: 'no-changes',
        summary: summary(appliedCounts),
      }),
    ).toBe(false);
  });
});

describe('teacher-year logical-source resolution V2', () => {
  it('derives a new server-owned source from official assignment references', async () => {
    const result = await resolveLogicalSourceForImportV2(request(), {
      entities: entities(),
      logicalSources: logicalSources([]),
      createLogicalSourceId: () => logicalSourceId,
      now: () => '2026-08-31T12:02:00.000Z',
    });
    expect(result).toEqual({
      status: 'new-source',
      context: {
        kind: 'teacher-year-gradebook',
        academicYearId,
        teacherId,
      },
      source: source(),
    });
  });

  it('reuses the unique compatible source regardless of filename metadata', async () => {
    const existing = source();
    for (const fileName of ['primeiro-nome.xlsx', 'nome-alterado.xlsx']) {
      const result = await resolveLogicalSourceForImportV2(request(fileName), {
        entities: entities(),
        logicalSources: logicalSources([existing]),
        createLogicalSourceId: () => 'logical-source:must-not-be-used' as LogicalSourceIdV1,
        now: () => '2026-08-31T12:03:00.000Z',
      });
      expect(result).toMatchObject({ status: 'existing-source', source: existing });
    }
  });

  it('fails closed for ambiguous or incompatible teacher context', async () => {
    const ambiguous = await resolveLogicalSourceForImportV2(request(), {
      entities: entities(),
      logicalSources: logicalSources([
        source(),
        source('logical-source:server-issued-002' as LogicalSourceIdV1),
      ]),
      createLogicalSourceId: () => logicalSourceId,
      now: () => '2026-08-31T12:02:00.000Z',
    });
    expect(ambiguous).toEqual({
      status: 'review-required',
      reason: 'ambiguous-logical-source',
    });

    const baseRequest = request();
    const incompatibleRequest = {
      ...baseRequest,
      sheets: [
        ...baseRequest.sheets,
        {
          ...baseRequest.sheets[0]!,
          sourceSheetName: 'REC-SINTETICA-2',
          teachingAssignmentId: 'teaching-assignment:synthetic-002' as TeachingAssignmentId,
        },
      ],
    };
    const incompatible = await resolveLogicalSourceForImportV2(incompatibleRequest, {
      entities: entities(
        new Map([
          [assignmentId, teacherId],
          [
            'teaching-assignment:synthetic-002' as TeachingAssignmentId,
            'teacher:synthetic-002' as TeacherId,
          ],
        ]),
      ),
      logicalSources: logicalSources([]),
      createLogicalSourceId: () => logicalSourceId,
      now: () => '2026-08-31T12:02:00.000Z',
    });
    expect(incompatible).toEqual({
      status: 'review-required',
      reason: 'incompatible-teacher-context',
    });
  });
});

describe('ImportBootstrapTransactionRequestV2', () => {
  it('is assembled only after the official plan and fixes the atomic write order', () => {
    const resolved = {
      status: 'new-source',
      source: source(),
      context: {
        kind: TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2,
        academicYearId,
        teacherId,
      },
    } as const;
    const envelope = createImportBootstrapEnvelopeV2({
      resolution: resolved,
      batch: batch(),
      plan: plan(),
    });
    expect(envelope.status).toBe('ready');
    if (envelope.status !== 'ready') return;
    expect(inspectImportBootstrapTransactionRequestV2({ academicYearId }, envelope.request)).toBe(
      'ready',
    );
    expect(envelope.request).toMatchObject({
      logicalSource: { kind: 'create', value: { id: logicalSourceId } },
      plannedSourceFileManifestIds: [manifestId],
      batchWrite: { expectedVersion: null, value: { id: importBatchId } },
      promotionRequest: { expectedBatchVersion: 1 },
    });
    expect(IMPORT_BOOTSTRAP_WRITE_ORDER_V2).toEqual([
      'logical-source-if-new',
      'planned-source-file-version',
      'import-batch-version',
      'assessment-component-version',
      'academic-record-version',
      'logical-source-record-association-version',
    ]);
  });

  it('rejects cross-year and duplicate planned manifests before a transaction starts', () => {
    const resolved = {
      status: 'existing-source',
      source: source(),
      context: {
        kind: TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2,
        academicYearId,
        teacherId,
      },
    } as const;
    const envelope = createImportBootstrapEnvelopeV2({
      resolution: resolved,
      batch: batch(),
      plan: plan(),
    });
    expect(envelope.status).toBe('ready');
    if (envelope.status !== 'ready') return;
    expect(
      inspectImportBootstrapTransactionRequestV2(
        { academicYearId: 'academic-year:synthetic-2027' as AcademicYearId },
        envelope.request,
      ),
    ).toBe('invalid-context');
    expect(
      inspectImportBootstrapTransactionRequestV2(
        { academicYearId },
        {
          ...envelope.request,
          plannedSourceFileManifestIds: [manifestId, manifestId],
        },
      ),
    ).toBe('duplicate-source-manifest');
  });

  it('commits the official sequence once and rolls every step back on a late failure', async () => {
    const resolution = {
      status: 'new-source',
      source: source(),
      context: {
        kind: TEACHER_YEAR_GRADEBOOK_LOGICAL_SOURCE_CONTEXT_V2,
        academicYearId,
        teacherId,
      },
    } as const;
    const envelope = createImportBootstrapEnvelopeV2({
      resolution,
      batch: batch(),
      plan: plan(),
    });
    expect(envelope.status).toBe('ready');
    if (envelope.status !== 'ready') return;
    const run = async (port: SyntheticAtomicBootstrapPort) =>
      port.runImportBootstrap({ academicYearId }, envelope.request, async (unitOfWork) => {
        const logicalSourceWrite = await unitOfWork.logicalSources.createInitial(
          { academicYearId },
          source(),
        );
        if (logicalSourceWrite.status === 'resolution-conflict') {
          throw new Error('logical source CAS conflict');
        }
        const sourceWrite = plan().files[0]!.sourceFileWrite;
        if (sourceWrite.kind !== 'append-version')
          throw new Error('missing synthetic source write');
        await unitOfWork.imports.appendSourceFileVersion({ academicYearId }, sourceWrite.value, {
          expectedVersion: null,
        });
        await unitOfWork.imports.appendImportBatchVersion({ academicYearId }, batch(), {
          expectedVersion: null,
        });
        await unitOfWork.entities.appendVersion({ academicYearId }, {} as never, {
          expectedVersion: null,
        });
        await unitOfWork.academicRecords.appendVersion(
          { academicYearId },
          {} as never,
          {} as never,
          { expectedVersion: null },
        );
        await unitOfWork.logicalSourceRecords.appendVersion(
          { academicYearId },
          {} as never,
          {} as never,
          { expectedVersion: null },
        );
      });

    const committed = new SyntheticAtomicBootstrapPort();
    await run(committed);
    expect(committed.committedSteps).toEqual(IMPORT_BOOTSTRAP_WRITE_ORDER_V2);

    const rolledBack = new SyntheticAtomicBootstrapPort('academic-record-version');
    await expect(run(rolledBack)).rejects.toThrow('synthetic transaction failure');
    expect(rolledBack.committedSteps).toEqual([]);
  });
});
