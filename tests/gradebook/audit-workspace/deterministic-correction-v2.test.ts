import { describe, expect, it } from 'vitest';

import type {
  AcademicYearId,
  EnrollmentId,
  StudentId,
  TeacherId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import type {
  ImportBatchFileResultV1,
  ImportBatchResultV1,
  SourceFileManifestV1,
} from '../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  ImportBatchId,
  ImportFileId,
  SourceFileManifestId,
} from '../../../shared/gradebook-contracts/imports/import-ids-v1';
import type { ReconciliationResultId } from '../../../shared/gradebook-contracts/audit/audit-contract-v1';
import type {
  AssessmentComponentId,
  ComparedGradeValueV1,
  GradeEntryId,
  GradeEntryV1,
  TermResultId,
  TermResultV1,
} from '../../../shared/gradebook-contracts/results/results-contract-v1';
import type {
  DeterministicCorrectionProofV2,
  ReconciliationResultV2,
} from '../../../shared/gradebook-contracts/audit/reconciliation-contract-v2';
import type { SourceCellEvidenceV1 } from '../../../shared/gradebook-contracts/source/source-contract-v1';
import type {
  AcademicPersistenceContextV1,
  AcademicRecordStreamV1,
  AcademicRecordV1,
  BatchPromotionRequestV1,
  BatchPromotionTransactionPortV1,
  LogicalSourceIdV1,
  LogicalSourceRecordAssociationV1,
  PersistenceUnitOfWorkV1,
  SourceFileVersionV1,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  createDeterministicCorrectionWorkspaceV2,
  createInvestigatedReconciliationCaseV2,
  createLocalDeterministicCorrectionCaseStoreV2,
  type DeterministicCorrectionCaseStoreV2,
  type DeterministicCorrectionRecipeV2,
} from '../../../server/gradebook/application/audit-workspace/deterministic-correction-v2';
import {
  academicRecordStreamForV1,
  academicRecordStreamKeyV1,
  logicalSourceRecordAssociationStreamForV1,
  type ImportReconciliationInputV1,
} from '../../../server/gradebook/application/import/import-reconciliation-v1';
import { MemoryPersistenceAdapter } from '../persistence/ports/memory-persistence-adapter';

const academicYearId = 'academic-year:deterministic-correction:2026' as AcademicYearId;
const context = { academicYearId } satisfies AcademicPersistenceContextV1;
const batchId = 'import-batch:deterministic-correction:synthetic' as ImportBatchId;
const importFileId = 'import-file:deterministic-correction:synthetic' as ImportFileId;
const logicalSourceId = 'logical-source:deterministic-correction:synthetic' as LogicalSourceIdV1;
const reconciliationId =
  'reconciliation-result:deterministic-correction:synthetic' as ReconciliationResultId;
const fixedInstant = '2026-09-02T18:00:00.000Z';

function manifest(): SourceFileManifestV1 {
  return {
    id: 'manifest:deterministic-correction:synthetic' as SourceFileManifestId,
    fileName: 'notas-sinteticas.xlsx',
    extension: 'xlsx',
    reportedMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sizeBytes: 1024,
    lastModifiedAt: '2026-09-02T17:00:00.000Z',
    sha256: 'a'.repeat(64),
    sourceContractVersion: 2,
    parserVersion: 'synthetic-parser-v2',
    readAt: '2026-09-02T17:05:00.000Z',
    confirmedAcademicYearId: academicYearId,
    confirmedTeacherId: 'teacher:deterministic-correction:synthetic' as TeacherId,
  };
}

function evidence(value: number): SourceCellEvidenceV1 {
  return {
    classification: 'manual-positive-number',
    rawValue: value,
    provenance: {
      fileName: manifest().fileName,
      fileSha256: manifest().sha256,
      sheetName: '6A1º',
      cellAddress: 'R5',
    },
  };
}

function compared(imported: number, calculated: number): ComparedGradeValueV1 {
  return {
    imported: { value: { state: 'numeric', value: imported }, evidence: [evidence(imported)] },
    calculated: { value: { state: 'numeric', value: calculated } },
  };
}

function gradeRecord(value: number): AcademicRecordV1 {
  const grade: GradeEntryV1 = {
    id: 'grade-entry:deterministic-correction:synthetic' as GradeEntryId,
    academicYearId,
    studentId: 'student:deterministic-correction:synthetic' as StudentId,
    enrollmentId: 'enrollment:deterministic-correction:synthetic' as EnrollmentId,
    assessmentComponentId:
      'assessment-component:deterministic-correction:synthetic' as AssessmentComponentId,
    value: compared(value, value),
    authorityMode: 'imported-source',
    ruleVersion: 'source-normalization:synthetic:v2',
    version: value === 7 ? 1 : 2,
    ...(value === 7
      ? {}
      : {
          supersedesGradeEntryId: 'grade-entry:deterministic-correction:synthetic' as GradeEntryId,
        }),
  };
  return { kind: 'grade-entry', value: grade };
}

function termRecord(calculatedOfficial: number): AcademicRecordV1 {
  const base = compared(18, 18);
  const value: TermResultV1 = {
    id: 'term-result:deterministic-correction:synthetic' as TermResultId,
    academicYearId,
    studentId: 'student:deterministic-correction:term' as StudentId,
    enrollmentId: 'enrollment:deterministic-correction:term' as EnrollmentId,
    teachingAssignmentId:
      'teaching-assignment:deterministic-correction:term' as TeachingAssignmentId,
    term: 1,
    maximum: 30,
    quantitative: {
      original: base,
      parallelRecovery: base,
      parallelRecoveryApplicability: {
        imported: {
          value: { state: 'not-applicable', reason: 'synthetic' },
          evidence: [evidence(18)],
        },
        calculated: { state: 'not-applicable', reason: 'synthetic' },
      },
      considered: base,
    },
    qualitativeOperational: base,
    officialGrade: compared(18, calculatedOfficial),
    percentage: compared(60, (calculatedOfficial / 30) * 100),
    authorityMode: 'imported-source',
    coverage: {
      state: 'complete',
      expectedItemCount: 2,
      resolvedItemCount: 2,
      missingItemCount: 0,
      reasons: [],
    },
    ruleVersion: 'term-profile:synthetic:2026:v1',
  };
  return { kind: 'term-result', value };
}

function approvedFile(): ImportBatchFileResultV1 {
  return {
    id: importFileId,
    sourceFile: {
      fileName: manifest().fileName,
      extension: manifest().extension,
      reportedMimeType: manifest().reportedMimeType,
      sizeBytes: manifest().sizeBytes,
      lastModifiedAt: manifest().lastModifiedAt,
    },
    manifest: manifest(),
    status: 'approved',
    diagnosticIds: [],
  };
}

function batch(): ImportBatchResultV1 {
  return {
    id: batchId,
    status: 'approved',
    files: [approvedFile()],
    diagnostics: [],
    receivedAt: fixedInstant,
    updatedAt: fixedInstant,
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

function mismatch(target: AcademicRecordV1): ReconciliationResultV2 {
  return {
    id: reconciliationId,
    target: { kind: target.kind, id: target.value.id } as ReconciliationResultV2['target'],
    value: compared(7, 8),
    ruleVersion: 'reconciliation:synthetic:v2',
    status: 'mismatch',
    difference: 1,
    explanation: 'Divergência sintética observada.',
  };
}

function postMatch(target: AcademicRecordV1): ReconciliationResultV2 {
  return {
    id: reconciliationId,
    target: { kind: target.kind, id: target.value.id } as ReconciliationResultV2['target'],
    value: compared(8, 8),
    ruleVersion: 'reconciliation:synthetic:v2',
    status: 'match',
    difference: 0,
  };
}

function association(stream: AcademicRecordStreamV1): LogicalSourceRecordAssociationV1 {
  return {
    academicYearId,
    logicalSourceId,
    academicRecordStream: stream,
    stableKey: academicRecordStreamKeyV1(stream),
    state: 'active',
    sourceManifestId: manifest().id,
    sourceManifestVersion: 1,
  };
}

async function seed(adapter: MemoryPersistenceAdapter, currentRecord: AcademicRecordV1) {
  const source: SourceFileVersionV1 = {
    manifest: manifest(),
    logicalSource: { state: 'confirmed', logicalSourceId },
  };
  await adapter.unitOfWork.imports.appendSourceFileVersion(context, source, {
    expectedVersion: null,
  });
  await adapter.unitOfWork.imports.appendImportBatchVersion(context, batch(), {
    expectedVersion: null,
  });
  const stream = academicRecordStreamForV1(currentRecord);
  await adapter.unitOfWork.academicRecords.appendVersion(context, stream, currentRecord, {
    expectedVersion: null,
  });
  await adapter.unitOfWork.logicalSourceRecords.appendVersion(
    context,
    logicalSourceRecordAssociationStreamForV1(logicalSourceId, stream),
    association(stream),
    { expectedVersion: null },
  );
  return stream;
}

function proof(
  currentRecord: AcademicRecordV1,
  kind: 'renormalize-imported-record' | 'reprocess-derived-result' = 'renormalize-imported-record',
): DeterministicCorrectionProofV2 {
  const target = {
    kind: currentRecord.kind,
    id: currentRecord.value.id,
  } as DeterministicCorrectionProofV2['operation']['target'];
  return {
    rootCause: {
      state: 'identified',
      code:
        kind === 'renormalize-imported-record'
          ? 'internal-normalization-incompatible'
          : 'stale-derived-result',
    },
    officialEvidenceReferences: ['official-evidence:synthetic:1'],
    candidateOperationCount: 1,
    requiresHumanJudgment: false,
    destination: 'internal-versioned-state',
    operation:
      kind === 'renormalize-imported-record'
        ? {
            kind,
            target: target as Extract<typeof target, { kind: 'grade-entry' }>,
            deterministicOutputReference: 'deterministic-output:synthetic:1',
          }
        : {
            kind,
            target: target as Extract<
              typeof target,
              { kind: 'term-result' | 'final-recovery' | 'annual-result' }
            >,
            profileId: 'evaluation-profile:synthetic:2026',
            profileVersion: '1',
            deterministicOutputReference: 'deterministic-output:synthetic:1',
          },
    precondition:
      kind === 'renormalize-imported-record'
        ? { kind: 'cas', expectedVersion: 1 }
        : {
            kind: 'immutable-input-set',
            inputVersionReferences: ['input-version:synthetic:1'],
          },
  };
}

function recipe(
  currentRecord: AcademicRecordV1,
  correctedRecord: AcademicRecordV1,
): DeterministicCorrectionRecipeV2 {
  const reconciliationInput: ImportReconciliationInputV1 = {
    context,
    batch: batch(),
    expectedBatchVersion: 1,
    files: [
      {
        importFileId,
        logicalSource: { state: 'confirmed', logicalSourceId },
        records: [correctedRecord],
      },
    ],
  };
  return {
    reconciliationInput,
    importFileId,
    targetStableKey: academicRecordStreamKeyV1(academicRecordStreamForV1(currentRecord)),
    deterministicOutputReference: 'deterministic-output:synthetic:1',
    verifiedInputVersionReferences: ['input-version:synthetic:1'],
    postCorrectionReconciliation: postMatch(currentRecord),
  };
}

function workspace(
  adapter: MemoryPersistenceAdapter,
  store: DeterministicCorrectionCaseStoreV2,
  transaction: BatchPromotionTransactionPortV1 = adapter,
) {
  return createDeterministicCorrectionWorkspaceV2({
    store,
    audit: adapter.unitOfWork.audit,
    planningRepositories: {
      imports: adapter.unitOfWork.imports,
      academicRecords: adapter.unitOfWork.academicRecords,
      logicalSourceRecords: adapter.unitOfWork.logicalSourceRecords,
    },
    transaction,
    server: {
      isAuthorized: () => true,
      correctionIdentity: () => ({
        actorId: 'actor:deterministic-correction:server',
        occurredAt: fixedInstant,
      }),
    },
  });
}

async function registerEligible(input: {
  adapter: MemoryPersistenceAdapter;
  store: DeterministicCorrectionCaseStoreV2;
  current: AcademicRecordV1;
  corrected: AcademicRecordV1;
  operation?: 'renormalize-imported-record' | 'reprocess-derived-result';
}) {
  const correctionProof = proof(input.current, input.operation);
  const value = createInvestigatedReconciliationCaseV2({
    divergence: mismatch(input.current),
    academicImpact: {
      state: 'potentially-material',
      basis: 'fail-closed-unresolved',
      reason: 'Impacto sintético ainda bloqueado.',
    },
    finding: {
      state: 'eligible',
      proof: correctionProof,
      investigationReference: 'investigation:synthetic:1',
    },
  });
  const result = await workspace(input.adapter, input.store).register({
    academicYearId,
    reconciliationId,
    case: value,
    recipe: recipe(input.current, input.corrected),
    expectedVersion: null,
  });
  expect(result.status).toBe('written');
  if (result.status !== 'written') throw new Error('synthetic registration failed');
  return result.record;
}

describe('investigação e correção determinística V2', () => {
  it('corrige normalização interna pelo planner/executor oficiais e registra nova versão auditável', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const store = createLocalDeterministicCorrectionCaseStoreV2(() => fixedInstant);
    const current = gradeRecord(7);
    const corrected = gradeRecord(8);
    const stream = await seed(adapter, current);
    const registered = await registerEligible({ adapter, store, current, corrected });

    const result = await workspace(adapter, store).execute({
      academicYearId,
      reference: registered.reference,
      expectedVersion: registered.version,
    });

    expect(result.outcome).toBe('applied');
    if (result.outcome !== 'applied') throw new Error('expected applied correction');
    expect(result.record.case).toMatchObject({
      divergence: { status: 'match' },
      investigation: { state: 'reconciled' },
      correctionOutcome: { state: 'completed', evidencePreserved: true },
      institutionalRelease: { state: 'eligible' },
      pilotFlow: { state: 'continue', authorityMode: 'imported-source' },
    });
    expect(await adapter.unitOfWork.academicRecords.getCurrent(context, stream)).toMatchObject({
      version: 2,
      value: { value: { value: { imported: { value: { value: 8 } } } } },
    });
    expect(
      await adapter.unitOfWork.logicalSourceRecords.getCurrent(
        context,
        logicalSourceRecordAssociationStreamForV1(logicalSourceId, stream),
      ),
    ).toMatchObject({ version: 2, value: { sourceManifestVersion: 2 } });
    expect(
      await adapter.unitOfWork.imports.getSourceFileVersion(context, manifest().id),
    ).toMatchObject({ version: 2, value: { manifest: manifest() } });
    expect(
      await adapter.unitOfWork.audit.getCurrent(context, {
        kind: 'occurrence',
        id: `audit-occurrence:automatic-data-repair:${registered.reference}` as never,
      }),
    ).toMatchObject({
      version: 1,
      value: { value: { category: 'automatic-data-repair', state: 'resolved' } },
    });
  });

  it('reexecuta a mesma correção de forma idempotente sem nova versão', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const store = createLocalDeterministicCorrectionCaseStoreV2(() => fixedInstant);
    const current = gradeRecord(7);
    const stream = await seed(adapter, current);
    const registered = await registerEligible({
      adapter,
      store,
      current,
      corrected: gradeRecord(8),
    });
    const service = workspace(adapter, store);
    const first = await service.execute({
      academicYearId,
      reference: registered.reference,
      expectedVersion: 1,
    });
    expect(first.outcome).toBe('applied');
    const second = await service.execute({
      academicYearId,
      reference: registered.reference,
      expectedVersion: 1,
    });
    expect(second.outcome).toBe('already-completed');
    expect(await adapter.unitOfWork.academicRecords.getCurrent(context, stream)).toMatchObject({
      version: 2,
    });
    expect(await store.listVersions(context, registered.reference)).toHaveLength(2);
  });

  it('usa claim CAS para permitir um único vencedor concorrente', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const store = createLocalDeterministicCorrectionCaseStoreV2(() => fixedInstant);
    const current = gradeRecord(7);
    await seed(adapter, current);
    const registered = await registerEligible({
      adapter,
      store,
      current,
      corrected: gradeRecord(8),
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const holdingTransaction: BatchPromotionTransactionPortV1 = {
      async runBatchPromotion(transactionContext, request, operation) {
        entered();
        await gate;
        return adapter.runBatchPromotion(transactionContext, request, operation);
      },
    };
    const service = workspace(adapter, store, holdingTransaction);
    const first = service.execute({
      academicYearId,
      reference: registered.reference,
      expectedVersion: 1,
    });
    await started;
    const second = await service.execute({
      academicYearId,
      reference: registered.reference,
      expectedVersion: 1,
    });
    expect(second).toEqual({ outcome: 'version-conflict', currentVersion: 1 });
    release();
    await expect(first).resolves.toMatchObject({ outcome: 'applied' });
  });

  it('faz rollback de registro, associação e auditoria quando a correção falha no meio', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const store = createLocalDeterministicCorrectionCaseStoreV2(() => fixedInstant);
    const current = gradeRecord(7);
    const stream = await seed(adapter, current);
    const registered = await registerEligible({
      adapter,
      store,
      current,
      corrected: gradeRecord(8),
    });
    const failingTransaction: BatchPromotionTransactionPortV1 = {
      runBatchPromotion<T>(
        transactionContext: AcademicPersistenceContextV1,
        request: BatchPromotionRequestV1,
        operation: (unitOfWork: PersistenceUnitOfWorkV1) => Promise<T>,
      ) {
        return adapter.runBatchPromotion(transactionContext, request, (unitOfWork) =>
          operation({
            ...unitOfWork,
            audit: {
              ...unitOfWork.audit,
              appendVersion: async () => {
                throw new Error('synthetic-sensitive-failure');
              },
            },
          }),
        );
      },
    };

    const result = await workspace(adapter, store, failingTransaction).execute({
      academicYearId,
      reference: registered.reference,
      expectedVersion: 1,
    });

    expect(result).toEqual({ outcome: 'unavailable' });
    expect(await adapter.unitOfWork.academicRecords.getCurrent(context, stream)).toMatchObject({
      version: 1,
    });
    expect(
      await adapter.unitOfWork.logicalSourceRecords.getCurrent(
        context,
        logicalSourceRecordAssociationStreamForV1(logicalSourceId, stream),
      ),
    ).toMatchObject({ version: 1 });
    expect(
      await adapter.unitOfWork.imports.getSourceFileVersion(context, manifest().id),
    ).toMatchObject({ version: 1 });
    expect(
      await adapter.unitOfWork.audit.getCurrent(context, {
        kind: 'occurrence',
        id: `audit-occurrence:automatic-data-repair:${registered.reference}` as never,
      }),
    ).toBeNull();
    expect(JSON.stringify(result)).not.toContain('synthetic-sensitive-failure');
  });

  it('reprocessa resultado derivado obsoleto com perfil e inputs versionados', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const store = createLocalDeterministicCorrectionCaseStoreV2(() => fixedInstant);
    const current = termRecord(17);
    const corrected = termRecord(18);
    const stream = await seed(adapter, current);
    const registered = await registerEligible({
      adapter,
      store,
      current,
      corrected,
      operation: 'reprocess-derived-result',
    });
    const result = await workspace(adapter, store).execute({
      academicYearId,
      reference: registered.reference,
      expectedVersion: 1,
    });
    expect(result.outcome).toBe('applied');
    expect(await adapter.unitOfWork.academicRecords.getCurrent(context, stream)).toMatchObject({
      version: 2,
      value: { value: { officialGrade: { calculated: { value: { value: 18 } } } } },
    });
  });

  it.each([
    ['source-document-correction-required', 'A fonte deve ser corrigida pelo fluxo humano.'],
    ['official-evidence-insufficient', 'A evidência permanece ambígua.'],
    ['software-change-required', 'A correção exige PR normal de software.'],
    ['human-judgment-required', 'Decisão de Conselho não é automática.'],
  ] as const)('mantém %s fail-closed sem qualquer escrita', async (reason, explanation) => {
    const adapter = new MemoryPersistenceAdapter();
    const store = createLocalDeterministicCorrectionCaseStoreV2(() => fixedInstant);
    const current = gradeRecord(7);
    const stream = await seed(adapter, current);
    const value = createInvestigatedReconciliationCaseV2({
      divergence: mismatch(current),
      academicImpact: {
        state: 'potentially-material',
        basis: 'fail-closed-unresolved',
        reason: 'Materialidade não resolvida.',
      },
      finding: {
        state: 'not-eligible',
        reason,
        explanation,
        investigationReference: `investigation:synthetic:${reason}`,
      },
    });
    const service = workspace(adapter, store);
    const registered = await service.register({
      academicYearId,
      reconciliationId,
      case: value,
      recipe: null,
      expectedVersion: null,
    });
    expect(registered.status).toBe('written');
    if (registered.status !== 'written') throw new Error('registration failed');
    await expect(
      service.execute({
        academicYearId,
        reference: registered.record.reference,
        expectedVersion: registered.record.version,
      }),
    ).resolves.toMatchObject({ outcome: 'not-eligible' });
    expect(await adapter.unitOfWork.academicRecords.getCurrent(context, stream)).toMatchObject({
      version: 1,
    });
    expect(value.pilotFlow).toMatchObject({ state: 'stop', authorityMode: 'imported-source' });
  });

  it('rebaixa prova inválida para não elegível e nunca aceita mutação arbitrária', () => {
    const current = gradeRecord(7);
    const invalidProof = {
      ...proof(current),
      candidateOperationCount: 2,
      operation: {
        kind: 'patch-arbitrary-data',
        target: { kind: 'grade-entry', id: current.value.id },
        deterministicOutputReference: 'arbitrary:synthetic',
      },
    } as unknown as DeterministicCorrectionProofV2;
    const value = createInvestigatedReconciliationCaseV2({
      divergence: mismatch(current),
      academicImpact: {
        state: 'potentially-material',
        basis: 'fail-closed-unresolved',
        reason: 'Materialidade não resolvida.',
      },
      finding: {
        state: 'eligible',
        proof: invalidProof,
        investigationReference: 'investigation:synthetic:invalid-proof',
      },
    });
    expect(value.automaticCorrection).toMatchObject({
      state: 'not-eligible',
      reason: 'official-evidence-insufficient',
    });
    expect(JSON.stringify(value)).not.toContain('patch-arbitrary-data');
  });

  it('distingue software-fix-required de automatic-data-repair sem executar runtime', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const store = createLocalDeterministicCorrectionCaseStoreV2(() => fixedInstant);
    const current = gradeRecord(7);
    await seed(adapter, current);
    const value = createInvestigatedReconciliationCaseV2({
      divergence: mismatch(current),
      academicImpact: {
        state: 'potentially-material',
        basis: 'fail-closed-unresolved',
        reason: 'Impacto de defeito sintético ainda não resolvido.',
      },
      finding: {
        state: 'not-eligible',
        reason: 'software-change-required',
        explanation: 'software-fix-required: corrigir por PR normal antes do reprocessamento.',
        investigationReference: 'investigation:synthetic:software-fix-required',
      },
    });
    const service = workspace(adapter, store);
    const registered = await service.register({
      academicYearId,
      reconciliationId,
      case: value,
      recipe: null,
      expectedVersion: null,
    });
    expect(registered.status).toBe('written');
    if (registered.status !== 'written') throw new Error('registration failed');

    await expect(
      service.execute({
        academicYearId,
        reference: registered.record.reference,
        expectedVersion: registered.record.version,
      }),
    ).resolves.toMatchObject({
      outcome: 'not-eligible',
      record: {
        case: {
          automaticCorrection: { reason: 'software-change-required' },
          pilotFlow: { state: 'stop' },
        },
      },
    });
    await expect(
      adapter.unitOfWork.audit.getCurrent(context, {
        kind: 'occurrence',
        id: `audit-occurrence:automatic-data-repair:${registered.record.reference}` as never,
      }),
    ).resolves.toBeNull();
  });
});
