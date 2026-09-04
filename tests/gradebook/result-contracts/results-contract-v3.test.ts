import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import type { AssessmentComponentId } from '../../../shared/gradebook-contracts/results/results-contract-v1';
import {
  RESULTS_CONTRACT_V3,
  assessmentComponentSourceStableKeyV3,
  type AssessmentComponentV3,
} from '../../../shared/gradebook-contracts/results/results-contract-v3';

describe('ResultsContract V3', () => {
  it('represents an undefined maximum explicitly without changing stable identity', () => {
    const identity = {
      logicalSourceReference: 'logical-source:synthetic',
      academicYearId: 'academic-year:2026' as AcademicYearId,
      teachingAssignmentId: 'assignment:synthetic' as TeachingAssignmentId,
      term: 1 as const,
      sourceSlot: 'AA' as const,
    };
    const component = {
      id: 'assessment-component:v2:synthetic' as AssessmentComponentId,
      academicYearId: identity.academicYearId,
      teachingAssignmentId: identity.teachingAssignmentId,
      term: identity.term,
      type: 'qualitative-activity',
      name: 'Atividade sintética',
      maximum: { state: 'not-defined' },
      order: 3,
      applicability: { state: 'applicable' },
    } satisfies AssessmentComponentV3;

    expect(component.maximum).toEqual({ state: 'not-defined' });
    expect(assessmentComponentSourceStableKeyV3(identity)).toContain(
      'assessment-component-source:v2:',
    );
    expect(RESULTS_CONTRACT_V3.assessmentMaximum).toMatchObject({
      denominatorDependentIndicatorsWhenNotDefined: 'unavailable',
      inventFallbackMaximum: false,
    });
  });
});
