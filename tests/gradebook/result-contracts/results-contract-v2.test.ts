import { describe, expect, it } from 'vitest';

import type {
  AcademicYearId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import {
  ASSESSMENT_COMPONENT_TYPES_V1,
  type AssessmentComponentId,
} from '../../../shared/gradebook-contracts/results/results-contract-v1';
import {
  ASSESSMENT_COMPONENT_TYPES_V2,
  RESULTS_CONTRACT_V2,
  assessmentComponentSourceStableKeyV2,
  type AssessmentComponentSourceIdentityV2,
  type AssessmentComponentV2,
} from '../../../shared/gradebook-contracts/results/results-contract-v2';

const academicYearId = 'academic-year:assessment-v2:2026' as AcademicYearId;
const assignmentId = 'teaching-assignment:assessment-v2:math' as TeachingAssignmentId;
const otherAssignmentId = 'teaching-assignment:assessment-v2:science' as TeachingAssignmentId;

function identity(
  sourceSlot: AssessmentComponentSourceIdentityV2['sourceSlot'] = 'R',
): AssessmentComponentSourceIdentityV2 {
  return {
    logicalSourceReference: 'logical-source:assessment-v2:teacher-2026',
    academicYearId,
    teachingAssignmentId: assignmentId,
    term: 1,
    sourceSlot,
  };
}

describe('academic result contracts v2 — assessment fidelity', () => {
  it('RES2-001: usa tipo quantitativo genérico sem inferir written/simulation por posição', () => {
    expect(ASSESSMENT_COMPONENT_TYPES_V2).toEqual([
      'quantitative-assessment',
      'qualitative-activity',
      'parallel-recovery',
    ]);
    expect(ASSESSMENT_COMPONENT_TYPES_V2).not.toContain('simulation');
    expect(ASSESSMENT_COMPONENT_TYPES_V2).not.toContain('written');
  });

  it('RES2-002: V1 histórico preserva written/simulation sob a versão que os produziu', () => {
    expect(ASSESSMENT_COMPONENT_TYPES_V1).toEqual([
      'written',
      'simulation',
      'qualitative-activity',
      'parallel-recovery',
    ]);
    expect(RESULTS_CONTRACT_V2.predecessorVersion).toBe(1);
    expect(RESULTS_CONTRACT_V2.compatibility).toEqual({
      historicalV1AssessmentTypes: 'preserve-as-v1',
      reinterpretHistoricalV1: false,
    });
  });

  it('RES2-003: materializa R/S resolvidos com ID opaco, tipo genérico e ordem estrutural', () => {
    const first = {
      id: 'assessment-component:opaque:r' as AssessmentComponentId,
      academicYearId,
      teachingAssignmentId: assignmentId,
      term: 1,
      type: 'quantitative-assessment',
      name: 'Avaliação quantitativa 1',
      maximum: 8,
      order: 1,
      applicability: { state: 'applicable' },
    } satisfies AssessmentComponentV2;
    const second = {
      ...first,
      id: 'assessment-component:opaque:s' as AssessmentComponentId,
      name: 'Avaliação quantitativa 2',
      maximum: 5.5,
      order: 2,
    } satisfies AssessmentComponentV2;

    expect(first.type).toBe('quantitative-assessment');
    expect(second.type).toBe('quantitative-assessment');
    expect(first.id).not.toBe(second.id);
    expect([first.order, second.order]).toEqual([1, 2]);
  });

  it('RES2-004: chave estável exclui nome e máximo e suporta nova versão no mesmo slot', () => {
    const stableIdentity = identity('AA');
    const before = {
      name: 'Pesquisa sintética',
      maximum: 3,
      stableKey: assessmentComponentSourceStableKeyV2(stableIdentity),
    };
    const after = {
      name: 'Pesquisa sintética revisada',
      maximum: 4,
      stableKey: assessmentComponentSourceStableKeyV2(stableIdentity),
    };

    expect(before.stableKey).toBe(after.stableKey);
    expect(before.name).not.toBe(after.name);
    expect(before.maximum).not.toBe(after.maximum);
    expect(RESULTS_CONTRACT_V2.assessmentIdentity.excludes).toEqual(['name', 'maximum']);
  });

  it('RES2-005: chave isola fonte lógica, teaching assignment, trimestre e slot', () => {
    const base = identity('R');
    const baseKey = assessmentComponentSourceStableKeyV2(base);
    const variants: AssessmentComponentSourceIdentityV2[] = [
      { ...base, logicalSourceReference: 'logical-source:assessment-v2:other' },
      { ...base, teachingAssignmentId: otherAssignmentId },
      { ...base, term: 2 },
      { ...base, sourceSlot: 'S' },
    ];

    expect(new Set([baseKey, ...variants.map(assessmentComponentSourceStableKeyV2)]).size).toBe(5);
    expect(RESULTS_CONTRACT_V2.assessmentIdentity.stableSourceKeyFields).toEqual([
      'logicalSourceReference',
      'academicYearId',
      'teachingAssignmentId',
      'term',
      'sourceSlot',
    ]);
  });

  it('RES2-006: autoridade, estados de valor/aplicabilidade e resultados permanecem herdados de V1', () => {
    expect(RESULTS_CONTRACT_V2.authorityModes).toEqual(['imported-source', 'native-engine']);
    expect(RESULTS_CONTRACT_V2.gradeValueStates).toContain('insufficient-data');
    expect(RESULTS_CONTRACT_V2.applicabilityStates).toEqual([
      'applicable',
      'not-applicable',
      'insufficient-data',
    ]);
    expect(RESULTS_CONTRACT_V2.version).toBe(2);
  });
});
