export const GRADEBOOK_IMPORT_KNOWN_CONTENT_VERSION_V1 = 1 as const;
export const GRADEBOOK_IMPORT_KNOWN_CONTENT_OPERATION_V1 = 'inspect-known-content' as const;
export const GRADEBOOK_IMPORT_KNOWN_CONTENT_MAX_ITEMS_V1 = 50;

export interface GradebookImportKnownContentObservationV1 {
  readonly academicYearId: string;
  readonly fileName: string;
  readonly extension: 'xlsb' | 'xlsx' | 'xls';
  readonly reportedMimeType: string | null;
  readonly sizeBytes: number;
  readonly lastModifiedAt: string | null;
  readonly sha256: string;
  readonly sourceContractVersion: number;
  readonly parserVersion: string;
}

export interface GradebookImportKnownContentRequestV1 {
  readonly transportVersion: typeof GRADEBOOK_IMPORT_KNOWN_CONTENT_VERSION_V1;
  readonly operation: typeof GRADEBOOK_IMPORT_KNOWN_CONTENT_OPERATION_V1;
  readonly items: readonly GradebookImportKnownContentObservationV1[];
}

export type GradebookImportKnownContentResponseV1 =
  | {
      readonly transportVersion: typeof GRADEBOOK_IMPORT_KNOWN_CONTENT_VERSION_V1;
      readonly state: 'ready';
      readonly known: readonly boolean[];
    }
  | {
      readonly transportVersion: typeof GRADEBOOK_IMPORT_KNOWN_CONTENT_VERSION_V1;
      readonly state: 'not-authorized' | 'invalid-request' | 'unavailable';
    };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function observation(value: unknown): value is GradebookImportKnownContentObservationV1 {
  if (!record(value)) return false;
  return (
    typeof value.academicYearId === 'string' &&
    value.academicYearId.length > 0 &&
    value.academicYearId.length <= 200 &&
    typeof value.fileName === 'string' &&
    value.fileName.length > 0 &&
    value.fileName.length <= 260 &&
    (value.extension === 'xlsb' || value.extension === 'xlsx' || value.extension === 'xls') &&
    (value.reportedMimeType === null ||
      (typeof value.reportedMimeType === 'string' && value.reportedMimeType.length <= 200)) &&
    typeof value.sizeBytes === 'number' &&
    Number.isSafeInteger(value.sizeBytes) &&
    value.sizeBytes >= 0 &&
    (value.lastModifiedAt === null ||
      (typeof value.lastModifiedAt === 'string' &&
        !Number.isNaN(Date.parse(value.lastModifiedAt)))) &&
    typeof value.sha256 === 'string' &&
    /^[0-9a-f]{64}$/u.test(value.sha256) &&
    typeof value.sourceContractVersion === 'number' &&
    Number.isSafeInteger(value.sourceContractVersion) &&
    value.sourceContractVersion >= 1 &&
    typeof value.parserVersion === 'string' &&
    value.parserVersion.length > 0 &&
    value.parserVersion.length <= 128
  );
}

export function isGradebookImportKnownContentRequestV1(
  value: unknown,
): value is GradebookImportKnownContentRequestV1 {
  return (
    record(value) &&
    value.transportVersion === GRADEBOOK_IMPORT_KNOWN_CONTENT_VERSION_V1 &&
    value.operation === GRADEBOOK_IMPORT_KNOWN_CONTENT_OPERATION_V1 &&
    Array.isArray(value.items) &&
    value.items.length > 0 &&
    value.items.length <= GRADEBOOK_IMPORT_KNOWN_CONTENT_MAX_ITEMS_V1 &&
    value.items.every(observation)
  );
}

export function isGradebookImportKnownContentResponseV1(
  value: unknown,
): value is GradebookImportKnownContentResponseV1 {
  if (!record(value) || value.transportVersion !== GRADEBOOK_IMPORT_KNOWN_CONTENT_VERSION_V1) {
    return false;
  }
  if (
    value.state === 'not-authorized' ||
    value.state === 'invalid-request' ||
    value.state === 'unavailable'
  ) {
    return true;
  }
  return (
    value.state === 'ready' &&
    Array.isArray(value.known) &&
    value.known.every((item) => typeof item === 'boolean')
  );
}
