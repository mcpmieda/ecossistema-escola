import type { ImportBatchResultV1 } from '../../../../shared/gradebook-contracts/imports/import-contract-v1';
import {
  inspectImportBootstrapTransactionRequestV2,
  type ImportBootstrapTransactionRequestV2,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import type { ImportChangePlanV1 } from './import-reconciliation-v1';
import type { LogicalSourceResolutionResultV2 } from './logical-source-resolution-v2';

export type ImportBootstrapEnvelopeResultV2 =
  | {
      readonly status: 'ready';
      readonly request: ImportBootstrapTransactionRequestV2;
    }
  | {
      readonly status: 'review-required';
      readonly reason:
        | Extract<LogicalSourceResolutionResultV2, { readonly status: 'review-required' }>['reason']
        | 'invalid-bootstrap-plan';
    };

/**
 * Joins only server-built values after planning has completed against pre-write state.
 * The returned envelope is not a browser DTO and must never be accepted over HTTP.
 */
export function createImportBootstrapEnvelopeV2(input: {
  readonly resolution: LogicalSourceResolutionResultV2;
  readonly batch: ImportBatchResultV1;
  readonly plan: ImportChangePlanV1;
}): ImportBootstrapEnvelopeResultV2 {
  if (input.resolution.status === 'review-required') {
    return input.resolution;
  }
  const sourceId = input.resolution.source.id;
  const batchFilesById = new Map(input.batch.files.map((file) => [file.id, file]));
  const plannedSourceFileManifestIds = input.plan.files.flatMap((file) => {
    if (file.sourceFileWrite.kind === 'none') return [];
    return [file.sourceFileWrite.value.manifest.id];
  });
  const sourceRelationsAreCompatible = input.plan.files.every(
    (file) =>
      file.logicalSource.state === 'confirmed' && file.logicalSource.logicalSourceId === sourceId,
  );
  const sourceWritesAreCompatible = input.plan.files.every((file) => {
    if (file.sourceFileWrite.kind === 'none') return true;
    const relation = file.sourceFileWrite.value.logicalSource;
    const batchFile = batchFilesById.get(file.importFileId);
    return (
      relation.state === 'confirmed' &&
      relation.logicalSourceId === sourceId &&
      batchFile?.manifest?.id === file.sourceFileWrite.value.manifest.id
    );
  });
  if (
    input.batch.status !== 'approved' ||
    !['no-changes', 'ready-for-promotion'].includes(input.plan.status) ||
    input.plan.importBatchId !== input.batch.id ||
    input.plan.academicYearId !== input.resolution.source.academicYearId ||
    input.plan.expectedBatchVersion !== 1 ||
    input.plan.files.length !== input.batch.files.length ||
    input.plan.files.some((file) => !batchFilesById.has(file.importFileId)) ||
    !sourceRelationsAreCompatible ||
    !sourceWritesAreCompatible
  ) {
    return { status: 'review-required', reason: 'invalid-bootstrap-plan' };
  }

  const request = {
    logicalSource: {
      kind: input.resolution.status === 'new-source' ? 'create' : 'reuse',
      value: input.resolution.source,
    },
    plannedSourceFileManifestIds,
    batchWrite: {
      value: input.batch,
      expectedVersion: null,
    },
    promotionRequest: input.plan.promotionRequest,
  } as const satisfies ImportBootstrapTransactionRequestV2;
  const inspection = inspectImportBootstrapTransactionRequestV2(
    { academicYearId: input.plan.academicYearId },
    request,
  );
  return inspection === 'ready'
    ? { status: 'ready', request }
    : { status: 'review-required', reason: 'invalid-bootstrap-plan' };
}

export const IMPORT_BOOTSTRAP_WRITE_ORDER_V2 = [
  'logical-source-if-new',
  'planned-source-file-version',
  'import-batch-version',
  'assessment-component-version',
  'academic-record-version',
  'logical-source-record-association-version',
] as const;
