const base = 'https://api.github.com/repos/mcpmieda/ecossistema-escola';
export const monitorMarkerV1 = '<!-- operational-monitor-v1 -->';

export function githubApiV1(token: string, fetcher: typeof fetch) {
  return async (path: string, method = 'GET', body?: unknown): Promise<unknown> => {
    const response = await fetcher(base + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('GitHub report unavailable');
    }
    return response.json();
  };
}

export async function findMonitorStatusV1(api: ReturnType<typeof githubApiV1>) {
  const issue = (await api('/issues/1211')) as {
    user?: { login?: string };
    pull_request?: unknown;
  };
  if (issue.user?.login !== 'mcpmieda' || issue.pull_request)
    throw new Error('Unexpected monitor issue');
  let existing: { id: number; body: string } | undefined;
  for (let page = 1; page <= 10; page++) {
    const result = await api(`/issues/1211/comments?per_page=100&page=${page}`);
    if (!Array.isArray(result)) throw new Error('Invalid comments');
    for (const item of result) {
      if (
        item.user?.login === 'github-actions[bot]' &&
        Number.isSafeInteger(item.id) &&
        typeof item.body === 'string' &&
        item.body.startsWith(monitorMarkerV1)
      ) {
        if (existing) throw new Error('Ambiguous monitor status');
        existing = { id: item.id, body: item.body };
      }
    }
    if (result.length < 100) break;
    if (page === 10) throw new Error('Comment lookup exceeded bound');
  }
  return existing;
}

export type DeploymentReferenceV1 = {
  runId: number;
  runNumber: number;
  runAttempt: number;
  createdAt: string;
  headSha: string;
};

export function deploymentReferenceV1(value: unknown): DeploymentReferenceV1 | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const positiveInteger = (n: unknown): n is number =>
    typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
  if (
    !positiveInteger(row.runId) ||
    !positiveInteger(row.runNumber) ||
    !positiveInteger(row.runAttempt) ||
    typeof row.headSha !== 'string' ||
    !/^[a-f0-9]{40}$/u.test(row.headSha) ||
    typeof row.createdAt !== 'string' ||
    !/^\d{4}-\d\d-\d\dT[\d:.]+Z$/u.test(row.createdAt) ||
    !Number.isFinite(Date.parse(row.createdAt))
  )
    return undefined;
  return {
    runId: row.runId,
    runNumber: row.runNumber,
    runAttempt: row.runAttempt,
    createdAt: new Date(row.createdAt).toISOString(),
    headSha: row.headSha,
  };
}

// Only immutable creation metadata orders runs. A rerun can update an old run today.
export function compareDeploymentReferencesV1(
  candidate: DeploymentReferenceV1,
  previous: DeploymentReferenceV1,
): 'current' | 'regressed' | 'inconsistent' {
  if (candidate.runId === previous.runId) {
    if (
      candidate.runNumber !== previous.runNumber ||
      candidate.createdAt !== previous.createdAt ||
      candidate.headSha !== previous.headSha
    )
      return 'inconsistent';
    return candidate.runAttempt < previous.runAttempt ? 'regressed' : 'current';
  }
  const laterNumber = candidate.runNumber > previous.runNumber;
  const laterId = candidate.runId > previous.runId;
  const laterDate = Date.parse(candidate.createdAt) >= Date.parse(previous.createdAt);
  const earlierDate = Date.parse(candidate.createdAt) <= Date.parse(previous.createdAt);
  if (laterNumber && laterId && laterDate) return 'current';
  if (candidate.runNumber < previous.runNumber && !laterId && earlierDate) return 'regressed';
  return 'inconsistent';
}

export function readDeploymentReferenceV1(body: string | undefined): {
  state: 'available' | 'missing' | 'invalid';
  reference?: DeploymentReferenceV1;
} {
  if (!body?.includes('<!-- deployment-reference:')) return { state: 'missing' };
  const matches = [...body.matchAll(/<!-- deployment-reference:([^\n]{1,512}) -->/gu)];
  if (matches.length !== 1) return { state: 'invalid' };
  try {
    const reference = deploymentReferenceV1(JSON.parse(matches[0]![1]!) as unknown);
    return reference ? { state: 'available', reference } : { state: 'invalid' };
  } catch {
    return { state: 'invalid' };
  }
}
