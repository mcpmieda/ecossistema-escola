import { describe, expect, it } from 'vitest';
import type {
  ComparedGradeValueV1,
  TermResultId,
} from '../../../shared/gradebook-contracts/results/results-contract-v1';
import {
  AUDIT_CONTRACT_V1,
  RECONCILIATION_STATUSES_V1,
  type ReconciliationResultId,
} from '../../../shared/gradebook-contracts/audit/audit-contract-v1';
import {
  RECONCILIATION_CONTRACT_V2,
  RECONCILIATION_CONTRACT_VERSION_V2,
  isDeterministicCorrectionProofV2,
  resolvePilotFlowStateV2,
  type AutomaticCorrectionEligibilityV2,
  type DeterministicCorrectionOutcomeV2,
  type ReconciliationCaseV2,
  type ReconciliationInvestigationV2,
  type ReconciliationResultV2,
} from '../../../shared/gradebook-contracts/audit/reconciliation-contract-v2';

const resultId = 'reconciliation-result:synthetic:1' as ReconciliationResultId;
const termResultId = 'term-result:synthetic:1' as TermResultId;
const comparedValue = {
  imported: {
    value: { state: 'numeric', value: 80 },
    evidence: [],
  },
  calculated: {
    value: { state: 'numeric', value: 79 },
  },
} as unknown as ComparedGradeValueV1;

function mismatch(): ReconciliationResultV2 {
  return {
    id: resultId,
    target: { kind: 'term-result', id: termResultId },
    value: comparedValue,
    ruleVersion: 'reconciliation:synthetic:v2',
    status: 'mismatch',
    difference: 1,
    explanation: 'synthetic-mismatch',
  };
}

function investigation(state: ReconciliationInvestigationV2['state']): ReconciliationInvestigationV2 {
  switch (state) {
    case 'not-required':
      return { state };
    case 'required':
      return { state, reason: 'synthetic-investigation-required' };
    case 'in-progress':
      return { state, investigationReference: 'investigation:synthetic:1' };
    case 'reconciled':
      return { state, resolutionReference: 'resolution:synthetic:1' };
    case 'accepted-with-reason':
      return {
        state,
        resolutionReference: 'resolution:synthetic:accepted',
        justification: 'synthetic-official-justification',
      };
  }
}

const validProofCandidate = {
  rootCause: {
    state: 'identified',
    code: 'synthetic-stale-derived-result',
  },
  officialEvidenceReferences: ['evidence:synthetic:official:1'],
  candidateOperationCount: 1,
  requiresHumanJudgment: false,
  destination: 'internal-versioned-state',
  operation: {
    kind: 'reprocess-derived-result',
    target: { kind: 'term-result', id: termResultId },
    profileId: 'evaluation-profile:synthetic:2026',
    profileVersion: '1',
    deterministicOutputReference: 'derived-output:synthetic:expected',
  },
  precondition: {
    kind: 'immutable-input-set',
    inputVersionReferences: ['input-version:synthetic:1'],
  },
} as const;

describe('reconciliation contract v2', () => {
  it('preserves the official reconciliation states while removing tolerance from V2', () => {
    const value = mismatch();

    expect(RECONCILIATION_STATUSES_V1).toEqual([
      'match',
      'expected-difference',
      'mismatch',
      'not-comparable',
    ]);
    expect(AUDIT_CONTRACT_V1.version).toBe(1);
    expect(RECONCILIATION_CONTRACT_VERSION_V2).toBe(2);
    expect(value.status).toBe('mismatch');
    expect(value).not.toHaveProperty('tolerance');
    expect(value).not.toHaveProperty('fault');
    expect(value.value.imported).toBeDefined();
    expect(value.value.calculated).toBeDefined();
    expect(RECONCILIATION_CONTRACT_V2.compatibility).toMatchObject({
      reinterpretHistoricalV1: false,
      historicalToleranceField: 'preserve-as-v1-only',
    });
    expect(RECONCILIATION_CONTRACT_V2.tolerance).toBe('forbidden-in-v2');
  });

  it('accepts only a unique deterministic internal operation with official evidence and precondition', () => {
    expect(isDeterministicCorrectionProofV2(validProofCandidate)).toBe(true);

    for (const invalid of [
      { ...validProofCandidate, rootCause: { state: 'unknown' } },
      { ...validProofCandidate, officialEvidenceReferences: [] },
      { ...validProofCandidate, candidateOperationCount: 2 },
      { ...validProofCandidate, requiresHumanJudgment: true },
      { ...validProofCandidate, destination: 'source-document' },
      { ...validProofCandidate, precondition: null },
      {
        ...validProofCandidate,
        operation: {
          kind: 'patch-arbitrary-data',
          target: { kind: 'term-result', id: termResultId },
          deterministicOutputReference: 'forbidden:synthetic',
        },
      },
    ]) {
      expect(isDeterministicCorrectionProofV2(invalid)).toBe(false);
    }
  });

  it('represents eligible deterministic reprocessing without overwriting evidence or history', () => {
    if (!isDeterministicCorrectionProofV2(validProofCandidate)) {
      throw new Error('synthetic proof must satisfy the frozen contract');
    }
    const eligibility: AutomaticCorrectionEligibilityV2 = {
      state: 'eligible',
      proof: validProofCandidate,
    };
    const outcome: DeterministicCorrectionOutcomeV2 = {
      state: 'completed',
      previousVersionReference: 'term-result-version:synthetic:1',
      newVersionReference: 'term-result-version:synthetic:2',
      evidencePreserved: true,
    };

    expect(eligibility.proof.operation.kind).toBe('reprocess-derived-result');
    expect(eligibility.proof.candidateOperationCount).toBe(1);
    expect(eligibility.proof.requiresHumanJudgment).toBe(false);
    expect(outcome).toMatchObject({
      state: 'completed',
      evidencePreserved: true,
    });
    expect(outcome.previousVersionReference).not.toBe(outcome.newVersionReference);
  });

  it('keeps software defects and source-document corrections fail-closed for automatic correction', () => {
    const softwareDefect: AutomaticCorrectionEligibilityV2 = {
      state: 'not-eligible',
      reason: 'software-change-required',
      explanation: 'synthetic-code-defect-requires-normal-development-flow',
    };
    const sourceDocument: AutomaticCorrectionEligibilityV2 = {
      state: 'not-eligible',
      reason: 'source-document-correction-required',
      explanation: 'synthetic-source-must-be-corrected-by-authorized-flow',
    };

    expect(softwareDefect.state).toBe('not-eligible');
    expect(softwareDefect).not.toHaveProperty('operation');
    expect(sourceDocument.reason).toBe('source-document-correction-required');
    expect(RECONCILIATION_CONTRACT_V2.automaticCorrection).toMatchObject({
      arbitraryMutation: 'forbidden',
      sourceDocumentMutation: 'forbidden',
      runtimeCodeMutation: 'forbidden',
      councilDecision: 'forbidden',
    });
  });

  it('keeps divergence, academic impact, investigation, correction, outcome and release as separate states', () => {
    if (!isDeterministicCorrectionProofV2(validProofCandidate)) {
      throw new Error('synthetic proof must satisfy the frozen contract');
    }
    const divergence = mismatch();
    const academicImpact = {
      state: 'material',
      basis: 'official-domain-rule',
      ruleVersion: 'academic-impact:synthetic:v1',
    } as const;
    const investigationState = investigation('required');
    const automaticCorrection: AutomaticCorrectionEligibilityV2 = {
      state: 'eligible',
      proof: validProofCandidate,
    };
    const pilotFlow = resolvePilotFlowStateV2({
      divergence,
      academicImpact,
      investigation: investigationState,
    });
    const value: ReconciliationCaseV2 = {
      contractVersion: 2,
      divergence,
      academicImpact,
      investigation: investigationState,
      automaticCorrection,
      correctionOutcome: { state: 'not-run', reason: 'blocked' },
      institutionalRelease: { state: 'blocked', reason: 'investigation-required' },
      pilotFlow,
    };

    expect(Object.keys(value).sort()).toEqual([
      'academicImpact',
      'automaticCorrection',
      'contractVersion',
      'correctionOutcome',
      'divergence',
      'institutionalRelease',
      'investigation',
      'pilotFlow',
    ]);
    expect(value.divergence.status).toBe('mismatch');
    expect(value.academicImpact.state).toBe('material');
    expect(value.investigation.state).toBe('required');
    expect(value.automaticCorrection.state).toBe('eligible');
    expect(value.correctionOutcome.state).toBe('not-run');
    expect(value.institutionalRelease.state).toBe('blocked');
    expect(value.pilotFlow.state).toBe('stop');
  });

  it('stops the pilot for material or unresolved potential impact under imported authority', () => {
    const divergence = mismatch();

    expect(
      resolvePilotFlowStateV2({
        divergence,
        academicImpact: {
          state: 'material',
          basis: 'official-domain-rule',
          ruleVersion: 'impact:synthetic:v1',
        },
        investigation: investigation('required'),
      }),
    ).toEqual({
      state: 'stop',
      authorityMode: 'imported-source',
      reason: 'mismatch-with-academic-impact',
    });

    expect(
      resolvePilotFlowStateV2({
        divergence,
        academicImpact: {
          state: 'potentially-material',
          basis: 'fail-closed-unresolved',
          reason: 'synthetic-impact-not-safely-resolved',
        },
        investigation: investigation('in-progress'),
      }),
    ).toEqual({
      state: 'stop',
      authorityMode: 'imported-source',
      reason: 'potential-academic-impact-unresolved',
    });
  });

  it('allows pilot continuation only after official reconciliation or accepted resolution', () => {
    const divergence = mismatch();
    const academicImpact = {
      state: 'material',
      basis: 'official-domain-rule',
      ruleVersion: 'impact:synthetic:v1',
    } as const;

    for (const resolvedInvestigation of [investigation('reconciled'), investigation('accepted-with-reason')]) {
      expect(
        resolvePilotFlowStateV2({
          divergence,
          academicImpact,
          investigation: resolvedInvestigation,
        }),
      ).toEqual({
        state: 'continue',
        authorityMode: 'imported-source',
        basis: 'reconciled-or-accepted',
      });
    }
    expect(RECONCILIATION_CONTRACT_V2.numericMaterialityHeuristic).toBe('forbidden');
    expect(RECONCILIATION_CONTRACT_V2.pilotAuthorityMode).toBe('imported-source');
  });
});
