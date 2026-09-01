import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AcademicYearId, ClassGroupId } from '../../../shared/gradebook-contracts/entities';
import {
  CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
  PERFORMANCE_AUTHORITY_MODE_V1,
  PERFORMANCE_COLUMN_ORDER_V1,
  PERFORMANCE_ROW_ORDER_V1,
  type ClassPerformanceRequestV1,
  type PerformanceCellDetailRefV1,
  type PerformanceCellV1,
  type PerformanceStudentDetailRefV1,
} from '../../../shared/gradebook-contracts/performance/class-performance-read-model-v1';
import { PERFORMANCE_TRANSPORT_VERSION_V1 } from '../../../shared/gradebook-contracts/performance/performance-transport-v1';
import { AuthorizationError } from '../../../server/auth/roles';
import { AuthenticationError } from '../../../server/auth/session';
import type { RuntimeEnv } from '../../../server/env';
import {
  ClassPerformanceReadModelErrorV1,
  type ClassPerformanceReadModelProviderV1,
} from '../../../server/gradebook/application/read-models/performance/class-performance-read-model-v1';
import { createPerformanceRequestHandlerV1 } from '../../../server/gradebook/http/performance-routes-v1';

const ORIGIN = 'https://preview.pages.dev';
const env = { OFFICIAL_ORIGIN: ORIGIN } as RuntimeEnv;
const academicYearId = 'year-synthetic-2026' as AcademicYearId;
const classGroupId = 'class-synthetic-a' as ClassGroupId;

function matrixRequest(overrides: Partial<ClassPerformanceRequestV1> = {}): ClassPerformanceRequestV1 {
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

function fakeProvider(overrides: Partial<ClassPerformanceReadModelProviderV1> = {}): ClassPerformanceReadModelProviderV1 {
  return {
    async get() { return null; },
    async getStudentDetail() { return null; },
    async getCellDetail() { return null; },
    ...overrides,
  };
}

function handler(provider: ClassPerformanceReadModelProviderV1) {
  return createPerformanceRequestHandlerV1({
    async authorizeRequest() { return {} as never; },
    createProvider() { return provider; },
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

describe('Performance HTTP V1', () => {
  it('exige autenticação antes de construir provider e responde no-store', async () => {
    let created = false;
    const route = createPerformanceRequestHandlerV1({
      async authorizeRequest() { throw new AuthenticationError(); },
      createProvider() { created = true; return fakeProvider(); },
    });
    const response = await route(request({
      transportVersion: PERFORMANCE_TRANSPORT_VERSION_V1,
      operation: 'matrix',
      request: matrixRequest(),
    }), env);

    expect(response?.status).toBe(401);
    expect(response?.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate, private');
    expect(created).toBe(false);
    expect(await json(response as Response)).toEqual({ transportVersion: 1, state: 'not-authorized' });
  });

  it('exige autorização server-side e não constrói provider após 403', async () => {
    let created = false;
    const route = createPerformanceRequestHandlerV1({
      async authorizeRequest() { throw new AuthorizationError(); },
      createProvider() { created = true; return fakeProvider(); },
    });
    const response = await route(request({
      transportVersion: PERFORMANCE_TRANSPORT_VERSION_V1,
      operation: 'matrix',
      request: matrixRequest(),
    }), env);

    expect(response?.status).toBe(403);
    expect(response?.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate, private');
    expect(created).toBe(false);
    expect(await json(response as Response)).toEqual({ transportVersion: 1, state: 'not-authorized' });
  });

  it('valida payload e sanitiza cursores de linha/coluna inválidos sem expor detalhes', async () => {
    let providerCalls = 0;
    const route = handler(fakeProvider({
      async get(value) {
        providerCalls += 1;
        if (value.rows.cursor !== null) throw new ClassPerformanceReadModelErrorV1('invalid-row-cursor');
        if (value.columns.cursor !== null) throw new ClassPerformanceReadModelErrorV1('invalid-column-cursor');
        return null;
      },
    }));

    const invalid = await route(request({ transportVersion: 1, operation: 'matrix', request: { bad: true } }), env);
    expect(invalid?.status).toBe(400);
    expect(providerCalls).toBe(0);

    const rowFailure = await route(request({
      transportVersion: 1,
      operation: 'matrix',
      request: matrixRequest({ rows: { limit: 20, cursor: 'opaque-invalid-row' as never } }),
    }), env);
    expect(rowFailure?.status).toBe(400);
    expect(await json(rowFailure as Response)).toEqual({
      transportVersion: 1,
      state: 'invalid-request',
      reason: 'invalid-row-cursor',
    });

    const columnFailure = await route(request({
      transportVersion: 1,
      operation: 'matrix',
      request: matrixRequest({ columns: { limit: 6, cursor: 'opaque-invalid-column' as never } }),
    }), env);
    expect(columnFailure?.status).toBe(400);
    expect(await json(columnFailure as Response)).toEqual({
      transportVersion: 1,
      state: 'invalid-request',
      reason: 'invalid-column-cursor',
    });
    expect(providerCalls).toBe(2);
  });

  it('passa contexto, lente, modo, período e comparação ao read model sem criar semântica HTTP', async () => {
    const seen: ClassPerformanceRequestV1[] = [];
    const cases: ClassPerformanceRequestV1[] = [
      matrixRequest({ lens: 'result', mode: 'regular' }),
      matrixRequest({ lens: 'quantitative', mode: 'recovery' }),
      matrixRequest({ lens: 'qualitative', mode: 'recovery' }),
      matrixRequest({ lens: 'assessments', mode: 'recovery' }),
      matrixRequest({ lens: 'result', mode: 'recovery' }),
      matrixRequest({ lens: 'quantitative', period: { kind: 'annual' } }),
      matrixRequest({ comparisonPeriod: { kind: 'term', term: 2 } }),
    ];
    const route = handler(fakeProvider({ async get(value) { seen.push(value); return null; } }));

    for (const value of cases) {
      const response = await route(request({ transportVersion: 1, operation: 'matrix', request: value }), env);
      expect(response?.status).toBe(200);
      expect(response?.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate, private');
    }
    expect(seen).toEqual(cases);
  });

  it('preserva respostas oficiais: FinalRecoveryV1, term-base recovery, annual insufficient-data e comparison not-comparable', async () => {
    const source = readFileSync(join(process.cwd(), 'server/gradebook/persistence/d1/performance/d1-class-performance-source-v1.ts'), 'utf8');
    expect(source).toContain("source: 'final-recovery'");
    expect(source).toContain('comparison-semantics-not-integrated');
    expect(source).toContain('official-projection-unavailable');
    expect(source).toContain("request.mode === 'recovery'");
    expect(source).toContain("request.lens === 'result'");
    expect(source).toContain("request.period.kind === 'annual'");
    expect(source).not.toContain("basis: 'percentage'");

    const handlerSource = readFileSync(join(process.cwd(), 'server/gradebook/http/performance-routes-v1.ts'), 'utf8');
    expect(handlerSource).not.toContain('FinalRecoveryV1');
    expect(handlerSource).not.toContain('Math.round');
    expect(handlerSource).not.toContain('tolerance');
    expect(handlerSource).not.toContain('comparison-semantics-not-integrated');
  });

  it('remove registros/evidência bruta do detalhe de célula antes da serialização', async () => {
    const detailRef = 'cell-detail-synthetic' as PerformanceCellDetailRefV1;
    const cell = {
      lens: 'qualitative',
      teachingAssignmentId: 'assignment-synthetic',
      authorityMode: PERFORMANCE_AUTHORITY_MODE_V1,
      coverage: { state: 'complete', expectedItemCount: 1, resolvedItemCount: 1, missingItemCount: 0, reasons: [] },
      comparison: null,
      signals: [],
      detailRef,
      projection: {
        operational: {
          imported: { state: 'numeric', value: 20 },
          calculated: { state: 'numeric', value: 20 },
        },
      },
    } as unknown as PerformanceCellV1;
    const route = handler(fakeProvider({
      async getCellDetail() {
        return {
          contractVersion: 1,
          academicYearId,
          classGroupId,
          period: { kind: 'term', term: 1 },
          mode: 'regular',
          lens: 'qualitative',
          comparisonPeriod: null,
          detailKey: 'detail-key',
          detailRef,
          studentId: 'student-synthetic',
          authorityMode: PERFORMANCE_AUTHORITY_MODE_V1,
          cell,
          officialRecords: [{ raw: 'must-not-cross-http' }],
        } as never;
      },
    }));

    const response = await route(request({ transportVersion: 1, operation: 'cell-detail', detailRef }), env);
    expect(response?.status).toBe(200);
    const body = JSON.stringify(await json(response as Response));
    expect(body).not.toContain('officialRecords');
    expect(body).not.toContain('must-not-cross-http');
    expect(body).toContain('cell-detail-synthetic');
  });

  it('projeta detalhe de aluno sem nomes/marcas/textos de evidência da fonte', async () => {
    const detailRef = 'student-detail-synthetic' as PerformanceStudentDetailRefV1;
    const route = handler(fakeProvider({
      async getStudentDetail() {
        return {
          detailRef,
          academicYearId,
          classGroupId,
          student: {
            id: 'student-synthetic',
            displayName: 'Aluno Sintético',
            sourceNames: ['RAW SOURCE NAME'],
            sourceIdentityMarks: ['RAW MARK'],
          },
          enrollment: {
            id: 'enrollment-synthetic',
            academicYearId,
            studentId: 'student-synthetic',
            classGroupId,
            effectivePeriod: {},
            position: 'current',
            sourcePosition: 7,
          },
          statusHistory: [{
            id: 'status-synthetic',
            academicYearId,
            enrollmentId: 'enrollment-synthetic',
            status: 'active',
            sourceText: 'RAW STATUS TEXT',
            sourceReference: 'RAW REF',
          }],
        } as never;
      },
    }));

    const response = await route(request({ transportVersion: 1, operation: 'student-detail', detailRef }), env);
    const body = JSON.stringify(await json(response as Response));
    expect(body).toContain('Aluno Sintético');
    expect(body).not.toContain('RAW SOURCE NAME');
    expect(body).not.toContain('RAW MARK');
    expect(body).not.toContain('RAW STATUS TEXT');
    expect(body).not.toContain('RAW REF');
  });

  it('mantém produção fail-closed antes do binding no runtime consumido, sem wiring central nesta frente', () => {
    const runtime = readFileSync(join(process.cwd(), 'server/gradebook/persistence/d1/runtime/d1-runtime-v1.ts'), 'utf8');
    const runtimeEnvironmentIndex = runtime.indexOf('runtimeEnvironment(env)');
    const requireDatabaseIndex = runtime.indexOf('requireDatabase(env.GRADEBOOK_D1)');
    expect(runtimeEnvironmentIndex).toBeGreaterThanOrEqual(0);
    expect(requireDatabaseIndex).toBeGreaterThan(runtimeEnvironmentIndex);

    const handlerSource = readFileSync(join(process.cwd(), 'server/gradebook/http/performance-routes-v1.ts'), 'utf8');
    expect(handlerSource).toContain('authorizeGradebookD1RuntimeV1(session)');
    expect(handlerSource).toContain('runtime.classPerformanceReadModel()');
    expect(handlerSource).toContain("'Cache-Control': 'no-store, no-cache, must-revalidate, private'");
  });
});
