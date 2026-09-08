import {
  GRADEBOOK_IMPORT_KNOWN_CONTENT_OPERATION_V1,
  GRADEBOOK_IMPORT_KNOWN_CONTENT_VERSION_V1,
  isGradebookImportKnownContentResponseV1,
  type GradebookImportKnownContentObservationV1,
  type GradebookImportKnownContentResponseV1,
} from '../../../../shared/gradebook-contracts/imports/import-known-content-transport-v1';

export async function inspectGradebookImportKnownContentV1(
  items: readonly GradebookImportKnownContentObservationV1[],
): Promise<GradebookImportKnownContentResponseV1> {
  try {
    const response = await fetch('/api/gradebook/import-known-content', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transportVersion: GRADEBOOK_IMPORT_KNOWN_CONTENT_VERSION_V1,
        operation: GRADEBOOK_IMPORT_KNOWN_CONTENT_OPERATION_V1,
        items,
      }),
    });
    const value: unknown = await response.json();
    if (!isGradebookImportKnownContentResponseV1(value)) {
      return { transportVersion: 1, state: 'unavailable' };
    }
    return value;
  } catch {
    return { transportVersion: 1, state: 'unavailable' };
  }
}
