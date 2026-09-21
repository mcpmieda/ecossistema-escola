import { describe, expect, it, vi } from 'vitest';
import type { AcademicYearId, ClassGroupId } from '../../../shared/gradebook-contracts/entities';
import { CLASS_PERFORMANCE_CONTRACT_VERSION_V1, PERFORMANCE_COLUMN_ORDER_V1, PERFORMANCE_ROW_ORDER_V1,
  type ClassPerformanceRequestV1 } from '../../../shared/gradebook-contracts/performance/class-performance-read-model-v1';
import { AuthorizationError } from '../../../server/auth/roles';
import { AuthenticationError } from '../../../server/auth/session';
import type { RuntimeEnv } from '../../../server/env';
import { createPerformanceRequestHandlerV1 } from '../../../server/gradebook/http/performance-routes-v1';

const ORIGIN = 'https://preview.pages.dev';
const env = { OFFICIAL_ORIGIN: ORIGIN } as RuntimeEnv;
const academicYearId = 'year-synthetic-2026' as AcademicYearId;
const classGroupId = 'class-synthetic-a' as ClassGroupId;

function matrixRequest(
  overrides: Partial<ClassPerformanceRequestV1> = {},
): ClassPerformanceRequestV1 {
  return {
    contractVersion: CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
    academicYearId,
    classGroupId,
    period: { kind: 'term', term: 1 },
    mode: 'regular',
    lens: 'result',
    comparisonPeriod: null,
    rows: { limit: 20, cursor: null },
    columns: { limit: 6, cursor: null },
    order: { rows: PERFORMANCE_ROW_ORDER_V1, columns: PERFORMANCE_COLUMN_ORDER_V1 },
    ...overrides,
  };
}

function request(body: unknown): Request {
  return new Request(`${ORIGIN}/api/gradebook/performance`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}


function handler() {
  return createPerformanceRequestHandlerV1({ async authorizeRequest() {
    return { runtimeAuthorization: {} as never, capabilities: ['platform.settings.read'] };
  } });
}
async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}
describe('Performance HTTP V1 retirement', () => {
  it.each([AuthenticationError, AuthorizationError])('preserves %s before storage access', async (ErrorType) => {
    const access = vi.fn(() => { throw new Error('retired-storage-access'); });
    const guarded = Object.defineProperty({ ...env }, 'GRADEBOOK_DATABASE', { get: access });
    const route = createPerformanceRequestHandlerV1({ async authorizeRequest() { throw new ErrorType(); } });
    const response = await route(request({ transportVersion: 1, operation: 'matrix', request: matrixRequest() }), guarded);
    expect(response?.status).toBe(new ErrorType().status);
    expect(response?.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate, private');
    await expect(response?.json()).resolves.toEqual({ transportVersion: 1, state: 'not-authorized' });
    expect(access).not.toHaveBeenCalled();
  });
  it('mantém dispatch explícito e gate fail-closed para transportes V2 a V6', async () => {
    const route = handler();
    const validCurrentRequests = [
      { transportVersion: 2, operation: 'classes', year: 2026, offset: 0, limit: 100 },
      {
        transportVersion: 3,
        operation: 'analysis',
        year: 2026,
        classId: 10,
        period: 1,
        mode: 'regular',
        statuses: [null, 7],
        lens: 'result',
        offerId: null,
      },
      {
        transportVersion: 4,
        operation: 'term-comparison',
        year: 2026,
        classId: 10,
        period: 3,
        referencePeriod: 1,
        mode: 'regular',
        statuses: [null, 7],
        lens: 'result',
        offerId: null,
      },
      {
        transportVersion: 5,
        operation: 'dashboard',
        year: 2026,
        classId: 10,
        period: 1,
        referencePeriod: null,
        mode: 'regular',
        statuses: [null, 7],
        lens: 'result',
        offerId: null,
      },
      {
        transportVersion: 6,
        operation: 'analytics',
        year: 2026,
        classId: 10,
        period: 1,
      },
    ] as const;

    for (const value of validCurrentRequests) {
      const response = await route(request(value), env);
      expect(response?.status).toBe(503);
      expect(await json(response as Response)).toEqual({
        transportVersion: value.transportVersion,
        state: 'unavailable',
      });
    }

    for (const transportVersion of [2, 3, 4, 5, 6] as const) {
      const response = await route(request({ transportVersion }), env);
      expect(response?.status).toBe(400);
      expect(await json(response as Response)).toEqual({
        transportVersion,
        state: 'invalid-request',
      });
    }
  });


  it('validates bounds and rejects client configuration before retirement', async () => {
    const route = handler();
    for (const value of [{ bad: true }, matrixRequest({ rows: { limit: 0, cursor: null } }),
      matrixRequest({ columns: { limit: 0, cursor: null } }), { ...matrixRequest(), comparisonEnabled: false }]) {
      const response = await route(request({ transportVersion: 1, operation: 'matrix', request: value }), env);
      expect(response?.status).toBe(400);
      await expect(response?.json()).resolves.toEqual({ transportVersion: 1, state: 'invalid-request', reason: 'invalid-request' });
    }
  });
  it('retires valid lenses, periods and details without resolving a source or configuration', async () => {
    const access = vi.fn(() => { throw new Error('retired-storage-access'); });
    const guarded = Object.defineProperties({ ...env }, {
      GRADEBOOK_D1: { get: access }, GRADEBOOK_DATABASE: { get: access },
    });
    const route = handler();
    const matrices = [matrixRequest(), matrixRequest({ lens: 'quantitative', mode: 'recovery' }),
      matrixRequest({ lens: 'qualitative', mode: 'recovery' }), matrixRequest({ lens: 'assessments', mode: 'recovery' }),
      matrixRequest({ lens: 'result', mode: 'recovery' }), matrixRequest({ lens: 'quantitative', period: { kind: 'annual' } }),
      matrixRequest({ comparisonPeriod: { kind: 'term', term: 2 } })];
    const bodies = [...matrices.map((value) => ({ transportVersion: 1, operation: 'matrix', request: value })),
      { transportVersion: 1, operation: 'student-detail', detailRef: 'opaque-synthetic-student' },
      { transportVersion: 1, operation: 'cell-detail', detailRef: 'opaque-synthetic-cell' }];
    for (const body of bodies) {
      const response = await route(request(body), guarded);
      expect(response?.status).toBe(410);
      expect(response?.headers.get('Cache-Control')).toContain('no-store');
      await expect(response?.json()).resolves.toEqual({ transportVersion: 1, state: 'unavailable' });
    }
    expect(access).not.toHaveBeenCalled();
  });
});
