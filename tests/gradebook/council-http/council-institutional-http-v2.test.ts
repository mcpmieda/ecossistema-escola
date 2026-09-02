import { describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE } from '../../../server/auth/session';
import { seal } from '../../../server/auth/sealed';
import type { RuntimeEnv } from '../../../server/env';
import { createLocalCouncilDecisionStoreV1 } from '../../../server/gradebook/application/council/council-decision-store-v1';
import { createCouncilInstitutionalWorkspaceV2 } from '../../../server/gradebook/application/council/council-institutional-workspace-v2';
import { createLocalCouncilSessionStoreV2 } from '../../../server/gradebook/application/council/council-session-store-v2';
import { createLocalCouncilWorkspaceSourceV1 } from '../../../server/gradebook/application/council/council-workspace-source-v1';
import { createCouncilWorkspaceV1 } from '../../../server/gradebook/application/council/council-workspace-v1';
import {
  createCouncilWorkspaceRequestHandlerV1,
  GRADEBOOK_COUNCIL_WORKSPACE_ROUTE_V1,
} from '../../../server/gradebook/http/council-routes-v1';
import {
  COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
  type CouncilClosureCloseResponseV2,
  type CouncilClosureHistoryResponseV2,
  type CouncilClosureReviewResponseV2,
  type CouncilTieBreakResponseV2,
  type CouncilVoteResponseV2,
} from '../../../shared/gradebook-contracts/council/council-institutional-contract-v2';
import {
  COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
  type CouncilActorReferenceV1,
  type CouncilClassReferenceV1,
  type CouncilDecisionResponseV1,
  type CouncilStudentReferenceV1,
  type CouncilStudentResponseV1,
} from '../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import type { AcademicYearId } from '../../../shared/gradebook-contracts/entities';
import { testEnv } from '../../fixtures';

const LOCAL_ORIGIN = 'http://localhost:8788';
const SESSION_OID = '33333333-3333-4333-8333-333333333333';
const SERVER_INSTANT = '2026-09-02T09:00:00.000Z';
const academicYearId = 'academic-year:synthetic-council-http-v2:2026' as AcademicYearId;
const classReference = 'class:synthetic-council-http-v2:6a' as CouncilClassReferenceV1;
const studentReference = 'student:synthetic-council-http-v2:1' as CouncilStudentReferenceV1;
type TestRole = 'ADMINISTRADOR' | 'PROFESSOR';

function env(runtime: RuntimeEnv['RUNTIME_ENVIRONMENT'] = 'local'): RuntimeEnv {
  return {
    ...testEnv,
    RUNTIME_ENVIRONMENT: runtime,
    OFFICIAL_ORIGIN: runtime === 'production' ? testEnv.OFFICIAL_ORIGIN : LOCAL_ORIGIN,
  };
}

async function headers(role?: TestRole, origin = LOCAL_ORIGIN): Promise<Headers> {
  const result = new Headers({ Origin: origin, 'Content-Type': 'application/json' });
  if (!role) return result;
  const session = await seal(
    {
      oid: SESSION_OID,
      name: 'Administrador Sintético Conselho V2',
      username: 'synthetic-council-v2@example.test',
      roles: [role],
      exp: Math.floor(Date.now() / 1000) + 600,
    },
    testEnv.SESSION_SECRET,
  );
  result.set('Cookie', `${SESSION_COOKIE}=${session}`);
  return result;
}

async function request(
  body: unknown,
  options: { readonly role?: TestRole; readonly runtime?: RuntimeEnv['RUNTIME_ENVIRONMENT'] } = {},
): Promise<Request> {
  const runtime = options.runtime ?? 'local';
  const origin = runtime === 'production' ? testEnv.OFFICIAL_ORIGIN : LOCAL_ORIGIN;
  return new Request(`${origin}${GRADEBOOK_COUNCIL_WORKSPACE_ROUTE_V1}`, {
    method: 'POST',
    headers: await headers(options.role, origin),
    body: JSON.stringify(body),
  });
}

function reviewBody() {
  return {
    operation: 'closure-review',
    contractVersion: COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
    academicYearId,
    classReference,
  } as const;
}

function historyBody() {
  return {
    operation: 'closure-history',
    contractVersion: COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
    academicYearId,
    classReference,
  } as const;
}

function decisionBody(expectedVersion = 0) {
  return {
    operation: 'decision',
    contractVersion: COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
    academicYearId,
    classReference,
    studentReference,
    expectedVersion,
    decision: { outcome: 'approved', resultingState: 'approved-by-council' },
    justification: 'Justificativa HTTP V2 sintética.',
  } as const;
}

function studentBody() {
  return {
    operation: 'student',
    contractVersion: COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
    academicYearId,
    classReference,
    studentReference,
  } as const;
}

function fixture() {
  const source = createLocalCouncilWorkspaceSourceV1({
    students: [
      {
        academicYearId,
        classReference,
        classLabel: '6º A sintético V2 HTTP',
        studentReference,
        studentLabel: 'Aluno Sintético V2 HTTP',
        calculated: {
          queueState: 'eligible-for-council',
          officialAnnualState: 'eligible-for-council',
          failedComponentCount: 1,
          coverage: {
            state: 'complete',
            expectedItemCount: 1,
            resolvedItemCount: 1,
            missingItemCount: 0,
            reasons: [],
          },
          reason: 'Elegibilidade oficial sintética V2 já resolvida.',
        },
        annualView: [],
      },
    ],
  });
  const decisions = createLocalCouncilDecisionStoreV1();
  const sessions = createLocalCouncilSessionStoreV2();
  const createWorkspace = vi.fn((_env: RuntimeEnv, server) =>
    createCouncilWorkspaceV1({ source, decisions, server }),
  );
  const createInstitutionalWorkspace = vi.fn((_env: RuntimeEnv, server) => {
    const workspace = createCouncilWorkspaceV1({ source, decisions, server });
    return createCouncilInstitutionalWorkspaceV2({
      source,
      decisions,
      workspace,
      sessions,
      server,
    });
  });
  const handler = createCouncilWorkspaceRequestHandlerV1({
    createWorkspace,
    createInstitutionalWorkspace,
    now: () => new Date(SERVER_INSTANT),
  });
  return { handler, createWorkspace, createInstitutionalWorkspace, decisions, sessions };
}

describe('Council institutional HTTP V2', () => {
  it('reusa o bridge único, exige auth/capability, responde no-store e mantém produção fechada', async () => {
    const { handler, createInstitutionalWorkspace } = fixture();

    const unauthenticated = await handler(await request(reviewBody()), env());
    expect(unauthenticated?.status).toBe(401);
    expect(unauthenticated?.headers.get('Cache-Control')).toContain('no-store');
    expect(await unauthenticated?.text()).toBe('');

    const forbidden = await handler(await request(reviewBody(), { role: 'PROFESSOR' }), env());
    expect(forbidden?.status).toBe(403);
    expect(forbidden?.headers.get('Cache-Control')).toContain('no-store');
    expect(await forbidden?.text()).toBe('');

    const production = await handler(
      await request(reviewBody(), { role: 'ADMINISTRADOR', runtime: 'production' }),
      env('production'),
    );
    expect(production?.status).toBe(503);
    expect(production?.headers.get('Cache-Control')).toContain('no-store');
    expect(createInstitutionalWorkspace).not.toHaveBeenCalled();
  });

  it('rejeita identidade, papel, capability e abstenção enviados pelo navegador antes do workspace', async () => {
    const { handler, createInstitutionalWorkspace } = fixture();
    const response = await handler(
      await request(
        {
          operation: 'vote',
          contractVersion: COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
          academicYearId,
          classReference,
          studentReference,
          expectedVersion: 0,
          approvedVotes: 2,
          failedVotes: 1,
          abstentions: 0,
          actorReference: 'browser-actor',
          occurredAt: '2000-01-01T00:00:00.000Z',
          role: 'ADMINISTRADOR',
          capability: 'gradebook.persistence.admin',
        },
        { role: 'ADMINISTRADOR' },
      ),
      env(),
    );
    expect(response?.status).toBe(400);
    expect(response?.headers.get('Cache-Control')).toContain('no-store');
    expect(createInstitutionalWorkspace).not.toHaveBeenCalled();
  });

  it('fecha com ator/instante server-side e bloqueia nova decisão depois da fotografia', async () => {
    const { handler } = fixture();

    const decision = await handler(await request(decisionBody(), { role: 'ADMINISTRADOR' }), env());
    const decisionPayload = (await decision?.json()) as CouncilDecisionResponseV1;
    expect(decisionPayload.outcome).toBe('applied');
    if (decisionPayload.outcome !== 'applied') throw new Error('Expected applied decision.');
    expect(decisionPayload.record.actorReference).toBe(SESSION_OID as CouncilActorReferenceV1);
    expect(decisionPayload.record.decidedAt).toBe(SERVER_INSTANT);

    const review = await handler(await request(reviewBody(), { role: 'ADMINISTRADOR' }), env());
    expect(review?.headers.get('Cache-Control')).toContain('no-store');
    const reviewPayload = (await review?.json()) as CouncilClosureReviewResponseV2;
    expect(reviewPayload.outcome).toBe('review');
    if (reviewPayload.outcome !== 'review') throw new Error('Expected closure review.');
    expect(reviewPayload.canClose).toBe(true);
    expect(reviewPayload.meeting.version).toBe(1);

    const closed = await handler(
      await request(
        {
          operation: 'closure-close',
          contractVersion: COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
          academicYearId,
          classReference,
          expectedVersion: reviewPayload.meeting.version,
          reviewReference: reviewPayload.reviewReference,
        },
        { role: 'ADMINISTRADOR' },
      ),
      env(),
    );
    const closedPayload = (await closed?.json()) as CouncilClosureCloseResponseV2;
    expect(closedPayload.outcome).toBe('closed');
    if (closedPayload.outcome !== 'closed') throw new Error('Expected closed Council.');
    expect(closedPayload.snapshot.closedBy).toBe(SESSION_OID as CouncilActorReferenceV1);
    expect(closedPayload.snapshot.closedAt).toBe(SERVER_INSTANT);

    const rejected = await handler(
      await request(decisionBody(1), { role: 'ADMINISTRADOR' }),
      env(),
    );
    const rejectedPayload = (await rejected?.json()) as CouncilDecisionResponseV1;
    expect(rejectedPayload.outcome).toBe('decision-unavailable');

    const history = await handler(await request(historyBody(), { role: 'ADMINISTRADOR' }), env());
    const historyPayload = (await history?.json()) as CouncilClosureHistoryResponseV2;
    expect(historyPayload.outcome).toBe('closure-history');
    if (historyPayload.outcome === 'closure-history') {
      expect(historyPayload.entries).toHaveLength(1);
      expect(historyPayload.meeting.state).toBe('closed');
    }
  });

  it('registra empate numérico opcional mas mantém desempate fail-closed e sem decisão automática', async () => {
    const { handler } = fixture();
    const vote = await handler(
      await request(
        {
          operation: 'vote',
          contractVersion: COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
          academicYearId,
          classReference,
          studentReference,
          expectedVersion: 0,
          approvedVotes: 2,
          failedVotes: 2,
        },
        { role: 'ADMINISTRADOR' },
      ),
      env(),
    );
    const votePayload = (await vote?.json()) as CouncilVoteResponseV2;
    expect(votePayload.outcome).toBe('vote-applied');
    if (votePayload.outcome !== 'vote-applied') throw new Error('Expected vote applied.');
    expect(votePayload.vote.comparison).toBe('tie');
    expect(votePayload.vote.actorReference).toBe(SESSION_OID as CouncilActorReferenceV1);
    expect(votePayload.vote.recordedAt).toBe(SERVER_INSTANT);

    const tieBreak = await handler(
      await request(
        {
          operation: 'tie-break',
          contractVersion: COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
          academicYearId,
          classReference,
          studentReference,
          expectedVersion: votePayload.version,
          decision: { outcome: 'approved', resultingState: 'approved-by-council' },
        },
        { role: 'ADMINISTRADOR' },
      ),
      env(),
    );
    const tiePayload = (await tieBreak?.json()) as CouncilTieBreakResponseV2;
    expect(tiePayload.outcome).toBe('tie-break-identity-unavailable');

    const detail = await handler(await request(studentBody(), { role: 'ADMINISTRADOR' }), env());
    const detailPayload = (await detail?.json()) as CouncilStudentResponseV1;
    expect(detailPayload.outcome).toBe('detail');
    if (detailPayload.outcome === 'detail') expect(detailPayload.detail.currentDecision).toBeNull();
  });
});
