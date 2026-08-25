import { describe, expect, it, vi } from 'vitest';
import { routeBancoNotasApi } from '../server/banco-notas/api';
import {
  assignmentPatchSchema,
  type BancoNotasRepository,
} from '../shared/banco-notas-contract';

describe('Banco de Notas assignment editing', () => {
  it('treats an empty effectiveTo from the current UI as unchanged', () => {
    const parsed = assignmentPatchSchema.parse({
      authorityMode: 'authoritative',
      syncEnabled: false,
      effectiveTo: null,
      reason: 'ajuste administrativo',
    });

    expect(parsed.effectiveTo).toBeUndefined();
    expect(parsed.clearEffectiveTo).toBeUndefined();
  });

  it('requires an explicit flag to clear an existing effectiveTo', () => {
    const parsed = assignmentPatchSchema.parse({
      clearEffectiveTo: true,
      reason: 'reabrir vigência',
    });

    expect(parsed.clearEffectiveTo).toBe(true);
    expect(parsed.effectiveTo).toBeUndefined();
    expect(() =>
      assignmentPatchSchema.parse({
        effectiveTo: '2026-12-31',
        clearEffectiveTo: true,
        reason: 'entrada incompatível',
      }),
    ).toThrow(/cannot be sent together/iu);
  });

  it('maps a resulting invalid effective period to a 400 response contract', async () => {
    const patchAssignment = vi.fn(async () => {
      throw new Error('invalid_effective_period');
    });
    const repository = { patchAssignment } as unknown as BancoNotasRepository;

    await expect(
      routeBancoNotasApi({
        request: new Request(
          'https://example.test/api/banco-notas/v1/source-assignments/22222222-2222-4222-8222-222222222222',
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              effectiveFrom: '2026-12-31',
              effectiveTo: '2026-01-01',
              reason: 'teste de período',
            }),
          },
        ),
        repository,
        capabilities: ['grades.sources.manage'],
        actor: 'actor',
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(patchAssignment).toHaveBeenCalledOnce();
  });
});
