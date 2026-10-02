import type { SourceFileManifestV1 } from '../../../../shared/gradebook-contracts/imports/import-contract-v1';
import type { WorkbookReadTimingV1, WorkbookSummaryWithRelationV9 } from './workbook-reader';

export interface WorkbookWorkerTaskV1 {
  readonly version: 1;
  readonly kind: 'read';
  readonly generation: number;
  readonly sourceFileIndex: number;
  readonly taskId: number;
  readonly file: File;
  readonly data: ArrayBuffer;
  readonly manifest: SourceFileManifestV1;
  readonly captureValues: boolean;
}
export type WorkbookWorkerResponseV1 =
  | {
      readonly version: 1;
      readonly kind: 'ready';
      readonly libraryVersion: string;
      readonly libraryMs: number;
    }
  | { readonly version: 1; readonly kind: 'initialization-failed'; readonly security: boolean }
  | (Pick<WorkbookWorkerTaskV1, 'generation' | 'sourceFileIndex' | 'taskId' | 'version'> &
      (
        | {
            readonly kind: 'result';
            readonly summary: WorkbookSummaryWithRelationV9;
            readonly timing: WorkbookReadTimingV1 | null;
          }
        | {
            readonly kind: 'failure';
            readonly message: string;
            readonly timing: WorkbookReadTimingV1 | null;
          }
      ));

export interface WorkbookLocalReadResultV1 {
  readonly summary: WorkbookSummaryWithRelationV9;
  readonly timing: WorkbookReadTimingV1 | null;
}
export type WorkbookWorkerFallbackV1 =
  | 'unavailable'
  | 'initialization'
  | 'initialization-timeout'
  | 'crash'
  | 'message-error'
  | 'task-timeout';
export interface WorkbookLocalExecutorV1 {
  readonly concurrency: 1 | 2;
  readonly inputByteBudget: number;
  read(
    file: File,
    data: ArrayBuffer,
    manifest: SourceFileManifestV1,
    sourceFileIndex: number,
    captureValues: boolean,
    onTiming: (timing: WorkbookReadTimingV1) => void,
  ): Promise<WorkbookSummaryWithRelationV9>;
}
