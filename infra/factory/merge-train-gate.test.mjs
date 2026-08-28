import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyCodeRabbitReview,
  codeRabbitEvidence,
  latestTrustedReviewerEvidence,
  parseTrustedCodeRabbitRequest,
  parseTrustedMergeTrainEvidence,
  parseTrustedReviewerEvidence,
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
