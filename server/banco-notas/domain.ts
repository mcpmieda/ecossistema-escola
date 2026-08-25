import type { SourceAssignment } from '../../shared/banco-notas-contract';

export function periodsOverlap(
  left: Pick<SourceAssignment, 'effectiveFrom' | 'effectiveTo'>,
  right: Pick<SourceAssignment, 'effectiveFrom' | 'effectiveTo'>,
): boolean {
  return (
    left.effectiveFrom <= (right.effectiveTo ?? '9999-12-31') &&
    right.effectiveFrom <= (left.effectiveTo ?? '9999-12-31')
  );
}

export function effectiveAuthority(
  assignments: readonly SourceAssignment[],
  schoolYearId: string,
  teacherId: string | null,
  at: string,
): SourceAssignment | null {
  const active = assignments.filter(
    (item) =>
      item.schoolYearId === schoolYearId &&
      item.status === 'active' &&
      item.authorityMode === 'authoritative' &&
      item.effectiveFrom <= at &&
      (!item.effectiveTo || item.effectiveTo >= at),
  );
  const overrides = teacherId
    ? active.filter((item) => item.scope === 'teacher_override' && item.teacherId === teacherId)
    : [];
  const matches = overrides.length
    ? overrides
    : active.filter((item) => item.scope === 'school_year_default');
  if (matches.length > 1) throw new Error('ambiguous_authoritative_source');
  return matches[0] ?? null;
}

export type GradeEventCandidate = {
  idempotencyKey: string;
  sequence: number;
  isAbsent: boolean;
  value: number | null;
};

export function classifyGradeEvent(
  candidate: GradeEventCandidate,
  existingKeys: ReadonlySet<string>,
  latestSequence: number | null,
): 'accept' | 'duplicate' | 'stale' | 'invalid' {
  if (candidate.isAbsent === (candidate.value !== null)) return 'invalid';
  if (existingKeys.has(candidate.idempotencyKey)) return 'duplicate';
  if (latestSequence !== null && candidate.sequence <= latestSequence) return 'stale';
  return 'accept';
}
