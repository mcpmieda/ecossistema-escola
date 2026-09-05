import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  ClassGroupId,
  TeachingAssignmentV1,
} from '../../../shared/gradebook-contracts/entities';
import { createGradebookImportAnnualStateCacheV1 } from '../../../server/gradebook/application/import/import-persistence-service-v5';
import {
  GradebookD1ImportAnnualStateSourceV1,
  type GradebookImportAnnualStateSourceV1,
} from '../../../server/gradebook/persistence/d1/imports/d1-import-annual-state-source-v1';
import type {
  D1ReadDatabaseV1,
  D1ReadStatementV1,
} from '../../../server/gradebook/persistence/d1/read/d1-read-adapter-v1';

const academicYearId = 'academic-year:annual-bulk:2026' as AcademicYearId;
const otherYearId = 'academic-year:annual-bulk:2025' as AcademicYearId;
const classGroupId = 'class-group:annual-bulk:a' as ClassGroupId;
const outsideClassGroupId = 'class-group:annual-bulk:outside' as ClassGroupId;

function assignment(index: number): TeachingAssignmentV1 {
  const suffix = String(index).padStart(3, '0');
  return {
    id: `teaching-assignment:annual-bulk:${suffix}` as TeachingAssignmentV1['id'],
    academicYearId,
    teacherId: 'teacher:annual-bulk' as TeachingAssignmentV1['teacherId'],
    classGroupId,
    subjectId: `subject:annual-bulk:${suffix}` as TeachingAssignmentV1['subjectId'],
    sourceDisciplineIndex: 'D1',
    effectivePeriod: {},
    confirmationOrigin: 'imported-source',
  };
}

describe('gradebook import annual state bulk reuse', () => {
  it('serves loaded curriculum and prefetched annual results without per-class D1 fallbacks', async () => {
    let listCalls = 0;
    let singleCalls = 0;
    let bulkCalls = 0;
    const base: GradebookImportAnnualStateSourceV1 = {
      async listAssignments() {
        listCalls += 1;
        return { items: [], nextCursor: null };
      },
      async loadCurrentAnnualResultsForClass() {
        singleCalls += 1;
        return [];
      },
      async loadCurrentAnnualResultsForClasses(input) {
        bulkCalls += 1;
        return new Map(input.classGroupIds.map((id) => [id, []] as const));
      },
    };
    const assignments = Array.from({ length: 101 }, (_, index) => assignment(index + 1));
    const cached = await createGradebookImportAnnualStateCacheV1({
      base,
      academicYearId,
      assignments,
      classGroupIds: [classGroupId],
    });

    expect(bulkCalls).toBe(1);
    const first = await cached.listAssignments({
      academicYearId,
      classGroupId,
      limit: 100,
      cursor: null,
    });
    expect(first.items).toHaveLength(100);
    expect(first.nextCursor).toBe(assignments[99]!.id);
    const second = await cached.listAssignments({
      academicYearId,
      classGroupId,
      limit: 100,
      cursor: first.nextCursor,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(listCalls).toBe(0);

    await expect(
      cached.loadCurrentAnnualResultsForClass({ academicYearId, classGroupId }),
    ).resolves.toEqual([]);
    expect(singleCalls).toBe(0);

    await cached.listAssignments({
      academicYearId: otherYearId,
      classGroupId,
      limit: 100,
      cursor: null,
    });
    await cached.loadCurrentAnnualResultsForClass({
      academicYearId,
      classGroupId: outsideClassGroupId,
    });
    expect(listCalls).toBe(1);
    expect(singleCalls).toBe(1);
  });

  it('loads current annual results for multiple classes with one D1 all call', async () => {
    const classA = 'class-group:annual-bulk:a' as ClassGroupId;
    const classB = 'class-group:annual-bulk:b' as ClassGroupId;
    let allCalls = 0;
    let boundValues: readonly (string | number | null)[] = [];
    let preparedSql = '';
    const statement: D1ReadStatementV1 = {
      bind(...values) {
        boundValues = values;
        return this;
      },
      async first() {
        return null;
      },
      async all<Row extends Record<string, unknown>>() {
        allCalls += 1;
        return {
          results: [
            {
              class_group_id: classA,
              payload_json: JSON.stringify({
                kind: 'annual-result',
                value: { academicYearId, authorityMode: 'imported-source' },
              }),
            },
            {
              class_group_id: classB,
              payload_json: JSON.stringify({
                kind: 'annual-result',
                value: { academicYearId, authorityMode: 'imported-source' },
              }),
            },
          ] as unknown as readonly Row[],
        };
      },
    };
    const database: D1ReadDatabaseV1 = {
      prepare(query) {
        preparedSql = query;
        return statement;
      },
    };
    const source = new GradebookD1ImportAnnualStateSourceV1(database);

    const grouped = await source.loadCurrentAnnualResultsForClasses({
      academicYearId,
      classGroupIds: [classA, classB, classA],
    });

    expect(allCalls).toBe(1);
    expect(preparedSql).toContain('json_each(?)');
    expect(JSON.parse(String(boundValues[0]))).toEqual([classA, classB]);
    expect(boundValues[1]).toBe(academicYearId);
    expect(grouped.get(classA)).toHaveLength(1);
    expect(grouped.get(classB)).toHaveLength(1);
  });
});
