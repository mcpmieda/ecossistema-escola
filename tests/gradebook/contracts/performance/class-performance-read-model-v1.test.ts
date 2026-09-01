import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  ClassGroupId,
  StudentId,
  SubjectId,
  TeachingAssignmentId,
} from '../../../../shared/gradebook-contracts/entities';
import type {
  AcademicGradeValueV1,
  AssessmentComponentId,
  ResultCoverageV1,
} from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import {
  CLASS_PERFORMANCE_CONTRACT_V1,
  CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
  PERFORMANCE_AUTHORITY_MODE_V1,
  PERFORMANCE_COLUMN_ORDER_V1,
  PERFORMANCE_COMPARABILITY_STATES_V1,
  PERFORMANCE_COMPARISON_BASES_V1,
  PERFORMANCE_LENSES_V1,
  PERFORMANCE_MAX_PAGE_LIMIT_V1,
  PERFORMANCE_ROW_ORDER_V1,
  comparePerformanceComponentColumnsV1,
  comparePerformanceStudentRowsV1,
  inspectClassPerformanceRequestV1,
  isClassPerformanceReadModelValidV1,
  isPerformanceColumnsPageValidV1,
  isPerformanceComponentColumnOrderV1,
  isPerformancePageLimitV1,
  isPerformanceRowsPageValidV1,
  isPerformanceStudentRowOrderV1,
  type ClassPerformanceReadModelV1,
  type ClassPerformanceRequestV1,
  type PerformanceCellDetailRefV1,
  type PerformanceCellV1,
  type PerformanceColumnCursorV1,
  type PerformanceComparedGradeValueV1,
  type PerformanceComponentColumnV1,
  type PerformanceLensV1,
  type PerformanceRowCursorV1,
  type PerformanceStudentDetailRefV1,
  type PerformanceStudentRowV1,
  type PerformanceValueComparisonV1,
} from '../../../../shared/gradebook-contracts/performance/class-performance-read-model-v1';

const academicYearId = 'academic-year:synthetic:2026' as AcademicYearId;
const classGroupId = 'class-group:synthetic:6a' as ClassGroupId;
const assignmentA = 'teaching-assignment:synthetic:math' as TeachingAssignmentId;
const assignmentB = 'teaching-assignment:synthetic:portuguese' as TeachingAssignmentId;
const subjectA = 'subject:synthetic:math' as SubjectId;
const subjectB = 'subject:synthetic:portuguese' as SubjectId;
const studentA = 'student:synthetic:a' as StudentId;
const studentB = 'student:synthetic:b' as StudentId;
const rowCursor = 'performance-row-cursor:synthetic:next' as PerformanceRowCursorV1;
const columnCursor = 'performance-column-cursor:synthetic:next' as PerformanceColumnCursorV1;

const columns: readonly PerformanceComponentColumnV1[] = [
  {
    teachingAssignmentId: assignmentA,
    subjectId: subjectA,
    code: 'MAT',
    displayName: 'Componente Sintético Matemática',
  },
  {
    teachingAssignmentId: assignmentB,
    subjectId: subjectB,
    code: 'POR',
    displayName: 'Componente Sintético Língua Portuguesa',
  },
];

function numeric(value: number): AcademicGradeValueV1 {
  return { state: 'numeric', value };
}

function compared(imported: number, calculated: number): PerformanceComparedGradeValueV1 {
  return {
    imported: numeric(imported),
    calculated: numeric(calculated),
  };
}

function coverage(state: ResultCoverageV1['state']): ResultCoverageV1 {
  switch (state) {
    case 'complete':
      return {
        state,
        expectedItemCount: 2,
        resolvedItemCount: 2,
        missingItemCount: 0,
        reasons: [],
      };
    case 'partial':
      return {
        state,
        expectedItemCount: 2,
        resolvedItemCount: 1,
        missingItemCount: 1,
        reasons: ['synthetic-partial'],
      };
    case 'insufficient-data':
      return {
        state,
        expectedItemCount: 2,
        resolvedItemCount: 0,
        missingItemCount: 2,
        reasons: ['synthetic-insufficient-data'],
      };
    case 'not-applicable':
      return {
        state,
        expectedItemCount: 0,
        resolvedItemCount: 0,
        missingItemCount: 0,
        reasons: ['synthetic-not-applicable'],
      };
  }
}

function cellDetailRef(assignmentId: TeachingAssignmentId, ordinal: number): PerformanceCellDetailRefV1 {
  return `performance-cell-detail:synthetic:${assignmentId}:${ordinal}` as PerformanceCellDetailRefV1;
}

function cellForLens(
  lens: PerformanceLensV1,
  assignmentId: TeachingAssignmentId,
  ordinal: number,
  cellCoverage: ResultCoverageV1 = coverage('complete'),
): PerformanceCellV1 {
  const base = {
    teachingAssignmentId: assignmentId,
    authorityMode: PERFORMANCE_AUTHORITY_MODE_V1,
    coverage: cellCoverage,
    comparison: null,
    signals: [],
    detailRef: cellDetailRef(assignmentId, ordinal),
  } as const;

  switch (lens) {
    case 'result':
      return {
        ...base,
        lens,
        projection: {
          source: 'term-result',
          officialGrade: compared(20 + ordinal, 20.5 + ordinal),
          percentage: compared(70 + ordinal, 71 + ordinal),
        },
      };
    case 'quantitative':
      return {
        ...base,
        lens,
        projection: {
          original: compared(8 + ordinal, 8.5 + ordinal),
          parallelRecovery: compared(9 + ordinal, 9.5 + ordinal),
          parallelRecoveryApplicability: {
            imported: { state: 'applicable' },
            calculated: { state: 'applicable' },
          },
          considered: compared(9 + ordinal, 9.5 + ordinal),
        },
      };
    case 'qualitative':
      return {
        ...base,
        lens,
        projection: {
          operational: compared(12 + ordinal, 12.5 + ordinal),
        },
      };
    case 'assessments':
      return {
        ...base,
        lens,
        projection: {
          items: [
            {
              assessmentComponentId:
                `assessment-component:synthetic:${ordinal}` as AssessmentComponentId,
              name: `Avaliação Sintética ${ordinal}`,
              type: 'written',
              order: ordinal,
              maximum: 10,
              applicability: { state: 'applicable' },
              value: compared(7 + ordinal, 7.5 + ordinal),
            },
          ],
        },
      };
  }
}

function studentRow(
  studentId: StudentId,
  displayName: string,
  sourcePosition: number | null,
  lens: PerformanceLensV1,
  ordinal: number,
): PerformanceStudentRowV1 {
  return {
    sourcePosition,
    studentId,
    displayName,
    situation: { state: 'known', value: 'active' },
    detailRef: `performance-student-detail:synthetic:${ordinal}` as PerformanceStudentDetailRefV1,
    cells: [
      cellForLens(lens, assignmentA, ordinal),
      cellForLens(lens, assignmentB, ordinal + 10),
    ],
  };
}

function modelForLens(lens: PerformanceLensV1): ClassPerformanceReadModelV1 {
  return {
    contractVersion: CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
    academicYearId,
    classGroupId,
    period: { kind: 'term', term: 1 },
    mode: 'regular',
    lens,
    comparisonPeriod: { kind: 'term', term: 2 },
    authorityMode: PERFORMANCE_AUTHORITY_MODE_V1,
    coverage: coverage('complete'),
    order: {
      rows: PERFORMANCE_ROW_ORDER_V1,
      columns: PERFORMANCE_COLUMN_ORDER_V1,
    },
    rows: {
      limit: 20,
      items: [
        studentRow(studentA, 'Aluno Sintético A', 1, lens, 1),
        studentRow(studentB, 'Aluno Sintético B', 2, lens, 2),
      ],
      nextCursor: rowCursor,
    },
    columns: {
      limit: 20,
      items: columns,
      nextCursor: columnCursor,
    },
  };
}

function request(overrides: Partial<ClassPerformanceRequestV1> = {}): ClassPerformanceRequestV1 {
  return {
    contractVersion: CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
    academicYearId,
    classGroupId,
    period: { kind: 'term', term: 1 },
    mode: 'regular',
    lens: 'result',
    comparisonPeriod: { kind: 'term', term: 2 },
    rows: { limit: 20, cursor: null },
    columns: { limit: 20, cursor: null },
    order: {
      rows: PERFORMANCE_ROW_ORDER_V1,
      columns: PERFORMANCE_COLUMN_ORDER_V1,
    },
    ...overrides,
  };
}

describe('class performance read model contract v1', () => {
  it('freezes one read-only provider-independent contract with the four required lenses', () => {
    expect(CLASS_PERFORMANCE_CONTRACT_V1.version).toBe(1);
    expect(CLASS_PERFORMANCE_CONTRACT_V1.lenses).toEqual([
      'result',
      'quantitative',
      'qualitative',
      'assessments',
    ]);
    expect(CLASS_PERFORMANCE_CONTRACT_V1.authorityMode).toBe('imported-source');
    expect(CLASS_PERFORMANCE_CONTRACT_V1.coverageStates).toEqual([
      'complete',
      'partial',
      'insufficient-data',
      'not-applicable',
    ]);
    expect(CLASS_PERFORMANCE_CONTRACT_V1.academicSemantics).toEqual({
      source: 'shared-results-contract-v1',
      calculations: 'forbidden',
      rounding: 'forbidden',
      recoveryRules: 'forbidden',
      annualClassification: 'forbidden',
      tolerance: 'forbidden',
      signalStateMutation: 'forbidden',
    });
    expect(CLASS_PERFORMANCE_CONTRACT_V1.detail).toEqual({
      references: 'opaque',
      rawSourceEvidence: 'omitted-from-matrix',
    });
  });

  it('requires explicit year, class, period, mode, lens, comparison, pagination and order', () => {
    const value = request();

    expect(inspectClassPerformanceRequestV1(value)).toBe('ready');
    expect(value).toEqual({
      contractVersion: 1,
      academicYearId,
      classGroupId,
      period: { kind: 'term', term: 1 },
      mode: 'regular',
      lens: 'result',
      comparisonPeriod: { kind: 'term', term: 2 },
      rows: { limit: 20, cursor: null },
      columns: { limit: 20, cursor: null },
      order: {
        rows: 'source-position-display-name-student-id-ascending-code-unit',
        columns: 'subject-code-display-name-assignment-id-ascending-code-unit',
      },
    });
    expect(value).not.toHaveProperty('authorityMode');
    expect(value).not.toHaveProperty('formula');
    expect(value).not.toHaveProperty('tolerance');
    expect(value).not.toHaveProperty('route');
    expect(value).not.toHaveProperty('href');
  });

  it('rejects invalid or concurrent academic-rule payload instead of accepting client calculation', () => {
    expect(inspectClassPerformanceRequestV1({ ...request(), academicRule: 'synthetic-rule' })).toBe(
      'invalid-request',
    );
    expect(
      inspectClassPerformanceRequestV1({
        ...request(),
        calculation: { weight: 0.5 },
      }),
    ).toBe('invalid-request');
    expect(
      inspectClassPerformanceRequestV1({
        ...request(),
        authorityMode: 'native-engine',
      }),
    ).toBe('invalid-request');
    expect(
      inspectClassPerformanceRequestV1({
        ...request(),
        period: { kind: 'term', term: 1, rounding: 'synthetic' },
      }),
    ).toBe('invalid-request');
    expect(inspectClassPerformanceRequestV1(request({ rows: { limit: 0, cursor: null } }))).toBe(
      'invalid-request',
    );
    expect(
      inspectClassPerformanceRequestV1(
        request({
          columns: {
            limit: 20,
            cursor: '   ' as PerformanceColumnCursorV1,
          },
        }),
      ),
    ).toBe('invalid-request');
  });

  it('represents multiple synthetic students and components in each of the four lenses', () => {
    for (const lens of PERFORMANCE_LENSES_V1) {
      const model = modelForLens(lens);

      expect(isClassPerformanceReadModelValidV1(model)).toBe(true);
      expect(model.rows.items).toHaveLength(2);
      expect(model.columns.items).toHaveLength(2);
      expect(model.rows.items.every((row) => row.cells.length === 2)).toBe(true);
      expect(model.rows.items.flatMap((row) => row.cells).every((cell) => cell.lens === lens)).toBe(
        true,
      );
    }
  });

  it('reuses all four official coverage states without defining another coverage vocabulary', () => {
    const states = ['complete', 'partial', 'insufficient-data', 'not-applicable'] as const;
    const cells = states.map((state, index) =>
      cellForLens('result', assignmentA, index + 1, coverage(state)),
    );

    expect(cells.map((cell) => cell.coverage.state)).toEqual(states);
    expect(CLASS_PERFORMANCE_CONTRACT_V1.coverageStates).toEqual(states);
  });

  it('makes comparable and non-comparable periods explicit without a tolerance or fabricated comparison', () => {
    const comparable = {
      state: 'comparable',
      referencePeriod: { kind: 'term', term: 3 },
      basis: 'percentage',
      current: compared(80, 81),
      reference: compared(75, 76),
    } as const satisfies PerformanceValueComparisonV1;
    const notComparable = {
      state: 'not-comparable',
      referencePeriod: { kind: 'annual' },
      reason: 'synthetic-non-equivalent-period-basis',
    } as const satisfies PerformanceValueComparisonV1;

    expect(PERFORMANCE_COMPARABILITY_STATES_V1).toEqual(['comparable', 'not-comparable']);
    expect(PERFORMANCE_COMPARISON_BASES_V1).toEqual(['official-value', 'percentage']);
    expect(comparable.basis).toBe('percentage');
    expect(comparable.current.imported).toEqual(numeric(80));
    expect(comparable.reference.calculated).toEqual(numeric(76));
    expect(notComparable.state).toBe('not-comparable');
    expect(notComparable).not.toHaveProperty('basis');
    expect(notComparable).not.toHaveProperty('current');
    expect(notComparable).not.toHaveProperty('reference');
    expect(CLASS_PERFORMANCE_CONTRACT_V1.academicSemantics.tolerance).toBe('forbidden');
  });

  it('preserves explicit absence and insufficient data without fabricating zero', () => {
    const missing = {
      imported: { state: 'absent' },
      calculated: {
        state: 'insufficient-data',
        reason: 'synthetic-required-input-missing',
      },
    } as const satisfies PerformanceComparedGradeValueV1;

    expect(missing.imported.state).toBe('absent');
    expect(missing.calculated.state).toBe('insufficient-data');
    expect(missing.imported).not.toHaveProperty('value');
    expect(missing.calculated).not.toHaveProperty('value');
    expect(JSON.stringify(missing)).not.toContain('"value":0');
  });

  it('paginates rows and columns independently with stable deterministic ordering and no total', () => {
    const unorderedRows = [
      studentRow(studentB, 'Aluno Sintético B', null, 'result', 2),
      studentRow(studentA, 'Aluno Sintético A', 2, 'result', 1),
      studentRow('student:synthetic:c' as StudentId, 'Aluno Sintético C', 1, 'result', 3),
    ];
    const orderedRows = [...unorderedRows].sort(comparePerformanceStudentRowsV1);
    const unorderedColumns = [columns[1], columns[0]].filter(
      (column): column is PerformanceComponentColumnV1 => column !== undefined,
    );
    const orderedColumns = [...unorderedColumns].sort(comparePerformanceComponentColumnsV1);

    expect(orderedRows.map((row) => row.sourcePosition)).toEqual([1, 2, null]);
    expect(isPerformanceStudentRowOrderV1(orderedRows)).toBe(true);
    expect(isPerformanceStudentRowOrderV1(unorderedRows)).toBe(false);
    expect(orderedColumns.map((column) => column.code)).toEqual(['MAT', 'POR']);
    expect(isPerformanceComponentColumnOrderV1(orderedColumns)).toBe(true);
    expect(isPerformanceComponentColumnOrderV1(unorderedColumns)).toBe(false);

    expect(isPerformancePageLimitV1(1)).toBe(true);
    expect(isPerformancePageLimitV1(PERFORMANCE_MAX_PAGE_LIMIT_V1)).toBe(true);
    expect(isPerformancePageLimitV1(0)).toBe(false);
    expect(isPerformancePageLimitV1(PERFORMANCE_MAX_PAGE_LIMIT_V1 + 1)).toBe(false);
    expect(isPerformancePageLimitV1(1.5)).toBe(false);

    const model = modelForLens('result');
    expect(isPerformanceRowsPageValidV1(model.rows)).toBe(true);
    expect(isPerformanceColumnsPageValidV1(model.columns)).toBe(true);
    expect(Object.keys(model.rows).sort()).toEqual(['items', 'limit', 'nextCursor']);
    expect(Object.keys(model.columns).sort()).toEqual(['items', 'limit', 'nextCursor']);
    expect(model).not.toHaveProperty('total');
    expect(model.rows).not.toHaveProperty('total');
    expect(model.columns).not.toHaveProperty('total');
  });

  it('preserves imported and native values under imported-source authority without raw evidence', () => {
    const cell = cellForLens('result', assignmentA, 1);

    expect(cell.authorityMode).toBe('imported-source');
    if (cell.lens !== 'result' || cell.projection.source !== 'term-result') {
      throw new Error('unexpected synthetic projection');
    }
    expect(cell.projection.officialGrade.imported).toEqual(numeric(21));
    expect(cell.projection.officialGrade.calculated).toEqual(numeric(21.5));
    expect(cell.projection.officialGrade.imported).not.toEqual(
      cell.projection.officialGrade.calculated,
    );
    expect(Object.keys(cell.projection.officialGrade).sort()).toEqual(['calculated', 'imported']);

    const serialized = JSON.stringify(modelForLens('result'));
    for (const forbidden of [
      'evidence',
      'rawValue',
      'formula',
      'cachedValue',
      'sourceReference',
      'sql',
      'href',
      'route',
    ]) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
  });

  it('keeps signals informational and detail access opaque instead of changing academic state', () => {
    const cell = {
      ...cellForLens('result', assignmentA, 1),
      signals: [
        {
          code: 'synthetic-coverage-signal',
          explanation: 'Sinal sintético explicável para investigação.',
          source: 'coverage',
          detailRef: cellDetailRef(assignmentA, 1),
        },
      ],
    } as const satisfies PerformanceCellV1;

    expect(cell.signals[0]).toEqual({
      code: 'synthetic-coverage-signal',
      explanation: 'Sinal sintético explicável para investigação.',
      source: 'coverage',
      detailRef: cell.detailRef,
    });
    expect(cell.signals[0]).not.toHaveProperty('academicState');
    expect(cell.signals[0]).not.toHaveProperty('decision');
    expect(CLASS_PERFORMANCE_CONTRACT_V1.academicSemantics.signalStateMutation).toBe('forbidden');
  });
});
