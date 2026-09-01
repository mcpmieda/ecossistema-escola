import { describe, expect, it } from 'vitest';
import { createPerformanceRequestGateV1 } from '../../../src/features/gradebook/performance/performance-request-gate';

describe('performance latest-request gate V1', () => {
  it('aborta a solicitação anterior e impede resposta obsoleta após troca rápida de contexto', () => {
    const gate = createPerformanceRequestGateV1();
    const first = gate.begin('year-2026:class-a:result');
    expect(first).not.toBeNull();

    const second = gate.begin('year-2026:class-b:result');
    expect(second).not.toBeNull();
    expect(first?.signal.aborted).toBe(true);
    expect(first?.isCurrent()).toBe(false);
    expect(second?.isCurrent()).toBe(true);

    first?.complete();
    expect(second?.isCurrent()).toBe(true);
    second?.complete();
  });

  it('deduplica a mesma request enquanto ela está em voo e libera retry depois da conclusão', () => {
    const gate = createPerformanceRequestGateV1();
    const first = gate.begin('same-matrix-page');
    expect(first).not.toBeNull();
    expect(gate.begin('same-matrix-page')).toBeNull();

    first?.complete();
    const retry = gate.begin('same-matrix-page');
    expect(retry).not.toBeNull();
    expect(retry?.isCurrent()).toBe(true);
    retry?.complete();
  });

  it('invalida trabalho pendente em unmount ou limpeza explícita', () => {
    const gate = createPerformanceRequestGateV1();
    const request = gate.begin('detail');
    expect(request).not.toBeNull();

    gate.invalidate();
    expect(request?.signal.aborted).toBe(true);
    expect(request?.isCurrent()).toBe(false);
  });
});
