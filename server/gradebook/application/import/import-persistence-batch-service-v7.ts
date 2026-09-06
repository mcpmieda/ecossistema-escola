import {
  GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V7,
  type GradebookImportPersistenceBatchItemResultV7,
  type GradebookImportPersistenceBatchRequestV7,
  type GradebookImportPersistenceBatchResponseV7,
  type GradebookImportPersistenceFailureCategoryV7,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v7';
import type {
  GradebookImportPersistenceRequestV6,
  GradebookImportPersistenceResponseV6,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';

export interface GradebookImportPersistenceBatchExecutorV7 {
  execute(request: GradebookImportPersistenceRequestV6): Promise<GradebookImportPersistenceResponseV6>;
}

export interface GradebookImportPersistenceBatchRuntimeV7 {
  readonly nowMs?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const RETRY_DELAY_MS_V7 = 200;
const MAX_RETRY_FIRST_ATTEMPT_MS_V7 = 12_000;

function failureCategory(
  response: GradebookImportPersistenceResponseV6,
): GradebookImportPersistenceFailureCategoryV7 {
  switch (response.state) {
    case 'conflict':
      return 'cas-conflict';
    case 'unavailable':
      return 'operational';
    case 'not-authorized':
      return 'authorization';
    case 'invalid-request':
      return 'request';
    case 'review-required':
    case 'blocked':
      return 'academic-review';
    case 'applied':
    case 'no-changes':
      return 'none';
  }
}

function successful(response: GradebookImportPersistenceResponseV6): boolean {
  return response.state === 'applied' || response.state === 'no-changes';
}

function unavailable(): GradebookImportPersistenceResponseV6 {
  return { transportVersion: 6, state: 'unavailable' };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createGradebookImportPersistenceBatchServiceV7(
  createExecutor: () => GradebookImportPersistenceBatchExecutorV7,
  runtime: GradebookImportPersistenceBatchRuntimeV7 = {},
) {
  const nowMs = runtime.nowMs ?? Date.now;
  const sleep = runtime.sleep ?? defaultSleep;

  return {
    async execute(
      request: GradebookImportPersistenceBatchRequestV7,
    ): Promise<GradebookImportPersistenceBatchResponseV7> {
      const batchStartedAt = nowMs();
      const items: GradebookImportPersistenceBatchItemResultV7[] = [];
      let partial = false;

      for (const [index, itemRequest] of request.requests.entries()) {
        const itemStartedAt = nowMs();
        let attempts: 1 | 2 = 1;
        let firstAttemptMs = 0;
        let response: GradebookImportPersistenceResponseV6;
        try {
          const firstStartedAt = nowMs();
          response = await createExecutor().execute(itemRequest);
          firstAttemptMs = nowMs() - firstStartedAt;
        } catch {
          response = unavailable();
          firstAttemptMs = nowMs() - itemStartedAt;
        }

        if (
          response.state === 'unavailable' &&
          firstAttemptMs <= MAX_RETRY_FIRST_ATTEMPT_MS_V7
        ) {
          attempts = 2;
          await sleep(RETRY_DELAY_MS_V7);
          try {
            response = await createExecutor().execute(itemRequest);
          } catch {
            response = unavailable();
          }
        }

        const result: GradebookImportPersistenceBatchItemResultV7 = {
          index,
          attempts,
          totalMs: Math.max(0, nowMs() - itemStartedAt),
          failureCategory: failureCategory(response),
          response,
        };
        items.push(result);

        if (response.state === 'not-authorized') {
          const value: GradebookImportPersistenceBatchResponseV7 = {
            transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V7,
            state: 'not-authorized',
            items,
            pendingFromIndex: index,
            totalMs: Math.max(0, nowMs() - batchStartedAt),
          };
          console.info(
            '[gradebook-import-batch-v7]',
            JSON.stringify({
              state: value.state,
              totalMs: value.totalMs,
              itemCount: value.items.length,
              items: value.items.map((item) => ({
                index: item.index,
                attempts: item.attempts,
                totalMs: item.totalMs,
                state: item.response.state,
                failureCategory: item.failureCategory,
              })),
            }),
          );
          return value;
        }

        if (!successful(response)) partial = true;
      }

      const value: GradebookImportPersistenceBatchResponseV7 = {
        transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V7,
        state: partial ? 'partial' : 'completed',
        items,
        pendingFromIndex: null,
        totalMs: Math.max(0, nowMs() - batchStartedAt),
      };
      console.info(
        '[gradebook-import-batch-v7]',
        JSON.stringify({
          state: value.state,
          totalMs: value.totalMs,
          itemCount: value.items.length,
          items: value.items.map((item) => ({
            index: item.index,
            attempts: item.attempts,
            totalMs: item.totalMs,
            state: item.response.state,
            failureCategory: item.failureCategory,
          })),
        }),
      );
      return value;
    },
  };
}
