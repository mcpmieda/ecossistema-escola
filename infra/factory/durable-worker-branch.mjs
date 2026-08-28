import { validateBranch } from './durable-provider-contract.mjs';

export function durableWorkerBranch(runId, taskId) {
  const branch = validateBranch(`factory/${runId}-${taskId}`, 'durable worker branch');
  const integration = validateBranch(`factory/${runId}`, 'integration branch');
  if (branch === integration || branch.startsWith(`${integration}/`)) {
    throw new Error('durable worker branch must be a sibling of the integration branch');
  }
  return branch;
}
