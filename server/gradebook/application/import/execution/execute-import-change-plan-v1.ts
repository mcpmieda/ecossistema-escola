import type { ImportFileId, SourceFileManifestId } from '../../../../../shared/gradebook-contracts/imports/import-ids-v1';
import type {
  AcademicPersistenceContextV1,
  AcademicRecordStreamV1,
  AcademicRecordV1,
  BatchPromotionTransactionPortV1,
  PersistenceUnitOfWorkV1,
  VersionedRecordV1,
  VersionedWriteResultV1,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  academicRecordStreamForV1,
  academicRecordStreamKeyV1,
  type ImportChangeCountsV1,
  type ImportChangePlanItemV1,
  type ImportChangePlanV1,
  type ImportFileChangePlanV1,
} from '../import-reconciliation-v1';

export interface ImportChangeExecutionWriteCountsV1 {
  readonly sourceFileVersions: number;
  readonly academicRecordVersions: number;
  readonly totalVersionWrites: number;
}

export interface AppliedSourceFileVersionV1 {
  readonly importFileId: ImportFileId;
  readonly sourceFileManifestId: SourceFileManifestId;
  readonly version: number;
}

export interface AppliedAcademicRecordVersionV1 {
  readonly importFileId: ImportFileId;
  readonly changeState: 'new' | 'changed';
  readonly stableKey: string;
  readonly recordKind: AcademicRecordV1['kind'];
  readonly version: number;
}

export interface AppliedImportChangeVersionsV1 {
  readonly sourceFiles: readonly AppliedSourceFileVersionV1[];
  readonly academicRecords: readonly AppliedAcademicRecordVersionV1[];
}

export type ImportChangePlanValidationScopeV1 = 'plan' | 'file' | 'item';

export interface ImportChangePlanValidationIssueV1 {
  readonly code: string;
  readonly scope: ImportChangePlanValidationScopeV1;
  readonly message: string;
  readonly importFileId?: ImportFileId;
  readonly stableKey?: string;
}

export interface ImportChangeVersionConflictV1 {
  readonly scope: 'source-file' | 'academic-record';
  readonly importFileId: ImportFileId;
  readonly stableKey?: string;
  readonly expectedVersion: number | null;
  readonly currentVersion: number | null;
}

interface ImportChangeExecutionResultBaseV1 {
  readonly importBatchId: ImportChangePlanV1['importBatchId'];
  readonly academicYearId: ImportChangePlanV1['academicYearId'];
  readonly expectedBatchVersion: number;
  readonly transactionStarted: boolean;
  readonly transactionCommitted: boolean;
  readonly committedWrites: ImportChangeExecutionWriteCountsV1;
  readonly appliedVersions: AppliedImportChangeVersionsV1;
}

export type ImportChangeExecutionResultV1 =
  | (ImportChangeExecutionResultBaseV1 & {
      readonly status: 'applied';
      readonly transactionStarted: true;
      readonly transactionCommitted: true;
      readonly plannedWrites: ImportChangeExecutionWriteCountsV1;
    })
  | (ImportChangeExecutionResultBaseV1 & {
      readonly status: 'no-changes';
      readonly transactionStarted: false;
      readonly transactionCommitted: false;
      readonly plannedWrites: ImportChangeExecutionWriteCountsV1;
      readonly reason: 'no-promotable-writes';
    })
  | (ImportChangeExecutionResultBaseV1 & {
      readonly status: 'version-conflict';
      readonly transactionStarted: true;
      readonly transactionCommitted: false;
      readonly attemptedWritesBeforeRollback: ImportChangeExecutionWriteCountsV1;
      readonly conflict: ImportChangeVersionConflictV1;
    })
  | (ImportChangeExecutionResultBaseV1 & {
      readonly status: 'rejected-invalid-plan';
      readonly transactionCommitted: false;
      readonly attemptedWritesBeforeRollback: ImportChangeExecutionWriteCountsV1;
      readonly validationIssues: readonly ImportChangePlanValidationIssueV1[];
    })
  | (ImportChangeExecutionResultBaseV1 & {
      readonly status: 'transaction-failed';
      readonly transactionStarted: true;
      readonly transactionCommitted: false;
      readonly attemptedWritesBeforeRollback: ImportChangeExecutionWriteCountsV1;
      readonly failure: {
        readonly code: 'transaction-failed';
        readonly message: string;
      };
    });

interface PlanValidationResultV1 {
  readonly issues: readonly ImportChangePlanValidationIssueV1[];
  readonly readyFiles: readonly ImportFileChangePlanV1[];
  readonly plannedWrites: ImportChangeExecutionWriteCountsV1;
}

interface MutableAppliedVersionsV1 {
  sourceFiles: AppliedSourceFileVersionV1[];
  academicRecords: AppliedAcademicRecordVersionV1[];
}

class VersionConflictSignalV1 extends Error {
  readonly conflict: ImportChangeVersionConflictV1;

  constructor(conflict: ImportChangeVersionConflictV1) {
    super('version-conflict');
    this.name = 'VersionConflictSignalV1';
    this.conflict = conflict;
  }
}

class InvalidExecutionSignalV1 extends Error {
  readonly issue: ImportChangePlanValidationIssueV1;

  constructor(issue: ImportChangePlanValidationIssueV1) {
    super(issue.code);
    this.name = 'InvalidExecutionSignalV1';
    this.issue = issue;
  }
}

function zeroWriteCounts(): ImportChangeExecutionWriteCountsV1 {
  return {
    sourceFileVersions: 0,
    academicRecordVersions: 0,
    totalVersionWrites: 0,
  };
}

function emptyAppliedVersions(): AppliedImportChangeVersionsV1 {
  return {
    sourceFiles: [],
    academicRecords: [],
  };
}

function attemptedWriteCounts(
  applied: MutableAppliedVersionsV1,
): ImportChangeExecutionWriteCountsV1 {
  return {
    sourceFileVersions: applied.sourceFiles.length,
    academicRecordVersions: applied.academicRecords.length,
    totalVersionWrites: applied.sourceFiles.length + applied.academicRecords.length,
  };
}

function validationIssue(input: ImportChangePlanValidationIssueV1): ImportChangePlanValidationIssueV1 {
  return input;
}

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isVersionExpectation(value: number | null): boolean {
  return value === null || isPositiveInteger(value);
}

function stableSerialize(value: unknown): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (Number.isNaN(value)) return '"number:NaN"';
      if (value === Number.POSITIVE_INFINITY) return '"number:+Infinity"';
      if (value === Number.NEGATIVE_INFINITY) return '"number:-Infinity"';
      return JSON.stringify(value);
    case 'undefined':
      return '"undefined"';
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
      }

      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right));
      return `{${entries
        .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
        .join(',')}}`;
    }
    default:
      return `"unsupported:${typeof value}"`;
  }
}

function sameStructure(left: unknown, right: unknown): boolean {
  return stableSerialize(left) === stableSerialize(right);
}

function countItems(items: readonly ImportChangePlanItemV1[]): ImportChangeCountsV1 {
  const counts: Record<ImportChangePlanItemV1['state'], number> = {
    unchanged: 0,
    new: 0,
    changed: 0,
    'missing-from-new-source': 0,
    blocked: 0,
  };

  for (const item of items) counts[item.state] += 1;
  return counts;
}

function sameChangeCounts(left: ImportChangeCountsV1, right: ImportChangeCountsV1): boolean {
  return (
    left.unchanged === right.unchanged &&
    left.new === right.new &&
    left.changed === right.changed &&
    left['missing-from-new-source'] === right['missing-from-new-source'] &&
    left.blocked === right.blocked
  );
}

function expectedFileWrites(file: ImportFileChangePlanV1): ImportChangeExecutionWriteCountsV1 {
  const sourceFileVersions = file.sourceFileWrite.kind === 'append-version' ? 1 : 0;
  const academicRecordVersions = file.counts.new + file.counts.changed;
  return {
    sourceFileVersions,
    academicRecordVersions,
    totalVersionWrites: sourceFileVersions + academicRecordVersions,
  };
}

function derivedPlanStatus(files: readonly ImportFileChangePlanV1[]): ImportChangePlanV1['status'] {
  const hasReady = files.some((file) => file.status === 'ready-for-promotion');
  const hasReview = files.some((file) => file.status === 'review-required');
  const hasBlocked = files.some((file) => file.status === 'blocked');

  if (hasReady && (hasReview || hasBlocked)) return 'partially-ready';
  if (hasReady) return 'ready-for-promotion';
  if (hasReview) return 'review-required';
  if (hasBlocked) return 'blocked';
  return 'no-changes';
}

function recordAcademicYearId(record: AcademicRecordV1): AcademicPersistenceContextV1['academicYearId'] {
  return record.value.academicYearId;
}

function validateStreamAndRecord(input: {
  plan: ImportChangePlanV1;
  file: ImportFileChangePlanV1;
  item: Extract<ImportChangePlanItemV1, { readonly stream: AcademicRecordStreamV1 }>;
  record: AcademicRecordV1;
  recordLabel: 'incoming' | 'current';
  issues: ImportChangePlanValidationIssueV1[];
}): void {
  const expectedStableKey = academicRecordStreamKeyV1(input.item.stream);
  const recordStream = academicRecordStreamForV1(input.record);

  if (input.item.stableKey !== expectedStableKey) {
    input.issues.push(
      validationIssue({
        code: 'item-stable-key-mismatch',
        scope: 'item',
        message: 'A chave estável não corresponde ao stream acadêmico informado.',
        importFileId: input.file.importFileId,
        stableKey: input.item.stableKey,
      }),
    );
  }

  if (academicRecordStreamKeyV1(recordStream) !== expectedStableKey) {
    input.issues.push(
      validationIssue({
        code: `${input.recordLabel}-record-stream-mismatch`,
        scope: 'item',
        message: 'O registro acadêmico não corresponde ao stream planejado.',
        importFileId: input.file.importFileId,
        stableKey: input.item.stableKey,
      }),
    );
  }

  if (recordAcademicYearId(input.record) !== input.plan.academicYearId) {
    input.issues.push(
      validationIssue({
        code: `${input.recordLabel}-record-year-mismatch`,
        scope: 'item',
        message: 'O registro acadêmico não pertence ao ano letivo do plano.',
        importFileId: input.file.importFileId,
        stableKey: input.item.stableKey,
      }),
    );
  }
}

function validateItem(input: {
  plan: ImportChangePlanV1;
  file: ImportFileChangePlanV1;
  item: ImportChangePlanItemV1;
  issues: ImportChangePlanValidationIssueV1[];
}): void {
  if (input.item.importFileId !== input.file.importFileId) {
    input.issues.push(
      validationIssue({
        code: 'item-file-mismatch',
        scope: 'item',
        message: 'O item não pertence ao arquivo que o contém.',
        importFileId: input.file.importFileId,
        stableKey: 'stableKey' in input.item ? input.item.stableKey : undefined,
      }),
    );
  }

  switch (input.item.state) {
    case 'new': {
      validateStreamAndRecord({
        ...input,
        item: input.item,
        record: input.item.incomingRecord,
        recordLabel: 'incoming',
      });
      const newExpectedVersion: unknown = input.item.expectedVersion;
      if (newExpectedVersion !== null) {
        input.issues.push(
          validationIssue({
            code: 'new-item-version-expectation-invalid',
            scope: 'item',
            message: 'Um item novo deve esperar ausência de versão anterior.',
            importFileId: input.file.importFileId,
            stableKey: input.item.stableKey,
          }),
        );
      }
      break;
    }
    case 'changed':
      validateStreamAndRecord({
        ...input,
        item: input.item,
        record: input.item.incomingRecord,
        recordLabel: 'incoming',
      });
      validateStreamAndRecord({
        ...input,
        item: input.item,
        record: input.item.currentRecord.value,
        recordLabel: 'current',
      });
      if (
        !isPositiveInteger(input.item.expectedVersion) ||
        input.item.expectedVersion !== input.item.currentRecord.version
      ) {
        input.issues.push(
          validationIssue({
            code: 'changed-item-version-expectation-invalid',
            scope: 'item',
            message: 'A expectativa de versão do item alterado não corresponde à versão atual.',
            importFileId: input.file.importFileId,
            stableKey: input.item.stableKey,
          }),
        );
      }
      break;
    case 'unchanged':
      validateStreamAndRecord({
        ...input,
        item: input.item,
        record: input.item.incomingRecord,
        recordLabel: 'incoming',
      });
      if (input.item.currentVersion !== null && !isPositiveInteger(input.item.currentVersion)) {
        input.issues.push(
          validationIssue({
            code: 'unchanged-item-version-invalid',
            scope: 'item',
            message: 'A versão atual do item inalterado é inválida.',
            importFileId: input.file.importFileId,
            stableKey: input.item.stableKey,
          }),
        );
      }
      break;
    case 'missing-from-new-source':
      validateStreamAndRecord({
        ...input,
        item: input.item,
        record: input.item.currentRecord.value,
        recordLabel: 'current',
      });
      if (
        !isPositiveInteger(input.item.expectedVersion) ||
        input.item.expectedVersion !== input.item.currentRecord.version
      ) {
        input.issues.push(
          validationIssue({
            code: 'missing-item-version-expectation-invalid',
            scope: 'item',
            message: 'A expectativa de versão do item ausente não corresponde à versão atual.',
            importFileId: input.file.importFileId,
            stableKey: input.item.stableKey,
          }),
        );
      }
      break;
    case 'blocked': {
      const hasStableKey = input.item.stableKey !== undefined;
      const hasStream = input.item.stream !== undefined;
      if (hasStableKey !== hasStream) {
        input.issues.push(
          validationIssue({
            code: 'blocked-item-reference-incomplete',
            scope: 'item',
            message: 'Um item bloqueado deve informar stream e chave estável juntos.',
            importFileId: input.file.importFileId,
            stableKey: input.item.stableKey,
          }),
        );
      } else if (input.item.stream && input.item.stableKey) {
        const expectedStableKey = academicRecordStreamKeyV1(input.item.stream);
        if (expectedStableKey !== input.item.stableKey) {
          input.issues.push(
            validationIssue({
              code: 'blocked-item-stable-key-mismatch',
              scope: 'item',
              message: 'A chave estável do item bloqueado não corresponde ao stream.',
              importFileId: input.file.importFileId,
              stableKey: input.item.stableKey,
            }),
          );
        }
      }
      break;
    }
  }
}

function validateFile(input: {
  plan: ImportChangePlanV1;
  file: ImportFileChangePlanV1;
  issues: ImportChangePlanValidationIssueV1[];
  readyWriteKeys: Set<string>;
  readySourceManifestIds: Set<SourceFileManifestId>;
}): void {
  const derivedCounts = countItems(input.file.items);
  if (!sameChangeCounts(input.file.counts, derivedCounts)) {
    input.issues.push(
      validationIssue({
        code: 'file-counts-mismatch',
        scope: 'file',
        message: 'As contagens do arquivo não correspondem aos itens planejados.',
        importFileId: input.file.importFileId,
      }),
    );
  }

  const expectedWrites = expectedFileWrites(input.file);
  if (
    input.file.estimatedWrites.sourceFileVersions !== expectedWrites.sourceFileVersions ||
    input.file.estimatedWrites.academicRecordVersions !== expectedWrites.academicRecordVersions ||
    input.file.estimatedWrites.totalPlannedVersionWrites !== expectedWrites.totalVersionWrites
  ) {
    input.issues.push(
      validationIssue({
        code: 'file-write-estimate-mismatch',
        scope: 'file',
        message: 'A estimativa de versões do arquivo diverge dos appends planejados.',
        importFileId: input.file.importFileId,
      }),
    );
  }

  const itemKeys = new Set<string>();
  for (const item of input.file.items) {
    validateItem({ plan: input.plan, file: input.file, item, issues: input.issues });
    if ('stableKey' in item && item.stableKey !== undefined) {
      if (itemKeys.has(item.stableKey)) {
        input.issues.push(
          validationIssue({
            code: 'duplicate-file-stream',
            scope: 'item',
            message: 'O arquivo contém mais de um item para o mesmo stream acadêmico.',
            importFileId: input.file.importFileId,
            stableKey: item.stableKey,
          }),
        );
      }
      itemKeys.add(item.stableKey);
    }
  }

  if (input.file.sourceFileWrite.kind === 'append-version') {
    const sourceWrite = input.file.sourceFileWrite;
    if (!isVersionExpectation(sourceWrite.expectedVersion)) {
      input.issues.push(
        validationIssue({
          code: 'source-version-expectation-invalid',
          scope: 'file',
          message: 'A expectativa de versão do arquivo-fonte é inválida.',
          importFileId: input.file.importFileId,
        }),
      );
    }
    if (
      input.file.sourceFileManifestId === null ||
      sourceWrite.value.manifest.id !== input.file.sourceFileManifestId
    ) {
      input.issues.push(
        validationIssue({
          code: 'source-manifest-id-mismatch',
          scope: 'file',
          message: 'O manifesto do append não corresponde à identidade do arquivo planejado.',
          importFileId: input.file.importFileId,
        }),
      );
    }
    if (
      sourceWrite.value.manifest.fileName !== input.file.fileName ||
      sourceWrite.value.manifest.sha256 !== input.file.sha256
    ) {
      input.issues.push(
        validationIssue({
          code: 'source-manifest-metadata-mismatch',
          scope: 'file',
          message: 'Os metadados do manifesto divergem do arquivo planejado.',
          importFileId: input.file.importFileId,
        }),
      );
    }
    if (!sameStructure(sourceWrite.value.logicalSource, input.file.logicalSource)) {
      input.issues.push(
        validationIssue({
          code: 'source-logical-relation-mismatch',
          scope: 'file',
          message: 'A relação lógica do append diverge da relação revisada do arquivo.',
          importFileId: input.file.importFileId,
        }),
      );
    }
  }

  switch (input.file.status) {
    case 'unchanged':
      if (
        input.file.sourceFileWrite.kind !== 'none' ||
        expectedWrites.totalVersionWrites !== 0 ||
        input.file.items.some((item) => item.state !== 'unchanged')
      ) {
        input.issues.push(
          validationIssue({
            code: 'unchanged-file-has-writes',
            scope: 'file',
            message: 'Um arquivo inalterado não pode conter appends planejados.',
            importFileId: input.file.importFileId,
          }),
        );
      }
      break;
    case 'ready-for-promotion':
      if (
        input.file.batchFileStatus !== 'approved' ||
        input.file.logicalSource.state !== 'confirmed' ||
        input.file.sourceFileManifestId === null ||
        expectedWrites.totalVersionWrites <= 0 ||
        input.file.items.some(
          (item) => item.state === 'missing-from-new-source' || item.state === 'blocked',
        )
      ) {
        input.issues.push(
          validationIssue({
            code: 'ready-file-not-promotable',
            scope: 'file',
            message: 'O arquivo marcado como pronto contém estado incompatível com promoção.',
            importFileId: input.file.importFileId,
          }),
        );
      }
      for (const item of input.file.items) {
        if (item.state !== 'new' && item.state !== 'changed') continue;
        if (input.readyWriteKeys.has(item.stableKey)) {
          input.issues.push(
            validationIssue({
              code: 'duplicate-promotion-stream',
              scope: 'item',
              message: 'A promoção contém mais de um append para o mesmo stream acadêmico.',
              importFileId: input.file.importFileId,
              stableKey: item.stableKey,
            }),
          );
        }
        input.readyWriteKeys.add(item.stableKey);
      }
      if (input.file.sourceFileWrite.kind === 'append-version') {
        const manifestId = input.file.sourceFileWrite.value.manifest.id;
        if (input.readySourceManifestIds.has(manifestId)) {
          input.issues.push(
            validationIssue({
              code: 'duplicate-promotion-source-manifest',
              scope: 'file',
              message: 'A promoção contém mais de um append para o mesmo manifesto.',
              importFileId: input.file.importFileId,
            }),
          );
        }
        input.readySourceManifestIds.add(manifestId);
      }
      break;
    case 'review-required':
      break;
    case 'blocked':
      if (expectedWrites.totalVersionWrites !== 0 || input.file.sourceFileWrite.kind !== 'none') {
        input.issues.push(
          validationIssue({
            code: 'blocked-file-has-writes',
            scope: 'file',
            message: 'Um arquivo bloqueado não pode conter appends planejados.',
            importFileId: input.file.importFileId,
          }),
        );
      }
      break;
  }
}

function validateImportChangePlan(plan: ImportChangePlanV1): PlanValidationResultV1 {
  const issues: ImportChangePlanValidationIssueV1[] = [];
  const readyWriteKeys = new Set<string>();
  const readySourceManifestIds = new Set<SourceFileManifestId>();

  if (!isPositiveInteger(plan.expectedBatchVersion)) {
    issues.push(
      validationIssue({
        code: 'batch-version-invalid',
        scope: 'plan',
        message: 'A versão esperada do lote deve ser um inteiro positivo.',
      }),
    );
  }

  if (
    plan.planningEvidence.writesPerformed !== 0 ||
    !plan.planningEvidence.repositoriesExposeReadOperationsOnly ||
    !plan.planningEvidence.deterministicWithoutClockNetworkOrGlobalEnvironment
  ) {
    issues.push(
      validationIssue({
        code: 'planning-evidence-invalid',
        scope: 'plan',
        message: 'As garantias de planejamento sem escrita não foram preservadas.',
      }),
    );
  }

  const fileIds = new Set<ImportFileId>();
  for (const file of plan.files) {
    if (fileIds.has(file.importFileId)) {
      issues.push(
        validationIssue({
          code: 'duplicate-plan-file',
          scope: 'file',
          message: 'O plano contém o mesmo arquivo mais de uma vez.',
          importFileId: file.importFileId,
        }),
      );
    }
    fileIds.add(file.importFileId);
    validateFile({ plan, file, issues, readyWriteKeys, readySourceManifestIds });
  }

  const flattenedItems = plan.files.flatMap((file) => file.items);
  if (!sameStructure(plan.items, flattenedItems)) {
    issues.push(
      validationIssue({
        code: 'plan-items-mismatch',
        scope: 'plan',
        message: 'A lista global de itens diverge dos itens dos arquivos.',
      }),
    );
  }

  const derivedCounts = countItems(flattenedItems);
  if (!sameChangeCounts(plan.counts, derivedCounts)) {
    issues.push(
      validationIssue({
        code: 'plan-counts-mismatch',
        scope: 'plan',
        message: 'As contagens globais divergem dos itens dos arquivos.',
      }),
    );
  }

  if (plan.status !== derivedPlanStatus(plan.files)) {
    issues.push(
      validationIssue({
        code: 'plan-status-mismatch',
        scope: 'plan',
        message: 'O estado global do plano diverge dos estados dos arquivos.',
      }),
    );
  }

  const readyFiles = plan.files.filter((file) => file.status === 'ready-for-promotion');
  const reviewFiles = plan.files.filter((file) => file.status === 'review-required');
  const blockedFiles = plan.files.filter((file) => file.status === 'blocked');
  const readyIds = readyFiles.map((file) => file.importFileId);
  const reviewIds = reviewFiles.map((file) => file.importFileId);
  const blockedIds = blockedFiles.map((file) => file.importFileId);

  if (
    plan.promotionRequest.importBatchId !== plan.importBatchId ||
    plan.promotionRequest.expectedBatchVersion !== plan.expectedBatchVersion ||
    !sameOrderedStrings(plan.promotionRequest.approvedImportFileIds, readyIds)
  ) {
    issues.push(
      validationIssue({
        code: 'promotion-request-mismatch',
        scope: 'plan',
        message: 'A requisição de promoção não corresponde exatamente aos arquivos prontos.',
      }),
    );
  }

  if (!sameOrderedStrings(plan.reviewRequiredImportFileIds, reviewIds)) {
    issues.push(
      validationIssue({
        code: 'review-file-list-mismatch',
        scope: 'plan',
        message: 'A lista de arquivos em revisão diverge dos estados do plano.',
      }),
    );
  }

  if (!sameOrderedStrings(plan.blockedImportFileIds, blockedIds)) {
    issues.push(
      validationIssue({
        code: 'blocked-file-list-mismatch',
        scope: 'plan',
        message: 'A lista de arquivos bloqueados diverge dos estados do plano.',
      }),
    );
  }

  const expectedAllSourceWrites = plan.files.filter(
    (file) => file.sourceFileWrite.kind === 'append-version',
  ).length;
  const expectedAllAcademicWrites = plan.files.reduce(
    (total, file) => total + file.counts.new + file.counts.changed,
    0,
  );
  const expectedReadyWrites = readyFiles.reduce(
    (total, file) => total + expectedFileWrites(file).totalVersionWrites,
    0,
  );
  const expectedReviewWrites = reviewFiles.reduce(
    (total, file) => total + expectedFileWrites(file).totalVersionWrites,
    0,
  );

  if (
    plan.estimatedWrites.sourceFileVersions !== expectedAllSourceWrites ||
    plan.estimatedWrites.academicRecordVersions !== expectedAllAcademicWrites ||
    plan.estimatedWrites.totalPlannedVersionWrites !==
      expectedAllSourceWrites + expectedAllAcademicWrites ||
    plan.estimatedWrites.readyForPromotionVersionWrites !== expectedReadyWrites ||
    plan.estimatedWrites.pendingReviewVersionWrites !== expectedReviewWrites ||
    plan.estimatedWrites.exactCloudflareQuota !== false ||
    plan.estimatedWrites.basis !== 'planned-version-appends-only'
  ) {
    issues.push(
      validationIssue({
        code: 'plan-write-estimate-mismatch',
        scope: 'plan',
        message: 'A estimativa global diverge dos appends representados pelo plano.',
      }),
    );
  }

  const plannedWrites = readyFiles.reduce<ImportChangeExecutionWriteCountsV1>(
    (counts, file) => {
      const fileWrites = expectedFileWrites(file);
      return {
        sourceFileVersions: counts.sourceFileVersions + fileWrites.sourceFileVersions,
        academicRecordVersions:
          counts.academicRecordVersions + fileWrites.academicRecordVersions,
        totalVersionWrites: counts.totalVersionWrites + fileWrites.totalVersionWrites,
      };
    },
    zeroWriteCounts(),
  );

  return { issues, readyFiles, plannedWrites };
}

function assertWrittenRecord<T>(input: {
  result: VersionedWriteResultV1<T>;
  expectedValue: T;
  expectedVersion: number | null;
  conflict: ImportChangeVersionConflictV1;
  mismatchIssue: ImportChangePlanValidationIssueV1;
}): VersionedRecordV1<T> {
  if (input.result.status === 'version-conflict') {
    throw new VersionConflictSignalV1({
      ...input.conflict,
      currentVersion: input.result.currentVersion,
    });
  }

  const expectedWrittenVersion = (input.expectedVersion ?? 0) + 1;
  if (
    input.result.record.version !== expectedWrittenVersion ||
    !sameStructure(input.result.record.value, input.expectedValue)
  ) {
    throw new InvalidExecutionSignalV1(input.mismatchIssue);
  }

  return input.result.record;
}

async function applySourceFileWrite(input: {
  context: AcademicPersistenceContextV1;
  file: ImportFileChangePlanV1;
  unitOfWork: PersistenceUnitOfWorkV1;
  applied: MutableAppliedVersionsV1;
}): Promise<void> {
  if (input.file.sourceFileWrite.kind === 'none') return;

  const sourceWrite = input.file.sourceFileWrite;
  const result = await input.unitOfWork.imports.appendSourceFileVersion(
    input.context,
    sourceWrite.value,
    { expectedVersion: sourceWrite.expectedVersion },
  );
  const record = assertWrittenRecord({
    result,
    expectedValue: sourceWrite.value,
    expectedVersion: sourceWrite.expectedVersion,
    conflict: {
      scope: 'source-file',
      importFileId: input.file.importFileId,
      expectedVersion: sourceWrite.expectedVersion,
      currentVersion: null,
    },
    mismatchIssue: validationIssue({
      code: 'source-write-result-mismatch',
      scope: 'file',
      message: 'O repositório retornou uma versão de arquivo incompatível com o append.',
      importFileId: input.file.importFileId,
    }),
  });

  input.applied.sourceFiles.push({
    importFileId: input.file.importFileId,
    sourceFileManifestId: sourceWrite.value.manifest.id,
    version: record.version,
  });
}

async function applyAcademicItem(input: {
  context: AcademicPersistenceContextV1;
  file: ImportFileChangePlanV1;
  item: Extract<ImportChangePlanItemV1, { readonly state: 'new' | 'changed' }>;
  unitOfWork: PersistenceUnitOfWorkV1;
  applied: MutableAppliedVersionsV1;
}): Promise<void> {
  const result = await input.unitOfWork.academicRecords.appendVersion(
    input.context,
    input.item.stream,
    input.item.incomingRecord,
    { expectedVersion: input.item.expectedVersion },
  );
  const record = assertWrittenRecord({
    result,
    expectedValue: input.item.incomingRecord,
    expectedVersion: input.item.expectedVersion,
    conflict: {
      scope: 'academic-record',
      importFileId: input.file.importFileId,
      stableKey: input.item.stableKey,
      expectedVersion: input.item.expectedVersion,
      currentVersion: null,
    },
    mismatchIssue: validationIssue({
      code: 'academic-write-result-mismatch',
      scope: 'item',
      message: 'O repositório retornou uma versão acadêmica incompatível com o append.',
      importFileId: input.file.importFileId,
      stableKey: input.item.stableKey,
    }),
  });

  input.applied.academicRecords.push({
    importFileId: input.file.importFileId,
    changeState: input.item.state,
    stableKey: input.item.stableKey,
    recordKind: input.item.incomingRecord.kind,
    version: record.version,
  });
}

async function applyReadyFile(input: {
  context: AcademicPersistenceContextV1;
  file: ImportFileChangePlanV1;
  unitOfWork: PersistenceUnitOfWorkV1;
  applied: MutableAppliedVersionsV1;
}): Promise<void> {
  await applySourceFileWrite(input);

  for (const item of input.file.items) {
    switch (item.state) {
      case 'new':
      case 'changed':
        await applyAcademicItem({ ...input, item });
        break;
      case 'unchanged':
        break;
      case 'missing-from-new-source':
      case 'blocked':
        throw new InvalidExecutionSignalV1(
          validationIssue({
            code: 'non-writable-item-in-promotion',
            scope: 'item',
            message: 'A promoção contém um item que não pode gerar append automático.',
            importFileId: input.file.importFileId,
            stableKey: 'stableKey' in item ? item.stableKey : undefined,
          }),
        );
    }
  }
}

function baseResult(
  plan: ImportChangePlanV1,
): Pick<
  ImportChangeExecutionResultBaseV1,
  'importBatchId' | 'academicYearId' | 'expectedBatchVersion'
> {
  return {
    importBatchId: plan.importBatchId,
    academicYearId: plan.academicYearId,
    expectedBatchVersion: plan.expectedBatchVersion,
  };
}

export async function executeImportChangePlan(
  plan: ImportChangePlanV1,
  transactionPort: BatchPromotionTransactionPortV1,
): Promise<ImportChangeExecutionResultV1> {
  let validation: PlanValidationResultV1;
  try {
    validation = validateImportChangePlan(plan);
  } catch {
    return {
      ...baseResult(plan),
      status: 'rejected-invalid-plan',
      transactionStarted: false,
      transactionCommitted: false,
      attemptedWritesBeforeRollback: zeroWriteCounts(),
      committedWrites: zeroWriteCounts(),
      appliedVersions: emptyAppliedVersions(),
      validationIssues: [
        validationIssue({
          code: 'invalid-plan-shape',
          scope: 'plan',
          message: 'A estrutura do plano não pôde ser validada.',
        }),
      ],
    };
  }

  if (validation.issues.length > 0) {
    return {
      ...baseResult(plan),
      status: 'rejected-invalid-plan',
      transactionStarted: false,
      transactionCommitted: false,
      attemptedWritesBeforeRollback: zeroWriteCounts(),
      committedWrites: zeroWriteCounts(),
      appliedVersions: emptyAppliedVersions(),
      validationIssues: validation.issues,
    };
  }

  if (validation.plannedWrites.totalVersionWrites === 0) {
    return {
      ...baseResult(plan),
      status: 'no-changes',
      transactionStarted: false,
      transactionCommitted: false,
      plannedWrites: validation.plannedWrites,
      committedWrites: zeroWriteCounts(),
      appliedVersions: emptyAppliedVersions(),
      reason: 'no-promotable-writes',
    };
  }

  const context = { academicYearId: plan.academicYearId } satisfies AcademicPersistenceContextV1;
  const applied: MutableAppliedVersionsV1 = {
    sourceFiles: [],
    academicRecords: [],
  };

  try {
    const committed = await transactionPort.runBatchPromotion(
      context,
      plan.promotionRequest,
      async (unitOfWork) => {
        for (const file of validation.readyFiles) {
          await applyReadyFile({ context, file, unitOfWork, applied });
        }

        const actualWrites = attemptedWriteCounts(applied);
        if (
          actualWrites.sourceFileVersions !== validation.plannedWrites.sourceFileVersions ||
          actualWrites.academicRecordVersions !==
            validation.plannedWrites.academicRecordVersions ||
          actualWrites.totalVersionWrites !== validation.plannedWrites.totalVersionWrites
        ) {
          throw new InvalidExecutionSignalV1(
            validationIssue({
              code: 'applied-write-count-mismatch',
              scope: 'plan',
              message: 'As contagens aplicadas divergem da estimativa validada do plano.',
            }),
          );
        }

        return {
          counts: actualWrites,
          versions: {
            sourceFiles: [...applied.sourceFiles],
            academicRecords: [...applied.academicRecords],
          } satisfies AppliedImportChangeVersionsV1,
        };
      },
    );

    return {
      ...baseResult(plan),
      status: 'applied',
      transactionStarted: true,
      transactionCommitted: true,
      plannedWrites: validation.plannedWrites,
      committedWrites: committed.counts,
      appliedVersions: committed.versions,
    };
  } catch (error: unknown) {
    const attemptedWritesBeforeRollback = attemptedWriteCounts(applied);

    if (error instanceof VersionConflictSignalV1) {
      return {
        ...baseResult(plan),
        status: 'version-conflict',
        transactionStarted: true,
        transactionCommitted: false,
        attemptedWritesBeforeRollback,
        committedWrites: zeroWriteCounts(),
        appliedVersions: emptyAppliedVersions(),
        conflict: error.conflict,
      };
    }

    if (error instanceof InvalidExecutionSignalV1) {
      return {
        ...baseResult(plan),
        status: 'rejected-invalid-plan',
        transactionStarted: true,
        transactionCommitted: false,
        attemptedWritesBeforeRollback,
        committedWrites: zeroWriteCounts(),
        appliedVersions: emptyAppliedVersions(),
        validationIssues: [error.issue],
      };
    }

    return {
      ...baseResult(plan),
      status: 'transaction-failed',
      transactionStarted: true,
      transactionCommitted: false,
      attemptedWritesBeforeRollback,
      committedWrites: zeroWriteCounts(),
      appliedVersions: emptyAppliedVersions(),
      failure: {
        code: 'transaction-failed',
        message: 'A promoção transacional falhou sem confirmar alterações.',
      },
    };
  }
}
