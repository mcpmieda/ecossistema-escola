import { describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE } from '../../../server/auth/session';
import { seal } from '../../../server/auth/sealed';
import type { RuntimeEnv } from '../../../server/env';
import { createCouncilWorkspaceRequestHandlerV1, GRADEBOOK_COUNCIL_WORKSPACE_ROUTE_V1 } from '../../../server/gradebook/http/council-routes-v1';
import type { CouncilClassReferenceV1, CouncilStudentReferenceV1 } from '../../../shared/gradebook-contracts/council/council-workspace-contract-v1';

import type { AcademicYearId } from '../../../shared/gradebook-contracts/entities';
import { testEnv } from '../../fixtures';

const LOCAL_ORIGIN = 'http://localhost:8788';
const SESSION_OID = '22222222-2222-4222-8222-222222222222';
const academicYearId = 'academic-year:synthetic-council-http:2026' as AcademicYearId;
const classReference = 'class:synthetic-council-http:6a' as CouncilClassReferenceV1;
const studentReference = 'student:synthetic-council-http:1' as CouncilStudentReferenceV1;
type TestRole = 'ADMINISTRADOR' | 'PROFESSOR';

function env(runtime: RuntimeEnv['RUNTIME_ENVIRONMENT'] = 'local'): RuntimeEnv {
  return {
    ...testEnv,
    RUNTIME_ENVIRONMENT: runtime,
    OFFICIAL_ORIGIN: runtime === 'production' ? testEnv.OFFICIAL_ORIGIN : runtime === 'preview' ? 'https://synthetic.pages.dev' : LOCAL_ORIGIN,
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
  const origin = runtime === 'production' ? testEnv.OFFICIAL_ORIGIN : runtime === 'preview' ? 'https://synthetic.pages.dev' : LOCAL_ORIGIN;
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



const bodies = [queueBody(), studentBody(), decisionBody()];
const expected = [
  { contractVersion: 1, outcome: 'unavailable', items: [], nextCursor: null },
  { contractVersion: 1, outcome: 'unavailable', detail: null },
  { contractVersion: 1, outcome: 'unavailable', currentVersion: null },
];
function guardedEnv(runtime: RuntimeEnv['RUNTIME_ENVIRONMENT'] = 'local') {
  const value = env(runtime);
  const access = vi.fn(() => { throw new Error('retired-council-storage-access'); });
  Object.defineProperties(value, { GRADEBOOK_D1: { get: access }, GRADEBOOK_DATABASE: { get: access } });
  return { value, access };
}
describe('Council HTTP V1 retirement', () => {
  it.each([[undefined, 401], ['PROFESSOR', 403]] as const)('preserves authorization for %s', async (role, status) => {
    const { value, access } = guardedEnv();
    const handler = createCouncilWorkspaceRequestHandlerV1();
    const response = await handler(await request(bodies[0], { role }), value);
    expect(response?.status).toBe(status);
    expect(response?.headers.get('Cache-Control')).toContain('no-store');
    expect(await response?.text()).toBe('');
    expect(access).not.toHaveBeenCalled();
  });
  it.each(['local', 'preview', 'production'] as const)('retires every V1 operation without storage in %s', async (runtime) => {
    const { value, access } = guardedEnv(runtime);
    const handler = createCouncilWorkspaceRequestHandlerV1();
    for (const [index, body] of bodies.entries()) {
      const response = await handler(await request(body, { role: 'ADMINISTRADOR', runtime }), value);
      expect(response?.status).toBe(410);
      expect(response?.headers.get('Cache-Control')).toContain('no-store');
      await expect(response?.json()).resolves.toEqual(expected[index]);
    }
    expect(access).not.toHaveBeenCalled();
  });
  it('rejects browser-supplied identity, permissions and invalid bounds before retirement', async () => {
    const { value, access } = guardedEnv();
    const handler = createCouncilWorkspaceRequestHandlerV1();
    for (const field of ['actorReference', 'occurredAt', 'decidedAt', 'role', 'capability', 'abstentions']) {
      const response = await handler(await request({ ...bodies[2], [field]: 'forged' }, { role: 'ADMINISTRADOR' }), value);
      expect(response?.status).toBe(400);
      expect(response?.headers.get('Cache-Control')).toContain('no-store');
    }
    const invalid = await handler(await request({ ...bodies[2], expectedVersion: -1 }, { role: 'ADMINISTRADOR' }), value);
    expect(invalid?.status).toBe(400);
    expect(access).not.toHaveBeenCalled();
  });
});
