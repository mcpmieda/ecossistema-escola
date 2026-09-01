import { describe, expect, it, vi } from 'vitest';

import {
  COUNCIL_ANNUAL_PERIODS_V1,
  COUNCIL_UNSUPPORTED_SEMANTICS_V1,
  COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
  inspectCouncilDecisionRequestV1,
  type CouncilActorReferenceV1,
  type CouncilAnnualComponentViewV1,
  type CouncilClassReferenceV1,
  type CouncilComponentReferenceV1,
  type CouncilQueueStateV1,
  type CouncilStudentReferenceV1,
} from '../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import type { AcademicYearId } from '../../../shared/gradebook-contracts/entities';
import type { ResultCoverageV1 } from '../../../shared/gradebook-contracts/results/results-contract-v1';
import { createLocalCouncilDecisionStoreV1 } from '../../../server/gradebook/application/council/council-decision-store-v1';
import {
  createLocalCouncilWorkspaceSourceV1,
  type CouncilWorkspaceSourceStudentV1,
} from '../../../server/gradebook/application/council/council-workspace-source-v1';
import { createCouncilWorkspaceV1 } from '../../../server/gradebook/application/council/council-workspace-v1';

const academicYearId = 'academic-year:synthetic-council:2026' as AcademicYearId;
const classReference = 'class:synthetic-council:6a' as CouncilClassReferenceV1;
const actorReference = 'actor:synthetic-admin' as CouncilActorReferenceV1;
const decidedAt = '2026-09-01T22:30:00.000Z';

function coverage(state: ResultCoverageV1['state'] = 'complete'): ResultCoverageV1 {
  if (state === 'complete') {
    return { state, expectedItemCount: 1, resolvedItemCount: 1, missingItemCount: 0, reasons: [] };
  }
  return {
    state,
    expectedItemCount: 1,
    resolvedItemCount: 0,
    missingItemCount: 1,
    reasons: [`synthetic-${state}`],
  };
}

function annualView(seed: string): readonly CouncilAnnualComponentViewV1[] {
  const componentReference = `component:${seed}` as CouncilComponentReferenceV1;
  const periodResult = (
    period: (typeof COUNCIL_ANNUAL_PERIODS_V1)[number],
    index: number,
  ): CouncilAnnualComponentViewV1['periods'][number] => ({
    period,
    value:
      period === 'REC'
        ? { state: 'not-applicable', reason: 'synthetic-no-recovery' }
        : { state: 'numeric', value: 18 + index },
    coverage: period === 'REC' ? coverage('not-applicable') : coverage(),
    evidence: [
      {
        label: `Evidência oficial ${period}`,
        reference: `official:${seed}:${period}`,
      },
    ],
  });
  const [t1, t2, t3, rec] = COUNCIL_ANNUAL_PERIODS_V1;
  return [
    {
      componentReference,
      componentLabel: `Componente ${seed}`,
      periods: [
        periodResult(t1, 0),
        periodResult(t2, 1),
        periodResult(t3, 2),
        periodResult(rec, 3),
      ],
      annualState: 'approved-direct',
      annualCoverage: coverage(),
    },
  ];
}

function student(
  suffix: string,
  queueState: CouncilQueueStateV1,
  failedComponentCount: number | null,
  coverageState: ResultCoverageV1['state'] = 'complete',
): CouncilWorkspaceSourceStudentV1 {
  const studentReference = `student:synthetic:${suffix}` as CouncilStudentReferenceV1;
  return {
    academicYearId,
    classReference,
    classLabel: '6º A sintético',
    studentReference,
    studentLabel: `Aluno Sintético ${suffix}`,
    calculated: {
      queueState,
      officialAnnualState:
        queueState === 'eligible-for-council'
          ? 'eligible-for-council'
          : queueState === 'not-eligible-for-council'
            ? 'not-eligible-for-council'
            : queueState === 'insufficient-data'
              ? 'insufficient-data'
              : 'approved-direct',
      failedComponentCount,
      coverage: coverage(coverageState),
      reason: `Motivo oficial sintético ${suffix}`,
    },
    annualView: annualView(suffix),
  };
}

function createFixture() {
  const students = [
    student('zero', 'follows-official-annual-result', 0),
    student('one', 'eligible-for-council', 1),
    student('two', 'eligible-for-council', 2),
    student('three', 'not-eligible-for-council', 3),
    student('insufficient', 'insufficient-data', null, 'insufficient-data'),
  ];
  const source = createLocalCouncilWorkspaceSourceV1({ students });
  const decisions = createLocalCouncilDecisionStoreV1();
  const decisionIdentity = vi.fn(() => ({ actorReference, decidedAt }));
  const workspace = createCouncilWorkspaceV1({
    source,
    decisions,
    server: { isAuthorized: () => true, decisionIdentity },
  });
  return { students, source, decisions, workspace, decisionIdentity };
}

function queueRequest() {
  return {
    operation: 'queue' as const,
    contractVersion: COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
    academicYearId,
    classReference,
    page: { limit: 10, cursor: null },
  };
}

function studentRequest(studentReference: CouncilStudentReferenceV1) {
  return {
    operation: 'student' as const,
    contractVersion: COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
    academicYearId,
    classReference,
    studentReference,
  };
}

function decisionRequest(
  studentReference: CouncilStudentReferenceV1,
  expectedVersion: number,
  outcome: 'approved' | 'failed' = 'approved',
  justification = 'Justificativa colegiada sintética e explícita.',
) {
  return {
    operation: 'decision' as const,
    contractVersion: COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
    academicYearId,
    classReference,
    studentReference,
    expectedVersion,
    decision:
      outcome === 'approved'
        ? ({ outcome: 'approved', resultingState: 'approved-by-council' } as const)
        : ({ outcome: 'failed', resultingState: 'failed-by-council-decision' } as const),
    justification,
  };
}

describe('Council Workspace V1', () => {
  it('projeta 0/1/2/3+ e cobertura insuficiente exatamente como recebidos, sem cálculo concorrente', async () => {
    const { workspace, source, decisions } = createFixture();
    const listSpy = vi.spyOn(source, 'listQueue');
    const detailSpy = vi.spyOn(source, 'getStudent');
    const versionsSpy = vi.spyOn(decisions, 'getVersions');

    const response = await workspace.queue(queueRequest());
    expect(response.outcome).toBe('items');
    if (response.outcome !== 'items') throw new Error('Expected queue items.');

    expect(response.items.map((item) => [item.calculated.failedComponentCount, item.calculated.queueState])).toEqual([
      [0, 'follows-official-annual-result'],
      [1, 'eligible-for-council'],
      [2, 'eligible-for-council'],
      [3, 'not-eligible-for-council'],
      [null, 'insufficient-data'],
    ]);
    expect(response.items.at(-1)?.calculated.coverage.state).toBe('insufficient-data');
    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(detailSpy).not.toHaveBeenCalled();
    expect(versionsSpy).toHaveBeenCalledTimes(1);
  });

  it('preserva a visão anual T1/T2/T3/REC e evidências oficiais fornecidas pela fonte', async () => {
    const { workspace, students } = createFixture();
    const target = students[1]!;
    const response = await workspace.student(studentRequest(target.studentReference));
    expect(response.outcome).toBe('detail');
    if (response.outcome !== 'detail') throw new Error('Expected student detail.');

    expect(response.detail.annualView[0]?.periods.map((period) => period.period)).toEqual([
      'T1',
      'T2',
      'T3',
      'REC',
    ]);
    expect(response.detail.annualView[0]?.periods[0].value).toEqual({ state: 'numeric', value: 18 });
    expect(response.detail.annualView[0]?.periods[0].evidence[0]?.reference).toBe('official:one:T1');
    expect(response.detail.currentDecision).toBeNull();
    expect(response.detail.version).toBe(0);
  });

  it('exige justificativa e não cria decisão implícita para o estado calculado', async () => {
    const { workspace, students, decisionIdentity } = createFixture();
    const eligible = students[1]!;

    expect(inspectCouncilDecisionRequestV1(decisionRequest(eligible.studentReference, 0, 'approved', '   '))).toBe(
      'invalid-request',
    );
    const rejected = await workspace.decide(
      decisionRequest(eligible.studentReference, 0, 'approved', '   '),
    );
    expect(rejected.outcome).toBe('invalid-request');
    expect(decisionIdentity).not.toHaveBeenCalled();

    const untouched = await workspace.student(studentRequest(eligible.studentReference));
    expect(untouched.outcome).toBe('detail');
    if (untouched.outcome === 'detail') expect(untouched.detail.currentDecision).toBeNull();
  });

  it('registra primeira decisão e edição justificada com ator/instante exclusivamente server-side', async () => {
    const { workspace, students, decisionIdentity } = createFixture();
    const eligible = students[1]!;

    const first = await workspace.decide(decisionRequest(eligible.studentReference, 0));
    expect(first.outcome).toBe('applied');
    if (first.outcome !== 'applied') throw new Error('Expected first decision.');
    expect(first.version).toBe(1);
    expect(first.record.actorReference).toBe(actorReference);
    expect(first.record.decidedAt).toBe(decidedAt);
    expect(first.record.annualFinalDecision).toMatchObject({
      status: 'recorded',
      outcome: 'approved',
      basis: 'class-council',
      resultingState: 'approved-by-council',
      decidedAt,
    });

    const second = await workspace.decide(
      decisionRequest(
        eligible.studentReference,
        1,
        'failed',
        'Nova justificativa sintética para a edição da decisão.',
      ),
    );
    expect(second.outcome).toBe('applied');
    if (second.outcome !== 'applied') throw new Error('Expected edited decision.');
    expect(second.version).toBe(2);
    expect(decisionIdentity).toHaveBeenCalledTimes(2);

    const detail = await workspace.student(studentRequest(eligible.studentReference));
    expect(detail.outcome).toBe('detail');
    if (detail.outcome !== 'detail') throw new Error('Expected decision history.');
    expect(detail.detail.history.map((entry) => entry.version)).toEqual([1, 2]);
    expect(detail.detail.history[0]?.decision.outcome).toBe('approved');
    expect(detail.detail.history[1]?.decision.outcome).toBe('failed');
    expect(detail.detail.currentDecision?.version).toBe(2);
  });

  it('aplica expectedVersion/CAS e devolve conflito compreensível sem sobrescrever histórico', async () => {
    const { workspace, students } = createFixture();
    const eligible = students[2]!;

    await workspace.decide(decisionRequest(eligible.studentReference, 0));
    await workspace.decide(
      decisionRequest(eligible.studentReference, 1, 'failed', 'Segunda decisão sintética válida.'),
    );
    const stale = await workspace.decide(
      decisionRequest(eligible.studentReference, 1, 'approved', 'Tentativa sintética obsoleta.'),
    );
    expect(stale).toEqual({
      contractVersion: COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
      outcome: 'version-conflict',
      currentVersion: 2,
    });

    const detail = await workspace.student(studentRequest(eligible.studentReference));
    if (detail.outcome !== 'detail') throw new Error('Expected detail after conflict.');
    expect(detail.detail.history).toHaveLength(2);
    expect(detail.detail.currentDecision?.decision.outcome).toBe('failed');
  });

  it('mantém decisão indisponível para não elegível, dados insuficientes e resultado anual direto', async () => {
    const { workspace, students, decisionIdentity } = createFixture();
    for (const target of [students[0]!, students[3]!, students[4]!]) {
      const response = await workspace.decide(decisionRequest(target.studentReference, 0));
      expect(response.outcome).toBe('decision-unavailable');
    }
    expect(decisionIdentity).not.toHaveBeenCalled();
  });

  it('rejeita alegações do navegador e não expõe semântica de votação/frequência/participantes no request', () => {
    const { students } = createFixture();
    const request = decisionRequest(students[1]!.studentReference, 0);
    expect(Object.keys(request).sort()).toEqual([
      'academicYearId',
      'classReference',
      'contractVersion',
      'decision',
      'expectedVersion',
      'justification',
      'operation',
      'studentReference',
    ]);
    expect(
      inspectCouncilDecisionRequestV1({
        ...request,
        actorReference: 'browser-actor',
        decidedAt: '2000-01-01T00:00:00Z',
        role: 'ADMINISTRADOR',
        capability: 'gradebook.persistence.admin',
      }),
    ).toBe('invalid-request');
    expect(COUNCIL_UNSUPPORTED_SEMANTICS_V1).toEqual(
      expect.arrayContaining([
        'ballot-or-vote-count',
        'tie-break',
        'named-participant-or-participant-role',
        'attendance-as-automatic-rule',
      ]),
    );
  });

  it('mantém histórico como snapshots registrados, sem reler ou recalcular versões anteriores', async () => {
    const { workspace, students, decisions } = createFixture();
    const eligible = students[1]!;
    const applied = await workspace.decide(decisionRequest(eligible.studentReference, 0));
    if (applied.outcome !== 'applied') throw new Error('Expected applied decision.');

    const history = await decisions.getHistory({
      academicYearId,
      classReference,
      studentReference: eligible.studentReference,
    });
    expect(history).toEqual([applied.record]);
    expect(history[0]?.annualFinalDecision.basis).toBe('class-council');
    expect(Object.isFrozen(history[0])).toBe(true);
  });

  it('non-disclosure de autorização não retorna fila, detalhe ou decisão', async () => {
    const source = createLocalCouncilWorkspaceSourceV1({
      students: [student('one', 'eligible-for-council', 1)],
    });
    const workspace = createCouncilWorkspaceV1({
      source,
      decisions: createLocalCouncilDecisionStoreV1(),
      server: {
        isAuthorized: () => false,
        decisionIdentity: () => ({ actorReference, decidedAt }),
      },
    });
    const target = 'student:synthetic:one' as CouncilStudentReferenceV1;
    expect((await workspace.queue(queueRequest())).outcome).toBe('not-authorized');
    expect((await workspace.student(studentRequest(target))).outcome).toBe('not-authorized');
    expect((await workspace.decide(decisionRequest(target, 0))).outcome).toBe('not-authorized');
  });
});
