import { describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE } from '../../../server/auth/session';
import { seal } from '../../../server/auth/sealed';
import type { RuntimeEnv } from '../../../server/env';
import { createLocalCouncilDecisionStoreV1 } from '../../../server/gradebook/application/council/council-decision-store-v1';
import { createLocalCouncilWorkspaceSourceV1 } from '../../../server/gradebook/application/council/council-workspace-source-v1';
import { createCouncilWorkspaceV1 } from '../../../server/gradebook/application/council/council-workspace-v1';
import {
  createCouncilWorkspaceRequestHandlerV1,
  GRADEBOOK_COUNCIL_WORKSPACE_ROUTE_V1,
} from '../../../server/gradebook/http/council-routes-v1';
import type {
  CouncilActorReferenceV1,
  CouncilClassReferenceV1,
  CouncilDecisionResponseV1,
  CouncilQueueResponseV1,
  CouncilStudentReferenceV1,
  CouncilStudentResponseV1,
} from '../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import type { AcademicYearId } from '../../../shared/gradebook-contracts/entities';
import { testEnv } from '../../fixtures';

const LOCAL_ORIGIN = 'http://localhost:8788';
const SESSION_OID = '22222222-2222-4222-8222-222222222222';
const SERVER_INSTANT = '2026-09-01T22:45:00.000Z';
const academicYearId = 'academic-year:synthetic-council-http:2026' as AcademicYearId;
const classReference = 'class:synthetic-council-http:6a' as CouncilClassReferenceV1;
const studentReference = 'student:synthetic-council-http:1' as CouncilStudentReferenceV1;
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
      name: 'Administrador Sintético Conselho',
      username: 'synthetic-council-http@example.test',
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

function queueBody() {
  return {
    operation: 'queue',
    contractVersion: 1,
    academicYearId,
    classReference,
    page: { limit: 20, cursor: null },
  } as const;
}

function studentBody() {
  return {
    operation: 'student',
    contractVersion: 1,
    academicYearId,
    classReference,
    studentReference,
  } as const;
}

function decisionBody() {
  return {
    operation: 'decision',
    contractVersion: 1,
    academicYearId,
    classReference,
    studentReference,
    expectedVersion: 0,
    decision: { outcome: 'approved', resultingState: 'approved-by-council' },
    justification: 'Justificativa HTTP sintética.',
  } as const;
}

function fixture() {
  const source = createLocalCouncilWorkspaceSourceV1({
    students: [
      {
        academicYearId,
        classReference,
        classLabel: '6º A sintético',
        studentReference,
        studentLabel: 'Aluno Sintético HTTP',
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
          reason: 'Elegibilidade oficial sintética já resolvida.',
        },
        annualView: [],
      },
    ],
  });
  const decisions = createLocalCouncilDecisionStoreV1();
  const createWorkspace = vi.fn((_env: RuntimeEnv, server) =>
    createCouncilWorkspaceV1({ source, decisions, server }),
  );
  const handler = createCouncilWorkspaceRequestHandlerV1({
    createWorkspace,
    now: () => new Date(SERVER_INSTANT),
  });
  return { handler, createWorkspace };
}

describe('Council Workspace HTTP V1', () => {
  it('exige autenticação/capability e mantém respostas de acesso sem disclosure e no-store', async () => {
    const { handler, createWorkspace } = fixture();
    const unauthenticated = await handler(await request(queueBody()), env());
    expect(unauthenticated?.status).toBe(401);
    expect(unauthenticated?.headers.get('Cache-Control')).toContain('no-store');
    expect(await unauthenticated?.text()).toBe('');

    const forbidden = await handler(await request(queueBody(), { role: 'PROFESSOR' }), env());
    expect(forbidden?.status).toBe(403);
    expect(forbidden?.headers.get('Cache-Control')).toContain('no-store');
    expect(await forbidden?.text()).toBe('');
    expect(createWorkspace).not.toHaveBeenCalled();
  });

  it('delega produção autorizada ao runtime central sem duplicar o gate no bridge', async () => {
    const { handler, createWorkspace } = fixture();
    const response = await handler(
      await request(queueBody(), { role: 'ADMINISTRADOR', runtime: 'production' }),
      { ...env('production'), GRADEBOOK_PRODUCTION_ENABLED: 'true' },
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Cache-Control')).toContain('no-store');
    expect(createWorkspace).toHaveBeenCalledTimes(1);
    expect(createWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ RUNTIME_ENVIRONMENT: 'production' }),
      expect.any(Object),
    );
  });

  it('lista local/preview autorizado e usa o bridge dedicado com no-store', async () => {
    const { handler } = fixture();
    const response = await handler(await request(queueBody(), { role: 'ADMINISTRADOR' }), env());
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Cache-Control')).toContain('no-store');
    const payload = (await response?.json()) as CouncilQueueResponseV1;
    expect(payload).toMatchObject({
      contractVersion: 1,
      outcome: 'items',
      academicYearId,
      classReference,
    });
    if (payload.outcome !== 'items') throw new Error('Expected Council queue items.');
    expect(payload.items).toHaveLength(1);
  });

  it('rejeita ator, instante, papel ou capability enviados pelo navegador antes do workspace', async () => {
    const { handler, createWorkspace } = fixture();
    const response = await handler(
      await request(
        {
          ...decisionBody(),
          actorReference: 'browser-actor',
          decidedAt: '2000-01-01T00:00:00.000Z',
          role: 'ADMINISTRADOR',
          capability: 'gradebook.persistence.admin',
        },
        { role: 'ADMINISTRADOR' },
      ),
      env(),
    );
    expect(response?.status).toBe(400);
    expect(response?.headers.get('Cache-Control')).toContain('no-store');
    expect(createWorkspace).not.toHaveBeenCalled();
  });

  it('registra decisão com ator da sessão e instante do servidor, nunca do browser', async () => {
    const { handler } = fixture();
    const applied = await handler(await request(decisionBody(), { role: 'ADMINISTRADOR' }), env());
    expect(applied?.status).toBe(200);
    const appliedPayload = (await applied?.json()) as CouncilDecisionResponseV1;
    expect(appliedPayload.outcome).toBe('applied');
    if (appliedPayload.outcome !== 'applied') throw new Error('Expected applied Council decision.');
    expect(appliedPayload.record.actorReference).toBe(SESSION_OID as CouncilActorReferenceV1);
    expect(appliedPayload.record.decidedAt).toBe(SERVER_INSTANT);
    expect(appliedPayload.record.annualFinalDecision.basis).toBe('class-council');

    const detail = await handler(await request(studentBody(), { role: 'ADMINISTRADOR' }), env());
    const detailPayload = (await detail?.json()) as CouncilStudentResponseV1;
    if (detailPayload.outcome !== 'detail') throw new Error('Expected Council student detail.');
    expect(detailPayload.detail.version).toBe(1);
    expect(detailPayload.detail.history).toHaveLength(1);
  });
});
