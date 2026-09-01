import type {
  AuditEntityReferenceV1,
  AuditOccurrenceStateTransitionV1,
  AuditOccurrenceV1,
  AuditSourceReferenceV1,
  ReconciliationResultV1,
  ReconciliationTargetV1,
} from '../../../../../shared/gradebook-contracts/audit/audit-contract-v1';
import type { SourceCellEvidenceV1 } from '../../../../../shared/gradebook-contracts/source/source-contract-v1';
import type {
  AcademicGradeValueV1,
  ComparedGradeValueV1,
} from '../../../../../shared/gradebook-contracts/results/results-contract-v1';
import type {
  AcademicPersistenceContextV1,
  AuditPersistenceRepositoryV1,
  AuditRecordStreamV1,
  AuditRecordV1,
  CursorPageRequestV1,
  CursorPageV1,
  VersionExpectationV1,
  VersionedRecordV1,
  VersionedWriteResultV1,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type { D1WriteDatabaseV1, D1WriteRunResultV1 } from '../write/d1-write-adapter-v1';

export const GRADEBOOK_D1_AUDIT_DEFAULT_MAXIMUM_PAGE_SIZE_V1 = 100;

export type GradebookD1AuditRepositoryErrorCodeV1 =
  | 'invalid-options'
  | 'invalid-page-request'
  | 'invalid-cursor'
  | 'invalid-json'
  | 'incompatible-row'
  | 'broken-reference'
  | 'invalid-transition-history'
  | 'database-read-failed'
  | 'incompatible-write'
  | 'database-write-failed';

const ERROR_MESSAGES: Record<GradebookD1AuditRepositoryErrorCodeV1, string> = {
  'invalid-options': 'As opções do repositório local de Auditoria são inválidas.',
  'invalid-page-request': 'A paginação do histórico de Auditoria é inválida.',
  'invalid-cursor': 'O cursor do histórico de Auditoria é inválido.',
  'invalid-json': 'Os dados de Auditoria persistidos não puderam ser reconstruídos.',
  'incompatible-row': 'O registro de Auditoria persistido possui formato incompatível.',
  'broken-reference': 'Uma referência de Auditoria persistida está inconsistente.',
  'invalid-transition-history': 'O histórico de estados da ocorrência é inválido.',
  'database-read-failed': 'Não foi possível consultar os dados de Auditoria persistidos.',
  'incompatible-write': 'A escrita de Auditoria recebida possui formato incompatível.',
  'database-write-failed': 'Não foi possível gravar os dados de Auditoria persistidos.',
};

export class GradebookD1AuditRepositoryErrorV1 extends Error {
  readonly code: GradebookD1AuditRepositoryErrorCodeV1;

  constructor(code: GradebookD1AuditRepositoryErrorCodeV1) {
    super(ERROR_MESSAGES[code]);
    this.name = 'GradebookD1AuditRepositoryErrorV1';
    this.code = code;
  }
}

export interface GradebookD1AuditRepositoryOptionsV1 {
  readonly now?: () => string;
  readonly maximumPageSize?: number;
}

type D1RowV1 = Record<string, unknown>;

const SEVERITIES = new Set(['information', 'warning', 'blocking-error', 'critical-error']);
const RECONCILIATION_STATUSES = new Set([
  'match',
  'expected-difference',
  'mismatch',
  'not-comparable',
]);
const RECORD_KINDS = new Set(['grade-entry', 'term-result', 'final-recovery', 'annual-result']);
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

function fail(code: GradebookD1AuditRepositoryErrorCodeV1): never {
  throw new GradebookD1AuditRepositoryErrorV1(code);
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

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
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

function validRawValue(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function validEvidence(value: unknown): value is SourceCellEvidenceV1 {
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
      return validRawValue(value.rawValue);
    case 'empty':
      return value.rawValue === null || value.rawValue === '';
    case 'manual-positive-number':
      return finiteNumber(value.rawValue) && value.rawValue > 0;
    case 'manual-negative-number':
      return finiteNumber(value.rawValue) && value.rawValue < 0;
    case 'manual-legacy-zero':
      return value.rawValue === 0;
    case 'manual-official-zero-marker':
      return value.rawValue === 0.1;
    case 'formula-nonzero':
      return (
        validRawValue(value.rawValue) &&
        nonEmptyString(value.formula) &&
        finiteNumber(value.cachedValue) &&
        value.cachedValue !== 0
      );
    case 'formula-zero':
      return (
        validRawValue(value.rawValue) && nonEmptyString(value.formula) && value.cachedValue === 0
      );
    case 'formula-error-or-missing-cache':
      return (
        validRawValue(value.rawValue) &&
        nonEmptyString(value.formula) &&
        value.cachedValue === null &&
        (value.sourceError === null || typeof value.sourceError === 'string')
      );
    case 'invalid-text':
      return typeof value.rawValue === 'string';
    default:
      return false;
  }
}

function validGradeValue(value: unknown): value is AcademicGradeValueV1 {
  if (!isObject(value)) return false;
  switch (value.state) {
    case 'absent':
      return true;
    case 'numeric':
      return finiteNumber(value.value);
    case 'official-zero':
      return value.value === 0 && value.sourceMarker === 0.1;
    case 'legacy-zero':
      return value.value === 0;
    case 'not-applicable':
      return optionalString(value.reason);
    case 'insufficient-data':
      return nonEmptyString(value.reason);
    default:
      return false;
  }
}

function validComparedValue(value: unknown): value is ComparedGradeValueV1 {
  return (
    isObject(value) &&
    isObject(value.imported) &&
    validGradeValue(value.imported.value) &&
    Array.isArray(value.imported.evidence) &&
    value.imported.evidence.length > 0 &&
    value.imported.evidence.every(validEvidence) &&
    isObject(value.calculated) &&
    validGradeValue(value.calculated.value)
  );
}

function validEntityReference(value: unknown): value is AuditEntityReferenceV1 {
  return isObject(value) && ENTITY_KINDS.has(String(value.kind)) && nonEmptyString(value.id);
}

function validSourceReference(value: unknown): value is AuditSourceReferenceV1 {
  if (!isObject(value) || !nonEmptyString(value.sourceFileManifestId)) return false;
  switch (value.kind) {
    case 'file':
      return value.sheetName === undefined && value.evidence === undefined;
    case 'sheet':
      return nonEmptyString(value.sheetName) && value.evidence === undefined;
    case 'cell':
      return validEvidence(value.evidence);
    default:
      return false;
  }
}

function validTransition(
  value: unknown,
  expectedPreviousState: 'open' | 'acknowledged',
): value is AuditOccurrenceStateTransitionV1 {
  if (
    !isObject(value) ||
    value.previousState !== expectedPreviousState ||
    !nonEmptyString(value.actorId) ||
    !nonEmptyString(value.occurredAt)
  ) {
    return false;
  }
  switch (value.nextState) {
    case 'acknowledged':
      return (
        expectedPreviousState === 'open' &&
        optionalString(value.note) &&
        value.justification === undefined
      );
    case 'resolved':
    case 'dismissed-with-reason':
      return nonEmptyString(value.justification) && value.note === undefined;
    default:
      return false;
  }
}

function validOccurrence(value: unknown): value is AuditOccurrenceV1 {
  if (
    !isObject(value) ||
    !nonEmptyString(value.id) ||
    (value.importBatchId !== undefined && !nonEmptyString(value.importBatchId)) ||
    !SEVERITIES.has(String(value.severity)) ||
    !nonEmptyString(value.category) ||
    (value.entity !== undefined && !validEntityReference(value.entity)) ||
    (value.source !== undefined && !validSourceReference(value.source)) ||
    !nonEmptyString(value.message) ||
    !optionalString(value.recommendedAction) ||
    !nonEmptyString(value.createdAt) ||
    !Array.isArray(value.stateHistory)
  ) {
    return false;
  }
  let state: 'open' | 'acknowledged' = 'open';
  let terminal: 'resolved' | 'dismissed-with-reason' | null = null;
  for (const transition of value.stateHistory) {
    if (terminal !== null || !validTransition(transition, state)) return false;
    if (transition.nextState === 'acknowledged') state = 'acknowledged';
    else terminal = transition.nextState;
  }
  const finalState = terminal ?? state;
  return value.state === finalState;
}

function validTarget(value: unknown): value is ReconciliationTargetV1 {
  return isObject(value) && RECORD_KINDS.has(String(value.kind)) && nonEmptyString(value.id);
}

function validReconciliation(value: unknown): value is ReconciliationResultV1 {
  if (
    !isObject(value) ||
    !nonEmptyString(value.id) ||
    !validTarget(value.target) ||
    !validComparedValue(value.value) ||
    !nonEmptyString(value.ruleVersion) ||
    !RECONCILIATION_STATUSES.has(String(value.status))
  ) {
    return false;
  }
  if (value.status === 'not-comparable') {
    return (
      value.difference === null &&
      (value.tolerance === null || finiteNumber(value.tolerance)) &&
      nonEmptyString(value.explanation)
    );
  }
  return (
    finiteNumber(value.difference) &&
    finiteNumber(value.tolerance) &&
    optionalString(value.explanation)
  );
}

function validAuditRecord(stream: AuditRecordStreamV1, record: unknown): record is AuditRecordV1 {
  if (!isObject(record) || record.kind !== stream.kind) return false;
  if (record.kind === 'occurrence') {
    return validOccurrence(record.value) && record.value.id === stream.id;
  }
  return validReconciliation(record.value) && record.value.id === stream.id;
}

function normalizedEntity(entity: AuditEntityReferenceV1 | undefined): {
  readonly kind: string | null;
  readonly id: string | null;
} {
  return entity && NORMALIZED_ENTITY_KINDS.has(entity.kind)
    ? { kind: entity.kind, id: entity.id }
    : { kind: null, id: null };
}

function sourceColumns(source: AuditSourceReferenceV1 | undefined): {
  readonly manifestId: string | null;
  readonly sheetName: string | null;
  readonly cellAddress: string | null;
} {
  if (!source) return { manifestId: null, sheetName: null, cellAddress: null };
  switch (source.kind) {
    case 'file':
      return { manifestId: source.sourceFileManifestId, sheetName: null, cellAddress: null };
    case 'sheet':
      return {
        manifestId: source.sourceFileManifestId,
        sheetName: source.sheetName,
        cellAddress: null,
      };
    case 'cell':
      return {
        manifestId: source.sourceFileManifestId,
        sheetName: source.evidence.provenance.sheetName,
        cellAddress: source.evidence.provenance.cellAddress,
      };
  }
}

interface OccurrenceReferencesV1 {
  readonly entityKind: string | null;
  readonly entityId: string | null;
  readonly sourceManifestId: string | null;
  readonly sourceManifestVersion: number | null;
  readonly sourceSheetName: string | null;
  readonly sourceCellAddress: string | null;
}

interface ReconciliationTargetColumnsV1 {
  readonly targetKind: ReconciliationTargetV1['kind'];
  readonly targetRecordId: string;
  readonly targetStreamKey: string;
}

function transitionFromRow(row: D1RowV1): AuditOccurrenceStateTransitionV1 {
  const previousState = row.previous_state;
  const nextState = row.next_state;
  const base = {
    previousState,
    nextState,
    actorId: rowString(row.actor_id),
    occurredAt: rowString(row.occurred_at),
  };
  if (previousState !== 'open' && previousState !== 'acknowledged') {
    return fail('incompatible-row');
  }
  if (nextState === 'acknowledged') {
    if (previousState !== 'open' || row.justification !== null) return fail('incompatible-row');
    return {
      ...base,
      previousState: 'open',
      nextState,
      ...(row.note === null ? {} : { note: rowString(row.note) }),
    };
  }
  if (nextState === 'resolved' || nextState === 'dismissed-with-reason') {
    if (row.note !== null) return fail('incompatible-row');
    return {
      ...base,
      previousState,
      nextState,
      justification: rowString(row.justification),
    };
  }
  return fail('incompatible-row');
}

function encodeCursor(
  context: AcademicPersistenceContextV1,
  stream: AuditRecordStreamV1,
  version: number,
): string {
  const bytes = new TextEncoder().encode(
    JSON.stringify([1, context.academicYearId, stream.kind, stream.id, version]),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function decodeCursor(
  cursor: string,
  context: AcademicPersistenceContextV1,
  stream: AuditRecordStreamV1,
): number {
  try {
    if (cursor.length === 0 || cursor.length % 2 !== 0 || !/^[0-9a-f]+$/u.test(cursor)) {
      return fail('invalid-cursor');
    }
    const bytes = new Uint8Array(cursor.length / 2);
    for (let index = 0; index < cursor.length; index += 2) {
      bytes[index / 2] = Number.parseInt(cursor.slice(index, index + 2), 16);
    }
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 5 ||
      parsed[0] !== 1 ||
      parsed[1] !== context.academicYearId ||
      parsed[2] !== stream.kind ||
      parsed[3] !== stream.id ||
      !positiveInteger(parsed[4])
    ) {
      return fail('invalid-cursor');
    }
    return parsed[4];
  } catch (cause) {
    if (cause instanceof GradebookD1AuditRepositoryErrorV1) throw cause;
    return fail('invalid-cursor');
  }
}

class GradebookD1AuditRepositoryV1 implements AuditPersistenceRepositoryV1 {
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
      if (cause instanceof GradebookD1AuditRepositoryErrorV1) throw cause;
      throw new GradebookD1AuditRepositoryErrorV1('database-read-failed');
    }
  }

  private async safelyWrite<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (cause) {
      if (cause instanceof GradebookD1AuditRepositoryErrorV1) throw cause;
      throw new GradebookD1AuditRepositoryErrorV1('database-write-failed');
    }
  }

  private async inSavepoint<T>(operation: () => Promise<T>): Promise<T> {
    const name = `gradebook_audit_${String(++this.savepointSequence)}`;
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
          throw new GradebookD1AuditRepositoryErrorV1('database-write-failed');
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
      if (cause instanceof GradebookD1AuditRepositoryErrorV1) throw cause;
      return fail('incompatible-write');
    }
  }

  private async currentVersion(
    context: AcademicPersistenceContextV1,
    stream: AuditRecordStreamV1,
  ): Promise<number | null> {
    const row = await this.database
      .prepare(
        `SELECT current_version FROM audit_record_streams
         WHERE academic_year_id = ? AND audit_kind = ? AND audit_record_id = ?`,
      )
      .bind(context.academicYearId, stream.kind, stream.id)
      .first<D1RowV1>();
    if (!row) return null;
    return positiveInteger(row.current_version)
      ? row.current_version
      : fail('database-write-failed');
  }

  private async transitionRows(
    context: AcademicPersistenceContextV1,
    occurrenceId: string,
  ): Promise<readonly D1RowV1[]> {
    const rows = await this.database
      .prepare(
        `SELECT transition_sequence, previous_state, next_state, actor_id,
                occurred_at, note, justification
         FROM audit_occurrence_transitions
         WHERE academic_year_id = ? AND occurrence_id = ?
         ORDER BY transition_sequence`,
      )
      .bind(context.academicYearId, occurrenceId)
      .all<D1RowV1>();
    rows.results.forEach((row, index) => {
      if (row.transition_sequence !== index + 1) fail('broken-reference');
    });
    return rows.results;
  }

  private async entityExists(
    context: AcademicPersistenceContextV1,
    entity: AuditEntityReferenceV1,
  ): Promise<boolean> {
    if (entity.kind === 'academic-year') {
      const row = await this.database
        .prepare('SELECT academic_year_id FROM academic_years WHERE academic_year_id = ?')
        .bind(context.academicYearId)
        .first<D1RowV1>();
      return row?.academic_year_id === entity.id;
    }
    if (RECORD_KINDS.has(entity.kind)) {
      const row = await this.database
        .prepare(
          `SELECT record_id FROM academic_record_versions
           WHERE academic_year_id = ? AND record_kind = ? AND record_id = ? LIMIT 1`,
        )
        .bind(context.academicYearId, entity.kind, entity.id)
        .first<D1RowV1>();
      return row !== null;
    }
    const row = await this.database
      .prepare(
        `SELECT entity_id FROM academic_entity_streams
         WHERE academic_year_id = ? AND entity_kind = ? AND entity_id = ?`,
      )
      .bind(context.academicYearId, entity.kind, entity.id)
      .first<D1RowV1>();
    return row !== null;
  }

  private async resolveSource(
    context: AcademicPersistenceContextV1,
    source: AuditSourceReferenceV1,
    exactVersion?: number,
  ): Promise<number> {
    const row = await this.database
      .prepare(
        exactVersion === undefined
          ? `SELECT s.current_version AS version, v.file_name, v.sha256
             FROM source_file_streams s
             LEFT JOIN source_file_versions v
               ON v.academic_year_id = s.academic_year_id
              AND v.manifest_id = s.manifest_id
              AND v.version = s.current_version
             WHERE s.academic_year_id = ? AND s.manifest_id = ?`
          : `SELECT version, file_name, sha256
             FROM source_file_versions
             WHERE academic_year_id = ? AND manifest_id = ? AND version = ?`,
      )
      .bind(
        context.academicYearId,
        source.sourceFileManifestId,
        ...(exactVersion === undefined ? [] : [exactVersion]),
      )
      .first<D1RowV1>();
    if (!row || row.file_name === null) return fail('broken-reference');
    if (
      source.kind === 'cell' &&
      (source.evidence.provenance.fileName !== row.file_name ||
        source.evidence.provenance.fileSha256 !== row.sha256)
    ) {
      return fail('broken-reference');
    }
    return rowVersion(row.version);
  }

  private async occurrenceReferences(
    context: AcademicPersistenceContextV1,
    occurrence: AuditOccurrenceV1,
    exactSourceVersion?: number,
  ): Promise<OccurrenceReferencesV1> {
    if (occurrence.importBatchId !== undefined) {
      const row = await this.database
        .prepare(
          `SELECT import_batch_id FROM import_batch_streams
           WHERE academic_year_id = ? AND import_batch_id = ?`,
        )
        .bind(context.academicYearId, occurrence.importBatchId)
        .first<D1RowV1>();
      if (!row) return fail('broken-reference');
    }
    if (occurrence.entity !== undefined && !(await this.entityExists(context, occurrence.entity))) {
      return fail('broken-reference');
    }
    const entity = normalizedEntity(occurrence.entity);
    const source = sourceColumns(occurrence.source);
    const sourceManifestVersion =
      occurrence.source === undefined
        ? null
        : await this.resolveSource(context, occurrence.source, exactSourceVersion);
    return {
      entityKind: entity.kind,
      entityId: entity.id,
      sourceManifestId: source.manifestId,
      sourceManifestVersion,
      sourceSheetName: source.sheetName,
      sourceCellAddress: source.cellAddress,
    };
  }

  private async targetColumns(
    context: AcademicPersistenceContextV1,
    target: ReconciliationTargetV1,
    exactStreamKey?: string,
  ): Promise<ReconciliationTargetColumnsV1> {
    const rows = await this.database
      .prepare(
        `SELECT DISTINCT stream_key FROM academic_record_versions
         WHERE academic_year_id = ? AND record_kind = ? AND record_id = ?
         ORDER BY stream_key`,
      )
      .bind(context.academicYearId, target.kind, target.id)
      .all<D1RowV1>();
    const keys = rows.results.map(({ stream_key }) => rowString(stream_key));
    if (keys.length !== 1 || (exactStreamKey !== undefined && keys[0] !== exactStreamKey)) {
      return fail('broken-reference');
    }
    return { targetKind: target.kind, targetRecordId: target.id, targetStreamKey: keys[0]! };
  }

  private async mapRow(
    row: D1RowV1,
    context: AcademicPersistenceContextV1,
    stream: AuditRecordStreamV1,
    requireAllTransitions: boolean,
  ): Promise<VersionedRecordV1<AuditRecordV1>> {
    if (row.audit_kind !== stream.kind || row.audit_record_id !== stream.id) {
      return fail('incompatible-row');
    }
    const parsed = parseJson(row.payload_json);
    if (!validAuditRecord(stream, parsed)) return fail('incompatible-row');

    if (parsed.kind === 'occurrence') {
      const value = parsed.value;
      const transitions = (await this.transitionRows(context, value.id)).map(transitionFromRow);
      if (
        transitions.length < value.stateHistory.length ||
        (requireAllTransitions && transitions.length !== value.stateHistory.length) ||
        !structurallyEqual(transitions.slice(0, value.stateHistory.length), value.stateHistory)
      ) {
        return fail('invalid-transition-history');
      }
      const references = await this.occurrenceReferences(
        context,
        value,
        row.source_manifest_version === null ? undefined : rowVersion(row.source_manifest_version),
      );
      if (
        row.import_batch_id !== (value.importBatchId ?? null) ||
        row.severity !== value.severity ||
        row.category !== value.category ||
        row.occurrence_state !== value.state ||
        row.reconciliation_status !== null ||
        row.target_kind !== null ||
        row.target_record_id !== null ||
        row.target_stream_key !== null ||
        row.difference !== null ||
        row.tolerance !== null ||
        row.rule_version !== null ||
        row.entity_kind !== references.entityKind ||
        row.entity_id !== references.entityId ||
        row.source_manifest_id !== references.sourceManifestId ||
        row.source_manifest_version !== references.sourceManifestVersion ||
        row.source_sheet_name !== references.sourceSheetName ||
        row.source_cell_address !== references.sourceCellAddress
      ) {
        return fail('incompatible-row');
      }
    } else {
      const value = parsed.value;
      const target = await this.targetColumns(
        context,
        value.target,
        rowString(row.target_stream_key),
      );
      if (
        row.import_batch_id !== null ||
        row.severity !== null ||
        row.category !== null ||
        row.occurrence_state !== null ||
        row.reconciliation_status !== value.status ||
        row.target_kind !== target.targetKind ||
        row.target_record_id !== target.targetRecordId ||
        row.target_stream_key !== target.targetStreamKey ||
        row.difference !== value.difference ||
        row.tolerance !== value.tolerance ||
        row.rule_version !== value.ruleVersion ||
        row.entity_kind !== null ||
        row.entity_id !== null ||
        row.source_manifest_id !== null ||
        row.source_manifest_version !== null ||
        row.source_sheet_name !== null ||
        row.source_cell_address !== null
      ) {
        return fail('incompatible-row');
      }
    }

    return {
      value: parsed,
      version: rowVersion(row.version),
      recordedAt: rowString(row.recorded_at),
    };
  }

  getCurrent(
    context: AcademicPersistenceContextV1,
    stream: AuditRecordStreamV1,
  ): Promise<VersionedRecordV1<AuditRecordV1> | null> {
    if (!nonEmptyString(context.academicYearId) || !nonEmptyString(stream.id)) {
      return Promise.reject(new GradebookD1AuditRepositoryErrorV1('incompatible-row'));
    }
    return this.safelyRead(async () => {
      const row = await this.database
        .prepare(
          `SELECT s.current_version, v.*
           FROM audit_record_streams s
           LEFT JOIN audit_record_versions v
             ON v.academic_year_id = s.academic_year_id
            AND v.audit_kind = s.audit_kind
            AND v.audit_record_id = s.audit_record_id
            AND v.version = s.current_version
           WHERE s.academic_year_id = ? AND s.audit_kind = ? AND s.audit_record_id = ?`,
        )
        .bind(context.academicYearId, stream.kind, stream.id)
        .first<D1RowV1>();
      if (!row) return null;
      if (row.version === null || rowVersion(row.current_version) !== rowVersion(row.version)) {
        return fail('broken-reference');
      }
      return this.mapRow(row, context, stream, true);
    });
  }

  async listVersions(
    context: AcademicPersistenceContextV1,
    stream: AuditRecordStreamV1,
    page: CursorPageRequestV1,
  ): Promise<CursorPageV1<VersionedRecordV1<AuditRecordV1>>> {
    if (
      !nonEmptyString(context.academicYearId) ||
      !nonEmptyString(stream.id) ||
      !isObject(page) ||
      !Number.isInteger(page.limit) ||
      page.limit < 1 ||
      page.limit > this.maximumPageSize
    ) {
      return Promise.reject(new GradebookD1AuditRepositoryErrorV1('invalid-page-request'));
    }
    let afterVersion = 0;
    if (page.cursor !== undefined && page.cursor !== null) {
      if (typeof page.cursor !== 'string') {
        return Promise.reject(new GradebookD1AuditRepositoryErrorV1('invalid-cursor'));
      }
      afterVersion = decodeCursor(page.cursor, context, stream);
    }
    return this.safelyRead(async () => {
      const rows = await this.database
        .prepare(
          `SELECT * FROM audit_record_versions
           WHERE academic_year_id = ? AND audit_kind = ? AND audit_record_id = ?
             AND version > ?
           ORDER BY version
           LIMIT ?`,
        )
        .bind(context.academicYearId, stream.kind, stream.id, afterVersion, page.limit + 1)
        .all<D1RowV1>();
      const selected = rows.results.slice(0, page.limit);
      const items = await Promise.all(
        selected.map((row) => this.mapRow(row, context, stream, false)),
      );
      const last = selected.at(-1);
      return {
        items,
        nextCursor:
          rows.results.length > page.limit && last
            ? encodeCursor(context, stream, rowVersion(last.version))
            : null,
      };
    });
  }

  appendVersion(
    context: AcademicPersistenceContextV1,
    stream: AuditRecordStreamV1,
    record: AuditRecordV1,
    expectation: VersionExpectationV1,
  ): Promise<VersionedWriteResultV1<AuditRecordV1>> {
    if (
      !nonEmptyString(context.academicYearId) ||
      !validAuditRecord(stream, record) ||
      !isObject(expectation) ||
      (expectation.expectedVersion !== null && !positiveInteger(expectation.expectedVersion))
    ) {
      return Promise.reject(new GradebookD1AuditRepositoryErrorV1('incompatible-write'));
    }
    const payloadJson = serialize(record);
    const recordedAt = this.recordedAt();

    return this.inSavepoint(async () => {
      let rootChanges: number;
      if (expectation.expectedVersion === null) {
        rootChanges = changes(
          await this.database
            .prepare(
              `INSERT INTO audit_record_streams (
                 academic_year_id, audit_kind, audit_record_id, current_version, created_at
               ) VALUES (?, ?, ?, 1, ?)
               ON CONFLICT (academic_year_id, audit_kind, audit_record_id) DO NOTHING`,
            )
            .bind(context.academicYearId, stream.kind, stream.id, recordedAt)
            .run(),
        );
      } else {
        rootChanges = changes(
          await this.database
            .prepare(
              `UPDATE audit_record_streams SET current_version = ?
               WHERE academic_year_id = ? AND audit_kind = ?
                 AND audit_record_id = ? AND current_version = ?`,
            )
            .bind(
              expectation.expectedVersion + 1,
              context.academicYearId,
              stream.kind,
              stream.id,
              expectation.expectedVersion,
            )
            .run(),
        );
      }
      if (rootChanges !== 1) {
        return {
          status: 'version-conflict',
          currentVersion: await this.currentVersion(context, stream),
        };
      }

      let previousOccurrence: AuditOccurrenceV1 | null = null;
      let newTransitions: readonly AuditOccurrenceStateTransitionV1[] = [];
      if (record.kind === 'occurrence') {
        if (expectation.expectedVersion !== null) {
          const previousRow = await this.database
            .prepare(
              `SELECT payload_json FROM audit_record_versions
               WHERE academic_year_id = ? AND audit_kind = 'occurrence'
                 AND audit_record_id = ? AND version = ?`,
            )
            .bind(context.academicYearId, stream.id, expectation.expectedVersion)
            .first<D1RowV1>();
          if (!previousRow) return fail('broken-reference');
          const previous = parseJson(previousRow.payload_json);
          if (!validAuditRecord(stream, previous) || previous.kind !== 'occurrence') {
            return fail('incompatible-row');
          }
          previousOccurrence = previous.value;
        }
        const previousHistory = previousOccurrence?.stateHistory ?? [];
        if (
          record.value.stateHistory.length < previousHistory.length ||
          !structurallyEqual(
            record.value.stateHistory.slice(0, previousHistory.length),
            previousHistory,
          )
        ) {
          return fail('invalid-transition-history');
        }
        const persistedTransitions = (await this.transitionRows(context, stream.id)).map(
          transitionFromRow,
        );
        if (!structurallyEqual(persistedTransitions, previousHistory)) {
          return fail('invalid-transition-history');
        }
        newTransitions = record.value.stateHistory.slice(previousHistory.length);
      }

      let occurrenceReferences: OccurrenceReferencesV1 | null = null;
      let target: ReconciliationTargetColumnsV1 | null = null;
      if (record.kind === 'occurrence') {
        occurrenceReferences = await this.occurrenceReferences(context, record.value);
      } else {
        target = await this.targetColumns(context, record.value.target);
      }

      const version = (expectation.expectedVersion ?? 0) + 1;
      const occurrence = record.kind === 'occurrence' ? record.value : null;
      const reconciliation = record.kind === 'reconciliation' ? record.value : null;
      if (
        changes(
          await this.database
            .prepare(
              `INSERT INTO audit_record_versions (
                 academic_year_id, audit_kind, audit_record_id, version, previous_version,
                 import_batch_id, severity, category, occurrence_state,
                 reconciliation_status, target_kind, target_record_id, target_stream_key,
                 difference, tolerance, rule_version, entity_kind, entity_id,
                 source_manifest_id, source_manifest_version,
                 source_sheet_name, source_cell_address, payload_json, recorded_at
               ) VALUES (
                 ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
               )`,
            )
            .bind(
              context.academicYearId,
              stream.kind,
              stream.id,
              version,
              expectation.expectedVersion,
              occurrence?.importBatchId ?? null,
              occurrence?.severity ?? null,
              occurrence?.category ?? null,
              occurrence?.state ?? null,
              reconciliation?.status ?? null,
              target?.targetKind ?? null,
              target?.targetRecordId ?? null,
              target?.targetStreamKey ?? null,
              reconciliation?.difference ?? null,
              reconciliation?.tolerance ?? null,
              reconciliation?.ruleVersion ?? null,
              occurrenceReferences?.entityKind ?? null,
              occurrenceReferences?.entityId ?? null,
              occurrenceReferences?.sourceManifestId ?? null,
              occurrenceReferences?.sourceManifestVersion ?? null,
              occurrenceReferences?.sourceSheetName ?? null,
              occurrenceReferences?.sourceCellAddress ?? null,
              payloadJson,
              recordedAt,
            )
            .run(),
        ) !== 1
      ) {
        return fail('database-write-failed');
      }

      const transitionOffset = previousOccurrence?.stateHistory.length ?? 0;
      for (const [index, transition] of newTransitions.entries()) {
        const isAcknowledgement = transition.nextState === 'acknowledged';
        if (
          changes(
            await this.database
              .prepare(
                `INSERT INTO audit_occurrence_transitions (
                   academic_year_id, occurrence_id, transition_sequence,
                   previous_state, next_state, actor_id, occurred_at, note, justification
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              )
              .bind(
                context.academicYearId,
                stream.id,
                transitionOffset + index + 1,
                transition.previousState,
                transition.nextState,
                transition.actorId,
                transition.occurredAt,
                isAcknowledgement ? (transition.note ?? null) : null,
                isAcknowledgement ? null : transition.justification,
              )
              .run(),
          ) !== 1
        ) {
          return fail('database-write-failed');
        }
      }

      return { status: 'written', record: { value: record, version, recordedAt } };
    });
  }
}

export function createGradebookD1AuditRepositoryV1(
  database: D1WriteDatabaseV1,
  options: GradebookD1AuditRepositoryOptionsV1 = {},
): AuditPersistenceRepositoryV1 {
  const maximumPageSize =
    options.maximumPageSize ?? GRADEBOOK_D1_AUDIT_DEFAULT_MAXIMUM_PAGE_SIZE_V1;
  if (
    !positiveInteger(maximumPageSize) ||
    maximumPageSize > GRADEBOOK_D1_AUDIT_DEFAULT_MAXIMUM_PAGE_SIZE_V1 ||
    (options.now !== undefined && typeof options.now !== 'function')
  ) {
    return fail('invalid-options');
  }
  return new GradebookD1AuditRepositoryV1(
    database,
    options.now ?? (() => new Date().toISOString()),
    maximumPageSize,
  );
}
