import { describe, expect, it, vi } from 'vitest';

import type { RuntimeEnv } from '../../../../server/env';
import { validateEnv } from '../../../../server/env';
import { authorizeGradebookD1RuntimeV1 } from '../../../../server/gradebook/persistence/d1/runtime/d1-runtime-authorization-v1';
import { createGradebookD1RuntimeV1 } from '../../../../server/gradebook/persistence/d1/runtime/d1-runtime-v1';
import { testEnv } from '../../../fixtures';

const authorization = authorizeGradebookD1RuntimeV1({ roles: ['ADMINISTRADOR'] });

function productionEnv(
  binding: unknown,
  enabled?: 'true' | 'false',
): RuntimeEnv {
  return {
    ...testEnv,
    RUNTIME_ENVIRONMENT: 'production',
    GRADEBOOK_D1: binding,
    ...(enabled === undefined ? {} : { GRADEBOOK_PRODUCTION_ENABLED: enabled }),
  };
}

function capturedError(operation: () => unknown): unknown {
  try {
    operation();
  } catch (cause) {
    return cause;
  }
  throw new Error('Expected the synthetic operation to fail.');
}

function bindingProbe() {
  const statement = {
    bind: vi.fn(),
    first: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
  };
  const prepare = vi.fn(() => statement);
  return {
    binding: { prepare, exec: vi.fn() },
    prepare,
  };
}

describe('gate produtivo D1 V1', () => {
  it('preserva somente estados explícitos do gate server-side na validação do ambiente', () => {
    expect(validateEnv(productionEnv(undefined)).GRADEBOOK_PRODUCTION_ENABLED).toBeUndefined();
    expect(validateEnv(productionEnv(undefined, 'false')).GRADEBOOK_PRODUCTION_ENABLED).toBe(
      'false',
    );
    expect(validateEnv(productionEnv(undefined, 'true')).GRADEBOOK_PRODUCTION_ENABLED).toBe(
      'true',
    );
    expect(() =>
      validateEnv({
        ...productionEnv(undefined),
        GRADEBOOK_PRODUCTION_ENABLED: 'TRUE',
      } as unknown as RuntimeEnv),
    ).toThrow('Runtime environment is invalid.');
  });

  it.each([undefined, 'false'] as const)(
    'mantém produção fail-closed com gate %s antes de inspecionar GRADEBOOK_D1',
    (enabled) => {
      const { binding, prepare } = bindingProbe();

      expect(
        capturedError(() =>
          createGradebookD1RuntimeV1(productionEnv(binding, enabled), authorization),
        ),
      ).toMatchObject({ code: 'runtime-environment-disabled' });
      expect(prepare).not.toHaveBeenCalled();
    },
  );

  it('só alcança o binding produtivo quando o gate server-side está exatamente ativo', () => {
    const { binding, prepare } = bindingProbe();

    const runtime = createGradebookD1RuntimeV1(productionEnv(binding, 'true'), authorization);

    expect(runtime.environment).toBe('production');
    expect(prepare).toHaveBeenCalledTimes(1);
  });
});
