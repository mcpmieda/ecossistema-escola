import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyCodeRabbitReview,
  classifyCodeRabbitSummaryComment,
  codeRabbitEvidence,
  latestMatchingReviewerWorkflowRun,
  latestTrustedReviewerEvidence,
  parseTrustedCodeRabbitRequest,
  parseTrustedMergeTrainEvidence,
  parseTrustedReviewerEvidence,
  reviewerRunName,
  selectFactoryWorkerPr,
  trustedMergeTrainEvidence,
} from './merge-train-gate.mjs';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);

function comment({ login, body, created = '2026-08-27T20:00:00Z', updated = created, id = 1 }) {
  return {
    id,
    body,
    user: { login },
    created_at: created,
    updated_at: updated,
  };
}

function review({
  login = 'coderabbitai[bot]',
  body = '**Actionable comments posted: 0**',
  sha = SHA,
  submitted = '2026-08-27T20:02:00Z',
  id = 10,
}) {
  return {
    id,
    body,
    user: { login },
    commit_id: sha,
    submitted_at: submitted,
    state: 'COMMENTED',
  };
}

function codeRabbitSummary({
  login = 'coderabbitai[bot]',
  sha = SHA,
  previousSha = OTHER_SHA,
  updated = '2026-08-27T20:03:00Z',
  id = 12,
  clean = true,
  includeRecentSection = true,
  historicalSkip = false,
}) {
  const reviewedRange = `Reviewing files that changed from the base of the PR and between ${previousSha} and ${sha}.`;
  const recent = clean
    ? ['No actionable comments were generated in the recent review. 🎉', '', reviewedRange].join(
        '\n',
      )
    : ['Actionable comments were generated in the recent review.', '', reviewedRange].join('\n');
  const recentBlock = includeRecentSection
    ? `<!-- recent_review_start -->\n${recent}\n<!-- recent_review_end -->`
    : recent;
  const body = [historicalSkip ? '<!-- skip review by coderabbit.ai -->' : '', recentBlock]
    .filter(Boolean)
    .join('\n');
  return comment({ login, body, updated, id });
}

function reviewerMarker({ reviewer = 'Semgrep', sha = SHA, conclusion = 'success', runId = 20 }) {
  const encoded = Buffer.from(
    JSON.stringify({
      schema_version: 1,
      reviewer,
      sha,
      conclusion,
      run_id: runId,
    }),
  ).toString('base64url');
  return comment({
    login: 'github-actions[bot]',
    body: `<!-- FACTORY_REVIEWER_EVIDENCE ${encoded} -->`,
  });
}

test('reviewer workflow runs are correlated by exact PR and SHA title', () => {
  const title = reviewerRunName('Sonar', 126, SHA);
  assert.equal(title, `Sonar PR 126 @ ${SHA}`);
  const runs = [
    {
      id: 40,
      event: 'workflow_dispatch',
      display_title: title,
      status: 'completed',
      conclusion: 'failure',
    },
    {
      id: 41,
      event: 'workflow_dispatch',
      display_title: `Sonar PR 127 @ ${SHA}`,
      status: 'completed',
      conclusion: 'success',
    },
    {
      id: 42,
      event: 'workflow_dispatch',
      display_title: reviewerRunName('Sonar', 126, OTHER_SHA),
      status: 'completed',
      conclusion: 'success',
    },
  ];
  assert.equal(latestMatchingReviewerWorkflowRun(runs, 'Sonar', 126, SHA)?.id, 40);
  assert.equal(latestMatchingReviewerWorkflowRun(runs, 'Sonar', 126, SHA, 40), null);
  assert.throws(() => reviewerRunName('Unknown', 126, SHA), /Unsupported reviewer/);
});

test('worker PR selection rejects stale workflow SHA instead of treating it as non-worker', () => {
  const branch = 'factory/run-worker-session';
  const worker = {
    number: 126,
    head: { ref: branch, sha: OTHER_SHA },
    base: { ref: 'factory/run' },
  };
  assert.throws(
    () => selectFactoryWorkerPr([worker], branch, SHA),
    /Worker PR #126 moved from requested SHA/,
  );
  assert.equal(selectFactoryWorkerPr([worker], 'factory/another-worker', SHA), null);
  const exactWorker = { ...worker, head: { ref: branch, sha: SHA } };
  assert.deepEqual(selectFactoryWorkerPr([exactWorker], branch, SHA), exactWorker);
});

test('worker PR selection rejects ambiguous matching branches', () => {
  const branch = 'factory/run-worker-session';
  const worker = {
    number: 126,
    head: { ref: branch, sha: SHA },
    base: { ref: 'factory/run' },
  };
  assert.throws(
    () => selectFactoryWorkerPr([worker, { ...worker, number: 127 }], branch, SHA),
    /Multiple open Factory worker PRs match branch/,
  );
});

test('CodeRabbit request markers trust only github-actions bot and exact SHA', () => {
  const body = `<!-- FACTORY_CODERABBIT_REQUEST {"sha":"${SHA}"} -->`;
  assert.equal(
    parseTrustedCodeRabbitRequest(comment({ login: 'github-actions[bot]', body }))?.sha,
    SHA,
  );
  assert.equal(parseTrustedCodeRabbitRequest(comment({ login: 'mcpmieda', body })), null);
});

test('CodeRabbit review is bound to exact commit and actionable count', () => {
  assert.equal(classifyCodeRabbitReview(review({}), SHA)?.status, 'success');
  assert.equal(
    classifyCodeRabbitReview(review({ body: '**Actionable comments posted: 2**' }), SHA)?.status,
    'findings',
  );
  assert.equal(classifyCodeRabbitReview(review({ sha: OTHER_SHA }), SHA), null);
  assert.equal(classifyCodeRabbitReview(review({ login: 'someone-else' }), SHA), null);
});

test('CodeRabbit zero-finding summary is trusted only from its bot and exact reviewed range', () => {
  const trusted = classifyCodeRabbitSummaryComment(codeRabbitSummary({}), SHA);
  const wrongAuthor = codeRabbitSummary({ login: 'mcpmieda' });
  const wrongSha = codeRabbitSummary({ sha: OTHER_SHA });
  const findings = codeRabbitSummary({ clean: false });
  const unbounded = codeRabbitSummary({ includeRecentSection: false });

  assert.equal(trusted?.status, 'success');
  assert.equal(trusted?.actionable, 0);
  assert.equal(trusted?.evidenceKind, 'recent-review-comment');
  assert.equal(trusted?.reviewId, 12);
  assert.equal(classifyCodeRabbitSummaryComment(wrongAuthor, SHA), null);
  assert.equal(classifyCodeRabbitSummaryComment(wrongSha, SHA), null);
  assert.equal(classifyCodeRabbitSummaryComment(findings, SHA), null);
  assert.equal(classifyCodeRabbitSummaryComment(unbounded, SHA), null);
});

test('CodeRabbit clean exact-SHA summary can satisfy a later trusted request', () => {
  const request = comment({
    login: 'github-actions[bot]',
    body: `<!-- FACTORY_CODERABBIT_REQUEST {"sha":"${SHA}"} -->`,
    created: '2026-08-27T20:05:00Z',
  });
  const summary = codeRabbitSummary({
    updated: '2026-08-27T20:03:00Z',
    historicalSkip: true,
  });
  const evidence = codeRabbitEvidence([summary, request], [], SHA);
  assert.equal(evidence.status, 'success');
  assert.equal(evidence.review.reviewId, 12);
  assert.equal(evidence.review.evidenceKind, 'recent-review-comment');
});

test('CodeRabbit evidence requires a trusted SHA-bound request before the review', () => {
  const request = comment({
    login: 'github-actions[bot]',
    body: `<!-- FACTORY_CODERABBIT_REQUEST {"sha":"${SHA}"} -->`,
    created: '2026-08-27T20:00:00Z',
  });
  const before = review({ submitted: '2026-08-27T19:59:00Z' });
  const after = review({ submitted: '2026-08-27T20:02:00Z', id: 11 });
  assert.equal(codeRabbitEvidence([request], [before], SHA).status, 'pending');
  const evidence = codeRabbitEvidence([request], [before, after], SHA);
  assert.equal(evidence.status, 'success');
  assert.equal(evidence.review.reviewId, 11);
  assert.equal(evidence.review.evidenceKind, 'review-submission');
  assert.equal(codeRabbitEvidence([], [after], SHA).status, 'request-missing');
});

test('trusted reviewer markers require bot authorship, exact SHA and supported reviewer', () => {
  const trusted = reviewerMarker({ reviewer: 'Semgrep', runId: 40 });
  assert.equal(parseTrustedReviewerEvidence(trusted)?.run_id, 40);
  assert.equal(parseTrustedReviewerEvidence({ ...trusted, user: { login: 'mcpmieda' } }), null);
  assert.equal(
    latestTrustedReviewerEvidence(
      [reviewerMarker({ runId: 30 }), reviewerMarker({ runId: 40 })],
      'Semgrep',
      SHA,
    )?.run_id,
    40,
  );
  assert.equal(
    latestTrustedReviewerEvidence([reviewerMarker({ sha: OTHER_SHA })], 'Semgrep', SHA),
    null,
  );
});

test('reviewer recovery can require evidence newer than a failed run', () => {
  const failed = reviewerMarker({ reviewer: 'Sonar', conclusion: 'failure', runId: 50 });
  const success = reviewerMarker({ reviewer: 'Sonar', conclusion: 'success', runId: 51 });
  assert.equal(latestTrustedReviewerEvidence([failed], 'Sonar', SHA)?.conclusion, 'failure');
  assert.equal(
    latestTrustedReviewerEvidence([failed, success], 'Sonar', SHA, 50)?.conclusion,
    'success',
  );
});

test('Merge Train evidence is trusted only when bot-authored and unique for exact SHA', () => {
  const payload = {
    schema_version: 1,
    sha: SHA,
    semgrep_run_id: 1,
    sonar_run_id: 2,
    coderabbit_review_id: 3,
    coderabbit_evidence_kind: 'review-submission',
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const trusted = comment({
    login: 'github-actions[bot]',
    body: `<!-- FACTORY_MERGE_TRAIN ${encoded} -->`,
  });
  assert.equal(parseTrustedMergeTrainEvidence(trusted)?.sha, SHA);
  assert.equal(
    parseTrustedMergeTrainEvidence(
      comment({ login: 'mcpmieda', body: `<!-- FACTORY_MERGE_TRAIN ${encoded} -->` }),
    ),
    null,
  );
  assert.equal(trustedMergeTrainEvidence([trusted], SHA)?.sonar_run_id, 2);
  assert.equal(trustedMergeTrainEvidence([trusted], OTHER_SHA), null);
  assert.throws(
    () => trustedMergeTrainEvidence([trusted, { ...trusted, id: 99 }], SHA),
    /Multiple trusted Merge Train evidence/,
  );
});
