import { describe, expect, it, vi } from 'vitest';
import type { RuntimeEnv } from '../../../server/env';
import type { RelationalInstitutionalReportsServiceV2 } from '../../../server/gradebook/application/reports/relational-institutional-reports-v2';
import {
  createInstitutionalReportsRequestHandlerV1,
  GRADEBOOK_INSTITUTIONAL_REPORTS_ROUTE_V1,
} from '../../../server/gradebook/http/institutional-reports-routes-v1';
import type { GradebookD1RuntimeAuthorizationV1 } from '../../../server/gradebook/persistence/d1/runtime/d1-runtime-authorization-v1';
import type { InstitutionalReportsServiceV1 } from '../../../server/gradebook/application/reports/institutional-reports-service-v1';
import { testEnv } from '../../fixtures';

const ORIGIN = 'http://localhost:8788';
const authorization = {} as GradebookD1RuntimeAuthorizationV1;

function env(): RuntimeEnv {
  return {
    ...testEnv,
    RUNTIME_ENVIRONMENT: 'local',
    OFFICIAL_ORIGIN: ORIGIN,
    GRADEBOOK_STORAGE_PROVIDER: 'postgres',
    GRADEBOOK_D1: {} as never,
  };
}

function request(payload: unknown) {
  return new Request(`${ORIGIN}${GRADEBOOK_INSTITUTIONAL_REPORTS_ROUTE_V1}`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function fixture() {
  const execute = vi.fn(async (request: { readonly year?: number }) => ({
    contractVersion: 2,
    operation: 'catalog',
    state: 'ready',
    year: request.year ?? 2026,
    classes: [{ id: 1, code: '6A', name: '6º ANO A' }],
  } as const));
  const relational = { execute } as unknown as RelationalInstitutionalReportsServiceV2;
  const createRelationalService = vi.fn(() => relational);
  const handler = createInstitutionalReportsRequestHandlerV1({
    authorizeRequest: vi.fn(async () => ({ runtimeAuthorization: authorization, actorOid: 'actor-oid' })),
    createService: vi.fn(() => ({ execute: vi.fn() }) as unknown as InstitutionalReportsServiceV1),
    createRelationalService,
  });
  return { handler, execute, createRelationalService };
}

describe('relational institutional reports HTTP V2', () => {
  it('routes the V2 contract with no-store and actor identity', async () => {
    const { handler, execute, createRelationalService } = fixture();
    const payload = { contractVersion: 2, operation: 'catalog', year: 2026 };
    const response = await handler(request(payload), env());
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Cache-Control')).toContain('no-store');
    expect(response?.headers.get('Pragma')).toBe('no-cache');
    expect(createRelationalService).toHaveBeenCalledWith(env(), 'actor-oid');
    expect(execute).toHaveBeenCalledWith(payload, { oid: 'actor-oid' });
    expect(await response?.json()).toMatchObject({ contractVersion: 2, operation: 'catalog', state: 'ready' });
  });

  it('routes another valid academic year to the relational source', async () => {
    const { handler, execute, createRelationalService } = fixture();
    const response = await handler(request({ contractVersion: 2, operation: 'catalog', year: 2027 }), env());
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({ contractVersion: 2, operation: 'catalog', state: 'ready', year: 2027 });
    expect(createRelationalService).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith({ contractVersion: 2, operation: 'catalog', year: 2027 }, { oid: 'actor-oid' });
  });

  it('fails closed when the PostgreSQL runtime is not available', async () => {
    const { handler, createRelationalService } = fixture();
    const disabled = { ...env(), GRADEBOOK_STORAGE_PROVIDER: 'd1' as const };
    const response = await handler(request({ contractVersion: 2, operation: 'catalog', year: 2026 }), disabled);
    expect(response?.status).toBe(503);
    expect(await response?.json()).toMatchObject({ contractVersion: 2, state: 'unavailable' });
    expect(createRelationalService).not.toHaveBeenCalled();
  });
});
