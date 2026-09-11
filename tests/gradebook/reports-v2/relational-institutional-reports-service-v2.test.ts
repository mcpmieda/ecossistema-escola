import { describe, expect, it, vi } from 'vitest';
import { createRelationalInstitutionalReportsServiceV2 } from '../../../server/gradebook/application/reports/relational-institutional-reports-v2';

function fixture() {
  const performanceAnalysis = { execute: vi.fn(async () => ({ transportVersion: 3, operation: 'analysis', state: 'unavailable' } as never)) };
  const performanceComparison = { execute: vi.fn(async () => ({ transportVersion: 4, operation: 'term-comparison', state: 'unavailable' } as never)) };
  const council = { execute: vi.fn(async () => ({ contractVersion: 3, state: 'unavailable' } as never)) };
  const bulletins = { execute: vi.fn(async (input: unknown) => {
    const request = input as { operation: string };
    if (request.operation === 'catalog') return {
      contractVersion: 2, operation: 'catalog', state: 'ready', year: 2026,
      classes: [{ id: 1, code: '6A', name: '6º ANO A', label: '6A · 6º ANO A', studentCount: 30 }],
    } as never;
    return { contractVersion: 2, operation: request.operation, state: 'not-found' } as never;
  }) };
  const diagnostics = { list: vi.fn(async () => ({ items: [], nextOffset: null })) };
  const service = createRelationalInstitutionalReportsServiceV2({
    performanceAnalysis,
    performanceComparison,
    council,
    bulletins,
    diagnostics,
  });
  return { service, performanceAnalysis, performanceComparison, council, bulletins, diagnostics };
}

const base = {
  contractVersion: 2,
  operation: 'performance',
  family: 'class-results',
  year: 2026,
  classId: 1,
  period: 2,
  lens: 'result',
  referenceTerm: null,
  statuses: [null, 1, 2, 3, 4, 5, 7],
} as const;

describe('relational institutional reports V2 service', () => {
  it('loads the class catalog through the relational bulletin catalog only', async () => {
    const { service, bulletins, performanceAnalysis, council, diagnostics } = fixture();
    await expect(service.execute({ contractVersion: 2, operation: 'catalog', year: 2026 }, { oid: 'actor' })).resolves.toEqual({
      contractVersion: 2,
      operation: 'catalog',
      state: 'ready',
      year: 2026,
      classes: [{ id: 1, code: '6A', name: '6º ANO A' }],
    });
    expect(bulletins.execute).toHaveBeenCalledTimes(1);
    expect(performanceAnalysis.execute).not.toHaveBeenCalled();
    expect(council.execute).not.toHaveBeenCalled();
    expect(diagnostics.list).not.toHaveBeenCalled();
  });

  it('uses one V3 analysis read or one V4 same-year comparison read', async () => {
    const regular = fixture();
    await regular.service.execute(base, { oid: 'actor' });
    expect(regular.performanceAnalysis.execute).toHaveBeenCalledWith(expect.objectContaining({
      transportVersion: 3,
      operation: 'analysis',
      year: 2026,
      classId: 1,
      period: 2,
      mode: 'regular',
      lens: 'result',
    }));
    expect(regular.performanceComparison.execute).not.toHaveBeenCalled();

    const comparison = fixture();
    await comparison.service.execute({ ...base, referenceTerm: 1 }, { oid: 'actor' });
    expect(comparison.performanceComparison.execute).toHaveBeenCalledWith(expect.objectContaining({
      transportVersion: 4,
      operation: 'term-comparison',
      year: 2026,
      period: 2,
      referencePeriod: 1,
    }));
    expect(comparison.performanceAnalysis.execute).not.toHaveBeenCalled();
  });

  it('reads current diagnostics without touching the other consumers', async () => {
    const { service, diagnostics, bulletins, performanceAnalysis, council } = fixture();
    const request = {
      contractVersion: 2, operation: 'audit', year: 2026, severities: ['warning'], codes: [],
      classCode: '6A', limit: 50, offset: 0,
    } as const;
    const response = await service.execute(request, { oid: 'actor' });
    expect(response).toMatchObject({ contractVersion: 2, operation: 'audit', state: 'ready', items: [] });
    expect(diagnostics.list).toHaveBeenCalledWith(request);
    expect(bulletins.execute).not.toHaveBeenCalled();
    expect(performanceAnalysis.execute).not.toHaveBeenCalled();
    expect(council.execute).not.toHaveBeenCalled();
  });

  it('fails closed before reaching a source for invalid or non-2026 input', async () => {
    const { service, diagnostics, bulletins } = fixture();
    const response = await service.execute({ contractVersion: 2, operation: 'audit', year: 2027 }, { oid: 'actor' });
    expect(response).toEqual({ contractVersion: 2, operation: 'audit', state: 'invalid-request' });
    expect(diagnostics.list).not.toHaveBeenCalled();
    expect(bulletins.execute).not.toHaveBeenCalled();
  });
});
