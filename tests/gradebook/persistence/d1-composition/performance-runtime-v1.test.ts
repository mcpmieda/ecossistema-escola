import { describe, expect, it, vi } from 'vitest';

import { AuthorizationError } from '../../../../server/auth/roles';
import type { RuntimeEnv } from '../../../../server/env';
import { authorizeGradebookD1RuntimeV1 } from '../../../../server/gradebook/persistence/d1/runtime/d1-runtime-authorization-v1';
import {
  createGradebookD1RuntimeV1,
  GradebookD1RuntimeErrorV1,
} from '../../../../server/gradebook/persistence/d1/runtime/d1-runtime-v1';
import type {
  AcademicYearId,
  ClassGroupId,
} from '../../../../shared/gradebook-contracts/entities';
import {
  CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
  PERFORMANCE_COLUMN_ORDER_V1,
  PERFORMANCE_ROW_ORDER_V1,
} from '../../../../shared/gradebook-contracts/performance/class-performance-read-model-v1';
import { openMigratedDatabase } from '../d1-transaction/d1-write-test-support';

const academicYearId = 'academic-year:wave-15:synthetic' as AcademicYearId;
const classGroupId = 'class-group:wave-15:synthetic' as ClassGroupId;

describe('composição do Desempenho no runtime D1 V1', () => {
  it('compõe fonte física e read model somente depois da autorização opaca', async () => {
    const database = await openMigratedDatabase();
    try {
      const authorization = authorizeGradebookD1RuntimeV1({ roles: ['ADMINISTRADOR'] });
      const runtime = createGradebookD1RuntimeV1(
        { RUNTIME_ENVIRONMENT: 'preview', GRADEBOOK_D1: database } as RuntimeEnv,
        authorization,
      );

      const provider = runtime.classPerformanceReadModel();
      await expect(
        provider.get({
          contractVersion: CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
          academicYearId,
          classGroupId,
          period: { kind: 'term', term: 1 },
          mode: 'regular',
          lens: 'result',
          comparisonPeriod: null,
          rows: { limit: 20, cursor: null },
          columns: { limit: 20, cursor: null },
          order: {
            rows: PERFORMANCE_ROW_ORDER_V1,
            columns: PERFORMANCE_COLUMN_ORDER_V1,
          },
        }),
      ).resolves.toBeNull();
    } finally {
      database.raw.close();
    }
  });

  it('mantém não autorização e produção bloqueadas antes de inspecionar o binding', () => {
    const unauthorizedPrepare = vi.fn();
    expect(() =>
      createGradebookD1RuntimeV1(
        {
          RUNTIME_ENVIRONMENT: 'preview',
          GRADEBOOK_D1: { prepare: unauthorizedPrepare, exec: vi.fn() },
        } as unknown as RuntimeEnv,
        {} as never,
      ),
    ).toThrow(AuthorizationError);
    expect(unauthorizedPrepare).not.toHaveBeenCalled();

    const authorization = authorizeGradebookD1RuntimeV1({ roles: ['ADMINISTRADOR'] });
    const productionPrepare = vi.fn();
    expect(() =>
      createGradebookD1RuntimeV1(
        {
          RUNTIME_ENVIRONMENT: 'production',
          GRADEBOOK_D1: { prepare: productionPrepare, exec: vi.fn() },
        } as unknown as RuntimeEnv,
        authorization,
      ),
    ).toThrow(GradebookD1RuntimeErrorV1);
    expect(productionPrepare).not.toHaveBeenCalled();
  });
});
