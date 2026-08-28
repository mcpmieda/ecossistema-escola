import process from 'node:process';

import { addComment, github, issueComments, requiredEnv, sleep } from './github-api.mjs';

export const SEMGREP_WORKFLOW = 'merge-train-semgrep.yml';
export const SONAR_WORKFLOW = 'merge-train-sonar.yml';

const TRUSTED_BOT = 'github-actions[bot]';
const CODERABBIT_LOGINS = new Set(['coderabbitai[bot]', 'coderabbitai']);
const CODERABBIT_COMMAND = '@coderabbitai review';
const REQUEST_PATTERN = /<!-- FACTORY_CODERABBIT_REQUEST \{"sha":"([0-9a-f]{40})"\} -->/;
const REVIEWER_PATTERN = /<!-- FACTORY_REVIEWER_EVIDENCE ([A-Za-z0-9_-]+) -->/;
const MERGE_TRAIN_PATTERN = /<!-- FACTORY_MERGE_TRAIN ([A-Za-z0-9_-]+) -->/;
const ACTIONABLE_PATTERN = /Actionable comments posted:\s*(\d+)/i;
const POLL_MS = 5_000;
const MAX_REVIEW_ATTEMPTS = 120;

function fail(message) {
  throw new Error(message);
}

function authorLogin(value) {
  return String(value?.user?.login ?? '');
}

function timestamp(value) {
  const raw = value?.submitted_at ?? value?.updated_at ?? value?.created_at;
  const parsed = Date.parse(raw ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function validateSha40(value, label = 'SHA') {
  const sha = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) fail(`${label} must be a 40-character Git SHA.`);
  return sha;
}

function validatePrNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0)
    fail('Reviewer PR number must be a positive integer.');
  return number;
}

function decodeMarkerPayload(encoded, label) {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    fail(`${label} marker payload is invalid.`);
  }
}

export function reviewerRunName(reviewer, prNumber, expectedSha) {
  if (!['Semgrep', 'Sonar'].includes(reviewer)) fail('Unsupported reviewer workflow name.');
  const pr = validatePrNumber(prNumber);
  const sha = validateSha40(expectedSha, `${reviewer} run SHA`);
  return `${reviewer} PR ${pr} @ ${sha}`;
}

export function latestMatchingReviewerWorkflowRun(
  runs,
  reviewer,
  prNumber,
  expectedSha,
  afterRunId = 0,
) {
  const title = reviewerRunName(reviewer, prNumber, expectedSha);
  return (
    (runs ?? [])
      .filter((run) => {
        const id = Number(run?.id);
        return (
          Number.isInteger(id) &&
          id > Number(afterRunId || 0) &&
          run?.event === 'workflow_dispatch' &&
          run?.display_title === title
        );
      })
      .sort((left, right) => Number(right.id) - Number(left.id))[0] ?? null
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

export function classifyCodeRabbitReview(review, expectedSha, notBefore = 0) {
  if (!CODERABBIT_LOGINS.has(authorLogin(review))) return null;
  const sha = validateSha40(expectedSha, 'CodeRabbit expected SHA');
  if (String(review?.commit_id ?? '').toLowerCase() !== sha) return null;
  if (timestamp(review) < notBefore) return null;
  const match = String(review?.body ?? '').match(ACTIONABLE_PATTERN);
  if (!match) return null;
  const actionable = Number(match[1]);
  if (!Number.isInteger(actionable) || actionable < 0) return null;
  return {
    status: actionable === 0 ? 'success' : 'findings',
    actionable,
    reviewId: review?.id ?? null,
    updatedAt: timestamp(review),
  };
}

export function classifyCodeRabbitUnavailableComment(comment, notBefore = 0) {
  if (!CODERABBIT_LOGINS.has(authorLogin(comment)) || timestamp(comment) < notBefore) return null;
  const lower = String(comment?.body ?? '').toLowerCase();
  if (
    lower.includes('skip review by coderabbit.ai') ||
    lower.includes('review rate limited') ||
    lower.includes('action not completed')
  ) {
    return {
      status: 'unavailable',
      commentId: comment?.id ?? null,
      updatedAt: timestamp(comment),
    };
  }
  return null;
}

export function codeRabbitEvidence(comments, reviews, expectedSha) {
  const sha = validateSha40(expectedSha, 'CodeRabbit expected SHA');
  const requests = (comments ?? [])
    .map((comment) => parseTrustedCodeRabbitRequest(comment))
    .filter((request) => request?.sha === sha)
    .sort((left, right) => right.createdAt - left.createdAt);
  const request = requests[0] ?? null;
  if (!request) return { status: 'request-missing', request: null, review: null };

  const completed = (reviews ?? [])
    .map((review) => classifyCodeRabbitReview(review, sha, request.createdAt))
    .filter(Boolean)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  if (completed[0]) return { status: completed[0].status, request, review: completed[0] };

  const unavailable = (comments ?? [])
    .map((comment) => classifyCodeRabbitUnavailableComment(comment, request.createdAt))
    .filter(Boolean)
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
  if (unavailable) return { status: 'unavailable', request, review: unavailable };
  return { status: 'pending', request, review: null };
}

export function parseTrustedReviewerEvidence(comment) {
  if (authorLogin(comment) !== TRUSTED_BOT) return null;
  const match = String(comment?.body ?? '').match(REVIEWER_PATTERN);
  if (!match) return null;
  let payload;
  try {
    payload = decodeMarkerPayload(match[1], 'reviewer evidence');
  } catch {
    return null;
  }
  if (payload?.schema_version !== 1) return null;
  if (!['Semgrep', 'Sonar'].includes(payload?.reviewer)) return null;
  if (!['success', 'failure', 'cancelled', 'timed_out', 'stale'].includes(payload?.conclusion)) {
    return null;
  }
  const runId = Number(payload?.run_id);
  if (!Number.isInteger(runId) || runId <= 0) return null;
  return {
    schema_version: 1,
    reviewer: payload.reviewer,
    sha: validateSha40(payload.sha, 'reviewer evidence SHA'),
    conclusion: payload.conclusion,
    run_id: runId,
  };
}

export function latestTrustedReviewerEvidence(comments, reviewer, expectedSha, afterRunId = 0) {
  const sha = validateSha40(expectedSha, `${reviewer} expected SHA`);
  return (
    (comments ?? [])
      .map(parseTrustedReviewerEvidence)
      .filter(
        (payload) =>
          payload?.reviewer === reviewer &&
          payload?.sha === sha &&
          payload.run_id > Number(afterRunId || 0),
      )
      .sort((left, right) => right.run_id - left.run_id)[0] ?? null
  );
}

function mergeTrainMarker(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `<!-- FACTORY_MERGE_TRAIN ${encoded} -->`;
}

export function parseTrustedMergeTrainEvidence(comment) {
  if (authorLogin(comment) !== TRUSTED_BOT) return null;
  const match = String(comment?.body ?? '').match(MERGE_TRAIN_PATTERN);
  if (!match) return null;
  let payload;
  try {
    payload = decodeMarkerPayload(match[1], 'Merge Train evidence');
  } catch {
    return null;
  }
  if (payload?.schema_version !== 1) return null;
  return {
    ...payload,
    sha: validateSha40(payload.sha, 'Merge Train evidence SHA'),
  };
}

export function trustedMergeTrainEvidence(comments, expectedSha) {
  const sha = validateSha40(expectedSha, 'Merge Train expected SHA');
  const matches = (comments ?? [])
    .map(parseTrustedMergeTrainEvidence)
    .filter((payload) => payload?.sha === sha);
  if (matches.length > 1) {
    fail('Multiple trusted Merge Train evidence markers exist for the same SHA.');
  }
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

async function reviewerWorkflowRuns(owner, repo, workflow) {
  const payload = await github(
    `/repos/${owner}/${repo}/actions/workflows/${workflow}/runs?event=workflow_dispatch&branch=main&per_page=50`,
  );
  return Array.isArray(payload?.workflow_runs) ? payload.workflow_runs : [];
}

async function dispatchReviewer(owner, repo, workflow, prNumber, sha) {
  await github(`/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({
      ref: 'main',
      inputs: {
        expected_sha: sha,
        pr_number: String(prNumber),
      },
    }),
  });
}

async function waitForReviewer(owner, repo, { workflow, reviewer, prNumber, sha }) {
  let comments = await issueComments(owner, repo, prNumber);
  const existing = latestTrustedReviewerEvidence(comments, reviewer, sha);
  if (existing?.conclusion === 'success') return existing;
  const baselineRunId = existing?.run_id ?? 0;
  const baselineRuns = await reviewerWorkflowRuns(owner, repo, workflow);
  const baselineWorkflowRunId =
    latestMatchingReviewerWorkflowRun(baselineRuns, reviewer, prNumber, sha)?.id ?? 0;

  await dispatchReviewer(owner, repo, workflow, prNumber, sha);
  for (let attempt = 0; attempt < MAX_REVIEW_ATTEMPTS; attempt += 1) {
    await currentPr(owner, repo, prNumber, sha);
    comments = await issueComments(owner, repo, prNumber);
    const evidence = latestTrustedReviewerEvidence(comments, reviewer, sha, baselineRunId);
    if (evidence) {
      if (evidence.conclusion !== 'success') {
        fail(`${reviewer} reviewer run ${evidence.run_id} concluded ${evidence.conclusion}.`);
      }
      return evidence;
    }

    const workflowRuns = await reviewerWorkflowRuns(owner, repo, workflow);
    const workflowRun = latestMatchingReviewerWorkflowRun(
      workflowRuns,
      reviewer,
      prNumber,
      sha,
      baselineWorkflowRunId,
    );
    if (workflowRun?.status === 'completed' && workflowRun.conclusion !== 'success') {
      fail(
        `${reviewer} reviewer workflow run ${workflowRun.id} concluded ${workflowRun.conclusion} before valid SHA-bound evidence was published.`,
      );
    }
    await sleep(POLL_MS);
  }
  fail(`${reviewer} reviewer evidence timed out for worker PR #${prNumber}@${sha}.`);
}

async function pullRequestReviews(owner, repo, prNumber) {
  return github(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews?per_page=100`);
}

async function ensureCodeRabbit(owner, repo, prNumber, sha) {
  let comments = await issueComments(owner, repo, prNumber);
  let reviews = await pullRequestReviews(owner, repo, prNumber);
  let evidence = codeRabbitEvidence(comments, reviews, sha);
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
    reviews = await pullRequestReviews(owner, repo, prNumber);
    evidence = codeRabbitEvidence(comments, reviews, sha);
    if (evidence.status === 'success') return evidence;
    if (evidence.status === 'findings') {
      fail(
        `CodeRabbit reported ${evidence.review.actionable} actionable finding(s) for worker PR #${prNumber}@${sha}.`,
      );
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
    `${mergeTrainMarker(payload)}\nMerge Train passed for exact worker SHA \`${payload.sha}\`. Semgrep run ${payload.semgrep_run_id}; Sonar run ${payload.sonar_run_id}; CodeRabbit review ${payload.coderabbit_review_id}.`,
  );
  return payload;
}

export async function ensureMergeTrain(owner, repo, { prNumber, sha }) {
  const exactSha = validateSha40(sha, 'Merge Train SHA');
  const comments = await issueComments(owner, repo, prNumber);
  const existing = trustedMergeTrainEvidence(comments, exactSha);
  if (existing) return existing;

  await currentPr(owner, repo, prNumber, exactSha);
  const [semgrep, sonar, coderabbit] = await Promise.all([
    waitForReviewer(owner, repo, {
      workflow: SEMGREP_WORKFLOW,
      reviewer: 'Semgrep',
      prNumber,
      sha: exactSha,
    }),
    waitForReviewer(owner, repo, {
      workflow: SONAR_WORKFLOW,
      reviewer: 'Sonar',
      prNumber,
      sha: exactSha,
    }),
    ensureCodeRabbit(owner, repo, prNumber, exactSha),
  ]);
  await currentPr(owner, repo, prNumber, exactSha);

  const payload = {
    schema_version: 1,
    sha: exactSha,
    semgrep_run_id: semgrep.run_id,
    sonar_run_id: sonar.run_id,
    coderabbit_review_id: coderabbit.review.reviewId,
    coderabbit_updated_at: new Date(coderabbit.review.updatedAt).toISOString(),
  };
  await persistMergeTrainEvidence(owner, repo, prNumber, payload);
  return payload;
}

export async function findFactoryWorkerPr(owner, repo, branch, sha) {
  const exactSha = validateSha40(sha, 'Factory worker SHA');
  const head = encodeURIComponent(`${owner}:${branch}`);
  const pulls = await github(`/repos/${owner}/${repo}/pulls?state=open&head=${head}&per_page=20`);
  const matches = (pulls ?? []).filter(
    (pr) =>
      pr.head?.ref === branch &&
      pr.head?.sha === exactSha &&
      typeof pr.base?.ref === 'string' &&
      pr.base.ref.startsWith('factory/'),
  );
  if (matches.length > 1) fail(`Multiple open Factory worker PRs match ${branch}@${exactSha}.`);
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
