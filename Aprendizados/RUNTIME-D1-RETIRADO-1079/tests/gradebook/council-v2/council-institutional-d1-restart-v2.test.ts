import { afterEach, describe, expect, it } from 'vitest';

import {
  COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
  type CouncilClosureReviewReadyV2,
} from '../../../shared/gradebook-contracts/council/council-institutional-contract-v2';
import {
  COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
  type CouncilActorReferenceV1,
  type CouncilClassReferenceV1,
  type CouncilStudentReferenceV1,
} from '../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import type { ResultCoverageV1 } from '../../../shared/gradebook-contracts/results/results-contract-v1';
import { createCouncilInstitutionalWorkspaceV2 } from '../../../server/gradebook/application/council/council-institutional-workspace-v2';
import {
  createLocalCouncilWorkspaceSourceV1,
  type CouncilWorkspaceSourceStudentV1,
} from '../../../server/gradebook/application/council/council-workspace-source-v1';
import { createCouncilWorkspaceV1 } from '../../../server/gradebook/application/council/council-workspace-v1';
import { createGradebookD1CouncilDecisionStoreV1 } from '../../../server/gradebook/persistence/d1/council/d1-council-decision-store-v1';
import { createGradebookD1CouncilSessionStoreV2 } from '../../../server/gradebook/persistence/d1/durability/d1-council-session-store-v2';
import {
  durabilityYear2026 as academicYearId,
  openDurabilityDatabase,
} from '../persistence/d1-durability/d1-durability-test-support';

const openedDatabases: Awaited<ReturnType<typeof openDurabilityDatabase>>[] = [];
const classReference = 'class-reference:durability:institutional-restart' as CouncilClassReferenceV1;
const studentReference = 'student-reference:durability:institutional-restart' as CouncilStudentReferenceV1;
const actorReference = 'actor:durability:institutional-restart' as CouncilActorReferenceV1;

function completeCoverage(): ResultCoverageV1 {
  return { state: 'complete', expectedItemCount: 1, resolvedItemCount: 1, missingItemCount: 0, reasons: [] };
}

const student: CouncilWorkspaceSourceStudentV1 = {
  academicYearId,
  classReference,
  classLabel: 'Turma sintética de restart',
  studentReference,
  studentLabel: 'Aluno sintético de restart',
  calculated: {
    queueState: 'eligible-for-council',
    officialAnnualState: 'eligible-for-council',
    failedComponentCount: 1,
    coverage: completeCoverage(),
    reason: 'Elegibilidade sintética para teste de durabilidade.',
  },
  annualView: [],
};

async function database() {
  const value = await openDurabilityDatabase();
  openedDatabases.push(value);
  return value;
}

afterEach(() => {
  for (const value of openedDatabases.splice(0)) value.raw.close();
});

function reviewRequest() {
  return {
    operation: 'closure-review' as const,
    contractVersion: COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
    academicYearId,
    classReference,
  };
}

function historyRequest() {
  return {
    operation: 'closure-history' as const,
    contractVersion: COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
    academicYearId,
    classReference,
  };
}

function decisionRequest(expectedVersion: number) {
  return {
    operation: 'decision' as const,
    contractVersion: COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
    academicYearId,
    classReference,
    studentReference,
    expectedVersion,
    decision: { outcome: 'approved', resultingState: 'approved-by-council' } as const,
    justification: 'Decisão sintética para validar bloqueio após restart.',
  };
}

function fixture(db: Awaited<ReturnType<typeof openDurabilityDatabase>>) {
  const source = createLocalCouncilWorkspaceSourceV1({ students: [student] });
  const decisions = createGradebookD1CouncilDecisionStoreV1(db);
  const sessions = createGradebookD1CouncilSessionStoreV2(db);
  const server = {
    isAuthorized: () => true,
    decisionIdentity: () => ({
      actorReference,
      decidedAt: '2026-09-03T00:10:01.000Z',
    }),
    institutionalIdentity: () => ({
      actorReference,
      occurredAt: '2026-09-03T00:10:02.000Z',
    }),
  };
  const workspace = createCouncilWorkspaceV1({ source, decisions, server });
  const institutional = createCouncilInstitutionalWorkspaceV2({
    source,
    decisions,
    workspace,
    sessions,
    server,
  });
  return { source, decisions, sessions, workspace, institutional };
}

async function readyReview(
  institutional: ReturnType<typeof createCouncilInstitutionalWorkspaceV2>,
): Promise<CouncilClosureReviewReadyV2> {
  const response = await institutional.review(reviewRequest());
  if (response.outcome !== 'review') throw new Error(`Expected review, got ${response.outcome}.`);
  return response;
}

describe('Council institucional V2 com sessão D1 após restart', () => {
  it('preserva fechamento e bloqueia decide/vote/close depois de reinstanciar os stores', async () => {
    const db = await database();
    const first = fixture(db);

    const decision = await first.institutional.decide(decisionRequest(0));
    expect(decision.outcome).toBe('applied');
    const review = await readyReview(first.institutional);
    expect(review).toMatchObject({ canClose: true, meeting: { state: 'open', version: 1 } });
    const closed = await first.institutional.close({
      operation: 'closure-close',
      contractVersion: COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
      academicYearId,
      classReference,
      expectedVersion: review.meeting.version,
      reviewReference: review.reviewReference,
    });
    expect(closed.outcome).toBe('closed');

    const restarted = fixture(db);
    const history = await restarted.institutional.history(historyRequest());
    expect(history.outcome).toBe('closure-history');
    if (history.outcome !== 'closure-history') return;
    expect(history.meeting).toMatchObject({ state: 'closed', version: 2 });
    expect(history.entries).toHaveLength(1);

    await expect(restarted.institutional.decide(decisionRequest(1))).resolves.toMatchObject({
      outcome: 'decision-unavailable',
    });
    await expect(
      restarted.institutional.vote({
        operation: 'vote',
        contractVersion: COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
        academicYearId,
        classReference,
        studentReference,
        expectedVersion: 2,
        approvedVotes: 5,
        failedVotes: 0,
      }),
    ).resolves.toMatchObject({ outcome: 'meeting-closed', currentVersion: 2 });
    await expect(
      restarted.institutional.close({
        operation: 'closure-close',
        contractVersion: COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
        academicYearId,
        classReference,
        expectedVersion: 2,
        reviewReference: review.reviewReference,
      }),
    ).resolves.toMatchObject({ outcome: 'already-closed', currentVersion: 2 });

    await expect(
      restarted.decisions.getHistory({ academicYearId, classReference, studentReference }),
    ).resolves.toHaveLength(1);
  });
});
