import { describe, expect, it } from 'vitest';
import {
  IMPORT_PLANNER_READ_CONCURRENCY_V1,
  mapWithBoundedConcurrencyV1,
} from '../../../server/gradebook/application/import/bounded-read-concurrency-v1';

describe('concorrência bounded de leituras do planner', () => {
  it('mantém a ordem de saída e nunca ultrapassa o limite explícito', async () => {
    let active = 0;
    let maximumActive = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inputs = Array.from({ length: 9 }, (_, index) => index);

    const execution = mapWithBoundedConcurrencyV1(
      inputs,
      IMPORT_PLANNER_READ_CONCURRENCY_V1,
      async (value) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await gate;
        active -= 1;
        return value * 2;
      },
    );

    await Promise.resolve();
    expect(active).toBe(IMPORT_PLANNER_READ_CONCURRENCY_V1);
    release();
    await expect(execution).resolves.toEqual(inputs.map((value) => value * 2));
    expect(maximumActive).toBe(IMPORT_PLANNER_READ_CONCURRENCY_V1);
  });

  it('preserva o fail-closed quando qualquer leitura falha', async () => {
    await expect(
      mapWithBoundedConcurrencyV1([1, 2, 3], 2, async (value) => {
        if (value === 2) throw new Error('synthetic-read-failure');
        return value;
      }),
    ).rejects.toThrow('synthetic-read-failure');
  });

  it('rejeita limite inválido antes de iniciar leituras', async () => {
    await expect(mapWithBoundedConcurrencyV1([1], 0, async (value) => value)).rejects.toThrow(
      'concurrency must be a positive integer',
    );
  });
});
