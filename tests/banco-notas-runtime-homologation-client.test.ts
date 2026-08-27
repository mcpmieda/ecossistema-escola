// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { runBancoNotasRuntimeHomologation } from '../addin/banco-notas/runtime-homologation';

describe('Banco de Notas runtime homologation client', () => {
  it('keeps the delegated token only in the outbound authorization header', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status: 'BANCO_NOTAS_RUNTIME_HOMOLOGATION_PASSED',
        bearerOwnership: { status: 'BEARER_OWNERSHIP_RUNTIME_HOMOLOGATION_PASSED' },
        d1Atomicity: { status: 'D1_BINDING_ATOMICITY_HOMOLOGATION_PASSED' },
      }),
    );
    const result = await runBancoNotasRuntimeHomologation({
      accessToken: 'delegated-token-never-persisted',
      origin: 'https://banco-notas-runtime-homologation.example.workers.dev',
      fetcher,
    });

    expect(result.status).toBe('BANCO_NOTAS_RUNTIME_HOMOLOGATION_PASSED');
    const [, init] = fetcher.mock.calls[0]!;
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer delegated-token-never-persisted',
    );
    expect(init?.body).not.toContain('delegated-token-never-persisted');
  });
});
