import process from 'node:process';

import { addComment, github, issueComments, requiredEnv, sleep } from './github-api.mjs';

export const SEMGREP_WORKFLOW = 'merge-train-semgrep.yml';
export const SONAR_WORKFLOW = 'merge-train-sonar.yml';

const TRUSTED_BOT = 'github-actions[bot]';
const CODERABBIT_BOT = 'coderabbitai[bot]';
const CODERABBIT_COMMAND = '@coderabbitai review';
const REQUEST_PATTERN = /<!-- FACTORY_CODERABBIT_REQUEST \{"sha":"([0-9a-f]{40})"\} -->/;
const MERGE_TRAIN_PATTERN = /<!-- FACTORY_MERGE_TRAIN ([A-Za-z0-9_-]+) -->/;
const POLL_MS = 5_000;
const MAX_REVIEW_ATTEMPTS = 120;

function fail(message) {
  throw new Error(message);
}

function authorLogin(comment) {
  return String(comment?.user?.login ?? '');
}

function timestamp(comment) {
  const value = comment?.updated_at ?? comment?.created_at;
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function validateSha40(value, label = 'SHA') {
  const sha = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) fail(`${label} must be a 40-character Git SHA.`);
  return sha;
}

export function selectExactReviewerRun(runs, expectedSha) {
  const sha = validateSha40(expectedSha, 'reviewer expected SHA');
  return (
    [...(runs ?? [])]
      .filter((run) => run?.event === 'workflow_dispatch' && run?.head_sha === sha)
      .sort((left, right) => Number(right?.id ?? 0) - Number(left?.id ?? 0))[0] ?? null
  );
}

export function parseTrustedCodeRabbitRequest(comment) {
  if (authorLogin(comment) !== TRUSTED_BOT) return null;
  const match = String(comment?.body ?? '').match(REQUEST_PATTERN);
  if (!match) return null;
  return {
    sha: validateSha40(match[1], 'CodeRabbit request SHA'),
    createdAt: Date.parse(comment?.created_at ?? '') || 0,
    commentId: comment?.id ?? null,
  };
}

export function classifyCodeRabbitComment(comment, notBefore = 0) {
  if (authorLogin(comment) !== CODERABBIT_BOT || timestamp(comment) < notBefore) return null;
  const body = String(comment?.body ?? '');
  const lower = body.toLowerCase();
  if (
    lower.includes('skip review by coderabbit.ai') ||
    lower.includes('review rate limited') ||
    lower.includes('action not completed')
  ) {
    return { status: 'unavailable', updatedAt: timestamp(comment), commentId: comment?.id ?? null };
  }
  if (!body.includes('<!-- recent_review_start -->')) return null;
  if (body.includes('No actionable comments were generated in the recent review.')) {
    return { status: 'success', updatedAt: timestamp(comment), commentId: comment?.id ?? null };
  }
  return { status: 'findings', updatedAt: timestamp(comment), commentId: comment?.id ?? null };
}

export function codeRabbitEvidence(comments, expectedSha) {
  const sha = validateSha40(expectedSha, 'CodeRabbit expected SHA');
  const requests = (comments ?? [])
    .map((comment) => ({ comment, request: parseTrustedCodeRabbitRequest(comment) }))
    .filter(({ request }) => request?.sha === sha)
    .sort((left, right) => right.request.createdAt - left.request.createdAt);
  const request = requests[0]?.request ?? null;
  if (!request) return { status: 'request-missing', request: null, review: null };

  const reviews = (comments ?? [])
    .map((comment) => classifyCodeRabbitComment(comment, request.createdAt))
    .filter(Boolean)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const review = reviews[0] ?? null;
  if (!review) return { status: 'pending', request, review: null };
  return { status: review.status, request, review };
}

function mergeTrainMarker(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `<!-- FACTORY_MERGE_TRAIN ${encoded} -->`;
}

export function parseTrustedMergeTrainEvidence(comment) {
  if (authorLogin(comment) !== TRUSTED_BOT) return null;
  const match = String(comment?.body ?? '').match(MERGE_TRAIN_PATTERN);
  if (!match) return null;
  try {
    const payload = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
    if (payload?.schema_version !== 1) return null;
    return {
      ...payload,
      sha: validateSha40(payload.sha, 'Merge Train evidence SHA'),
    };
  } catch {
    return null;
  }
}

export function trustedMergeTrainEvidence(comments, expectedSha) {
  const sha = validateSha40(expectedSha, 'Merge Train expected SHA');
  const matches = (comments ?? [])
    .map(parseTrustedMergeTrainEvidence)
    .filter((payload) => payload?.sha === sha);
  if (matches.length > 1)
    fail('Multiple trusted Merge Train evidence markers exist for the same SHA.');
  return matches[0] ?? null;
}

async function currentPr(owner, repo, prNumber, expectedSha) {
  const pr = await github(`/repos/${owner}/${repo}/pulls/${prNumber}`);
  const sha = validateSha40(expectedSha, 'Merge Train expected SHA');
  if (pr.head?.sha !== sha) {
    fail(
      `Worker PR #${prNumber} moved from Merge Train SHA ${sha} to ${pr.head?.sha ?? 'unknown'}.`,
    );
  }
  return pr;
}

async function findReviewerRun(owner, repo, workflow, sha) {
  const parameters = new URLSearchParams({
    event: 'workflow_dispatch',
    head_sha: sha,
    per_page: '30',
  });
  const payload = await github(
    `/repos/${owner}/${repo}/actions/workflows/${workflow}/runs?${parameters.toString()}`,
  );
  return selectExactReviewerRun(payload?.workflow_runs, sha);
}

async function waitForReviewerWorkflow(owner, repo, { workflow, branch, sha, inputs = {} }) {
  let run = await findReviewerRun(owner, repo, workflow, sha);
  if (!run) {
    const body = { ref: branch };
    if (Object.keys(inputs).length > 0) body.inputs = inputs;
    await github(`/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  for (let attempt = 0; attempt < MAX_REVIEW_ATTEMPTS; attempt += 1) {
    run = await findReviewerRun(owner, repo, workflow, sha);
    if (run?.status === 'completed') {
      if (run.conclusion !== 'success') {
        fail(`Merge Train workflow ${workflow} run ${run.id} concluded ${run.conclusion}.`);
      }
      return run;
    }
    await sleep(POLL_MS);
  }
  fail(`Merge Train workflow ${workflow} timed out for ${branch}@${sha}.`);
}

async function ensureCodeRabbit(owner, repo, prNumber, sha) {
  let comments = await issueComments(owner, repo, prNumber);
  let evidence = codeRabbitEvidence(comments, sha);
  if (evidence.status === 'request-missing') {
    await addComment(
      owner,
      repo,
      prNumber,
      `<!-- FACTORY_CODERABBIT_REQUEST {"sha":"${sha}"} -->\nFactory Merge Train requested CodeRabbit for exact head SHA ${sha}.`,
    );
    await addComment(owner, repo, prNumber, CODERABBIT_COMMAND);
  }

  for (let attempt = 0; attempt < MAX_REVIEW_ATTEMPTS; attempt += 1) {
    await currentPr(owner, repo, prNumber, sha);
    comments = await issueComments(owner, repo, prNumber);
    evidence = codeRabbitEvidence(comments, sha);
    if (evidence.status === 'success') return evidence;
    if (evidence.status === 'findings') {
      fail(`CodeRabbit reported actionable findings for worker PR #${prNumber}@${sha}.`);
    }
    if (evidence.status === 'unavailable') {
      fail(`CodeRabbit review is unavailable or rate limited for worker PR #${prNumber}@${sha}.`);
    }
    await sleep(POLL_MS);
  }
  fail(`CodeRabbit review timed out for worker PR #${prNumber}@${sha}.`);
}

async function persistMergeTrainEvidence(owner, repo, prNumber, payload) {
  const comments = await issueComments(owner, repo, prNumber);
  const existing = trustedMergeTrainEvidence(comments, payload.sha);
  if (existing) return existing;
  await addComment(
    owner,
    repo,
    prNumber,
    `${mergeTrainMarker(payload)}\nMerge Train passed for exact worker SHA \`${payload.sha}\`. Semgrep run ${payload.semgrep_run_id}; Sonar run ${payload.sonar_run_id}; CodeRabbit review completed after the trusted SHA-bound request.`,
  );
  return payload;
}

export async function ensureMergeTrain(owner, repo, { prNumber, branch, sha }) {
  const exactSha = validateSha40(sha, 'Merge Train SHA');
  await currentPr(owner, repo, prNumber, exactSha);
  const [semgrep, sonar, coderabbit] = await Promise.all([
    waitForReviewerWorkflow(owner, repo, {
      workflow: SEMGREP_WORKFLOW,
      branch,
      sha: exactSha,
    }),
    waitForReviewerWorkflow(owner, repo, {
      workflow: SONAR_WORKFLOW,
      branch,
      sha: exactSha,
      inputs: { expected_sha: exactSha },
    }),
    ensureCodeRabbit(owner, repo, prNumber, exactSha),
  ]);
  await currentPr(owner, repo, prNumber, exactSha);

  const payload = {
    schema_version: 1,
    sha: exactSha,
    semgrep_run_id: semgrep.id,
    sonar_run_id: sonar.id,
    coderabbit_comment_id: coderabbit.review.commentId,
    coderabbit_updated_at: new Date(coderabbit.review.updatedAt).toISOString(),
  };
  await persistMergeTrainEvidence(owner, repo, prNumber, payload);
  return payload;
}

export async function findFactoryWorkerPr(owner, repo, branch, sha) {
  const head = encodeURIComponent(`${owner}:${branch}`);
  const pulls = await github(`/repos/${owner}/${repo}/pulls?state=open&head=${head}&per_page=20`);
  const matches = (pulls ?? []).filter(
    (pr) =>
      pr.head?.ref === branch &&
      pr.head?.sha === sha &&
      typeof pr.base?.ref === 'string' &&
      pr.base.ref.startsWith('factory/'),
  );
  if (matches.length > 1) fail(`Multiple open Factory worker PRs match ${branch}@${sha}.`);
  return matches[0] ?? null;
}

export async function runMergeTrainForCurrentRevision() {
  const repository = requiredEnv('GITHUB_REPOSITORY');
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) fail('GITHUB_REPOSITORY must be owner/repo.');
  const sha = validateSha40(requiredEnv('GITHUB_SHA'), 'GITHUB_SHA');
  const branch = requiredEnv('GITHUB_REF_NAME');
  const pr = await findFactoryWorkerPr(owner, repo, branch, sha);
  if (!pr) {
    return {
      status: 'not-a-worker-pr',
      branch,
      sha,
    };
  }
  const evidence = await ensureMergeTrain(owner, repo, {
    prNumber: pr.number,
    branch,
    sha,
  });
  return {
    status: 'merge-train-passed',
    pr_number: pr.number,
    ...evidence,
  };
}

async function main() {
  const result = await runMergeTrainForCurrentRevision();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]?.endsWith('/merge-train-gate.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
