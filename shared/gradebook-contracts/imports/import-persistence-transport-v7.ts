import {
  inspectGradebookImportPersistenceRequestV6,
  isGradebookImportPersistenceRequestV6,
  isGradebookImportPersistenceResponseV6,
  type GradebookImportPersistenceRequestV6,
  type GradebookImportPersistenceResponseV6,
} from './import-persistence-transport-v6';

export const GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V7 = 7 as const;
export const GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V7 = 'persist-recognized-batch-v7' as const;

export const GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V7 = {
  maxFilesPerRequest: 50,
  maxBodyBytes: 33_554_432,
} as const;

export type GradebookImportPersistenceBatchRequestInspectionV7 =
  | 'ready'
  | 'invalid-request'
  | 'payload-too-large';

export type GradebookImportPersistenceFailureCategoryV7 =
  | 'none'
  | 'cas-conflict'
  | 'operational'
  | 'authorization'
  | 'request'
  | 'academic-review';

export interface GradebookImportPersistenceBatchRequestV7 {
  readonly transportVersion: typeof GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V7;
  readonly operation: typeof GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V7;
  readonly requests: readonly GradebookImportPersistenceRequestV6[];
}

export interface GradebookImportPersistenceBatchItemResultV7 {
  readonly index: number;
  readonly attempts: 1 | 2;
  readonly totalMs: number;
  readonly failureCategory: GradebookImportPersistenceFailureCategoryV7;
  readonly response: GradebookImportPersistenceResponseV6;
}

export type GradebookImportPersistenceBatchResponseV7 =
  | {
      readonly transportVersion: typeof GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V7;
      readonly state: 'completed' | 'partial' | 'not-authorized';
      readonly items: readonly GradebookImportPersistenceBatchItemResultV7[];
      readonly pendingFromIndex: number | null;
      readonly totalMs: number;
    }
  | {
      readonly transportVersion: typeof GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V7;
      readonly state: 'invalid-request';
      readonly reason: 'invalid-request' | 'payload-too-large';
    }
  | {
      readonly transportVersion: typeof GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V7;
      readonly state: 'unavailable';
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function serializedByteLength(value: unknown): number | null {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return null;
  }
}

function nonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validFailureCategory(value: unknown): value is GradebookImportPersistenceFailureCategoryV7 {
  return (
    value === 'none' ||
    value === 'cas-conflict' ||
    value === 'operational' ||
    value === 'authorization' ||
    value === 'request' ||
    value === 'academic-review'
  );
}

export function inspectGradebookImportPersistenceBatchRequestV7(
  value: unknown,
): GradebookImportPersistenceBatchRequestInspectionV7 {
  const bytes = serializedByteLength(value);
  if (bytes === null) return 'invalid-request';
  if (bytes > GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V7.maxBodyBytes) return 'payload-too-large';
  if (
    !isRecord(value) ||
    value.transportVersion !== GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V7 ||
    value.operation !== GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V7 ||
    !Array.isArray(value.requests) ||
    value.requests.length === 0
  ) {
    return 'invalid-request';
  }
  if (value.requests.length > GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V7.maxFilesPerRequest) {
    return 'payload-too-large';
  }
  for (const request of value.requests) {
    const inspection = inspectGradebookImportPersistenceRequestV6(request);
    if (inspection === 'payload-too-large') return 'payload-too-large';
    if (inspection !== 'ready' || !isGradebookImportPersistenceRequestV6(request)) {
      return 'invalid-request';
    }
  }
  return 'ready';
}

export function isGradebookImportPersistenceBatchRequestV7(
  value: unknown,
): value is GradebookImportPersistenceBatchRequestV7 {
  return inspectGradebookImportPersistenceBatchRequestV7(value) === 'ready';
}

function isItemResult(value: unknown): value is GradebookImportPersistenceBatchItemResultV7 {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.index) &&
    Number(value.index) >= 0 &&
    (value.attempts === 1 || value.attempts === 2) &&
    nonNegativeFinite(value.totalMs) &&
    validFailureCategory(value.failureCategory) &&
    isGradebookImportPersistenceResponseV6(value.response)
  );
}

export function isGradebookImportPersistenceBatchResponseV7(
  value: unknown,
): value is GradebookImportPersistenceBatchResponseV7 {
  if (!isRecord(value) || value.transportVersion !== GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V7) {
    return false;
  }
  if (value.state === 'invalid-request') {
    return value.reason === 'invalid-request' || value.reason === 'payload-too-large';
  }
  if (value.state === 'unavailable') return true;
  if (value.state !== 'completed' && value.state !== 'partial' && value.state !== 'not-authorized') {
    return false;
  }
  if (
    !Array.isArray(value.items) ||
    !value.items.every(isItemResult) ||
    !nonNegativeFinite(value.totalMs) ||
    (value.pendingFromIndex !== null &&
      (!Number.isSafeInteger(value.pendingFromIndex) || Number(value.pendingFromIndex) < 0))
  ) {
    return false;
  }
  for (const [position, item] of value.items.entries()) {
    if (item.index !== position) return false;
  }
  if (value.state === 'not-authorized') {
    return value.pendingFromIndex !== null && value.pendingFromIndex < value.items.length + 1;
  }
  return value.pendingFromIndex === null;
}

export const GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_V7 = {
  version: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V7,
  operation: GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V7,
  unit: 'bounded-recognized-source-file-batch',
  itemContract: 6,
  bounds: GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V7,
  commitOrdering: 'strictly-sequential-independent-per-file',
  retry: 'at-most-once-after-operational-unavailable-with-fresh-replan',
  browserStorage: 'memory-only',
} as const;
