import type {
  AuditWorkspaceCursorV1,
  AuditWorkspaceFiltersV1,
  AuditWorkspaceImportBatchListItemV1,
  AuditWorkspaceListRequestV1,
  AuditWorkspaceOccurrenceListItemV1,
  AuditWorkspaceReconciliationListItemV1,
} from '../../../../../shared/gradebook-contracts/audit-workspace/audit-workspace-contract-v1';
import {
  AUDIT_OCCURRENCE_STATES_V1,
  AUDIT_SEVERITIES_V1,
  RECONCILIATION_STATUSES_V1,
  type AuditOccurrenceId,
  type AuditOccurrenceStateV1,
  type AuditSeverityV1,
  type ReconciliationResultId,
  type ReconciliationStatusV1,
  type ReconciliationTargetV1,
} from '../../../../../shared/gradebook-contracts/audit/audit-contract-v1';
import { IMPORT_BATCH_STATUSES_V1 } from '../../../../../shared/gradebook-contracts/imports/import-contract-v1';
import type { ImportBatchId } from '../../../../../shared/gradebook-contracts/imports/import-ids-v1';
import type { AcademicPersistenceContextV1 } from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  AuditWorkspaceSourceErrorV1,
  type AuditWorkspaceSourcePageV1,
  type AuditWorkspaceSourceV1,
} from '../../../application/audit-workspace/audit-workspace-source-v1';
import type { D1WriteDatabaseV1, D1WriteValueV1 } from '../write/d1-write-adapter-v1';

interface CursorPositionV1 {
  readonly timestamp: string;
  readonly id: string;
}

interface EncodedCursorV1 {
  readonly version: 1;
  readonly scope: string;
  readonly timestamp: string;
  readonly id: string;
}

interface BatchRowV1 {
  readonly [key: string]: unknown;
  readonly item_id: string;
  readonly item_status: string;
  readonly item_received_at: string;
  readonly item_updated_at: string;
}

interface OccurrenceRowV1 {
  readonly [key: string]: unknown;
  readonly item_id: string;
  readonly import_batch_id: string | null;
  readonly item_state: string;
  readonly item_severity: string;
  readonly item_category: string;
  readonly item_created_at: string;
}

interface ReconciliationRowV1 {
  readonly [key: string]: unknown;
  readonly item_id: string;
  readonly item_status: string;
  readonly target_kind: string;
  readonly target_record_id: string;
  readonly rule_version: string;
  readonly item_recorded_at: string;
}

function fail(code: ConstructorParameters<typeof AuditWorkspaceSourceErrorV1>[0]): never {
  throw new AuditWorkspaceSourceErrorV1(code);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64UrlDecode(value: string): string {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function scopeHash(value: string): string {
  let hash = 14_695_981_039_346_656_037n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 1_099_511_628_211n);
  }
  return hash.toString(16).padStart(16, '0');
}

function canonicalFilters(filters: AuditWorkspaceFiltersV1): unknown {
  return {
    importBatchId: filters.importBatchId ?? null,
    importBatchStatuses:
      filters.importBatchStatuses === undefined ? null : [...filters.importBatchStatuses].sort(),
    occurrenceStates:
      filters.occurrenceStates === undefined ? null : [...filters.occurrenceStates].sort(),
    severities: filters.severities === undefined ? null : [...filters.severities].sort(),
    categories: filters.categories === undefined ? null : [...filters.categories].sort(),
    recordTypes: filters.recordTypes === undefined ? null : [...filters.recordTypes].sort(),
    reconciliationStatuses:
      filters.reconciliationStatuses === undefined
        ? null
        : [...filters.reconciliationStatuses].sort(),
    period: filters.period ?? null,
  };
}

function requestScope(request: AuditWorkspaceListRequestV1): string {
  return scopeHash(
    JSON.stringify({
      contractVersion: request.contractVersion,
      academicYearId: request.academicYearId,
      collection: request.collection,
      order: request.order,
      filters: canonicalFilters(request.filters),
    }),
  );
}

function decodeCursor(request: AuditWorkspaceListRequestV1): CursorPositionV1 | null {
  if (request.page.cursor === null) return null;
  try {
    const decoded = JSON.parse(base64UrlDecode(request.page.cursor)) as unknown;
    if (
      decoded === null ||
      typeof decoded !== 'object' ||
      Array.isArray(decoded) ||
      Object.keys(decoded).length !== 4
    ) {
      return fail('invalid-cursor');
    }
    const cursor = decoded as Partial<EncodedCursorV1>;
    if (
      cursor.version !== 1 ||
      cursor.scope !== requestScope(request) ||
      !nonEmptyString(cursor.timestamp) ||
      !nonEmptyString(cursor.id)
    ) {
      return fail('invalid-cursor');
    }
    return { timestamp: cursor.timestamp, id: cursor.id };
  } catch (error) {
    if (error instanceof AuditWorkspaceSourceErrorV1) throw error;
    return fail('invalid-cursor');
  }
}

function encodeCursor(
  request: AuditWorkspaceListRequestV1,
  position: CursorPositionV1,
): AuditWorkspaceCursorV1 {
  const value: EncodedCursorV1 = {
    version: 1,
    scope: requestScope(request),
    timestamp: position.timestamp,
    id: position.id,
  };
  return base64UrlEncode(JSON.stringify(value)) as AuditWorkspaceCursorV1;
}

function appendIn(
  conditions: string[],
  values: D1WriteValueV1[],
  column: string,
  candidates: readonly string[] | undefined,
): void {
  if (candidates === undefined) return;
  conditions.push(`${column} IN (${candidates.map(() => '?').join(', ')})`);
  values.push(...candidates);
}

function appendPeriod(
  conditions: string[],
  values: D1WriteValueV1[],
  column: string,
  filters: AuditWorkspaceFiltersV1,
): void {
  if (filters.period?.fromInclusive !== null && filters.period?.fromInclusive !== undefined) {
    conditions.push(`${column} >= ?`);
    values.push(filters.period.fromInclusive);
  }
  if (filters.period?.toExclusive !== null && filters.period?.toExclusive !== undefined) {
    conditions.push(`${column} < ?`);
    values.push(filters.period.toExclusive);
  }
}

function appendPosition(
  conditions: string[],
  values: D1WriteValueV1[],
  timestampColumn: string,
  idColumn: string,
  position: CursorPositionV1 | null,
): void {
  if (position === null) return;
  conditions.push(`(${timestampColumn} < ? OR (${timestampColumn} = ? AND ${idColumn} > ?))`);
  values.push(position.timestamp, position.timestamp, position.id);
}

function hasAny(
  filters: AuditWorkspaceFiltersV1,
  keys: readonly (keyof AuditWorkspaceFiltersV1)[],
): boolean {
  return keys.some((key) => filters[key] !== undefined);
}

function ensureAllowed<T extends string>(value: string, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) return fail('insufficient-data');
  return value as T;
}

function batchItem(row: BatchRowV1): AuditWorkspaceImportBatchListItemV1 {
  if (
    !nonEmptyString(row.item_id) ||
    !nonEmptyString(row.item_received_at) ||
    !nonEmptyString(row.item_updated_at)
  ) {
    return fail('insufficient-data');
  }
  return {
    kind: 'import-batch',
    reference: { kind: 'import-batch', id: row.item_id as ImportBatchId },
    status: ensureAllowed(row.item_status, IMPORT_BATCH_STATUSES_V1),
    receivedAt: row.item_received_at,
    updatedAt: row.item_updated_at,
  };
}

function occurrenceItem(row: OccurrenceRowV1): AuditWorkspaceOccurrenceListItemV1 {
  if (
    !nonEmptyString(row.item_id) ||
    !nonEmptyString(row.item_category) ||
    !nonEmptyString(row.item_created_at) ||
    (row.import_batch_id !== null && !nonEmptyString(row.import_batch_id))
  ) {
    return fail('insufficient-data');
  }
  return {
    kind: 'audit-occurrence',
    reference: { kind: 'audit-occurrence', id: row.item_id as AuditOccurrenceId },
    ...(row.import_batch_id === null
      ? {}
      : { importBatchId: row.import_batch_id as ImportBatchId }),
    state: ensureAllowed<AuditOccurrenceStateV1>(row.item_state, AUDIT_OCCURRENCE_STATES_V1),
    severity: ensureAllowed<AuditSeverityV1>(row.item_severity, AUDIT_SEVERITIES_V1),
    category: row.item_category,
    createdAt: row.item_created_at,
  };
}

const TARGET_KINDS = ['grade-entry', 'term-result', 'final-recovery', 'annual-result'] as const;

function reconciliationItem(row: ReconciliationRowV1): AuditWorkspaceReconciliationListItemV1 {
  if (
    !nonEmptyString(row.item_id) ||
    !nonEmptyString(row.target_record_id) ||
    !nonEmptyString(row.rule_version) ||
    !nonEmptyString(row.item_recorded_at)
  ) {
    return fail('insufficient-data');
  }
  const targetKind = ensureAllowed<ReconciliationTargetV1['kind']>(row.target_kind, TARGET_KINDS);
  return {
    kind: 'reconciliation',
    reference: { kind: 'reconciliation', id: row.item_id as ReconciliationResultId },
    status: ensureAllowed<ReconciliationStatusV1>(row.item_status, RECONCILIATION_STATUSES_V1),
    target: { kind: targetKind, id: row.target_record_id } as ReconciliationTargetV1,
    ruleVersion: row.rule_version,
    recordedAt: row.item_recorded_at,
  };
}

export class GradebookD1AuditWorkspaceSourceV1 implements AuditWorkspaceSourceV1 {
  constructor(private readonly database: D1WriteDatabaseV1) {}

  async list(request: AuditWorkspaceListRequestV1): Promise<AuditWorkspaceSourcePageV1> {
    const position = decodeCursor(request);
    try {
      switch (request.collection) {
        case 'import-batches':
          return await this.listBatches(request, position);
        case 'audit-occurrences':
          return await this.listOccurrences(request, position);
        case 'reconciliations':
          return await this.listReconciliations(request, position);
      }
    } catch (error) {
      if (error instanceof AuditWorkspaceSourceErrorV1) throw error;
      return fail('unavailable');
    }
  }

  async listPendingOccurrenceIdsForImportBatch(
    context: AcademicPersistenceContextV1,
    importBatchId: ImportBatchId,
  ): Promise<readonly AuditOccurrenceId[]> {
    try {
      const result = await this.database
        .prepare(
          `SELECT s.audit_record_id AS item_id
             FROM audit_record_streams AS s
             JOIN audit_record_versions AS v
               ON v.academic_year_id = s.academic_year_id
              AND v.audit_kind = s.audit_kind
              AND v.audit_record_id = s.audit_record_id
              AND v.version = s.current_version
            WHERE s.academic_year_id = ?
              AND s.audit_kind = 'occurrence'
              AND v.import_batch_id = ?
              AND v.occurrence_state IN ('open', 'acknowledged')
            ORDER BY s.audit_record_id ASC`,
        )
        .bind(context.academicYearId, importBatchId)
        .all<{ readonly item_id: string }>();
      return result.results.map((row) => {
        if (!nonEmptyString(row.item_id)) return fail('insufficient-data');
        return row.item_id as AuditOccurrenceId;
      });
    } catch (error) {
      if (error instanceof AuditWorkspaceSourceErrorV1) throw error;
      return fail('unavailable');
    }
  }

  private async listBatches(
    request: Extract<AuditWorkspaceListRequestV1, { readonly collection: 'import-batches' }>,
    position: CursorPositionV1 | null,
  ): Promise<AuditWorkspaceSourcePageV1> {
    const conditions = ['s.academic_year_id = ?'];
    const values: D1WriteValueV1[] = [request.academicYearId];
    if (request.filters.importBatchId !== undefined) {
      conditions.push('s.import_batch_id = ?');
      values.push(request.filters.importBatchId);
    }
    appendIn(conditions, values, 'v.status', request.filters.importBatchStatuses);
    appendPeriod(conditions, values, 'v.updated_at', request.filters);
    if (
      hasAny(request.filters, [
        'occurrenceStates',
        'severities',
        'categories',
        'recordTypes',
        'reconciliationStatuses',
      ])
    ) {
      conditions.push('1 = 0');
    }
    appendPosition(conditions, values, 'v.updated_at', 's.import_batch_id', position);
    values.push(request.page.limit + 1);
    const result = await this.database
      .prepare(
        `SELECT s.import_batch_id AS item_id,
                v.status AS item_status,
                v.received_at AS item_received_at,
                v.updated_at AS item_updated_at
           FROM import_batch_streams AS s
           JOIN import_batch_versions AS v
             ON v.academic_year_id = s.academic_year_id
            AND v.import_batch_id = s.import_batch_id
            AND v.version = s.current_version
          WHERE ${conditions.join('\n            AND ')}
          ORDER BY v.updated_at DESC, s.import_batch_id ASC
          LIMIT ?`,
      )
      .bind(...values)
      .all<BatchRowV1>();
    const items = result.results.slice(0, request.page.limit).map(batchItem);
    const last = items.at(-1);
    return {
      collection: 'import-batches',
      items,
      nextCursor:
        result.results.length > request.page.limit && last !== undefined
          ? encodeCursor(request, { timestamp: last.updatedAt, id: last.reference.id })
          : null,
    };
  }

  private async listOccurrences(
    request: Extract<AuditWorkspaceListRequestV1, { readonly collection: 'audit-occurrences' }>,
    position: CursorPositionV1 | null,
  ): Promise<AuditWorkspaceSourcePageV1> {
    const createdAt = `json_extract(v.payload_json, '$.value.createdAt')`;
    const conditions = ['s.academic_year_id = ?', "s.audit_kind = 'occurrence'"];
    const values: D1WriteValueV1[] = [request.academicYearId];
    if (request.filters.importBatchId !== undefined) {
      conditions.push('v.import_batch_id = ?');
      values.push(request.filters.importBatchId);
    }
    appendIn(conditions, values, 'v.occurrence_state', request.filters.occurrenceStates);
    appendIn(conditions, values, 'v.severity', request.filters.severities);
    appendIn(conditions, values, 'v.category', request.filters.categories);
    appendPeriod(conditions, values, createdAt, request.filters);
    if (hasAny(request.filters, ['importBatchStatuses', 'recordTypes', 'reconciliationStatuses'])) {
      conditions.push('1 = 0');
    }
    appendPosition(conditions, values, createdAt, 's.audit_record_id', position);
    values.push(request.page.limit + 1);
    const result = await this.database
      .prepare(
        `SELECT s.audit_record_id AS item_id,
                v.import_batch_id,
                v.occurrence_state AS item_state,
                v.severity AS item_severity,
                v.category AS item_category,
                ${createdAt} AS item_created_at
           FROM audit_record_streams AS s
           JOIN audit_record_versions AS v
             ON v.academic_year_id = s.academic_year_id
            AND v.audit_kind = s.audit_kind
            AND v.audit_record_id = s.audit_record_id
            AND v.version = s.current_version
          WHERE ${conditions.join('\n            AND ')}
          ORDER BY ${createdAt} DESC, s.audit_record_id ASC
          LIMIT ?`,
      )
      .bind(...values)
      .all<OccurrenceRowV1>();
    const items = result.results.slice(0, request.page.limit).map(occurrenceItem);
    const last = items.at(-1);
    return {
      collection: 'audit-occurrences',
      items,
      nextCursor:
        result.results.length > request.page.limit && last !== undefined
          ? encodeCursor(request, { timestamp: last.createdAt, id: last.reference.id })
          : null,
    };
  }

  private async listReconciliations(
    request: Extract<AuditWorkspaceListRequestV1, { readonly collection: 'reconciliations' }>,
    position: CursorPositionV1 | null,
  ): Promise<AuditWorkspaceSourcePageV1> {
    const conditions = ['s.academic_year_id = ?', "s.audit_kind = 'reconciliation'"];
    const values: D1WriteValueV1[] = [request.academicYearId];
    appendIn(conditions, values, 'v.target_kind', request.filters.recordTypes);
    appendIn(conditions, values, 'v.reconciliation_status', request.filters.reconciliationStatuses);
    appendPeriod(conditions, values, 'v.recorded_at', request.filters);
    if (
      hasAny(request.filters, [
        'importBatchId',
        'importBatchStatuses',
        'occurrenceStates',
        'severities',
        'categories',
      ])
    ) {
      conditions.push('1 = 0');
    }
    appendPosition(conditions, values, 'v.recorded_at', 's.audit_record_id', position);
    values.push(request.page.limit + 1);
    const result = await this.database
      .prepare(
        `SELECT s.audit_record_id AS item_id,
                v.reconciliation_status AS item_status,
                v.target_kind,
                v.target_record_id,
                v.rule_version,
                v.recorded_at AS item_recorded_at
           FROM audit_record_streams AS s
           JOIN audit_record_versions AS v
             ON v.academic_year_id = s.academic_year_id
            AND v.audit_kind = s.audit_kind
            AND v.audit_record_id = s.audit_record_id
            AND v.version = s.current_version
          WHERE ${conditions.join('\n            AND ')}
          ORDER BY v.recorded_at DESC, s.audit_record_id ASC
          LIMIT ?`,
      )
      .bind(...values)
      .all<ReconciliationRowV1>();
    const items = result.results.slice(0, request.page.limit).map(reconciliationItem);
    const last = items.at(-1);
    return {
      collection: 'reconciliations',
      items,
      nextCursor:
        result.results.length > request.page.limit && last !== undefined
          ? encodeCursor(request, { timestamp: last.recordedAt, id: last.reference.id })
          : null,
    };
  }
}

export function createGradebookD1AuditWorkspaceSourceV1(
  database: D1WriteDatabaseV1,
): AuditWorkspaceSourceV1 {
  return new GradebookD1AuditWorkspaceSourceV1(database);
}
