import { describe, expect, it, vi } from 'vitest';
import {
  AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
  AUDIT_WORKSPACE_ORDERS_V1,
  type AuditWorkspaceListRequestV1,
} from '../../../shared/gradebook-contracts/audit-workspace/audit-workspace-contract-v1';
import type { AuditOccurrenceId } from '../../../shared/gradebook-contracts/audit/audit-contract-v1';
import {
  COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
  type CouncilClassReferenceV1,
  type CouncilStudentReferenceV1,
} from '../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import type {
  AcademicYearId,
  ClassGroupId,
  StudentId,
  SubjectId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import {
  CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
  PERFORMANCE_AUTHORITY_MODE_V1,
  PERFORMANCE_COLUMN_ORDER_V1,
  PERFORMANCE_ROW_ORDER_V1,
  type ClassPerformanceReadModelV1,
  type ClassPerformanceRequestV1,
  type PerformanceCellDetailRefV1,
  type PerformanceLensV1,
  type PerformanceModeV1,
  type PerformanceStudentDetailRefV1,
} from '../../../shared/gradebook-contracts/performance/class-performance-read-model-v1';
import { INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1 } from '../../../shared/gradebook-contracts/reports/institutional-reports-contract-v1';
import { createInstitutionalReportsServiceV1 } from '../../../server/gradebook/application/reports/institutional-reports-service-v1';

const academicYearId = 'academic-year:synthetic:2026' as AcademicYearId;
const classGroupId = 'class-group:synthetic:6a' as ClassGroupId;
const classReference = 'council-class:synthetic:6a' as CouncilClassReferenceV1;
const studentZero = 'student:synthetic:zero' as StudentId;
const studentAbsent = 'student:synthetic:absent' as StudentId;
const assignmentId = 'assignment:synthetic:math' as TeachingAssignmentId;
const subjectId = 'subject:synthetic:math' as SubjectId;

const coverage = {
  state: 'complete',
  expectedItemCount: 1,
  resolvedItemCount: 1,
  missingItemCount: 0,
  reasons: [],
} as const;

function request(mode: PerformanceModeV1, lens: PerformanceLensV1): ClassPerformanceRequestV1 {
  return {
    contractVersion: CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
    academicYearId,
    classGroupId,
    period: { kind: 'term', term: 1 },
    mode,
    lens,
    comparisonPeriod: { kind: 'term', term: 2 },
    rows: { limit: 10, cursor: null },
    columns: { limit: 4, cursor: null },
    order: { rows: PERFORMANCE_ROW_ORDER_V1, columns: PERFORMANCE_COLUMN_ORDER_V1 },
  };
}

function resultMatrix(): ClassPerformanceReadModelV1 {
  const cell = (
    student: 'zero' | 'absent',
  ): ClassPerformanceReadModelV1['rows']['items'][number]['cells'][number] => ({
    teachingAssignmentId: assignmentId,
    authorityMode: PERFORMANCE_AUTHORITY_MODE_V1,
    coverage,
    comparison: {
      state: 'not-comparable',
      referencePeriod: { kind: 'term', term: 2 },
      reason: 'synthetic-official-comparison-not-resolved',
    },
    signals: [],
    detailRef: `cell-detail:synthetic:${student}` as PerformanceCellDetailRefV1,
    lens: 'result',
    projection: {
      source: 'term-result',
      officialGrade:
        student === 'zero'
          ? {
              imported: { state: 'official-zero', value: 0, sourceMarker: 0.1 },
              calculated: { state: 'legacy-zero', value: 0 },
            }
          : {
              imported: { state: 'absent' },
              calculated: { state: 'insufficient-data', reason: 'synthetic-unresolved' },
            },
      percentage: {
        imported: { state: 'not-applicable', reason: 'synthetic-not-applicable' },
        calculated: { state: 'not-applicable', reason: 'synthetic-not-applicable' },
      },
    },
  });
  return {
    contractVersion: CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
    academicYearId,
    classGroupId,
    period: { kind: 'term', term: 1 },
    mode: 'regular',
    lens: 'result',
    comparisonPeriod: { kind: 'term', term: 2 },
    authorityMode: PERFORMANCE_AUTHORITY_MODE_V1,
    coverage,
    order: { rows: PERFORMANCE_ROW_ORDER_V1, columns: PERFORMANCE_COLUMN_ORDER_V1 },
    rows: {
      limit: 10,
      items: [
        {
          sourcePosition: 1,
          studentId: studentZero,
          displayName: 'Aluno Zero Sintético',
          situation: { state: 'known', value: 'active' },
          detailRef: 'student-detail:synthetic:zero' as PerformanceStudentDetailRefV1,
          cells: [cell('zero')],
        },
        {
          sourcePosition: 2,
          studentId: studentAbsent,
          displayName: 'Aluno Ausente Sintético',
          situation: { state: 'known', value: 'active' },
          detailRef: 'student-detail:synthetic:absent' as PerformanceStudentDetailRefV1,
          cells: [cell('absent')],
        },
      ],
      nextCursor: null,
    },
    columns: {
      limit: 4,
      items: [{ teachingAssignmentId: assignmentId, subjectId, code: 'MAT', displayName: 'Matemática' }],
      nextCursor: null,
    },
  };
}

function serviceWithPerformance(matrix: ClassPerformanceReadModelV1) {
  return createInstitutionalReportsServiceV1({
    performance: { get: vi.fn(async () => matrix) },
    council: { queue: vi.fn(async () => ({ contractVersion: 1, outcome: 'no-results', items: [], nextCursor: null })) },
    audit: { list: vi.fn(async () => ({ contractVersion: 1, outcome: 'no-results', items: [], nextCursor: null })) },
  });
}

describe('Institutional reports service V1', () => {
  it('preserva zero oficial, ausência e comparação fail-closed sem calcular indicador', async () => {
    const matrix = resultMatrix();
    const response = await serviceWithPerformance(matrix).execute({
      contractVersion: INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
      family: 'class-results',
      request: request('regular', 'result'),
    });

    expect(response.state).toBe('ready');
    if (response.state !== 'ready' || response.family === 'council' || response.family === 'audit') return;
    expect(response.report).toBe(matrix);
    const zero = response.report.rows.items[0]?.cells[0];
    const absent = response.report.rows.items[1]?.cells[0];
    expect(zero?.lens).toBe('result');
    expect(absent?.lens).toBe('result');
    if (zero?.lens === 'result' && zero.projection.source === 'term-result') {
      expect(zero.projection.officialGrade.imported).toEqual({
        state: 'official-zero',
        value: 0,
        sourceMarker: 0.1,
      });
      expect(zero.comparison).toMatchObject({ state: 'not-comparable' });
    }
    if (absent?.lens === 'result' && absent.projection.source === 'term-result') {
      expect(absent.projection.officialGrade.imported).toEqual({ state: 'absent' });
    }
    expect(response.hardStop?.unavailableIndicators).toEqual(['average', 'rate', 'ranking']);
    expect(response.hardStop).not.toHaveProperty('value');
  });

  it('entrega composição e recuperação apenas como read models oficiais recebidos', async () => {
    const composition = {
      ...resultMatrix(),
      lens: 'quantitative' as const,
      rows: { ...resultMatrix().rows, items: [] },
    } as unknown as ClassPerformanceReadModelV1;
    const recovery = {
      ...resultMatrix(),
      mode: 'recovery' as const,
    } as ClassPerformanceReadModelV1;
    const get = vi.fn(async (input: ClassPerformanceRequestV1) =>
      input.mode === 'recovery' ? recovery : composition,
    );
    const service = createInstitutionalReportsServiceV1({
      performance: { get },
      council: { queue: vi.fn(async () => ({ contractVersion: 1, outcome: 'no-results', items: [], nextCursor: null })) },
      audit: { list: vi.fn(async () => ({ contractVersion: 1, outcome: 'no-results', items: [], nextCursor: null })) },
    });

    const compositionResponse = await service.execute({
      contractVersion: 1,
      family: 'composition',
      request: request('regular', 'quantitative'),
    });
    const recoveryResponse = await service.execute({
      contractVersion: 1,
      family: 'recovery',
      request: request('recovery', 'result'),
    });

    expect(compositionResponse.state === 'ready' && compositionResponse.report).toBe(composition);
    expect(recoveryResponse.state === 'ready' && recoveryResponse.report).toBe(recovery);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('não recalcula elegibilidade de Conselho e não precisa de detail/decision', async () => {
    const queue = vi.fn(async () => ({
      contractVersion: COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
      outcome: 'items' as const,
      academicYearId,
      classReference,
      items: [
        {
          studentReference: 'council-student:synthetic:1' as CouncilStudentReferenceV1,
          studentLabel: 'Aluno Conselho Sintético',
          calculated: {
            queueState: 'eligible-for-council' as const,
            officialAnnualState: 'eligible-for-council' as const,
            failedComponentCount: 2,
            coverage,
            reason: 'synthetic-official-projection',
          },
          currentDecisionVersion: 4,
        },
      ],
      nextCursor: null,
    }));
    const service = createInstitutionalReportsServiceV1({
      performance: { get: vi.fn(async () => null) },
      council: { queue },
      audit: { list: vi.fn(async () => ({ contractVersion: 1, outcome: 'no-results', items: [], nextCursor: null })) },
    });

    const response = await service.execute({
      contractVersion: 1,
      family: 'council',
      request: {
        operation: 'queue',
        contractVersion: COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
        academicYearId,
        classReference,
        page: { limit: 20, cursor: null },
      },
    });

    expect(response.state).toBe('ready');
    if (response.state === 'ready' && response.family === 'council') {
      expect(response.report.items[0]?.calculated).toEqual({
        queueState: 'eligible-for-council',
        officialAnnualState: 'eligible-for-council',
        failedComponentCount: 2,
        coverage,
        reason: 'synthetic-official-projection',
      });
    }
    expect(queue).toHaveBeenCalledTimes(1);
  });

  it('projeta somente a lista de Auditoria e não vaza detalhe ou evidência bruta', async () => {
    const auditRequest: AuditWorkspaceListRequestV1 = {
      contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
      academicYearId,
      collection: 'audit-occurrences',
      filters: { occurrenceStates: ['open'] },
      page: { limit: 20, cursor: null },
      order: AUDIT_WORKSPACE_ORDERS_V1['audit-occurrences'],
    };
    const list = vi.fn(async () => ({
      contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
      outcome: 'items' as const,
      academicYearId,
      collection: 'audit-occurrences' as const,
      limit: 20,
      order: AUDIT_WORKSPACE_ORDERS_V1['audit-occurrences'],
      items: [
        {
          kind: 'audit-occurrence' as const,
          reference: { kind: 'audit-occurrence' as const, id: 'audit:synthetic:1' as AuditOccurrenceId },
          state: 'open' as const,
          severity: 'warning' as const,
          category: 'synthetic-category',
          createdAt: '2026-09-01T12:00:00.000Z',
        },
      ] as const,
      nextCursor: null,
    }));
    const service = createInstitutionalReportsServiceV1({
      performance: { get: vi.fn(async () => null) },
      council: { queue: vi.fn(async () => ({ contractVersion: 1, outcome: 'no-results', items: [], nextCursor: null })) },
      audit: { list },
    });

    const response = await service.execute({ contractVersion: 1, family: 'audit', request: auditRequest });
    expect(response.state).toBe('ready');
    const serialized = JSON.stringify(response);
    expect(serialized).toContain('synthetic-category');
    expect(serialized).not.toContain('recommendedAction');
    expect(serialized).not.toContain('sourceCell');
    expect(serialized).not.toContain('evidence');
    expect(serialized).not.toContain('message');
    expect(list).toHaveBeenCalledWith(auditRequest);
  });

  it('mantém insufficient-data como estado explícito por subrecurso', async () => {
    const service = createInstitutionalReportsServiceV1({
      performance: { get: vi.fn(async () => null) },
      council: {
        queue: vi.fn(async () => ({
          contractVersion: COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
          outcome: 'insufficient-data' as const,
          items: [],
          nextCursor: null,
        })),
      },
      audit: { list: vi.fn(async () => ({ contractVersion: 1, outcome: 'no-results', items: [], nextCursor: null })) },
    });
    const response = await service.execute({
      contractVersion: 1,
      family: 'council',
      request: {
        operation: 'queue',
        contractVersion: COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
        academicYearId,
        classReference,
        page: { limit: 20, cursor: null },
      },
    });
    expect(response).toMatchObject({ state: 'insufficient-data', family: 'council', report: null });
  });
});
