import { beforeAll, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../../../functions/[[path]]';
import { SESSION_COOKIE } from '../../../server/auth/session';
import { seal } from '../../../server/auth/sealed';
import type { RuntimeEnv } from '../../../server/env';
import { handlePerformanceRequestV1 } from '../../../server/gradebook/http/performance-routes-v1';
import {
  PERFORMANCE_COLUMN_ORDER_V1,
  PERFORMANCE_ROW_ORDER_V1,
} from '../../../shared/gradebook-contracts/performance/class-performance-read-model-v1';
import { testEnv } from '../../fixtures';

const origins = {
  local: 'http://localhost:8788',
  preview: 'https://synthetic.pages.dev',
  production: testEnv.OFFICIAL_ORIGIN,
} as const;
type Environment = keyof typeof origins;
type Axis = 'rows' | 'columns';
type Role = 'ADMINISTRADOR' | 'PROFESSOR';
const matrix = {
  contractVersion: 1,
  academicYearId: 'year:synthetic:2026',
  classGroupId: 'class:synthetic:a',
  period: { kind: 'term', term: 1 },
  mode: 'regular',
  lens: 'result',
  comparisonPeriod: null,
  rows: { limit: 20, cursor: null },
  columns: { limit: 6, cursor: null },
  order: { rows: PERFORMANCE_ROW_ORDER_V1, columns: PERFORMANCE_COLUMN_ORDER_V1 },
} as const;

function scope(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 1,
    academicYearId: matrix.academicYearId,
    classGroupId: matrix.classGroupId,
    period: matrix.period,
    mode: matrix.mode,
    lens: matrix.lens,
    comparisonPeriod: matrix.comparisonPeriod,
    ...overrides,
  });
}
function prefix(axis: Axis): string {
  return axis === 'rows' ? 'class-performance-row-v1.' : 'class-performance-column-v1.';
}
function encode(axis: Axis, value: unknown): string {
  return prefix(axis) + Buffer.from(JSON.stringify(value)).toString('base64url');
}
function cursor(axis: Axis, overrides: Record<string, unknown> = {}): string {
  return encode(axis, { version: 1, axis, scope: scope(), key: 'synthetic:unresolved-key', ...overrides });
}
function body(axis: Axis, value: unknown) {
  return {
    transportVersion: 1,
    operation: 'matrix',
    request: { ...matrix, [axis]: { ...matrix[axis], cursor: value } },
  };
}

const cookies = new Map<Role, string>();
beforeAll(async () => {
  for (const role of ['ADMINISTRADOR', 'PROFESSOR'] as const) {
    const token = await seal({
      oid: '11111111-1111-4111-8111-111111111111',
      name: 'Synthetic', username: 'synthetic@example.test', roles: [role],
      exp: Math.floor(Date.now() / 1000) + 600,
    }, testEnv.SESSION_SECRET);
    cookies.set(role, `${SESSION_COOKIE}=${token}`);
  }
});
function environment(runtime: Environment) {
  const env: RuntimeEnv = {
    ...testEnv, RUNTIME_ENVIRONMENT: runtime, OFFICIAL_ORIGIN: origins[runtime],
    GRADEBOOK_STORAGE_PROVIDER: 'postgres', GRADEBOOK_PRODUCTION_ENABLED: 'true',
  };
  const access = vi.fn(() => { throw new Error('retired-cursor-storage-access'); });
  for (const key of ['GRADEBOOK_D1', 'GRADEBOOK_DATABASE', 'PROD_DB']) {
    Object.defineProperty(env, key, { get: access, configurable: true, enumerable: true });
  }
  return { env, access };
}
function request(env: RuntimeEnv, payload: unknown, role: Role | null = 'ADMINISTRADOR') {
  const headers = new Headers({ Origin: env.OFFICIAL_ORIGIN, 'Content-Type': 'application/json' });
  if (role !== null) headers.set('Cookie', cookies.get(role)!);
  return new Request(`${env.OFFICIAL_ORIGIN}/api/gradebook/performance`, {
    method: 'POST', headers, body: JSON.stringify(payload),
  });
}
async function expectFailure(response: Response | null, reason: string): Promise<void> {
  expect(response?.status).toBe(400);
  expect(response?.headers.get('Cache-Control')).toContain('no-store');
  await expect(response?.json()).resolves.toEqual({ transportVersion: 1, state: 'invalid-request', reason });
}

function malformedCursors(axis: Axis): string[] {
  const other = axis === 'rows' ? 'columns' : 'rows';
  return [
    '***', prefix(axis) + '***', prefix(axis) + Buffer.from('{').toString('base64url'),
    prefix(axis) + Buffer.from([0xc3, 0x28]).toString('base64url'),
    encode(axis, null), encode(axis, []), encode(axis, 'synthetic'), encode(axis, {}),
    encode(axis, { version: 1, axis, scope: scope() }),
    cursor(other), cursor(axis, { axis: other }), cursor(axis, { version: 2 }),
    cursor(axis, { key: '' }), cursor(axis, { key: '   ' }), cursor(axis, { key: 1 }),
    cursor(axis, { unexpected: true }), cursor(axis, { scope: null }),
    cursor(axis, { scope: 'not-json' }),
    ...[
      { academicYearId: 'year:synthetic:2025' }, { classGroupId: 'class:synthetic:b' },
      { period: { kind: 'term', term: 2 } }, { mode: 'recovery' }, { lens: 'quantitative' },
      { comparisonPeriod: { kind: 'term', term: 2 } },
    ].map((overrides) => cursor(axis, { scope: scope(overrides) })),
  ];
}

describe.each(['local', 'preview', 'production'] as const)('retired performance cursors in %s', (runtime) => {
  it.each(['rows', 'columns'] as const)('rejects malformed %s cursors without reading a binding', async (axis) => {
    const { env, access } = environment(runtime);
    const reason = axis === 'rows' ? 'invalid-row-cursor' : 'invalid-column-cursor';
    for (const value of malformedCursors(axis)) {
      await expectFailure(await handlePerformanceRequestV1(request(env, body(axis, value)), env), reason);
    }
    expect(access).not.toHaveBeenCalled();
  });

  it.each(['rows', 'columns'] as const)('preserves structural validation of %s before cursor decoding', async (axis) => {
    const { env, access } = environment(runtime);
    for (const value of ['', '   ', 1, false, {}, []]) {
      await expectFailure(await handlePerformanceRequestV1(request(env, body(axis, value)), env), 'invalid-request');
    }
    expect(access).not.toHaveBeenCalled();
  });

  it('keeps column-before-row error precedence when both cursors are malformed', async () => {
    const { env, access } = environment(runtime);
    const payload = { transportVersion: 1, operation: 'matrix', request: {
      ...matrix, rows: { limit: 20, cursor: '***' }, columns: { limit: 6, cursor: '***' },
    } };
    await expectFailure(await handlePerformanceRequestV1(request(env, payload), env), 'invalid-column-cursor');
    expect(access).not.toHaveBeenCalled();
  });

  it('retires null or structurally valid cursors without checking whether their keys exist', async () => {
    const { env, access } = environment(runtime);
    for (const rows of [null, cursor('rows')]) {
      for (const columns of [null, cursor('columns')]) {
        const payload = { transportVersion: 1, operation: 'matrix', request: {
          ...matrix, rows: { limit: 20, cursor: rows }, columns: { limit: 6, cursor: columns },
        } };
        const response = await handlePerformanceRequestV1(request(env, payload), env);
        expect(response?.status).toBe(410);
        expect(response?.headers.get('Cache-Control')).toContain('no-store');
        await expect(response?.json()).resolves.toEqual({ transportVersion: 1, state: 'unavailable' });
      }
    }
    expect(access).not.toHaveBeenCalled();
  });

  it('uses the existing canonical scope rather than incoming period property order', async () => {
    const { env, access } = environment(runtime);
    const canonical = scope({ comparisonPeriod: { kind: 'term', term: 2 } });
    const payload = { transportVersion: 1, operation: 'matrix', request: {
      ...matrix, period: { term: 1, kind: 'term' }, comparisonPeriod: { term: 2, kind: 'term' },
      rows: { limit: 20, cursor: cursor('rows', { scope: canonical }) },
      columns: { limit: 6, cursor: cursor('columns', { scope: canonical }) },
    } };
    const response = await handlePerformanceRequestV1(request(env, payload), env);
    expect(response?.status).toBe(410);
    expect(response?.headers.get('Cache-Control')).toContain('no-store');
    await expect(response?.json()).resolves.toEqual({ transportVersion: 1, state: 'unavailable' });
    expect(access).not.toHaveBeenCalled();
  });

  it.each([[null, 401], ['PROFESSOR', 403]] as const)('keeps authorization ahead of cursor validation for %s', async (role, status) => {
    const { env, access } = environment(runtime);
    const response = await handlePerformanceRequestV1(request(env, body('rows', '***'), role), env);
    expect(response?.status).toBe(status);
    expect(response?.headers.get('Cache-Control')).toContain('no-store');
    await expect(response?.json()).resolves.toEqual({ transportVersion: 1, state: 'not-authorized' });
    expect(access).not.toHaveBeenCalled();
  });

  it.each(['rows', 'columns'] as const)('keeps the central Functions dispatch safe for %s', async (axis) => {
    const { env, access } = environment(runtime);
    // Environment parsing reads fields; any use of a supplied binding still fails.
    const binding = new Proxy({}, { get: access });
    for (const key of ['GRADEBOOK_D1', 'GRADEBOOK_DATABASE', 'PROD_DB']) {
      Object.defineProperty(env, key, { value: binding, configurable: true, enumerable: true });
    }
    const response = await onRequest({ env, request: request(env, body(axis, '***')) } as never);
    await expectFailure(response, axis === 'rows' ? 'invalid-row-cursor' : 'invalid-column-cursor');
    expect(access).not.toHaveBeenCalled();
  });
});
