import type {
  ImportBatchFileResultV1,
  ImportBatchResultV1,
  ImportFileDiagnosticV1,
  ImportFileStatusV1,
  SourceFileManifestV1,
} from '../../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  ImportFileDiagnosticId,
  ImportFileId,
  SourceFileManifestId,
} from '../../../../shared/gradebook-contracts/imports/import-ids-v1';
import type {
  AcademicPersistenceContextV1,
  AcademicRecordRepositoryV1,
  AcademicRecordStreamV1,
  AcademicRecordV1,
  BatchPromotionRequestV1,
  ImportPersistenceRepositoryV1,
  LogicalSourceIdV1,
  LogicalSourceRelationV1,
  SourceFileVersionV1,
  VersionedRecordV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';

export const IMPORT_CHANGE_STATES_V1 = [
  'unchanged',
  'new',
  'changed',
  'missing-from-new-source',
  'blocked',
] as const;

export type ImportChangeStateV1 = (typeof IMPORT_CHANGE_STATES_V1)[number];

export interface ImportPlanReasonV1 {
  readonly code: string;
  readonly message: string;
  readonly diagnosticIds: readonly ImportFileDiagnosticId[];
}

interface ImportChangePlanItemBaseV1 {
  readonly importFileId: ImportFileId;
  readonly reason: ImportPlanReasonV1;
}

export type ImportChangePlanItemV1 =
  | (ImportChangePlanItemBaseV1 & {
      readonly state: 'unchanged';
      readonly stableKey: string;
      readonly stream: AcademicRecordStreamV1;
      readonly incomingRecord: AcademicRecordV1;
      /** Null means the hash short-circuit made a record read unnecessary. */
      readonly currentVersion: number | null;
    })
  | (ImportChangePlanItemBaseV1 & {
      readonly state: 'new';
      readonly stableKey: string;
      readonly stream: AcademicRecordStreamV1;
      readonly incomingRecord: AcademicRecordV1;
      readonly expectedVersion: null;
    })
  | (ImportChangePlanItemBaseV1 & {
      readonly state: 'changed';
      readonly stableKey: string;
      readonly stream: AcademicRecordStreamV1;
      readonly incomingRecord: AcademicRecordV1;
      readonly currentRecord: VersionedRecordV1<AcademicRecordV1>;
      readonly expectedVersion: number;
    })
  | (ImportChangePlanItemBaseV1 & {
      readonly state: 'missing-from-new-source';
      readonly stableKey: string;
      readonly stream: AcademicRecordStreamV1;
      readonly currentRecord: VersionedRecordV1<AcademicRecordV1>;
      readonly expectedVersion: number;
    })
  | (ImportChangePlanItemBaseV1 & {
      readonly state: 'blocked';
      readonly stableKey?: string;
      readonly stream?: AcademicRecordStreamV1;
    });

export interface ImportChangeCountsV1 {
  readonly unchanged: number;
  readonly new: number;
  readonly changed: number;
  readonly 'missing-from-new-source': number;
  readonly blocked: number;
}

export type ImportContentIdentityV1 =
  | {
      readonly state: 'not-evaluated';
    }
  | {
      readonly state: 'known-identical';
      readonly knownManifestId: SourceFileManifestId;
      readonly knownManifestVersion: number;
      readonly observedFileNameChanged: boolean;
    }
  | {
      readonly state: 'new-content';
    };

export type PlannedSourceFileWriteV1 =
  | {
      readonly kind: 'none';
    }
  | {
      readonly kind: 'append-version';
      readonly value: SourceFileVersionV1;
      readonly expectedVersion: number | null;
      readonly reason: ImportPlanReasonV1;
    };

export interface ImportFileWriteEstimateV1 {
  readonly sourceFileVersions: number;
  readonly academicRecordVersions: number;
  readonly totalPlannedVersionWrites: number;
}

export type ImportFileChangePlanStatusV1 =
  | 'unchanged'
  | 'ready-for-promotion'
  | 'review-required'
  | 'blocked';

export interface ImportFileChangePlanV1 {
  readonly importFileId: ImportFileId;
  readonly sourceFileManifestId: SourceFileManifestId | null;
  readonly fileName: string;
  readonly sha256: string | null;
  readonly batchFileStatus: ImportFileStatusV1;
  readonly logicalSource: LogicalSourceRelationV1;
  readonly contentIdentity: ImportContentIdentityV1;
  readonly status: ImportFileChangePlanStatusV1;
  readonly diagnostics: readonly ImportFileDiagnosticV1[];
  readonly reasons: readonly ImportPlanReasonV1[];
  readonly items: readonly ImportChangePlanItemV1[];
  readonly counts: ImportChangeCountsV1;
  readonly sourceFileWrite: PlannedSourceFileWriteV1;
  readonly estimatedWrites: ImportFileWriteEstimateV1;
}

export interface ImportChangeWriteEstimateV1 {
  readonly sourceFileVersions: number;
  readonly academicRecordVersions: number;
  readonly totalPlannedVersionWrites: number;
  readonly readyForPromotionVersionWrites: number;
  readonly pendingReviewVersionWrites: number;
  readonly exactCloudflareQuota: false;
  readonly basis: 'planned-version-appends-only';
}

export type ImportChangePlanStatusV1 =
  | 'no-changes'
  | 'ready-for-promotion'
  | 'partially-ready'
  | 'review-required'
  | 'blocked';

export interface ImportChangePlanV1 {
  readonly importBatchId: ImportBatchResultV1['id'];
  readonly academicYearId: AcademicPersistenceContextV1['academicYearId'];
  readonly expectedBatchVersion: number;
  readonly status: ImportChangePlanStatusV1;
  readonly files: readonly ImportFileChangePlanV1[];
  readonly items: readonly ImportChangePlanItemV1[];
  readonly counts: ImportChangeCountsV1;
  readonly estimatedWrites: ImportChangeWriteEstimateV1;
  readonly promotionRequest: BatchPromotionRequestV1;
  readonly reviewRequiredImportFileIds: readonly ImportFileId[];
  readonly blockedImportFileIds: readonly ImportFileId[];
  readonly planningEvidence: {
    readonly writesPerformed: 0;
    readonly repositoriesExposeReadOperationsOnly: true;
    readonly deterministicWithoutClockNetworkOrGlobalEnvironment: true;
  };
}

export interface ImportReconciliationFileInputV1 {
  readonly importFileId: ImportFileId;
  /**
   * Resolution supplied by the review/matching step. Candidate and unmatched
   * relations are never promoted by this planner.
   */
  readonly logicalSource: LogicalSourceRelationV1;
  readonly records: readonly AcademicRecordV1[];
}

export interface ImportReconciliationInputV1 {
  readonly context: AcademicPersistenceContextV1;
  readonly batch: ImportBatchResultV1;
  readonly expectedBatchVersion: number;
  readonly files: readonly ImportReconciliationFileInputV1[];
}

/**
 * Narrow application read model required to discover records that disappeared
 * from a new version. Values and optimistic versions still come from the
 * provider-independent AcademicRecordRepositoryV1.
 */
export interface LogicalSourceRecordCatalogV1 {
  listCurrentStreams(
    context: AcademicPersistenceContextV1,
    logicalSourceId: LogicalSourceIdV1,
  ): Promise<readonly AcademicRecordStreamV1[]>;
}

export interface ImportReconciliationRepositoriesV1 {
  readonly imports: Pick<
    ImportPersistenceRepositoryV1,
    'findSourceFileByHash' | 'getSourceFileVersion'
  >;
  readonly academicRecords: Pick<AcademicRecordRepositoryV1, 'getCurrent'>;
  readonly logicalSourceRecords: LogicalSourceRecordCatalogV1;
}

class FilePlanningBlockedError extends Error {
  readonly reason: ImportPlanReasonV1;

  constructor(reason: ImportPlanReasonV1) {
    super(reason.code);
    this.name = 'FilePlanningBlockedError';
    this.reason = reason;
  }
}

function reason(
  code: string,
  message: string,
  diagnosticIds: readonly ImportFileDiagnosticId[] = [],
): ImportPlanReasonV1 {
  return { code, message, diagnosticIds };
}

function streamTuple(stream: AcademicRecordStreamV1): readonly (string | number)[] {
  switch (stream.kind) {
    case 'grade-entry':
      return [
        stream.kind,
        stream.studentId,
        stream.enrollmentId,
        stream.assessmentComponentId,
      ];
    case 'term-result':
      return [
        stream.kind,
        stream.studentId,
        stream.enrollmentId,
        stream.teachingAssignmentId,
        stream.term,
      ];
    case 'final-recovery':
      return [
        stream.kind,
        stream.studentId,
        stream.enrollmentId,
        stream.teachingAssignmentId,
        stream.recoveredTerm,
      ];
    case 'annual-result':
      return [
        stream.kind,
        stream.studentId,
        stream.enrollmentId,
        stream.teachingAssignmentId,
      ];
  }
}

export function academicRecordStreamKeyV1(stream: AcademicRecordStreamV1): string {
  return JSON.stringify(streamTuple(stream));
}

export function academicRecordStreamForV1(record: AcademicRecordV1): AcademicRecordStreamV1 {
  switch (record.kind) {
    case 'grade-entry':
      return {
        kind: record.kind,
        studentId: record.value.studentId,
        enrollmentId: record.value.enrollmentId,
        assessmentComponentId: record.value.assessmentComponentId,
      };
    case 'term-result':
      return {
        kind: record.kind,
        studentId: record.value.studentId,
        enrollmentId: record.value.enrollmentId,
        teachingAssignmentId: record.value.teachingAssignmentId,
        term: record.value.term,
      };
    case 'final-recovery':
      return {
        kind: record.kind,
        studentId: record.value.studentId,
        enrollmentId: record.value.enrollmentId,
        teachingAssignmentId: record.value.teachingAssignmentId,
        recoveredTerm: record.value.recoveredTerm,
      };
    case 'annual-result':
      return {
        kind: record.kind,
        studentId: record.value.studentId,
        enrollmentId: record.value.enrollmentId,
        teachingAssignmentId: record.value.teachingAssignmentId,
      };
  }
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
      throw new TypeError(`Unsupported academic record value type: ${typeof value}`);
  }
}

function removeSourceEvidence(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => removeSourceEvidence(entry));
  if (value === null || typeof value !== 'object') return value;

  const normalized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'evidence' || entry === undefined) continue;
    normalized[key] = removeSourceEvidence(entry);
  }
  return normalized;
}

function semanticAcademicRecord(record: AcademicRecordV1): unknown {
  const excludedKeys = new Set(['id']);
  if (record.kind === 'grade-entry') {
    excludedKeys.add('version');
    excludedKeys.add('supersedesGradeEntryId');
  }

  const value: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record.value as unknown as Record<string, unknown>)) {
    if (!excludedKeys.has(key) && entry !== undefined) value[key] = entry;
  }

  return removeSourceEvidence({ kind: record.kind, value });
}

export function academicRecordsSemanticallyEqualV1(
  left: AcademicRecordV1,
  right: AcademicRecordV1,
): boolean {
  return stableSerialize(semanticAcademicRecord(left)) === stableSerialize(semanticAcademicRecord(right));
}

function recordAcademicYearId(record: AcademicRecordV1): AcademicPersistenceContextV1['academicYearId'] {
  return record.value.academicYearId;
}

function countsFor(items: readonly ImportChangePlanItemV1[]): ImportChangeCountsV1 {
  const counts: Record<ImportChangeStateV1, number> = {
    unchanged: 0,
    new: 0,
    changed: 0,
    'missing-from-new-source': 0,
    blocked: 0,
  };

  for (const item of items) counts[item.state] += 1;
  return counts;
}

function estimateFileWrites(
  sourceFileWrite: PlannedSourceFileWriteV1,
  counts: ImportChangeCountsV1,
): ImportFileWriteEstimateV1 {
  const sourceFileVersions = sourceFileWrite.kind === 'append-version' ? 1 : 0;
  const academicRecordVersions = counts.new + counts.changed;
  return {
    sourceFileVersions,
    academicRecordVersions,
    totalPlannedVersionWrites: sourceFileVersions + academicRecordVersions,
  };
}

function sortDiagnostics(
  diagnostics: readonly ImportFileDiagnosticV1[],
  importFileId: ImportFileId,
): readonly ImportFileDiagnosticV1[] {
  return diagnostics
    .filter((diagnostic) => diagnostic.importFileId === importFileId)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function hasBlockingDiagnostics(diagnostics: readonly ImportFileDiagnosticV1[]): boolean {
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === 'blocking-error' || diagnostic.severity === 'critical-error',
  );
}

function blockedItem(
  importFileId: ImportFileId,
  blockedReason: ImportPlanReasonV1,
  stream?: AcademicRecordStreamV1,
): ImportChangePlanItemV1 {
  if (!stream) return { state: 'blocked', importFileId, reason: blockedReason };
  return {
    state: 'blocked',
    importFileId,
    stableKey: academicRecordStreamKeyV1(stream),
    stream,
    reason: blockedReason,
  };
}

function blockedFilePlan(input: {
  batchFile: ImportBatchFileResultV1;
  logicalSource: LogicalSourceRelationV1;
  diagnostics: readonly ImportFileDiagnosticV1[];
  blockedReason: ImportPlanReasonV1;
  contentIdentity?: ImportContentIdentityV1;
  status?: Extract<ImportFileChangePlanStatusV1, 'blocked' | 'review-required'>;
}): ImportFileChangePlanV1 {
  const items = [blockedItem(input.batchFile.id, input.blockedReason)];
  const counts = countsFor(items);
  const sourceFileWrite = { kind: 'none' } as const;

  return {
    importFileId: input.batchFile.id,
    sourceFileManifestId: input.batchFile.manifest?.id ?? null,
    fileName: input.batchFile.sourceFile.fileName,
    sha256: input.batchFile.manifest?.sha256 ?? null,
    batchFileStatus: input.batchFile.status,
    logicalSource: input.logicalSource,
    contentIdentity: input.contentIdentity ?? { state: 'not-evaluated' },
    status: input.status ?? 'blocked',
    diagnostics: input.diagnostics,
    reasons: [input.blockedReason],
    items,
    counts,
    sourceFileWrite,
    estimatedWrites: estimateFileWrites(sourceFileWrite, counts),
  };
}

function validateIncomingRecords(
  context: AcademicPersistenceContextV1,
  records: readonly AcademicRecordV1[],
): Map<string, { readonly stream: AcademicRecordStreamV1; readonly record: AcademicRecordV1 }> {
  const recordsByKey = new Map<
    string,
    { readonly stream: AcademicRecordStreamV1; readonly record: AcademicRecordV1 }
  >();

  for (const record of records) {
    if (recordAcademicYearId(record) !== context.academicYearId) {
      throw new FilePlanningBlockedError(
        reason(
          'academic-year-mismatch',
          'O registro recebido não pertence ao ano letivo do planejamento.',
        ),
      );
    }

    const stream = academicRecordStreamForV1(record);
    const stableKey = academicRecordStreamKeyV1(stream);
    if (recordsByKey.has(stableKey)) {
      throw new FilePlanningBlockedError(
        reason(
          'duplicate-incoming-stream',
          'A nova fonte contém mais de um registro para a mesma chave acadêmica estável.',
        ),
      );
    }
    recordsByKey.set(stableKey, { stream, record });
  }

  return recordsByKey;
}

function assertCurrentRecordMatchesStream(
  context: AcademicPersistenceContextV1,
  stream: AcademicRecordStreamV1,
  current: VersionedRecordV1<AcademicRecordV1>,
): void {
  if (recordAcademicYearId(current.value) !== context.academicYearId) {
    throw new FilePlanningBlockedError(
      reason(
        'persisted-academic-year-mismatch',
        'O registro persistido retornado não pertence ao ano letivo consultado.',
      ),
    );
  }

  const persistedKey = academicRecordStreamKeyV1(academicRecordStreamForV1(current.value));
  if (persistedKey !== academicRecordStreamKeyV1(stream)) {
    throw new FilePlanningBlockedError(
      reason(
        'persisted-stream-mismatch',
        'O repositório retornou um registro incompatível com a chave acadêmica consultada.',
      ),
    );
  }
}

async function sourceFileWriteFor(
  context: AcademicPersistenceContextV1,
  manifest: SourceFileManifestV1,
  logicalSource: Extract<LogicalSourceRelationV1, { readonly state: 'confirmed' }>,
  writeReason: ImportPlanReasonV1,
  repositories: ImportReconciliationRepositoriesV1,
): Promise<PlannedSourceFileWriteV1> {
  const current = await repositories.imports.getSourceFileVersion(context, manifest.id);
  return {
    kind: 'append-version',
    value: { manifest, logicalSource },
    expectedVersion: current?.version ?? null,
    reason: writeReason,
  };
}

function inputIndex(files: readonly ImportReconciliationFileInputV1[]): {
  readonly byId: ReadonlyMap<ImportFileId, ImportReconciliationFileInputV1>;
  readonly duplicates: ReadonlySet<ImportFileId>;
} {
  const byId = new Map<ImportFileId, ImportReconciliationFileInputV1>();
  const duplicates = new Set<ImportFileId>();

  for (const file of files) {
    if (byId.has(file.importFileId)) duplicates.add(file.importFileId);
    else byId.set(file.importFileId, file);
  }

  return { byId, duplicates };
}

async function planConfirmedNewContent(input: {
  context: AcademicPersistenceContextV1;
  batchFile: ImportBatchFileResultV1 & { readonly manifest: SourceFileManifestV1 };
  fileInput: ImportReconciliationFileInputV1;
  logicalSource: Extract<LogicalSourceRelationV1, { readonly state: 'confirmed' }>;
  diagnostics: readonly ImportFileDiagnosticV1[];
  recordsByKey: ReadonlyMap<
    string,
    { readonly stream: AcademicRecordStreamV1; readonly record: AcademicRecordV1 }
  >;
  repositories: ImportReconciliationRepositoriesV1;
}): Promise<ImportFileChangePlanV1> {
  const sourceFileWrite = await sourceFileWriteFor(
    input.context,
    input.batchFile.manifest,
    input.logicalSource,
    reason(
      'new-source-file-version',
      'O conteúdo possui hash novo e será registrado como versão da fonte lógica confirmada.',
    ),
    input.repositories,
  );

  const indexedStreams = await input.repositories.logicalSourceRecords.listCurrentStreams(
    input.context,
    input.logicalSource.logicalSourceId,
  );
  const streamsByKey = new Map<string, AcademicRecordStreamV1>();
  for (const stream of indexedStreams) {
    streamsByKey.set(academicRecordStreamKeyV1(stream), stream);
  }
  for (const [stableKey, incoming] of input.recordsByKey) {
    streamsByKey.set(stableKey, incoming.stream);
  }

  const items: ImportChangePlanItemV1[] = [];
  for (const stableKey of [...streamsByKey.keys()].sort((left, right) => left.localeCompare(right))) {
    const incoming = input.recordsByKey.get(stableKey);
    const stream = incoming?.stream ?? streamsByKey.get(stableKey);
    if (!stream) {
      throw new FilePlanningBlockedError(
        reason('missing-stream-definition', 'Não foi possível reconstruir a chave acadêmica.'),
      );
    }

    const current = await input.repositories.academicRecords.getCurrent(input.context, stream);
    if (current) assertCurrentRecordMatchesStream(input.context, stream, current);

    if (incoming) {
      if (!current) {
        items.push({
          state: 'new',
          importFileId: input.batchFile.id,
          stableKey,
          stream,
          incomingRecord: incoming.record,
          expectedVersion: null,
          reason: reason(
            'new-academic-record',
            'Nenhuma versão atual existe para a chave acadêmica; um append inicial foi planejado.',
          ),
        });
        continue;
      }

      if (academicRecordsSemanticallyEqualV1(current.value, incoming.record)) {
        items.push({
          state: 'unchanged',
          importFileId: input.batchFile.id,
          stableKey,
          stream,
          incomingRecord: incoming.record,
          currentVersion: current.version,
          reason: reason(
            'academic-value-unchanged',
            'O valor acadêmico permanece igual; diferenças de ID técnico e evidência de origem não criam versão.',
          ),
        });
        continue;
      }

      items.push({
        state: 'changed',
        importFileId: input.batchFile.id,
        stableKey,
        stream,
        incomingRecord: incoming.record,
        currentRecord: current,
        expectedVersion: current.version,
        reason: reason(
          'academic-value-changed',
          'O valor acadêmico mudou; foi planejado append preservando a versão atual.',
        ),
      });
      continue;
    }

    if (!current) {
      throw new FilePlanningBlockedError(
        reason(
          'logical-source-index-stale',
          'A fonte lógica referencia uma chave sem versão acadêmica corrente.',
        ),
      );
    }

    items.push({
      state: 'missing-from-new-source',
      importFileId: input.batchFile.id,
      stableKey,
      stream,
      currentRecord: current,
      expectedVersion: current.version,
      reason: reason(
        'academic-record-missing-from-new-source',
        'O registro existia na fonte lógica e não aparece na nova versão; revisão humana é obrigatória e nenhuma exclusão foi planejada.',
      ),
    });
  }

  const counts = countsFor(items);
  const fileStatus: ImportFileChangePlanStatusV1 =
    counts['missing-from-new-source'] > 0 ? 'review-required' : 'ready-for-promotion';
  const fileReason = reason(
    'confirmed-logical-source',
    fileStatus === 'review-required'
      ? 'A fonte lógica foi confirmada, mas registros ausentes exigem revisão antes da promoção.'
      : 'A fonte lógica foi confirmada e o plano pode ser promovido atomicamente.',
  );

  return {
    importFileId: input.batchFile.id,
    sourceFileManifestId: input.batchFile.manifest.id,
    fileName: input.batchFile.sourceFile.fileName,
    sha256: input.batchFile.manifest.sha256,
    batchFileStatus: input.batchFile.status,
    logicalSource: input.logicalSource,
    contentIdentity: { state: 'new-content' },
    status: fileStatus,
    diagnostics: input.diagnostics,
    reasons: [fileReason],
    items,
    counts,
    sourceFileWrite,
    estimatedWrites: estimateFileWrites(sourceFileWrite, counts),
  };
}

async function planApprovedFile(input: {
  context: AcademicPersistenceContextV1;
  batchFile: ImportBatchFileResultV1;
  fileInput: ImportReconciliationFileInputV1;
  diagnostics: readonly ImportFileDiagnosticV1[];
  repositories: ImportReconciliationRepositoriesV1;
}): Promise<ImportFileChangePlanV1> {
  const manifest = input.batchFile.manifest;
  if (!manifest) {
    throw new FilePlanningBlockedError(
      reason('missing-source-manifest', 'O arquivo aprovado não possui manifesto de origem.'),
    );
  }

  const recordsByKey = validateIncomingRecords(input.context, input.fileInput.records);
  const knownContent = await input.repositories.imports.findSourceFileByHash(
    input.context,
    manifest.sha256,
  );

  if (knownContent) {
    const knownLogicalSource = knownContent.value.logicalSource;
    const contentIdentity: ImportContentIdentityV1 = {
      state: 'known-identical',
      knownManifestId: knownContent.value.manifest.id,
      knownManifestVersion: knownContent.version,
      observedFileNameChanged: knownContent.value.manifest.fileName !== manifest.fileName,
    };

    if (knownLogicalSource.state !== 'confirmed') {
      const sourceReason = reason(
        'identical-content-with-unconfirmed-logical-source',
        'O conteúdo já é conhecido, mas sua fonte lógica não está confirmada; nenhuma associação ou escrita foi planejada.',
      );
      return blockedFilePlan({
        batchFile: input.batchFile,
        logicalSource: knownLogicalSource,
        diagnostics: input.diagnostics,
        blockedReason: sourceReason,
        contentIdentity,
        status: 'review-required',
      });
    }

    const renamed = contentIdentity.observedFileNameChanged;
    const sourceFileWrite = renamed
      ? await sourceFileWriteFor(
          input.context,
          manifest,
          knownLogicalSource,
          reason(
            'renamed-identical-content-observation',
            'O mesmo conteúdo foi observado com outro nome; somente a versão de metadados da fonte foi planejada.',
          ),
          input.repositories,
        )
      : ({ kind: 'none' } as const);
    const itemReason = reason(
      'identical-content',
      'O SHA-256 já é conhecido; nenhuma consulta ou versão acadêmica nova é necessária.',
    );
    const items = [...recordsByKey.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map<ImportChangePlanItemV1>(([stableKey, incoming]) => ({
        state: 'unchanged',
        importFileId: input.batchFile.id,
        stableKey,
        stream: incoming.stream,
        incomingRecord: incoming.record,
        currentVersion: null,
        reason: itemReason,
      }));
    const counts = countsFor(items);
    const fileReason = reason(
      renamed ? 'identical-content-renamed' : 'identical-content-no-op',
      renamed
        ? 'O arquivo foi renomeado, sem duplicação de registros acadêmicos.'
        : 'O conteúdo e o nome já são conhecidos; o planejamento é um no-op.',
    );

    return {
      importFileId: input.batchFile.id,
      sourceFileManifestId: manifest.id,
      fileName: input.batchFile.sourceFile.fileName,
      sha256: manifest.sha256,
      batchFileStatus: input.batchFile.status,
      logicalSource: knownLogicalSource,
      contentIdentity,
      status: renamed ? 'ready-for-promotion' : 'unchanged',
      diagnostics: input.diagnostics,
      reasons: [fileReason],
      items,
      counts,
      sourceFileWrite,
      estimatedWrites: estimateFileWrites(sourceFileWrite, counts),
    };
  }

  if (input.fileInput.logicalSource.state !== 'confirmed') {
    const sourceReason = reason(
      input.fileInput.logicalSource.state === 'candidate'
        ? 'candidate-logical-source-requires-review'
        : 'unmatched-logical-source-requires-review',
      input.fileInput.logicalSource.state === 'candidate'
        ? 'O hash é novo e há mais de uma fonte lógica candidata; nenhuma associação ou escrita foi planejada.'
        : 'O hash é novo e não há fonte lógica confirmada; nenhuma associação ou escrita foi planejada.',
    );
    return blockedFilePlan({
      batchFile: input.batchFile,
      logicalSource: input.fileInput.logicalSource,
      diagnostics: input.diagnostics,
      blockedReason: sourceReason,
      contentIdentity: { state: 'new-content' },
      status: 'review-required',
    });
  }

  return planConfirmedNewContent({
    context: input.context,
    batchFile: { ...input.batchFile, manifest },
    fileInput: input.fileInput,
    logicalSource: input.fileInput.logicalSource,
    diagnostics: input.diagnostics,
    recordsByKey,
    repositories: input.repositories,
  });
}

function aggregateStatus(files: readonly ImportFileChangePlanV1[]): ImportChangePlanStatusV1 {
  const hasReady = files.some((file) => file.status === 'ready-for-promotion');
  const hasReview = files.some((file) => file.status === 'review-required');
  const hasBlocked = files.some((file) => file.status === 'blocked');

  if (hasReady && (hasReview || hasBlocked)) return 'partially-ready';
  if (hasReady) return 'ready-for-promotion';
  if (hasReview) return 'review-required';
  if (hasBlocked) return 'blocked';
  return 'no-changes';
}

function aggregateWriteEstimate(
  files: readonly ImportFileChangePlanV1[],
): ImportChangeWriteEstimateV1 {
  const sourceFileVersions = files.reduce(
    (total, file) => total + file.estimatedWrites.sourceFileVersions,
    0,
  );
  const academicRecordVersions = files.reduce(
    (total, file) => total + file.estimatedWrites.academicRecordVersions,
    0,
  );
  const readyForPromotionVersionWrites = files
    .filter((file) => file.status === 'ready-for-promotion')
    .reduce((total, file) => total + file.estimatedWrites.totalPlannedVersionWrites, 0);
  const pendingReviewVersionWrites = files
    .filter((file) => file.status === 'review-required')
    .reduce((total, file) => total + file.estimatedWrites.totalPlannedVersionWrites, 0);

  return {
    sourceFileVersions,
    academicRecordVersions,
    totalPlannedVersionWrites: sourceFileVersions + academicRecordVersions,
    readyForPromotionVersionWrites,
    pendingReviewVersionWrites,
    exactCloudflareQuota: false,
    basis: 'planned-version-appends-only',
  };
}

export async function planImportReconciliation(
  input: ImportReconciliationInputV1,
  repositories: ImportReconciliationRepositoriesV1,
): Promise<ImportChangePlanV1> {
  if (!Number.isInteger(input.expectedBatchVersion) || input.expectedBatchVersion <= 0) {
    throw new RangeError('expectedBatchVersion must be a positive integer');
  }

  const indexedInput = inputIndex(input.files);
  const files: ImportFileChangePlanV1[] = [];
  const orderedBatchFiles = [...input.batch.files].sort((left, right) =>
    left.id.localeCompare(right.id),
  );

  for (const batchFile of orderedBatchFiles) {
    const diagnostics = sortDiagnostics(input.batch.diagnostics, batchFile.id);
    const fileInput = indexedInput.byId.get(batchFile.id);
    const fallbackLogicalSource = fileInput?.logicalSource ?? ({ state: 'unmatched' } as const);

    if (indexedInput.duplicates.has(batchFile.id)) {
      files.push(
        blockedFilePlan({
          batchFile,
          logicalSource: fallbackLogicalSource,
          diagnostics,
          blockedReason: reason(
            'duplicate-file-input',
            'O lote forneceu mais de uma entrada de reconciliação para o mesmo arquivo.',
          ),
        }),
      );
      continue;
    }

    if (batchFile.status !== 'approved') {
      files.push(
        blockedFilePlan({
          batchFile,
          logicalSource: fallbackLogicalSource,
          diagnostics,
          blockedReason: reason(
            `file-status-${batchFile.status}`,
            'Somente arquivos aprovados podem entrar no plano de promoção.',
            diagnostics.map((diagnostic) => diagnostic.id),
          ),
        }),
      );
      continue;
    }

    if (hasBlockingDiagnostics(diagnostics)) {
      files.push(
        blockedFilePlan({
          batchFile,
          logicalSource: fallbackLogicalSource,
          diagnostics,
          blockedReason: reason(
            'file-has-blocking-diagnostics',
            'O arquivo possui diagnóstico bloqueante ou crítico e não pode ser promovido.',
            diagnostics.map((diagnostic) => diagnostic.id),
          ),
        }),
      );
      continue;
    }

    if (!fileInput) {
      files.push(
        blockedFilePlan({
          batchFile,
          logicalSource: fallbackLogicalSource,
          diagnostics,
          blockedReason: reason(
            'missing-file-reconciliation-input',
            'O arquivo aprovado não possui registros reconhecidos para planejamento.',
          ),
        }),
      );
      continue;
    }

    try {
      files.push(
        await planApprovedFile({
          context: input.context,
          batchFile,
          fileInput,
          diagnostics,
          repositories,
        }),
      );
    } catch (error: unknown) {
      const blockedReason =
        error instanceof FilePlanningBlockedError
          ? error.reason
          : reason(
              'reconciliation-read-failed',
              'Uma leitura necessária ao planejamento falhou; o arquivo foi isolado sem descartar os demais.',
            );
      files.push(
        blockedFilePlan({
          batchFile,
          logicalSource: fileInput.logicalSource,
          diagnostics,
          blockedReason,
        }),
      );
    }
  }

  const items = files.flatMap((file) => file.items);
  const counts = countsFor(items);
  const promotableImportFileIds = files
    .filter((file) => file.status === 'ready-for-promotion')
    .map((file) => file.importFileId);
  const reviewRequiredImportFileIds = files
    .filter((file) => file.status === 'review-required')
    .map((file) => file.importFileId);
  const blockedImportFileIds = files
    .filter((file) => file.status === 'blocked')
    .map((file) => file.importFileId);

  return {
    importBatchId: input.batch.id,
    academicYearId: input.context.academicYearId,
    expectedBatchVersion: input.expectedBatchVersion,
    status: aggregateStatus(files),
    files,
    items,
    counts,
    estimatedWrites: aggregateWriteEstimate(files),
    promotionRequest: {
      importBatchId: input.batch.id,
      approvedImportFileIds: promotableImportFileIds,
      expectedBatchVersion: input.expectedBatchVersion,
    },
    reviewRequiredImportFileIds,
    blockedImportFileIds,
    planningEvidence: {
      writesPerformed: 0,
      repositoriesExposeReadOperationsOnly: true,
      deterministicWithoutClockNetworkOrGlobalEnvironment: true,
    },
  };
}
