import { describe, expect, it, vi } from 'vitest';
import { AuthenticationError } from '../../../server/auth/session';
import type { RuntimeEnv } from '../../../server/env';
import type { InstitutionalReportsServiceV1 } from '../../../server/gradebook/application/reports/institutional-reports-service-v1';
import {
  createInstitutionalReportsRequestHandlerV1,
  GRADEBOOK_INSTITUTIONAL_REPORTS_ROUTE_V1,
} from '../../../server/gradebook/http/institutional-reports-routes-v1';
import type { GradebookD1RuntimeAuthorizationV1 } from '../../../server/gradebook/persistence/d1/runtime/d1-runtime-authorization-v1';
import type { AcademicYearId, ClassGroupId } from '../../../shared/gradebook-contracts/entities';
import {
  CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
  PERFORMANCE_COLUMN_ORDER_V1,
  PERFORMANCE_ROW_ORDER_V1,
} from '../../../shared/gradebook-contracts/performance/class-performance-read-model-v1';
import { INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1 } from '../../../shared/gradebook-contracts/reports/institutional-reports-contract-v1';
import { testEnv } from '../../fixtures';

const LOCAL_ORIGIN = 'http://localhost:8788';
const academicYearId = 'academic-year:synthetic:reports-http:2026' as AcademicYearId;
const classGroupId = 'class-group:synthetic:reports-http:6a' as ClassGroupId;
const authorization = {} as GradebookD1RuntimeAuthorizationV1;

function env(): RuntimeEnv {
  return { ...testEnv, RUNTIME_ENVIRONMENT: 'local', OFFICIAL_ORIGIN: LOCAL_ORIGIN };
}

function body() {
  return {
    contractVersion: INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
    family: 'class-results',
    request: {
      contractVersion: CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
      academicYearId,
      classGroupId,
      period: { kind: 'term', term: 1 },
      mode: 'regular',
      lens: 'result',
      comparisonPeriod: null,
      rows: { limit: 20, cursor: null },
      columns: { limit: 8, cursor: null },
      order: { rows: PERFORMANCE_ROW_ORDER_V1, columns: PERFORMANCE_COLUMN_ORDER_V1 },
    },
  } as const;
}

function request(payload: unknown, path = GRADEBOOK_INSTITUTIONAL_REPORTS_ROUTE_V1): Request {
  return new Request(`${LOCAL_ORIGIN}${path}`, {
    method: 'POST',
    headers: { Origin: LOCAL_ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function fixture(options: { readonly unauthenticated?: boolean } = {}) {
  const execute = vi.fn(async () => ({
    contractVersion: INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
    state: 'empty' as const,
    family: 'class-results' as const,
    report: null,
    hardStop: null,
  }));
  const service = { execute } as InstitutionalReportsServiceV1;
  const createService = vi.fn(() => service);
  const authorizeRequest = vi.fn(async () => {
    if (options.unauthenticated) throw new AuthenticationError();
    return authorization;
  });
  const handler = createInstitutionalReportsRequestHandlerV1({ authorizeRequest, createService });
  return { handler, execute, createService, authorizeRequest };
}

describe('Institutional reports HTTP V1', () => {
  it('permanece isolado fora da rota dedicada', async () => {
    const { handler, authorizeRequest } = fixture();
    expect(await handler(request(body(), '/api/gradebook/other'), env())).toBeNull();
    expect(authorizeRequest).not.toHaveBeenCalled();
  });

  it('exige autenticação sem inventar família e sempre usa no-store', async () => {
    const { handler, createService } = fixture({ unauthenticated: true });
    const response = await handler(request(body()), env());
    expect(response?.status).toBe(401);
    expect(response?.headers.get('Cache-Control')).toContain('no-store');
    expect(await response?.json()).toEqual({
      contractVersion: INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
      state: 'not-authorized',
      report: null,
      hardStop: null,
    });
    expect(createService).not.toHaveBeenCalled();
  });

  it('rejeita bounds/regras client-side antes de compor qualquer fonte', async () => {
    const { handler, createService } = fixture();
    const invalid = { ...body(), academicRules: [{ formula: 'synthetic-forbidden' }] };
    const response = await handler(request(invalid), env());
    expect(response?.status).toBe(400);
    expect(response?.headers.get('Cache-Control')).toContain('no-store');
    expect(await response?.json()).toMatchObject({ state: 'invalid-request', report: null });
    expect(createService).not.toHaveBeenCalled();
  });

  it('encaminha request oficial ao serviço read-only e responde no-store', async () => {
    const { handler, createService, execute } = fixture();
    const response = await handler(request(body()), env());
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Cache-Control')).toContain('no-store');
    expect(response?.headers.get('Pragma')).toBe('no-cache');
    expect(createService).toHaveBeenCalledWith(env(), authorization);
    expect(execute).toHaveBeenCalledWith(body());
    expect(await response?.json()).toMatchObject({
      contractVersion: 1,
      state: 'empty',
      family: 'class-results',
    });
  });
});
