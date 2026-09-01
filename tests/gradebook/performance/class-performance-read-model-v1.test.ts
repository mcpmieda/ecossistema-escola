import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  ClassGroupId,
  EnrollmentId,
  EnrollmentV1,
  StudentId,
  StudentStatusEventId,
  StudentStatusEventV1,
  StudentV1,
  SubjectId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import {
  CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
  PERFORMANCE_COLUMN_ORDER_V1,
  PERFORMANCE_ROW_ORDER_V1,
  type ClassPerformanceRequestV1,
  type PerformanceCellDetailRefV1,
  type PerformanceComparedGradeValueV1,
  type PerformanceComponentColumnV1,
  type PerformanceLensV1,
  type PerformancePeriodV1,
  type PerformanceRowCursorV1,
  type PerformanceStudentDetailRefV1,
  type PerformanceValueComparisonV1,
} from '../../../shared/gradebook-contracts/performance/class-performance-read-model-v1';
import type {
  AcademicGradeValueV1,
  ComparedGradeValueV1,
  ResultCoverageV1,
  TermResultId,
  TermResultV1,
} from '../../../shared/gradebook-contracts/results/results-contract-v1';
import type { SourceCellEvidenceV1 } from '../../../shared/gradebook-contracts/source/source-contract-v1';
import type { AcademicRecordV1 } from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  ClassPerformanceReadModelErrorV1,
  createClassPerformanceReadModelV1,
  type ClassPerformanceSourceV1,
  type PerformanceCellDetailSourceRequestV1,
  type PerformanceCellDetailSourceV1,
  type PerformanceMatrixSourceCellV1,
  type PerformanceMatrixSourceRequestV1,
  type PerformanceMatrixSourceSnapshotV1,
  type PerformanceStudentDetailSourceRequestV1,
  type PerformanceStudentDetailSourceV1,
} from '../../../server/gradebook/application/read-models/performance/class-performance-read-model-v1';

const academicYearId = 'academic-year:synthetic:2026' as AcademicYearId;
const classGroupId = 'class-group:synthetic:7a' as ClassGroupId;
const students = [
  'student:synthetic:ana',
  'student:synthetic:bia',
  'student:synthetic:caio',
] as const satisfies readonly string[];
const studentIds = students as unknown as readonly StudentId[];
const assignments = [
  'teaching-assignment:synthetic:mat',
  'teaching-assignment:synthetic:cie',
  'teaching-assignment:synthetic:por',
] as const satisfies readonly string[];
const assignmentIds = assignments as unknown as readonly TeachingAssignmentId[];

const columns: readonly PerformanceComponentColumnV1[] = [
  {
    teachingAssignmentId: assignmentIds[2] as TeachingAssignmentId,
    subjectId: 'subject:synthetic:por' as SubjectId,
    code: 'POR',
    displayName: 'Português Sintético',
  },
  {
    teachingAssignmentId: assignmentIds[0] as TeachingAssignmentId,
    subjectId: 'subject:synthetic:mat' as SubjectId,
    code: 'MAT',
    displayName: 'Matemática Sintética',
  },
  {
    teachingAssignmentId: assignmentIds[1] as TeachingAssignmentId,
    subjectId: 'subject:synthetic:cie' as SubjectId,
    code: 'CIE',
    displayName: 'Ciências Sintéticas',
  },
];

function numeric(value: number): AcademicGradeValueV1 {
  return { state: 'numeric', value };
}

function compared(
  imported: AcademicGradeValueV1,
  calculated: AcademicGradeValueV1,
): PerformanceComparedGradeValueV1 {
  return { imported, calculated };
}

function numericCompared(value: number): PerformanceComparedGradeValueV1 {
  return compared(numeric(value), numeric(value + 0.5));
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
        reasons: ['synthetic-insufficient'],
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

function comparison(
  referencePeriod: PerformancePeriodV1 | null,
  ordinal: number,
): PerformanceValueComparisonV1 | null {
  if (referencePeriod === null) return null;
  return ordinal % 2 === 0
    ? {
        state: 'comparable',
        referencePeriod,
        basis: 'percentage',
        current: numericCompared(70 + ordinal),
        reference: numericCompared(65 + ordinal),
      }
    : {
        state: 'not-comparable',
        referencePeriod,
        reason: 'synthetic-official-bases-are-not-equivalent',
      };
}

function projection(
  request: PerformanceMatrixSourceRequestV1,
  ordinal: number,
): Pick<PerformanceMatrixSourceCellV1, 'lens' | 'projection'> {
  switch (request.lens) {
    case 'result':
      if (request.period.kind === 'annual') {
        return {
          lens: 'result',
          projection: {
            source: 'annual-result',
            originalTotal: numericCompared(55 + ordinal),
            postRecoveryTotal: numericCompared(65 + ordinal),
            academicState: {
              imported: 'approved-after-recovery',
              calculated: 'approved-direct',
            },
          },
        };
      }
      if (request.mode === 'recovery') {
        return {
          lens: 'result',
          projection: {
            source: 'final-recovery',
            originalTermGrade: numericCompared(15 + ordinal),
            applicability: {
              imported: { state: 'applicable' },
              calculated: { state: 'applicable' },
            },
            recoveryGrade: numericCompared(18 + ordinal),
            replacementTermGrade: numericCompared(18 + ordinal),
          },
        };
      }
      return {
        lens: 'result',
        projection: {
          source: 'term-result',
          officialGrade: numericCompared(20 + ordinal),
          percentage: numericCompared(60 + ordinal),
        },
      };
    case 'quantitative':
      return {
        lens: 'quantitative',
        projection: {
          original: numericCompared(8 + ordinal),
          parallelRecovery: compared(
            { state: 'absent' },
            { state: 'insufficient-data', reason: 'synthetic-parallel-not-resolved' },
          ),
          parallelRecoveryApplicability: {
            imported: { state: 'not-applicable', reason: 'synthetic-official-result' },
            calculated: { state: 'not-applicable', reason: 'synthetic-native-result' },
          },
          considered: numericCompared(8 + ordinal),
        },
      };
    case 'qualitative':
      return {
        lens: 'qualitative',
        projection: { operational: numericCompared(10 + ordinal) },
      };
    case 'assessments':
      return {
        lens: 'assessments',
        projection: {
          items: [
            {
              assessmentComponentId: `assessment-component:synthetic:${ordinal}` as never,
              name: `Avaliação Sintética ${ordinal}`,
              type: 'written',
              order: ordinal,
              maximum: 10,
              applicability: { state: 'applicable' },
              value: compared(
                ordinal === 1 ? { state: 'absent' } : numeric(ordinal),
                ordinal === 1
                  ? { state: 'insufficient-data', reason: 'synthetic-input-absent' }
                  : numeric(ordinal + 0.5),
              ),
            },
          ],
        },
      };
  }
}

function sourceCell(
  request: PerformanceMatrixSourceRequestV1,
  studentId: StudentId,
  assignmentId: TeachingAssignmentId,
  ordinal: number,
): PerformanceMatrixSourceCellV1 {
  return {
    teachingAssignmentId: assignmentId,
    authorityMode: 'imported-source',
    coverage: coverage(
      (['complete', 'partial', 'insufficient-data', 'not-applicable'] as const)[ordinal % 4] ??
        'complete',
    ),
    comparison: comparison(request.comparisonPeriod, ordinal),
    signals: [
      {
        code: `synthetic-signal-${ordinal}`,
        explanation: 'Sinal sintético somente informativo.',
        source: 'coverage',
        detail: 'cell',
      },
    ],
    detailKey: `cell-detail:${studentId}:${assignmentId}`,
    ...projection(request, ordinal),
  } as PerformanceMatrixSourceCellV1;
}

function snapshot(request: PerformanceMatrixSourceRequestV1): PerformanceMatrixSourceSnapshotV1 {
  const displayNames = ['Caio Sintético', 'Ana Sintética', 'Bia Sintética'];
  const positions = [null, 1, 2] as const;
  return {
    ...request,
    authorityMode: 'imported-source',
    coverage: coverage('partial'),
    columns,
    rows: studentIds.map((studentId, studentIndex) => ({
      sourcePosition: positions[studentIndex] ?? null,
      studentId,
      displayName: displayNames[studentIndex] ?? `Estudante Sintético ${studentIndex}`,
      situation:
        studentIndex === 2
          ? ({ state: 'absent' } as const)
          : ({ state: 'known', value: 'active' } as const),
      detailKey: `student-detail:${studentId}`,
      cells: assignmentIds.map((assignmentId, assignmentIndex) =>
        sourceCell(request, studentId, assignmentId, studentIndex * 3 + assignmentIndex),
      ),
    })),
  };
}

function enrollment(studentId: StudentId): EnrollmentV1 {
  return {
    id: `enrollment:synthetic:${studentId}` as EnrollmentId,
    academicYearId,
    studentId,
    classGroupId,
    effectivePeriod: { startsOn: '2026-02-01' },
    position: 'current',
    sourcePosition: studentIds.indexOf(studentId) + 1,
  };
}

function studentDetail(
  request: PerformanceStudentDetailSourceRequestV1,
): PerformanceStudentDetailSourceV1 {
  const studentId = request.detailKey.slice('student-detail:'.length) as StudentId;
  const student: StudentV1 = {
    id: studentId,
    displayName: `Detalhe ${studentId}`,
    sourceNames: [`Fonte sintética ${studentId}`],
  };
  const studentEnrollment = enrollment(studentId);
  const status: StudentStatusEventV1 = {
    id: `student-status-event:synthetic:${studentId}` as StudentStatusEventId,
    academicYearId,
    enrollmentId: studentEnrollment.id,
    status: 'active',
    sourceText: 'ATIVO SINTÉTICO',
  };
  return { ...request, student, enrollment: studentEnrollment, statusHistory: [status] };
}

function sourceEvidence(ordinal: number): SourceCellEvidenceV1 {
  return {
    classification: 'manual-positive-number',
    rawValue: ordinal,
    provenance: {
      fileName: 'arquivo-sintetico.xlsx',
      fileSha256: 'a'.repeat(64),
      sheetName: '7A1º',
      cellAddress: `AM${ordinal + 1}`,
    },
  };
}

function officialCompared(value: number): ComparedGradeValueV1 {
  return {
    imported: { value: numeric(value), evidence: [sourceEvidence(value)] },
    calculated: { value: numeric(value + 0.5) },
  };
}

function officialTermRecord(
  studentId: StudentId,
  assignmentId: TeachingAssignmentId,
): AcademicRecordV1 {
  const value: TermResultV1 = {
    id: `term-result:synthetic:${studentId}:${assignmentId}` as TermResultId,
    academicYearId,
    studentId,
    enrollmentId: enrollment(studentId).id,
    teachingAssignmentId: assignmentId,
    term: 1,
    maximum: 30,
    quantitative: {
      original: officialCompared(8),
      parallelRecovery: officialCompared(9),
      parallelRecoveryApplicability: {
        imported: { value: { state: 'applicable' }, evidence: [sourceEvidence(9)] },
        calculated: { state: 'applicable' },
      },
      considered: officialCompared(9),
    },
    qualitativeOperational: officialCompared(12),
    officialGrade: officialCompared(21),
    percentage: officialCompared(70),
    authorityMode: 'imported-source',
    coverage: coverage('complete'),
    ruleVersion: 'synthetic-official-rule-v1',
  };
  return { kind: 'term-result', value };
}

class SyntheticPerformanceSource implements ClassPerformanceSourceV1 {
  matrixCalls = 0;
  studentDetailCalls = 0;
  cellDetailCalls = 0;
  failMatrix = false;
  authorityMode: 'imported-source' | 'native-engine' = 'imported-source';

  async loadMatrix(
    request: PerformanceMatrixSourceRequestV1,
  ): Promise<PerformanceMatrixSourceSnapshotV1 | null> {
    this.matrixCalls += 1;
    if (this.failMatrix) throw new Error('raw provider failure with synthetic payload');
    return { ...snapshot(request), authorityMode: this.authorityMode as 'imported-source' };
  }

  async loadStudentDetail(
    request: PerformanceStudentDetailSourceRequestV1,
  ): Promise<PerformanceStudentDetailSourceV1 | null> {
    this.studentDetailCalls += 1;
    return studentDetail(request);
  }

  async loadCellDetail(
    request: PerformanceCellDetailSourceRequestV1,
  ): Promise<PerformanceCellDetailSourceV1 | null> {
    this.cellDetailCalls += 1;
    const parts = request.detailKey.split(':');
    const studentId = parts.slice(1, 4).join(':') as StudentId;
    const assignmentId = parts.slice(4).join(':') as TeachingAssignmentId;
    return {
      ...request,
      studentId,
      cell: sourceCell(request, studentId, assignmentId, 0),
      officialRecords: [officialTermRecord(studentId, assignmentId)],
    };
  }
}

function request(
  lens: PerformanceLensV1 = 'result',
  overrides: Partial<ClassPerformanceRequestV1> = {},
): ClassPerformanceRequestV1 {
  return {
    contractVersion: CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
    academicYearId,
    classGroupId,
    period: { kind: 'term', term: 1 },
    mode: 'regular',
    lens,
    comparisonPeriod: { kind: 'term', term: 2 },
    rows: { limit: 2, cursor: null },
    columns: { limit: 2, cursor: null },
    order: { rows: PERFORMANCE_ROW_ORDER_V1, columns: PERFORMANCE_COLUMN_ORDER_V1 },
    ...overrides,
  };
}

function expectCode(operation: () => Promise<unknown>, code: string): Promise<void> {
  return expect(operation()).rejects.toMatchObject({
    name: 'ClassPerformanceReadModelErrorV1',
    code,
  });
}

describe('provider-independent class performance read model v1', () => {
  it.each(['result', 'quantitative', 'qualitative', 'assessments'] as const)(
    'projects multiple students and components through the %s lens in one batch',
    async (lens) => {
      const source = new SyntheticPerformanceSource();
      const provider = createClassPerformanceReadModelV1(source);

      const model = await provider.get(
        request(lens, { rows: { limit: 3, cursor: null }, columns: { limit: 3, cursor: null } }),
      );

      expect(source.matrixCalls).toBe(1);
      expect(model?.rows.items).toHaveLength(3);
      expect(model?.columns.items).toHaveLength(3);
      expect(
        model?.rows.items.flatMap((row) => row.cells).every((cell) => cell.lens === lens),
      ).toBe(true);
      expect(model?.authorityMode).toBe('imported-source');
      expect(
        model?.rows.items
          .flatMap((row) => row.cells)
          .every((cell) => cell.authorityMode === 'imported-source'),
      ).toBe(true);
    },
  );

  it('sorts deterministically and paginates rows and columns independently without totals', async () => {
    const source = new SyntheticPerformanceSource();
    const provider = createClassPerformanceReadModelV1(source);
    const first = await provider.get(request());

    expect(first?.rows.items.map((row) => row.displayName)).toEqual([
      'Ana Sintética',
      'Bia Sintética',
    ]);
    expect(first?.columns.items.map((column) => column.code)).toEqual(['CIE', 'MAT']);
    expect(first?.rows.nextCursor).toMatch(/^class-performance-row-v1\./u);
    expect(first?.columns.nextCursor).toMatch(/^class-performance-column-v1\./u);
    expect(first?.rows).not.toHaveProperty('total');
    expect(first?.columns).not.toHaveProperty('total');
    expect(first).not.toHaveProperty('total');

    const second = await provider.get(
      request('result', {
        rows: { limit: 2, cursor: first?.rows.nextCursor ?? null },
        columns: { limit: 2, cursor: first?.columns.nextCursor ?? null },
      }),
    );
    expect(second?.rows.items.map((row) => row.displayName)).toEqual(['Caio Sintético']);
    expect(second?.columns.items.map((column) => column.code)).toEqual(['POR']);
    expect(second?.rows.nextCursor).toBeNull();
    expect(second?.columns.nextCursor).toBeNull();
  });

  it('preserves all coverage states plus explicit comparable and not-comparable cells', async () => {
    const provider = createClassPerformanceReadModelV1(new SyntheticPerformanceSource());
    const model = await provider.get(
      request('result', { rows: { limit: 3, cursor: null }, columns: { limit: 3, cursor: null } }),
    );
    const cells = model?.rows.items.flatMap((row) => row.cells) ?? [];

    expect(new Set(cells.map((cell) => cell.coverage.state))).toEqual(
      new Set(['complete', 'partial', 'insufficient-data', 'not-applicable']),
    );
    expect(cells.some((cell) => cell.comparison?.state === 'comparable')).toBe(true);
    expect(cells.some((cell) => cell.comparison?.state === 'not-comparable')).toBe(true);
    const notComparable = cells.find(
      (cell) => cell.comparison?.state === 'not-comparable',
    )?.comparison;
    expect(notComparable).not.toHaveProperty('current');
    expect(notComparable).not.toHaveProperty('reference');
    expect(model?.coverage.state).toBe('partial');
  });

  it('preserves official regular, recovery, and annual result projections without deriving them', async () => {
    const provider = createClassPerformanceReadModelV1(new SyntheticPerformanceSource());
    const regular = await provider.get(request());
    const recovery = await provider.get(request('result', { mode: 'recovery' }));
    const annual = await provider.get(
      request('result', {
        period: { kind: 'annual' },
        comparisonPeriod: null,
      }),
    );

    const resultSource = (model: typeof regular): string | undefined => {
      const cell = model?.rows.items[0]?.cells[0];
      return cell?.lens === 'result' ? cell.projection.source : undefined;
    };
    expect(resultSource(regular)).toBe('term-result');
    expect(resultSource(recovery)).toBe('final-recovery');
    expect(resultSource(annual)).toBe('annual-result');
    expect(
      annual?.rows.items.flatMap((row) => row.cells).every((cell) => cell.comparison === null),
    ).toBe(true);
  });

  it('preserves absence and insufficiency instead of converting either side to zero', async () => {
    const provider = createClassPerformanceReadModelV1(new SyntheticPerformanceSource());
    const model = await provider.get(
      request('assessments', {
        rows: { limit: 3, cursor: null },
        columns: { limit: 3, cursor: null },
      }),
    );
    const assessmentCells = model?.rows.items.flatMap((row) => row.cells) ?? [];
    const absent = assessmentCells
      .filter((cell) => cell.lens === 'assessments')
      .flatMap((cell) => cell.projection.items)
      .find((item) => item.value.imported.state === 'absent');

    expect(absent?.value.imported).toEqual({ state: 'absent' });
    expect(absent?.value.calculated).toEqual({
      state: 'insufficient-data',
      reason: 'synthetic-input-absent',
    });
    expect(JSON.stringify(absent)).not.toContain('"value":0');
  });

  it('loads student and cell details only on demand through opaque references', async () => {
    const source = new SyntheticPerformanceSource();
    const provider = createClassPerformanceReadModelV1(source);
    const model = await provider.get(request());
    const row = model?.rows.items[0];
    const cell = row?.cells[0];

    expect(source.studentDetailCalls).toBe(0);
    expect(source.cellDetailCalls).toBe(0);
    expect(row?.detailRef).toMatch(/^class-performance-student-detail-v1\./u);
    expect(cell?.detailRef).toMatch(/^class-performance-cell-detail-v1\./u);
    const serializedMatrix = JSON.stringify(model);
    expect(serializedMatrix).not.toContain('evidence');
    expect(serializedMatrix).not.toContain('rawValue');
    expect(serializedMatrix).not.toContain('fileSha256');

    const student = await provider.getStudentDetail(
      row?.detailRef as PerformanceStudentDetailRefV1,
    );
    const detail = await provider.getCellDetail(cell?.detailRef as PerformanceCellDetailRefV1);
    expect(source.studentDetailCalls).toBe(1);
    expect(source.cellDetailCalls).toBe(1);
    expect(student?.student?.id).toBe(row?.studentId);
    expect(detail?.cell.detailRef).toBe(cell?.detailRef);
    expect(detail?.officialRecords).toHaveLength(1);
    expect(JSON.stringify(detail?.officialRecords)).toContain('evidence');
    expect(detail?.authorityMode).toBe('imported-source');
  });

  it('keeps signals explanatory and incapable of mutating academic state', async () => {
    const provider = createClassPerformanceReadModelV1(new SyntheticPerformanceSource());
    const model = await provider.get(request());
    const signal = model?.rows.items[0]?.cells[0]?.signals[0];

    expect(signal).toMatchObject({ source: 'coverage' });
    expect(signal?.detailRef).toBe(model?.rows.items[0]?.cells[0]?.detailRef);
    expect(signal).not.toHaveProperty('academicState');
    expect(signal).not.toHaveProperty('decision');
    expect(signal).not.toHaveProperty('classification');
  });

  it('rejects malformed, cross-scope, and unknown cursors explicitly', async () => {
    const provider = createClassPerformanceReadModelV1(new SyntheticPerformanceSource());
    const first = await provider.get(request());

    await expectCode(
      () =>
        provider.get(
          request('result', {
            rows: { limit: 2, cursor: 'not-a-cursor' as PerformanceRowCursorV1 },
          }),
        ),
      'invalid-row-cursor',
    );
    await expectCode(
      () =>
        provider.get(
          request('qualitative', {
            rows: { limit: 2, cursor: first?.rows.nextCursor ?? null },
          }),
        ),
      'invalid-row-cursor',
    );
  });

  it('rejects any source result that attempts to change imported-source authority', async () => {
    const source = new SyntheticPerformanceSource();
    source.authorityMode = 'native-engine';
    const provider = createClassPerformanceReadModelV1(source);

    await expectCode(() => provider.get(request()), 'incompatible-source-result');
  });

  it('rejects client-side academic rules through the frozen request inspection', async () => {
    const provider = createClassPerformanceReadModelV1(new SyntheticPerformanceSource());
    const invalid = {
      ...request(),
      authorityMode: 'native-engine',
      formula: 'synthetic-forbidden-formula',
      tolerance: 0.01,
    } as unknown as ClassPerformanceRequestV1;

    await expectCode(() => provider.get(invalid), 'invalid-request');
  });

  it('sanitizes provider failures instead of leaking raw source errors', async () => {
    const source = new SyntheticPerformanceSource();
    source.failMatrix = true;
    const provider = createClassPerformanceReadModelV1(source);

    await expect(provider.get(request())).rejects.toEqual(
      new ClassPerformanceReadModelErrorV1('source-failure'),
    );
    await expect(provider.get(request())).rejects.not.toThrow(/raw provider failure/u);
  });
});
