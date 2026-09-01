import type {
  ImportBatchFileResultV1,
  ImportBatchResultV1,
  ImportBatchStatusV1,
  ImportFileDiagnosticV1,
  ImportFileLocationV1,
  ImportFileStatusV1,
  SourceFileDescriptorV1,
  SourceFileManifestV1,
} from '../../../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  ImportBatchId,
  ImportFileId,
} from '../../../../../shared/gradebook-contracts/imports/import-ids-v1';
import type {
  AcademicPersistenceContextV1,
  CursorPageRequestV1,
  CursorPageV1,
  ImportPersistenceRepositoryV1,
  LogicalSourceIdV1,
  SourceFileVersionV1,
  VersionExpectationV1,
  VersionedRecordV1,
  VersionedWriteResultV1,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type { D1WriteDatabaseV1, D1WriteRunResultV1 } from '../write/d1-write-adapter-v1';

export const GRADEBOOK_D1_IMPORT_DEFAULT_MAXIMUM_PAGE_SIZE_V1 = 100;

export type GradebookD1ImportRepositoryErrorCodeV1 =
  | 'invalid-options'
  | 'invalid-page-request'
  | 'invalid-cursor'
  | 'invalid-json'
  | 'incompatible-row'
  | 'broken-reference'
  | 'database-read-failed'
  | 'incompatible-write'
  | 'manifest-not-found'
  | 'database-write-failed';

const ERROR_MESSAGES: Record<GradebookD1ImportRepositoryErrorCodeV1, string> = {
  'invalid-options': 'As opções do repositório local de importações são inválidas.',
  'invalid-page-request': 'A paginação de versões da fonte solicitada é inválida.',
  'invalid-cursor': 'O cursor de versões da fonte informado é inválido.',
  'invalid-json': 'Os dados de importação persistidos não puderam ser reconstruídos.',
  'incompatible-row': 'O registro de importação persistido possui formato incompatível.',
  'broken-reference': 'Uma referência de importação persistida está inconsistente.',
  'database-read-failed': 'Não foi possível consultar os dados de importação persistidos.',
  'incompatible-write': 'A escrita de importação recebida possui formato incompatível.',
  'manifest-not-found': 'O manifesto referenciado pelo lote não está disponível.',
  'database-write-failed': 'Não foi possível gravar os dados de importação persistidos.',
};

export class GradebookD1ImportRepositoryErrorV1 extends Error {
  readonly code: GradebookD1ImportRepositoryErrorCodeV1;

  constructor(code: GradebookD1ImportRepositoryErrorCodeV1) {
    super(ERROR_MESSAGES[code]);
    this.name = 'GradebookD1ImportRepositoryErrorV1';
    this.code = code;
  }
}

export interface GradebookD1ImportRepositoryOptionsV1 {
  readonly now?: () => string;
  readonly maximumPageSize?: number;
}

type D1RowV1 = Record<string, unknown>;

const FILE_STATUSES = new Set<ImportFileStatusV1>([
  'received',
  'processing',
  'review-required',
  'approved',
  'rejected',
  'failed',
]);

const BATCH_STATUSES = new Set<ImportBatchStatusV1>([
  'received',
  'processing',
  'review-required',
  'partially-approved',
  'approved',
  'rejected',
  'failed',
]);

const SEVERITIES = new Set(['information', 'warning', 'blocking-error', 'critical-error']);

const ENTITY_KINDS = new Set([
  'academic-year',
  'teacher',
  'class-group',
  'subject',
  'teaching-assignment',
  'student',
  'enrollment',
  'student-status-event',
  'assessment-component',
  'grade-entry',
  'term-result',
  'final-recovery',
  'annual-result',
]);

const NORMALIZED_ENTITY_KINDS = new Set([
  'teacher',
  'class-group',
  'subject',
  'teaching-assignment',
  'student',
  'enrollment',
  'student-status-event',
  'assessment-component',
]);

const SUMMARY_FIELDS = [
  'totalFileCount',
  'processedFileCount',
  'approvedFileCount',
  'reviewRequiredFileCount',
  'rejectedFileCount',
  'failedFileCount',
  'informationCount',
  'warningCount',
  'blockingErrorCount',
  'criticalErrorCount',
] as const;

function fail(code: GradebookD1ImportRepositoryErrorCodeV1): never {
  throw new GradebookD1ImportRepositoryErrorV1(code);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function nullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, canonicalJsonValue(value[key])]),
  );
}

function structurallyEqual(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(canonicalJsonValue(left)) === JSON.stringify(canonicalJsonValue(right));
  } catch {
    return false;
  }
}

function serialize(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return nonEmptyString(serialized) ? serialized : fail('incompatible-write');
  } catch {
    return fail('incompatible-write');
  }
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return fail('incompatible-row');
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fail('invalid-json');
  }
}

function rowString(value: unknown): string {
  return nonEmptyString(value) ? value : fail('incompatible-row');
}

function rowVersion(value: unknown): number {
  return positiveInteger(value) ? value : fail('incompatible-row');
}

function changes(result: D1WriteRunResultV1): number {
  const value = result.meta?.changes ?? result.changes;
  if (result.success === false || !nonNegativeInteger(value)) {
    return fail('database-write-failed');
  }
  return value;
}

function validManifest(
  value: unknown,
  context?: AcademicPersistenceContextV1,
): value is SourceFileManifestV1 {
  if (!isObject(value)) return false;
  return (
    nonEmptyString(value.id) &&
    nonEmptyString(value.fileName) &&
    (value.extension === 'xlsb' || value.extension === 'xlsx' || value.extension === 'xls') &&
    nullableString(value.reportedMimeType) &&
    nonNegativeInteger(value.sizeBytes) &&
    nullableString(value.lastModifiedAt) &&
    typeof value.sha256 === 'string' &&
    /^[0-9a-f]{64}$/u.test(value.sha256) &&
    positiveInteger(value.sourceContractVersion) &&
    nonEmptyString(value.parserVersion) &&
    nonEmptyString(value.readAt) &&
    (value.suggestedAcademicYear === undefined || Number.isInteger(value.suggestedAcademicYear)) &&
    (value.confirmedAcademicYearId === undefined ||
      (nonEmptyString(value.confirmedAcademicYearId) &&
        (context === undefined || value.confirmedAcademicYearId === context.academicYearId))) &&
    optionalString(value.suggestedTeacherName) &&
    (value.confirmedTeacherId === undefined || nonEmptyString(value.confirmedTeacherId))
  );
}

function validSourceFileVersion(
  value: unknown,
  context: AcademicPersistenceContextV1,
): value is SourceFileVersionV1 {
  if (
    !isObject(value) ||
    !validManifest(value.manifest, context) ||
    !isObject(value.logicalSource)
  ) {
    return false;
  }
  switch (value.logicalSource.state) {
    case 'unmatched':
      return true;
    case 'candidate':
      return (
        Array.isArray(value.logicalSource.candidateLogicalSourceIds) &&
        value.logicalSource.candidateLogicalSourceIds.length > 0 &&
        value.logicalSource.candidateLogicalSourceIds.every(nonEmptyString) &&
        new Set(value.logicalSource.candidateLogicalSourceIds).size ===
          value.logicalSource.candidateLogicalSourceIds.length
      );
    case 'confirmed':
      return nonEmptyString(value.logicalSource.logicalSourceId);
    default:
      return false;
  }
}

function validDescriptor(value: unknown): value is SourceFileDescriptorV1 {
  return (
    isObject(value) &&
    nonEmptyString(value.fileName) &&
    nullableString(value.extension) &&
    nullableString(value.reportedMimeType) &&
    nonNegativeInteger(value.sizeBytes) &&
    nullableString(value.lastModifiedAt)
  );
}

function validLocation(value: unknown): value is ImportFileLocationV1 {
  if (!isObject(value)) return false;
  switch (value.kind) {
    case 'file':
      return value.sheetName === undefined && value.cellAddress === undefined;
    case 'sheet':
      return nonEmptyString(value.sheetName) && value.cellAddress === undefined;
    case 'cell':
      return nonEmptyString(value.sheetName) && nonEmptyString(value.cellAddress);
    default:
      return false;
  }
}

function validEvidence(value: unknown): boolean {
  if (!isObject(value) || !isObject(value.provenance)) return false;
  const provenance = value.provenance;
  if (
    !nonEmptyString(provenance.fileName) ||
    !nonEmptyString(provenance.fileSha256) ||
    !nonEmptyString(provenance.sheetName) ||
    !nonEmptyString(provenance.cellAddress)
  ) {
    return false;
  }
  switch (value.classification) {
    case 'missing-field':
      return value.rawValue === undefined;
    case 'not-applicable':
      return (
        value.rawValue === null || ['string', 'number', 'boolean'].includes(typeof value.rawValue)
      );
    case 'empty':
      return value.rawValue === null || value.rawValue === '';
    case 'manual-positive-number':
      return (
        typeof value.rawValue === 'number' && Number.isFinite(value.rawValue) && value.rawValue > 0
      );
    case 'manual-negative-number':
      return (
        typeof value.rawValue === 'number' && Number.isFinite(value.rawValue) && value.rawValue < 0
      );
    case 'manual-legacy-zero':
      return value.rawValue === 0;
    case 'manual-official-zero-marker':
      return value.rawValue === 0.1;
    case 'formula-nonzero':
      return (
        nonEmptyString(value.formula) &&
        typeof value.cachedValue === 'number' &&
        Number.isFinite(value.cachedValue) &&
        value.cachedValue !== 0
      );
    case 'formula-zero':
      return nonEmptyString(value.formula) && value.cachedValue === 0;
    case 'formula-error-or-missing-cache':
      return (
        nonEmptyString(value.formula) &&
        value.cachedValue === null &&
        nullableString(value.sourceError)
      );
    case 'invalid-text':
      return typeof value.rawValue === 'string';
    default:
      return false;
  }
}

function validEntity(value: unknown): boolean {
  return (
    value === undefined ||
    (isObject(value) && ENTITY_KINDS.has(String(value.kind)) && nonEmptyString(value.id))
  );
}

function validFile(
  value: unknown,
  context: AcademicPersistenceContextV1,
): value is ImportBatchFileResultV1 {
  return (
    isObject(value) &&
    nonEmptyString(value.id) &&
    validDescriptor(value.sourceFile) &&
    (value.manifest === null || validManifest(value.manifest, context)) &&
    FILE_STATUSES.has(value.status as ImportFileStatusV1) &&
    Array.isArray(value.diagnosticIds) &&
    value.diagnosticIds.every(nonEmptyString) &&
    new Set(value.diagnosticIds).size === value.diagnosticIds.length
  );
}

function validDiagnostic(value: unknown): value is ImportFileDiagnosticV1 {
  return (
    isObject(value) &&
    nonEmptyString(value.id) &&
    nonEmptyString(value.importBatchId) &&
    nonEmptyString(value.importFileId) &&
    (value.sourceFileManifestId === undefined || nonEmptyString(value.sourceFileManifestId)) &&
    SEVERITIES.has(String(value.severity)) &&
    nonEmptyString(value.code) &&
    nonEmptyString(value.message) &&
    validLocation(value.location) &&
    validEntity(value.entity) &&
    (value.sourceEvidence === undefined || validEvidence(value.sourceEvidence))
  );
}

function validSummary(value: unknown, status: ImportBatchStatusV1): boolean {
  if (!isObject(value) || !SUMMARY_FIELDS.every((field) => nonNegativeInteger(value[field]))) {
    return false;
  }
  return (
    status !== 'approved' ||
    (value.reviewRequiredFileCount === 0 &&
      value.rejectedFileCount === 0 &&
      value.failedFileCount === 0 &&
      value.blockingErrorCount === 0 &&
      value.criticalErrorCount === 0)
  );
}

function canonicalBatch(
  value: unknown,
  context: AcademicPersistenceContextV1,
): ImportBatchResultV1 {
  if (
    !isObject(value) ||
    !nonEmptyString(context.academicYearId) ||
    !nonEmptyString(value.id) ||
    !BATCH_STATUSES.has(value.status as ImportBatchStatusV1) ||
    !nonEmptyString(value.receivedAt) ||
    !nonEmptyString(value.updatedAt) ||
    !Array.isArray(value.files) ||
    !value.files.every((file) => validFile(file, context)) ||
    !Array.isArray(value.diagnostics) ||
    !value.diagnostics.every(validDiagnostic) ||
    !validSummary(value.summary, value.status as ImportBatchStatusV1)
  ) {
    return fail('incompatible-write');
  }

  const files = [...value.files].sort((left, right) => left.id.localeCompare(right.id));
  const diagnostics = [...value.diagnostics].sort((left, right) => left.id.localeCompare(right.id));
  if (!isObject(value.summary)) return fail('incompatible-write');
  const status = value.status as ImportBatchStatusV1;
  const summary = value.summary as unknown as ImportBatchResultV1['summary'];
  const countFiles = (status: ImportFileStatusV1) =>
    files.filter((file) => file.status === status).length;
  const countDiagnostics = (severity: ImportFileDiagnosticV1['severity']) =>
    diagnostics.filter((diagnostic) => diagnostic.severity === severity).length;
  if (
    new Set(files.map(({ id }) => id)).size !== files.length ||
    new Set(diagnostics.map(({ id }) => id)).size !== diagnostics.length ||
    summary.totalFileCount !== files.length ||
    summary.processedFileCount > files.length ||
    summary.approvedFileCount !== countFiles('approved') ||
    summary.reviewRequiredFileCount !== countFiles('review-required') ||
    summary.rejectedFileCount !== countFiles('rejected') ||
    summary.failedFileCount !== countFiles('failed') ||
    summary.informationCount !== countDiagnostics('information') ||
    summary.warningCount !== countDiagnostics('warning') ||
    summary.blockingErrorCount !== countDiagnostics('blocking-error') ||
    summary.criticalErrorCount !== countDiagnostics('critical-error')
  ) {
    return fail('incompatible-write');
  }

  const fileById = new Map(files.map((file) => [file.id, file]));
  for (const diagnostic of diagnostics) {
    const file = fileById.get(diagnostic.importFileId);
    if (
      diagnostic.importBatchId !== value.id ||
      !file ||
      (diagnostic.sourceFileManifestId !== undefined &&
        diagnostic.sourceFileManifestId !== file.manifest?.id)
    ) {
      return fail('incompatible-write');
    }
  }

  const canonicalFiles = files.map((file) => {
    const diagnosticIds = [...file.diagnosticIds].sort();
    const actualIds = diagnostics
      .filter(({ importFileId }) => importFileId === file.id)
      .map(({ id }) => id)
      .sort();
    if (!structurallyEqual(diagnosticIds, actualIds)) return fail('incompatible-write');
    return { ...file, diagnosticIds };
  });

  return {
    id: value.id as ImportBatchId,
    status,
    files: canonicalFiles,
    diagnostics,
    summary,
    receivedAt: value.receivedAt,
    updatedAt: value.updatedAt,
  } as ImportBatchResultV1;
}

function parseBatch(value: unknown, context: AcademicPersistenceContextV1): ImportBatchResultV1 {
  try {
    return canonicalBatch(value, context);
  } catch (cause) {
    if (cause instanceof GradebookD1ImportRepositoryErrorV1) {
      return fail('incompatible-row');
    }
    return fail('incompatible-row');
  }
}

function manifestColumnsMatch(row: D1RowV1, manifest: SourceFileManifestV1): boolean {
  return (
    row.manifest_id === manifest.id &&
    row.file_name === manifest.fileName &&
    row.extension === manifest.extension &&
    row.reported_mime_type === manifest.reportedMimeType &&
    row.size_bytes === manifest.sizeBytes &&
    row.last_modified_at === manifest.lastModifiedAt &&
    row.sha256 === manifest.sha256 &&
    row.source_contract_version === manifest.sourceContractVersion &&
    row.parser_version === manifest.parserVersion &&
    row.read_at === manifest.readAt &&
    row.suggested_academic_year === (manifest.suggestedAcademicYear ?? null) &&
    row.confirmed_academic_year_id === (manifest.confirmedAcademicYearId ?? null) &&
    row.suggested_teacher_name === (manifest.suggestedTeacherName ?? null) &&
    row.confirmed_teacher_id === (manifest.confirmedTeacherId ?? null)
  );
}

function mapConfirmedSourceVersion(
  row: D1RowV1,
  context: AcademicPersistenceContextV1,
  logicalSourceId: LogicalSourceIdV1,
): VersionedRecordV1<SourceFileVersionV1> {
  const value = parseJson(row.payload_json);
  if (!validSourceFileVersion(value, context)) return fail('incompatible-row');
  if (
    value.logicalSource.state !== 'confirmed' ||
    value.logicalSource.logicalSourceId !== logicalSourceId ||
    row.logical_source_state !== 'confirmed' ||
    row.confirmed_logical_source_id !== logicalSourceId ||
    row.candidate_count !== 0 ||
    !manifestColumnsMatch(row, value.manifest)
  ) {
    return fail('incompatible-row');
  }
  return {
    value,
    version: rowVersion(row.version),
    recordedAt: rowString(row.recorded_at),
  };
}

interface SourceCursorV1 {
  readonly recordedAt: string;
  readonly manifestId: string;
  readonly version: number;
}

function encodeCursor(
  context: AcademicPersistenceContextV1,
  logicalSourceId: LogicalSourceIdV1,
  cursor: SourceCursorV1,
): string {
  const bytes = new TextEncoder().encode(
    JSON.stringify([
      1,
      context.academicYearId,
      logicalSourceId,
      cursor.recordedAt,
      cursor.manifestId,
      cursor.version,
    ]),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function decodeCursor(
  value: string,
  context: AcademicPersistenceContextV1,
  logicalSourceId: LogicalSourceIdV1,
): SourceCursorV1 {
  try {
    if (value.length === 0 || value.length % 2 !== 0 || !/^[0-9a-f]+$/u.test(value)) {
      return fail('invalid-cursor');
    }
    const bytes = new Uint8Array(value.length / 2);
    for (let index = 0; index < value.length; index += 2) {
      bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
    }
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 6 ||
      parsed[0] !== 1 ||
      parsed[1] !== context.academicYearId ||
      parsed[2] !== logicalSourceId ||
      !nonEmptyString(parsed[3]) ||
      !nonEmptyString(parsed[4]) ||
      !positiveInteger(parsed[5])
    ) {
      return fail('invalid-cursor');
    }
    return { recordedAt: parsed[3], manifestId: parsed[4], version: parsed[5] };
  } catch (cause) {
    if (cause instanceof GradebookD1ImportRepositoryErrorV1) throw cause;
    return fail('invalid-cursor');
  }
}

function locationColumns(location: ImportFileLocationV1): {
  readonly kind: ImportFileLocationV1['kind'];
  readonly sheetName: string | null;
  readonly cellAddress: string | null;
} {
  switch (location.kind) {
    case 'file':
      return { kind: 'file', sheetName: null, cellAddress: null };
    case 'sheet':
      return { kind: 'sheet', sheetName: location.sheetName, cellAddress: null };
    case 'cell':
      return {
        kind: 'cell',
        sheetName: location.sheetName,
        cellAddress: location.cellAddress,
      };
  }
}

function normalizedEntity(entity: ImportFileDiagnosticV1['entity']): {
  readonly kind: string | null;
  readonly id: string | null;
} {
  return entity && NORMALIZED_ENTITY_KINDS.has(entity.kind)
    ? { kind: entity.kind, id: entity.id }
    : { kind: null, id: null };
}

function mapBatchFile(
  row: D1RowV1,
  context: AcademicPersistenceContextV1,
): ImportBatchFileResultV1 {
  const value = parseJson(row.file_payload_json);
  if (!validFile(value, context)) return fail('incompatible-row');
  const manifestId = value.manifest?.id ?? null;
  if (
    row.import_file_id !== value.id ||
    row.status !== value.status ||
    row.file_name !== value.sourceFile.fileName ||
    row.extension !== value.sourceFile.extension ||
    row.reported_mime_type !== value.sourceFile.reportedMimeType ||
    row.size_bytes !== value.sourceFile.sizeBytes ||
    row.last_modified_at !== value.sourceFile.lastModifiedAt ||
    row.manifest_id !== manifestId
  ) {
    return fail('incompatible-row');
  }
  if (value.manifest === null) {
    if (row.manifest_version !== null || row.linked_manifest_version !== null) {
      return fail('broken-reference');
    }
  } else {
    if (rowVersion(row.manifest_version) !== rowVersion(row.linked_manifest_version)) {
      return fail('broken-reference');
    }
    const source = parseJson(row.linked_source_payload_json);
    if (
      !validSourceFileVersion(source, context) ||
      !structurallyEqual(source.manifest, value.manifest)
    ) {
      return fail('broken-reference');
    }
  }
  return value;
}

function mapDiagnostic(row: D1RowV1): ImportFileDiagnosticV1 {
  const value = parseJson(row.diagnostic_payload_json);
  if (!validDiagnostic(value)) return fail('incompatible-row');
  const location = locationColumns(value.location);
  const entity = normalizedEntity(value.entity);
  if (
    row.diagnostic_id !== value.id ||
    row.import_file_id !== value.importFileId ||
    row.manifest_id !== (value.sourceFileManifestId ?? null) ||
    row.severity !== value.severity ||
    row.code !== value.code ||
    row.message !== value.message ||
    row.location_kind !== location.kind ||
    row.sheet_name !== location.sheetName ||
    row.cell_address !== location.cellAddress ||
    row.entity_kind !== entity.kind ||
    row.entity_id !== entity.id ||
    !structurallyEqual(
      row.source_evidence_json === null ? undefined : parseJson(row.source_evidence_json),
      value.sourceEvidence,
    )
  ) {
    return fail('incompatible-row');
  }
  return value;
}

class GradebookD1ImportRepositoryExtensionV1 {
  private savepointSequence = 0;

  constructor(
    private readonly database: D1WriteDatabaseV1,
    private readonly now: () => string,
    private readonly maximumPageSize: number,
  ) {}

  private async safelyRead<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (cause) {
      if (cause instanceof GradebookD1ImportRepositoryErrorV1) throw cause;
      throw new GradebookD1ImportRepositoryErrorV1('database-read-failed');
    }
  }

  private async safelyWrite<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (cause) {
      if (cause instanceof GradebookD1ImportRepositoryErrorV1) throw cause;
      throw new GradebookD1ImportRepositoryErrorV1('database-write-failed');
    }
  }

  private async inSavepoint<T>(operation: () => Promise<T>): Promise<T> {
    const name = `gradebook_imports_${String(++this.savepointSequence)}`;
    return this.safelyWrite(async () => {
      await this.database.exec(`SAVEPOINT ${name}`);
      try {
        const result = await operation();
        await this.database.exec(`RELEASE SAVEPOINT ${name}`);
        return result;
      } catch (cause) {
        try {
          await this.database.exec(`ROLLBACK TO SAVEPOINT ${name}`);
          await this.database.exec(`RELEASE SAVEPOINT ${name}`);
        } catch {
          throw new GradebookD1ImportRepositoryErrorV1('database-write-failed');
        }
        throw cause;
      }
    });
  }

  private recordedAt(): string {
    try {
      const value = this.now();
      return nonEmptyString(value) ? value : fail('incompatible-write');
    } catch (cause) {
      if (cause instanceof GradebookD1ImportRepositoryErrorV1) throw cause;
      return fail('incompatible-write');
    }
  }

  private async currentBatchVersion(
    context: AcademicPersistenceContextV1,
    importBatchId: ImportBatchId,
  ): Promise<number | null> {
    const row = await this.database
      .prepare(
        `SELECT current_version FROM import_batch_streams
         WHERE academic_year_id = ? AND import_batch_id = ?`,
      )
      .bind(context.academicYearId, importBatchId)
      .first<D1RowV1>();
    if (!row) return null;
    return positiveInteger(row.current_version)
      ? row.current_version
      : fail('database-write-failed');
  }

  private async resolveManifestVersion(
    context: AcademicPersistenceContextV1,
    manifest: SourceFileManifestV1,
  ): Promise<number> {
    const rows = await this.database
      .prepare(
        `SELECT version, payload_json
         FROM source_file_versions
         WHERE academic_year_id = ? AND manifest_id = ?
         ORDER BY version DESC`,
      )
      .bind(context.academicYearId, manifest.id)
      .all<D1RowV1>();
    for (const row of rows.results) {
      const source = parseJson(row.payload_json);
      if (validSourceFileVersion(source, context) && structurallyEqual(source.manifest, manifest)) {
        return rowVersion(row.version);
      }
    }
    return fail('manifest-not-found');
  }

  async listLogicalSourceVersions(
    context: AcademicPersistenceContextV1,
    logicalSourceId: LogicalSourceIdV1,
    page: CursorPageRequestV1,
  ): Promise<CursorPageV1<VersionedRecordV1<SourceFileVersionV1>>> {
    if (
      !nonEmptyString(context.academicYearId) ||
      !nonEmptyString(logicalSourceId) ||
      !isObject(page) ||
      !Number.isInteger(page.limit) ||
      page.limit < 1 ||
      page.limit > this.maximumPageSize
    ) {
      return Promise.reject(new GradebookD1ImportRepositoryErrorV1('invalid-page-request'));
    }

    let cursor: SourceCursorV1 | null = null;
    if (page.cursor !== undefined && page.cursor !== null) {
      if (typeof page.cursor !== 'string') {
        return Promise.reject(new GradebookD1ImportRepositoryErrorV1('invalid-cursor'));
      }
      cursor = decodeCursor(page.cursor, context, logicalSourceId);
    }

    return this.safelyRead(async () => {
      const rows = await this.database
        .prepare(
          `SELECT
             v.manifest_id,
             v.version,
             v.file_name,
             v.extension,
             v.reported_mime_type,
             v.size_bytes,
             v.last_modified_at,
             v.sha256,
             v.source_contract_version,
             v.parser_version,
             v.read_at,
             v.suggested_academic_year,
             v.confirmed_academic_year_id,
             v.suggested_teacher_name,
             v.confirmed_teacher_id,
             v.logical_source_state,
             v.confirmed_logical_source_id,
             v.payload_json,
             v.recorded_at,
             (SELECT COUNT(*)
                FROM source_file_logical_source_candidates c
               WHERE c.academic_year_id = v.academic_year_id
                 AND c.manifest_id = v.manifest_id
                 AND c.source_file_version = v.version) AS candidate_count
           FROM source_file_versions v
           WHERE v.academic_year_id = ?
             AND v.logical_source_state = 'confirmed'
             AND v.confirmed_logical_source_id = ?
             AND (
               ? IS NULL
               OR v.recorded_at > ?
               OR (v.recorded_at = ? AND v.manifest_id > ?)
               OR (v.recorded_at = ? AND v.manifest_id = ? AND v.version > ?)
             )
           ORDER BY v.recorded_at, v.manifest_id, v.version
           LIMIT ?`,
        )
        .bind(
          context.academicYearId,
          logicalSourceId,
          cursor?.recordedAt ?? null,
          cursor?.recordedAt ?? null,
          cursor?.recordedAt ?? null,
          cursor?.manifestId ?? null,
          cursor?.recordedAt ?? null,
          cursor?.manifestId ?? null,
          cursor?.version ?? null,
          page.limit + 1,
        )
        .all<D1RowV1>();
      const selected = rows.results.slice(0, page.limit);
      const items = selected.map((row) => mapConfirmedSourceVersion(row, context, logicalSourceId));
      const last = selected.at(-1);
      return {
        items,
        nextCursor:
          rows.results.length > page.limit && last
            ? encodeCursor(context, logicalSourceId, {
                recordedAt: rowString(last.recorded_at),
                manifestId: rowString(last.manifest_id),
                version: rowVersion(last.version),
              })
            : null,
      };
    });
  }

  getImportBatch(
    context: AcademicPersistenceContextV1,
    importBatchId: ImportBatchId,
  ): Promise<VersionedRecordV1<ImportBatchResultV1> | null> {
    if (!nonEmptyString(context.academicYearId) || !nonEmptyString(importBatchId)) {
      return Promise.reject(new GradebookD1ImportRepositoryErrorV1('incompatible-row'));
    }
    return this.safelyRead(async () => {
      const row = await this.database
        .prepare(
          `SELECT
             s.current_version,
             v.version AS persisted_version,
             v.status,
             v.received_at,
             v.updated_at,
             v.summary_json,
             v.payload_json,
             v.recorded_at
           FROM import_batch_streams s
           LEFT JOIN import_batch_versions v
             ON v.academic_year_id = s.academic_year_id
            AND v.import_batch_id = s.import_batch_id
            AND v.version = s.current_version
           WHERE s.academic_year_id = ? AND s.import_batch_id = ?`,
        )
        .bind(context.academicYearId, importBatchId)
        .first<D1RowV1>();
      if (!row) return null;
      if (row.persisted_version === null) return fail('broken-reference');
      const version = rowVersion(row.persisted_version);
      if (rowVersion(row.current_version) !== version) return fail('broken-reference');

      const fileRows = await this.database
        .prepare(
          `SELECT
             f.import_file_id,
             f.manifest_id,
             f.manifest_version,
             f.status,
             f.file_name,
             f.extension,
             f.reported_mime_type,
             f.size_bytes,
             f.last_modified_at,
             f.payload_json AS file_payload_json,
             m.version AS linked_manifest_version,
             m.payload_json AS linked_source_payload_json
           FROM import_batch_files f
           LEFT JOIN source_file_versions m
             ON m.academic_year_id = f.academic_year_id
            AND m.manifest_id = f.manifest_id
            AND m.version = f.manifest_version
           WHERE f.academic_year_id = ? AND f.import_batch_id = ? AND f.batch_version = ?
           ORDER BY f.import_file_id`,
        )
        .bind(context.academicYearId, importBatchId, version)
        .all<D1RowV1>();
      const diagnosticRows = await this.database
        .prepare(
          `SELECT
             diagnostic_id,
             import_file_id,
             manifest_id,
             manifest_version,
             severity,
             code,
             message,
             location_kind,
             sheet_name,
             cell_address,
             entity_kind,
             entity_id,
             source_evidence_json,
             payload_json AS diagnostic_payload_json
           FROM import_diagnostics
           WHERE academic_year_id = ? AND import_batch_id = ? AND batch_version = ?
           ORDER BY diagnostic_id`,
        )
        .bind(context.academicYearId, importBatchId, version)
        .all<D1RowV1>();

      const files = fileRows.results.map((fileRow) => mapBatchFile(fileRow, context));
      const diagnostics = diagnosticRows.results.map(mapDiagnostic);
      const fileRowsById = new Map(
        fileRows.results.map((fileRow) => [rowString(fileRow.import_file_id), fileRow]),
      );
      for (const [index, diagnostic] of diagnostics.entries()) {
        const diagnosticRow = diagnosticRows.results[index]!;
        const fileRow = fileRowsById.get(diagnostic.importFileId);
        if (!fileRow) return fail('broken-reference');
        if (diagnostic.sourceFileManifestId === undefined) {
          if (diagnosticRow.manifest_version !== null) return fail('incompatible-row');
        } else if (
          diagnosticRow.manifest_id !== fileRow.manifest_id ||
          rowVersion(diagnosticRow.manifest_version) !== rowVersion(fileRow.manifest_version)
        ) {
          return fail('broken-reference');
        }
      }
      const parent = parseBatch(parseJson(row.payload_json), context);
      const summary = parseJson(row.summary_json);
      const reconstructed = parseBatch(
        {
          id: importBatchId,
          status: row.status,
          receivedAt: row.received_at,
          updatedAt: row.updated_at,
          summary,
          files,
          diagnostics,
        },
        context,
      );
      if (!structurallyEqual(parent, reconstructed)) return fail('incompatible-row');
      return {
        value: reconstructed,
        version,
        recordedAt: rowString(row.recorded_at),
      };
    });
  }

  appendImportBatchVersion(
    context: AcademicPersistenceContextV1,
    batch: ImportBatchResultV1,
    expectation: VersionExpectationV1,
  ): Promise<VersionedWriteResultV1<ImportBatchResultV1>> {
    if (
      !isObject(expectation) ||
      (expectation.expectedVersion !== null && !positiveInteger(expectation.expectedVersion))
    ) {
      return Promise.reject(new GradebookD1ImportRepositoryErrorV1('incompatible-write'));
    }
    let value: ImportBatchResultV1;
    try {
      value = canonicalBatch(batch, context);
    } catch (cause) {
      return Promise.reject(
        cause instanceof GradebookD1ImportRepositoryErrorV1
          ? cause
          : new GradebookD1ImportRepositoryErrorV1('incompatible-write'),
      );
    }
    const payloadJson = serialize(value);
    const summaryJson = serialize(value.summary);
    const recordedAt = this.recordedAt();

    return this.inSavepoint(async () => {
      let rootChanges: number;
      if (expectation.expectedVersion === null) {
        rootChanges = changes(
          await this.database
            .prepare(
              `INSERT INTO import_batch_streams (
                 academic_year_id, import_batch_id, current_version, created_at
               ) VALUES (?, ?, 1, ?)
               ON CONFLICT (academic_year_id, import_batch_id) DO NOTHING`,
            )
            .bind(context.academicYearId, value.id, recordedAt)
            .run(),
        );
      } else {
        rootChanges = changes(
          await this.database
            .prepare(
              `UPDATE import_batch_streams
               SET current_version = ?
               WHERE academic_year_id = ? AND import_batch_id = ? AND current_version = ?`,
            )
            .bind(
              expectation.expectedVersion + 1,
              context.academicYearId,
              value.id,
              expectation.expectedVersion,
            )
            .run(),
        );
      }

      if (rootChanges !== 1) {
        return {
          status: 'version-conflict',
          currentVersion: await this.currentBatchVersion(context, value.id),
        };
      }

      const manifestVersions = new Map<ImportFileId, number>();
      for (const file of value.files) {
        if (file.manifest !== null) {
          manifestVersions.set(file.id, await this.resolveManifestVersion(context, file.manifest));
        }
      }

      const version = (expectation.expectedVersion ?? 0) + 1;
      if (
        changes(
          await this.database
            .prepare(
              `INSERT INTO import_batch_versions (
                 academic_year_id, import_batch_id, version, previous_version, status,
                 received_at, updated_at, summary_json, payload_json, recorded_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              context.academicYearId,
              value.id,
              version,
              expectation.expectedVersion,
              value.status,
              value.receivedAt,
              value.updatedAt,
              summaryJson,
              payloadJson,
              recordedAt,
            )
            .run(),
        ) !== 1
      ) {
        return fail('database-write-failed');
      }

      for (const file of value.files) {
        const manifestVersion = manifestVersions.get(file.id) ?? null;
        if (
          changes(
            await this.database
              .prepare(
                `INSERT INTO import_batch_files (
                   academic_year_id, import_batch_id, batch_version, import_file_id,
                   manifest_id, manifest_version, status, file_name, extension,
                   reported_mime_type, size_bytes, last_modified_at, payload_json
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              )
              .bind(
                context.academicYearId,
                value.id,
                version,
                file.id,
                file.manifest?.id ?? null,
                manifestVersion,
                file.status,
                file.sourceFile.fileName,
                file.sourceFile.extension,
                file.sourceFile.reportedMimeType,
                file.sourceFile.sizeBytes,
                file.sourceFile.lastModifiedAt,
                serialize(file),
              )
              .run(),
          ) !== 1
        ) {
          return fail('database-write-failed');
        }
      }

      for (const diagnostic of value.diagnostics) {
        const file = value.files.find(({ id }) => id === diagnostic.importFileId)!;
        const manifestVersion =
          diagnostic.sourceFileManifestId === undefined
            ? null
            : (manifestVersions.get(file.id) ?? fail('manifest-not-found'));
        const location = locationColumns(diagnostic.location);
        const entity = normalizedEntity(diagnostic.entity);
        if (
          changes(
            await this.database
              .prepare(
                `INSERT INTO import_diagnostics (
                   academic_year_id, import_batch_id, batch_version, diagnostic_id,
                   import_file_id, manifest_id, manifest_version, severity, code, message,
                   location_kind, sheet_name, cell_address, entity_kind, entity_id,
                   source_evidence_json, payload_json
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              )
              .bind(
                context.academicYearId,
                value.id,
                version,
                diagnostic.id,
                diagnostic.importFileId,
                diagnostic.sourceFileManifestId ?? null,
                manifestVersion,
                diagnostic.severity,
                diagnostic.code,
                diagnostic.message,
                location.kind,
                location.sheetName,
                location.cellAddress,
                entity.kind,
                entity.id,
                diagnostic.sourceEvidence === undefined
                  ? null
                  : serialize(diagnostic.sourceEvidence),
                serialize(diagnostic),
              )
              .run(),
          ) !== 1
        ) {
          return fail('database-write-failed');
        }
      }

      return {
        status: 'written',
        record: { value, version, recordedAt },
      };
    });
  }
}

export function createGradebookD1ImportRepositoryExtensionV1(
  database: D1WriteDatabaseV1,
  options: GradebookD1ImportRepositoryOptionsV1 = {},
): Pick<
  ImportPersistenceRepositoryV1,
  'listLogicalSourceVersions' | 'getImportBatch' | 'appendImportBatchVersion'
> {
  const maximumPageSize =
    options.maximumPageSize ?? GRADEBOOK_D1_IMPORT_DEFAULT_MAXIMUM_PAGE_SIZE_V1;
  if (
    !positiveInteger(maximumPageSize) ||
    maximumPageSize > GRADEBOOK_D1_IMPORT_DEFAULT_MAXIMUM_PAGE_SIZE_V1 ||
    (options.now !== undefined && typeof options.now !== 'function')
  ) {
    return fail('invalid-options');
  }
  const repository = new GradebookD1ImportRepositoryExtensionV1(
    database,
    options.now ?? (() => new Date().toISOString()),
    maximumPageSize,
  );
  return {
    listLogicalSourceVersions: (context, logicalSourceId, page) =>
      repository.listLogicalSourceVersions(context, logicalSourceId, page),
    getImportBatch: (context, importBatchId) => repository.getImportBatch(context, importBatchId),
    appendImportBatchVersion: (context, batch, expectation) =>
      repository.appendImportBatchVersion(context, batch, expectation),
  };
}
