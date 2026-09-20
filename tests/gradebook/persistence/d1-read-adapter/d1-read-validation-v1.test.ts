import { describe, expect, it } from 'vitest';

import { GradebookD1ReadErrorV1 as AdapterErrorV1 } from '../../../../server/gradebook/persistence/d1/read/d1-read-adapter-v1';
import {
  GradebookD1ReadErrorV1,
  failD1ReadV1,
  isD1ReadObjectV1,
  positiveD1ReadIntegerV1,
  requiredD1ReadStringV1,
  validateAcademicRecordShapeV1,
  type GradebookD1ReadErrorCodeV1,
} from '../../../../server/gradebook/persistence/d1/read/d1-read-validation-v1';

describe('shared D1 read validation', () => {
  it('preserves the public read error class and all stable codes', () => {
    expect(AdapterErrorV1).toBe(GradebookD1ReadErrorV1);
    const codes: readonly GradebookD1ReadErrorCodeV1[] = [
      'database-read-failed',
      'invalid-json',
      'incompatible-row',
      'broken-reference',
    ];
    for (const code of codes) {
      try {
        failD1ReadV1(code);
      } catch (error) {
        expect(error).toBeInstanceOf(GradebookD1ReadErrorV1);
        expect(error).toMatchObject({ name: 'GradebookD1ReadErrorV1', code });
        expect((error as Error).message.length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps primitive validators fail-closed', () => {
    expect(isD1ReadObjectV1({ ok: true })).toBe(true);
    expect(isD1ReadObjectV1([])).toBe(false);
    expect(requiredD1ReadStringV1('value')).toBe('value');
    expect(positiveD1ReadIntegerV1(7)).toBe(7);
    expect(() => requiredD1ReadStringV1('')).toThrow(
      expect.objectContaining({ code: 'incompatible-row' }),
    );
    expect(() => positiveD1ReadIntegerV1(0)).toThrow(
      expect.objectContaining({ code: 'incompatible-row' }),
    );
  });

  it('preserves the academic record shape validator semantics', () => {
    const record = {
      kind: 'term-result',
      value: {
        id: 'result:1',
        academicYearId: 'academic-year:synthetic:2026',
        studentId: 'student:1',
        enrollmentId: 'enrollment:1',
        authorityMode: 'official',
        ruleVersion: 'v1',
        teachingAssignmentId: 'assignment:1',
        term: 2,
      },
    };
    expect(validateAcademicRecordShapeV1(record)).toBe(record);
    expect(() =>
      validateAcademicRecordShapeV1({
        ...record,
        value: { ...record.value, term: 4 },
      }),
    ).toThrow(expect.objectContaining({ code: 'incompatible-row' }));
  });
});
