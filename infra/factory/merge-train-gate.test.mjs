import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyCodeRabbitComment,
  codeRabbitEvidence,
  parseTrustedCodeRabbitRequest,
  parseTrustedMergeTrainEvidence,
  selectExactReviewerRun,
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

test('reviewer workflow selection requires workflow_dispatch and exact SHA', () => {
  const runs = [
    { id: 7, event: 'pull_request', head_sha: SHA },
    { id: 8, event: 'workflow_dispatch', head_sha: OTHER_SHA },
    { id: 9, event: 'workflow_dispatch', head_sha: SHA },
    { id: 10, event: 'workflow_dispatch', head_sha: SHA },
  ];
  assert.equal(selectExactReviewerRun(runs, SHA)?.id, 10);
  assert.equal(selectExactReviewerRun(runs.slice(0, 2), SHA), null);
});

test('CodeRabbit request markers trust only github-actions bot and exact SHA', () => {
  const body = `<!-- FACTORY_CODERABBIT_REQUEST {"sha":"${SHA}"} -->`;
  assert.equal(
    parseTrustedCodeRabbitRequest(comment({ login: 'github-actions[bot]', body }))?.sha,
    SHA,
  );
  assert.equal(parseTrustedCodeRabbitRequest(comment({ login: 'mcpmieda', body })), null);
});

test('CodeRabbit completion accepts only a completed no-actionable review after request', () => {
  const request = comment({
    login: 'github-actions[bot]',
    body: `<!-- FACTORY_CODERABBIT_REQUEST {"sha":"${SHA}"} -->`,
    created: '2026-08-27T20:00:00Z',
  });
  const oldSuccess = comment({
    login: 'coderabbitai[bot]',
    body: '<!-- recent_review_start -->\nNo actionable comments were generated in the recent review. 🎉',
    created: '2026-08-27T19:59:00Z',
    updated: '2026-08-27T19:59:00Z',
    id: 2,
  });
  const success = comment({
    login: 'coderabbitai[bot]',
    body: '<!-- recent_review_start -->\nNo actionable comments were generated in the recent review. 🎉',
    created: '2026-08-27T20:01:00Z',
    updated: '2026-08-27T20:02:00Z',
    id: 3,
  });
  const evidence = codeRabbitEvidence([oldSuccess, request, success], SHA);
  assert.equal(evidence.status, 'success');
  assert.equal(evidence.review.commentId, 3);
});

test('CodeRabbit skip and rate limit never count as approval', () => {
  const notBefore = Date.parse('2026-08-27T20:00:00Z');
  assert.equal(
    classifyCodeRabbitComment(
      comment({
        login: 'coderabbitai[bot]',
        body: '<!-- This is an auto-generated comment: skip review by coderabbit.ai -->',
        created: '2026-08-27T20:01:00Z',
      }),
      notBefore,
    )?.status,
    'unavailable',
  );
  assert.equal(
    classifyCodeRabbitComment(
      comment({
        login: 'coderabbitai[bot]',
        body: 'Action not completed\nReview rate limited.',
        created: '2026-08-27T20:01:00Z',
      }),
      notBefore,
    )?.status,
    'unavailable',
  );
});

test('CodeRabbit completed review with findings is classified as findings', () => {
  const review = classifyCodeRabbitComment(
    comment({
      login: 'coderabbitai[bot]',
      body: '<!-- recent_review_start -->\nActionable comments were generated.',
      created: '2026-08-27T20:01:00Z',
    }),
  );
  assert.equal(review?.status, 'findings');
});

test('Merge Train evidence is trusted only when bot-authored and unique for exact SHA', () => {
  const payload = {
    schema_version: 1,
    sha: SHA,
    semgrep_run_id: 1,
    sonar_run_id: 2,
    coderabbit_comment_id: 3,
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
