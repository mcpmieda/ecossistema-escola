import { describe, expect, it } from 'vitest';
import type { AcademicYearId, ClassGroupId } from '../../../shared/gradebook-contracts/entities';
import {
  CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
  PERFORMANCE_COLUMN_ORDER_V1,
  PERFORMANCE_ROW_ORDER_V1,
} from '../../../shared/gradebook-contracts/performance/class-performance-read-model-v1';
import {
  containsPerformanceForbiddenTransportFieldV1,
  isPerformanceTransportRequestV1,
  isPerformanceTransportResponseV1,
} from '../../../shared/gradebook-contracts/performance/performance-transport-v1';

const baseRequest = {
  contractVersion: CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
  academicYearId: 'year-synthetic' as AcademicYearId,
  classGroupId: 'class-synthetic' as ClassGroupId,
  period: { kind: 'term', term: 1 } as const,
  mode: 'regular' as const,
  lens: 'result' as const,
  comparisonPeriod: null,
  rows: { limit: 20, cursor: null },
  columns: { limit: 6, cursor: null },
  order: { rows: PERFORMANCE_ROW_ORDER_V1, columns: PERFORMANCE_COLUMN_ORDER_V1 },
};

describe('Performance transport V1', () => {
  it('aceita somente as três operações mínimas sobre o read model existente', () => {
    expect(isPerformanceTransportRequestV1({ transportVersion: 1, operation: 'matrix', request: baseRequest })).toBe(true);
    expect(isPerformanceTransportRequestV1({ transportVersion: 1, operation: 'student-detail', detailRef: 'student-detail' })).toBe(true);
    expect(isPerformanceTransportRequestV1({ transportVersion: 1, operation: 'cell-detail', detailRef: 'cell-detail' })).toBe(true);
    expect(isPerformanceTransportRequestV1({ transportVersion: 1, operation: 'calculate', request: baseRequest })).toBe(false);
  });

  it('rejeita campos acadêmicos concorrentes ou claims confiados ao cliente', () => {
    expect(isPerformanceTransportRequestV1({
      transportVersion: 1,
      operation: 'matrix',
      request: { ...baseRequest, tolerance: 0.01 },
    })).toBe(false);
    expect(isPerformanceTransportRequestV1({
      transportVersion: 1,
      operation: 'matrix',
      request: baseRequest,
      roles: ['ADMINISTRADOR'],
    })).toBe(false);
    expect(isPerformanceTransportRequestV1({
      transportVersion: 1,
      operation: 'cell-detail',
      detailRef: 'cell-detail',
      authorization: 'client-claim',
    })).toBe(false);
  });

  it('marca evidência bruta e metadados de autorização como proibidos em qualquer profundidade', () => {
    for (const key of [
      'officialRecords',
      'rawSourceEvidence',
      'sourceEvidence',
      'sourceNames',
      'sourceIdentityMarks',
      'sourceText',
      'sourceReference',
      'importBatchId',
      'roles',
      'capabilities',
      'authorization',
      'actorId',
    ]) {
      expect(containsPerformanceForbiddenTransportFieldV1({ nested: { [key]: 'synthetic' } })).toBe(true);
    }
  });

  it('aceita estados não divulgadores mínimos e rejeita payload extra neles', () => {
    expect(isPerformanceTransportResponseV1({ transportVersion: 1, state: 'not-authorized' })).toBe(true);
    expect(isPerformanceTransportResponseV1({ transportVersion: 1, state: 'unavailable' })).toBe(true);
    expect(isPerformanceTransportResponseV1({ transportVersion: 1, state: 'empty', operation: 'matrix' })).toBe(true);
    expect(isPerformanceTransportResponseV1({ transportVersion: 1, state: 'invalid-request', reason: 'invalid-row-cursor' })).toBe(true);
    expect(isPerformanceTransportResponseV1({ transportVersion: 1, state: 'not-authorized', roles: [] })).toBe(false);
    expect(isPerformanceTransportResponseV1({ transportVersion: 1, state: 'unavailable', error: 'SQL...' })).toBe(false);
  });
});
