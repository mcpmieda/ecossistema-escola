import { describe, expect, it } from 'vitest';
import {
  classifyGradeEvent,
  effectiveAuthority,
  periodsOverlap,
} from '../server/banco-notas/domain';
import type { SourceAssignment } from '../shared/banco-notas-contract';

const base: SourceAssignment = {
  id: 'default',
  schoolYearId: 'year',
  sourceId: 'source-default',
  teacherId: null,
  scope: 'school_year_default',
  authorityMode: 'authoritative',
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  syncEnabled: false,
  reason: 'default anual',
  status: 'active',
  operatorId: 'actor',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

describe('Banco de Notas domain rules', () => {
  it('gives an explicit teacher override precedence without merging sources', () => {
    const override: SourceAssignment = {
      ...base,
      id: 'override',
      sourceId: 'source-teacher',
      teacherId: 'teacher',
      scope: 'teacher_override',
    };
    expect(effectiveAuthority([base, override], 'year', 'teacher', '2026-08-25')?.id).toBe(
      'override',
    );
    expect(effectiveAuthority([base, override], 'year', 'other', '2026-08-25')?.id).toBe('default');
  });
  it('detects overlaps including open-ended periods', () =>
    expect(periodsOverlap(base, { ...base, effectiveFrom: '2027-01-01' })).toBe(true));
  it('separates absence, zero, duplicates and stale sequences', () => {
    expect(
      classifyGradeEvent(
        { idempotencyKey: 'a', sequence: 1, isAbsent: false, value: 0 },
        new Set(),
        null,
      ),
    ).toBe('accept');
    expect(
      classifyGradeEvent(
        { idempotencyKey: 'a', sequence: 2, isAbsent: false, value: 1 },
        new Set(['a']),
        1,
      ),
    ).toBe('duplicate');
    expect(
      classifyGradeEvent(
        { idempotencyKey: 'b', sequence: 1, isAbsent: false, value: 1 },
        new Set(),
        1,
      ),
    ).toBe('stale');
    expect(
      classifyGradeEvent(
        { idempotencyKey: 'c', sequence: 2, isAbsent: true, value: 0 },
        new Set(),
        1,
      ),
    ).toBe('invalid');
  });
});
