import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
  COUNCIL_INSTITUTIONAL_POLICY_V2,
  inspectCouncilInstitutionalRequestV2,
  type CouncilClosureReviewReadyV2,
} from '../../../shared/gradebook-contracts/council/council-institutional-contract-v2';
import {
  COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
  type CouncilActorReferenceV1,
  type CouncilClassReferenceV1,
  type CouncilStudentReferenceV1,
} from '../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import type { AcademicYearId } from '../../../shared/gradebook-contracts/entities';
import type { ResultCoverageV1 } from '../../../shared/gradebook-contracts/results/results-contract-v1';
import { createLocalCouncilDecisionStoreV1 } from '../../../server/gradebook/application/council/council-decision-store-v1';
import { createCouncilInstitutionalWorkspaceV2 } from '../../../server/gradebook/application/council/council-institutional-workspace-v2';
import { createLocalCouncilSessionStoreV2 } from '../../../server/gradebook/application/council/council-session-store-v2';
import {
  createLocalCouncilWorkspaceSourceV1,
  type CouncilWorkspaceSourceStudentV1,
} from '../../../server/gradebook/application/council/council-workspace-source-v1';
import { createCouncilWorkspaceV1 } from '../../../server/gradebook/application/council/council-workspace-v1';

const academicYearId = 'academic-year:synthetic-council-v2:2026' as AcademicYearId;
const classReference = 'class:synthetic-council-v2:6a' as CouncilClassReferenceV1;
const actorReference = 'actor:synthetic-council-v2' as CouncilActorReferenceV1;
const decidedAt = '2026-09-02T08:15:00.000Z';
const occurredAt = '2026-09-02T08:30:00.000Z';

function coverage(state: ResultCoverageV1['state'] = 'complete'): ResultCoverageV1 {
  if (state === 'complete') {
    return { state, expectedItemCount: 1, resolvedItemCount: 1, missingItemCount: 0, reasons: [] };
  }
  return {
    state,
    expectedItemCount: 1,
    resolvedItemCount: 0,
    missingItemCount: 1,
    reasons: [`synthetic-${state}`],
  };
}

function student(
  suffix: string,
  queueState: CouncilWorkspaceSourceStudentV1['calculated']['queueState'],
  failedComponentCount: number | null,
  coverageState: ResultCoverageV1['state'] = 'complete',
  reason = `Motivo oficial sintético ${suffix}`,
): CouncilWorkspaceSourceStudentV1 {
  return {
    academicYearId,
    classReference,
    classLabel: '6º A sintético V2',
    studentReference: `student:synthetic-council-v2:${suffix}` as CouncilStudentReferenceV1,
    studentLabel: `Aluno Sintético V2 ${suffix}`,
    calculated: {
      queueState,
      officialAnnualState:
        queueState === 'eligible-for-council'
          ? 'eligible-for-council'
          : queueState === 'not-eligible-for-council'
            ? 'not-eligible-for-council'
            : queueState === 'insufficient-data'
              ? 'insufficient-data'
              : 'approved-direct',
      failedComponentCount,
      coverage: coverage(coverageState),
      reason,
    },
    annualView: [],
  };
}

function fixture(
  students: CouncilWorkspaceSourceStudentV1[] = [
    student('eligible', 'eligible-for-council', 1),
    student('insufficient', 'insufficient-data', null, 'insufficient-data'),
    student('direct', 'follows-official-annual-result', 0),
  ],
  authorized = true,
) {
  const source = createLocalCouncilWorkspaceSourceV1({ students });
  const decisions = createLocalCouncilDecisionStoreV1();
  const sessions = createLocalCouncilSessionStoreV2();
  const decisionIdentity = vi.fn(() => ({ actorReference, decidedAt }));
  const institutionalIdentity = vi.fn(() => ({ actorReference, occurredAt }));
  const server = {
    isAuthorized: () => authorized,
    decisionIdentity,
    institutionalIdentity,
  };
  const workspace = createCouncilWorkspaceV1({ source, decisions, server });
  const institutional = createCouncilInstitutionalWorkspaceV2({
    source,
    decisions,
    workspace,
    sessions,
    server,
  });
  return {
    students,
    source,
    decisions,
    sessions,
    workspace,
    institutional,
    decisionIdentity,
    institutionalIdentity,
  };
}

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

function decisionRequest(
  studentReference: CouncilStudentReferenceV1,
  expectedVersion: number,
  outcome: 'approved' | 'failed' = 'approved',
) {
  return {
    operation: 'decision' as const,
    contractVersion: COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
    academicYearId,
    classReference,
    studentReference,
    expectedVersion,
    decision:
      outcome === 'approved'
        ? ({ outcome: 'approved', resultingState: 'approved-by-council' } as const)
        : ({ outcome: 'failed', resultingState: 'failed-by-council-decision' } as const),
    justification: `Justificativa sintética ${outcome}.`,
  };
}

function voteRequest(
  studentReference: CouncilStudentReferenceV1,
  expectedVersion: number,
  approvedVotes: number,
  failedVotes: number,
) {
  return {
    operation: 'vote' as const,
    contractVersion: COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
    academicYearId,
    classReference,
    studentReference,
    expectedVersion,
    approvedVotes,
    failedVotes,
  };
}

function closeRequest(review: CouncilClosureReviewReadyV2) {
  return {
    operation: 'closure-close' as const,
    contractVersion: COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
    academicYearId,
    classReference,
    expectedVersion: review.meeting.version,
    reviewReference: review.reviewReference,
  };
}

async function readyReview(
  institutional: ReturnType<typeof createCouncilInstitutionalWorkspaceV2>,
): Promise<CouncilClosureReviewReadyV2> {
  const response = await institutional.review(reviewRequest());
  if (response.outcome !== 'review') throw new Error(`Expected review, got ${response.outcome}.`);
  return response;
}

async function decideEligible(f: ReturnType<typeof fixture>) {
  const eligible = f.students.find(
    (candidate) => candidate.calculated.queueState === 'eligible-for-council',
  );
  if (!eligible) throw new Error('Expected synthetic eligible student.');
  const response = await f.institutional.decide(decisionRequest(eligible.studentReference, 0));
  expect(response.outcome).toBe('applied');
  return eligible;
}

describe('Council institutional closure V2', () => {
  it('faz revisão pré-fechamento sem inventar decisão para dados insuficientes', async () => {
    const f = fixture();
    const review = await readyReview(f.institutional);

    expect(review.meeting).toMatchObject({ state: 'open', version: 0 });
    expect(review.canClose).toBe(false);
    expect(review.blockers).toEqual([
      {
        studentReference: f.students[0]?.studentReference,
        code: 'decision-required',
      },
    ]);
    const insufficient = review.items.find(
      (item) => item.calculated.queueState === 'insufficient-data',
    );
    expect(insufficient).toMatchObject({ currentDecision: null, consistency: 'ready', vote: null });
  });

  it('fecha fila consistente com fotografia profundamente imutável e ator/instante server-side', async () => {
    const f = fixture();
    await decideEligible(f);
    const review = await readyReview(f.institutional);
    expect(review.canClose).toBe(true);

    const response = await f.institutional.close(closeRequest(review));
    expect(response.outcome).toBe('closed');
    if (response.outcome !== 'closed') throw new Error('Expected closed response.');
    expect(response.snapshot.closedBy).toBe(actorReference);
    expect(response.snapshot.closedAt).toBe(occurredAt);
    expect(response.snapshot.items).toHaveLength(3);
    expect(Object.isFrozen(response.snapshot)).toBe(true);
    expect(Object.isFrozen(response.snapshot.items)).toBe(true);
    expect(Object.isFrozen(response.snapshot.items[0])).toBe(true);
    expect(Object.isFrozen(response.snapshot.items[0]?.calculated)).toBe(true);
    expect(f.institutionalIdentity).toHaveBeenCalledTimes(1);
  });

  it('bloqueia nova edição depois do fechamento sem alterar histórico de decisão', async () => {
    const f = fixture();
    const eligible = await decideEligible(f);
    const review = await readyReview(f.institutional);
    const closed = await f.institutional.close(closeRequest(review));
    expect(closed.outcome).toBe('closed');

    const rejected = await f.institutional.decide(decisionRequest(eligible.studentReference, 1, 'failed'));
    expect(rejected.outcome).toBe('decision-unavailable');
    const history = await f.decisions.getHistory({
      academicYearId,
      classReference,
      studentReference: eligible.studentReference,
    });
    expect(history).toHaveLength(1);
    expect(history[0]?.decision.outcome).toBe('approved');
  });

  it('serializa fechamentos concorrentes e impede duas fotos para a mesma versão CAS', async () => {
    const f = fixture();
    await decideEligible(f);
    const review = await readyReview(f.institutional);

    const [left, right] = await Promise.all([
      f.institutional.close(closeRequest(review)),
      f.institutional.close(closeRequest(review)),
    ]);
    expect([left.outcome, right.outcome].sort()).toEqual(['already-closed', 'closed']);
    const history = await f.institutional.history(historyRequest());
    expect(history.outcome).toBe('closure-history');
    if (history.outcome === 'closure-history') expect(history.entries).toHaveLength(1);
  });

  it('mantém histórico de fechamento exclusivamente sobre snapshot, sem reler academia atual', async () => {
    const f = fixture();
    await decideEligible(f);
    const listSpy = vi.spyOn(f.source, 'listQueue');
    const review = await readyReview(f.institutional);
    const closed = await f.institutional.close(closeRequest(review));
    if (closed.outcome !== 'closed') throw new Error('Expected closed response.');
    const readsAtClose = listSpy.mock.calls.length;

    Object.assign(f.students[0]!.calculated as { reason: string }, {
      reason: 'Mudança sintética posterior que não pode reinterpretar a foto.',
    });
    const history = await f.institutional.history(historyRequest());
    const reviewAfterClose = await f.institutional.review(reviewRequest());
    expect(listSpy).toHaveBeenCalledTimes(readsAtClose);
    expect(history.outcome).toBe('closure-history');
    if (history.outcome !== 'closure-history') throw new Error('Expected closure history.');
    expect(history.entries[0]).toEqual(closed.snapshot);
    expect(reviewAfterClose.outcome).toBe('review');
    if (reviewAfterClose.outcome === 'review') {
      expect(reviewAfterClose.items[0]?.calculated.reason).not.toContain('Mudança sintética posterior');
    }
  });

  it('detecta revisão obsoleta quando a projeção oficial muda antes do fechamento', async () => {
    const f = fixture();
    await decideEligible(f);
    const review = await readyReview(f.institutional);
    Object.assign(f.students[2]!.calculated as { reason: string }, {
      reason: 'Nova projeção sintética oficial após revisão.',
    });

    const response = await f.institutional.close(closeRequest(review));
    expect(response.outcome).toBe('review-conflict');
    const history = await f.institutional.history(historyRequest());
    if (history.outcome !== 'closure-history') throw new Error('Expected closure history.');
    expect(history.entries).toHaveLength(0);
  });

  it('aceita decisão formal preexistente projetada sem criar uma segunda decisão local', async () => {
    const preexisting = student(
      'formal',
      'follows-official-annual-result',
      1,
      'complete',
      'formal-decision-recorded',
    );
    const f = fixture([preexisting]);
    const review = await readyReview(f.institutional);
    expect(review.canClose).toBe(true);
    expect(review.items[0]).toMatchObject({ currentDecision: null, consistency: 'ready' });

    const closed = await f.institutional.close(closeRequest(review));
    expect(closed.outcome).toBe('closed');
    expect(await f.decisions.getHistory({ academicYearId, classReference, studentReference: preexisting.studentReference })).toEqual([]);
  });

  it('mantém votação ausente como opcional e fecha sem inventar contagem', async () => {
    const f = fixture();
    await decideEligible(f);
    const review = await readyReview(f.institutional);
    expect(review.items.every((item) => item.vote === null)).toBe(true);
    expect(review.canClose).toBe(true);

    const closed = await f.institutional.close(closeRequest(review));
    expect(closed.outcome).toBe('closed');
    if (closed.outcome === 'closed') {
      expect(closed.snapshot.items.every((item) => item.vote === null)).toBe(true);
    }
  });

  it('registra contagem numérica válida sem fabricar a decisão humana', async () => {
    const f = fixture([student('vote', 'eligible-for-council', 1)]);
    const target = f.students[0]!;
    const vote = await f.institutional.vote(voteRequest(target.studentReference, 0, 4, 2));
    expect(vote.outcome).toBe('vote-applied');
    if (vote.outcome !== 'vote-applied') throw new Error('Expected vote applied.');
    expect(vote.vote).toMatchObject({
      approvedVotes: 4,
      failedVotes: 2,
      comparison: 'approved-leading',
      actorReference,
      recordedAt: occurredAt,
    });

    const detail = await f.workspace.student({
      operation: 'student',
      contractVersion: COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
      academicYearId,
      classReference,
      studentReference: target.studentReference,
    });
    expect(detail.outcome).toBe('detail');
    if (detail.outcome === 'detail') expect(detail.detail.currentDecision).toBeNull();
    const review = await readyReview(f.institutional);
    expect(review.canClose).toBe(false);
    expect(review.blockers[0]?.code).toBe('decision-required');
  });

  it('não possui campo de abstenção e rejeita payload adicional', () => {
    const request = {
      ...voteRequest('student:synthetic-council-v2:vote' as CouncilStudentReferenceV1, 0, 1, 0),
      abstentions: 0,
    };
    expect(inspectCouncilInstitutionalRequestV2(request)).toBe('invalid-request');
    expect(Object.keys(voteRequest(request.studentReference, 0, 1, 0)).sort()).toEqual([
      'academicYearId',
      'approvedVotes',
      'classReference',
      'contractVersion',
      'expectedVersion',
      'failedVotes',
      'operation',
      'studentReference',
    ]);
  });

  it('mantém empate fail-closed sem identidade/capability oficial de diretor', async () => {
    const f = fixture([student('tie', 'eligible-for-council', 1)]);
    const target = f.students[0]!;
    const vote = await f.institutional.vote(voteRequest(target.studentReference, 0, 2, 2));
    expect(vote.outcome).toBe('vote-applied');
    if (vote.outcome !== 'vote-applied') throw new Error('Expected tied vote.');
    expect(vote.vote.comparison).toBe('tie');

    const tieBreak = await f.institutional.resolveTie({
      operation: 'tie-break',
      contractVersion: COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
      academicYearId,
      classReference,
      studentReference: target.studentReference,
      expectedVersion: vote.version,
      decision: { outcome: 'approved', resultingState: 'approved-by-council' },
    });
    expect(tieBreak).toEqual({
      contractVersion: COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
      outcome: 'tie-break-identity-unavailable',
      currentVersion: vote.version,
    });
    expect(COUNCIL_INSTITUTIONAL_POLICY_V2.administratorIsDirector).toBe(false);
    expect(COUNCIL_INSTITUTIONAL_POLICY_V2.directorIdentity).toBe('not-formalized-fail-closed');
    expect(f.decisionIdentity).not.toHaveBeenCalled();
  });

  it('continua sem motor/regra acadêmica própria e preserva autorização fail-closed', async () => {
    const implementation = readFileSync(
      join(
        process.cwd(),
        'server/gradebook/application/council/council-institutional-workspace-v2.ts',
      ),
      'utf8',
    );
    expect(implementation).not.toContain('resolveNativeAnnualOutcome');
    expect(implementation).not.toContain('failedComponentCount <=');
    expect(implementation).not.toContain('failedComponentCount >=');

    const unauthorized = fixture([student('auth', 'eligible-for-council', 1)], false);
    expect((await unauthorized.institutional.review(reviewRequest())).outcome).toBe('not-authorized');
    expect(
      (
        await unauthorized.institutional.vote(
          voteRequest(unauthorized.students[0]!.studentReference, 0, 1, 0),
        )
      ).outcome,
    ).toBe('not-authorized');
    expect(unauthorized.institutionalIdentity).not.toHaveBeenCalled();
  });
});
