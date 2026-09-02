import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  CouncilClassReferenceV1,
  CouncilStudentReferenceV1,
} from '../../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import {
  createGradebookD1CouncilDecisionStoreV1,
  GradebookD1CouncilDecisionErrorV1,
} from '../../../../server/gradebook/persistence/d1/council/d1-council-decision-store-v1';
import type { CouncilDecisionStoreKeyV1 } from '../../../../server/gradebook/application/council/council-decision-store-v1';
import {
  councilDecision,
  councilKeyA,
  councilKeyB,
  councilKeyOtherYear,
  durabilityYear2026,
  openDurabilityDatabase,
} from './d1-durability-test-support';

const openedDatabases: Awaited<ReturnType<typeof openDurabilityDatabase>>[] = [];

async function database() {
  const value = await openDurabilityDatabase();
  openedDatabases.push(value);
  return value;
}

afterEach(() => {
  for (const value of openedDatabases.splice(0)) value.raw.close();
});

describe('store D1 de decisões do Conselho V1', () => {
  it('preserva append-only, CAS, ator, instante e AnnualFinalDecisionV1 canônico', async () => {
    const db = await database();
    const store = createGradebookD1CouncilDecisionStoreV1(db);
    const first = await store.append(councilDecision(councilKeyA, 0));
    expect(first.status).toBe('applied');
    if (first.status !== 'applied') return;
    expect(first.record).toMatchObject({
      version: 1,
      justification: 'Justificativa sintética da versão 1.',
      actorReference: 'actor:durability:server',
      decidedAt: '2026-09-02T11:01:00.000Z',
      decision: { outcome: 'approved', resultingState: 'approved-by-council' },
      annualFinalDecision: {
        status: 'recorded',
        outcome: 'approved',
        basis: 'class-council',
        resultingState: 'approved-by-council',
        decidedAt: '2026-09-02T11:01:00.000Z',
      },
    });
    expect(first.record.annualFinalDecision.reference).toBe(first.record.decisionReference);
    expect(Object.isFrozen(first.record)).toBe(true);
    expect(Object.isFrozen(first.record.annualFinalDecision)).toBe(true);

    await expect(store.append(councilDecision(councilKeyA, 0, 'failed'))).resolves.toEqual({
      status: 'version-conflict',
      currentVersion: 1,
    });
    const second = await store.append(councilDecision(councilKeyA, 1, 'failed'));
    expect(second.status).toBe('applied');
    await expect(store.getHistory(councilKeyA)).resolves.toMatchObject([
      { version: 1, decision: { outcome: 'approved' } },
      { version: 2, decision: { outcome: 'failed' } },
    ]);
    expect(
      db.raw
        .prepare(
          `SELECT version, previous_version FROM council_decision_versions
            WHERE academic_year_id = ? AND class_reference = ? AND student_reference = ?
            ORDER BY version`,
        )
        .all(councilKeyA.academicYearId, councilKeyA.classReference, councilKeyA.studentReference),
    ).toEqual([
      { version: 1, previous_version: null },
      { version: 2, previous_version: 1 },
    ]);
  });

  it('resolve decisões concorrentes com um vencedor e histórico/raiz atômicos', async () => {
    const db = await database();
    const store = createGradebookD1CouncilDecisionStoreV1(db);
    const results = await Promise.all([
      store.append(councilDecision(councilKeyA, 0, 'approved')),
      store.append(councilDecision(councilKeyA, 0, 'failed')),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual(['applied', 'version-conflict']);
    expect(await store.getHistory(councilKeyA)).toHaveLength(1);
    expect(
      db.raw
        .prepare(
          `SELECT current_version FROM council_decision_streams
            WHERE academic_year_id = ? AND class_reference = ? AND student_reference = ?`,
        )
        .get(councilKeyA.academicYearId, councilKeyA.classReference, councilKeyA.studentReference),
    ).toEqual({ current_version: 1 });
  });

  it('recupera decisão/histórico após reinstanciação e isola ano, turma e aluno', async () => {
    const db = await database();
    const firstRuntime = createGradebookD1CouncilDecisionStoreV1(db);
    await firstRuntime.append(councilDecision(councilKeyA, 0));
    await firstRuntime.append(councilDecision(councilKeyA, 1, 'failed'));
    await firstRuntime.append(councilDecision(councilKeyB, 0));
    await firstRuntime.append(councilDecision(councilKeyOtherYear, 0));

    const restarted = createGradebookD1CouncilDecisionStoreV1(db);
    await expect(restarted.getCurrent(councilKeyA)).resolves.toMatchObject({ version: 2 });
    await expect(restarted.getHistorical(councilKeyA, 1)).resolves.toMatchObject({ version: 1 });
    await expect(restarted.getHistory(councilKeyB)).resolves.toHaveLength(1);
    await expect(restarted.getHistory(councilKeyOtherYear)).resolves.toHaveLength(1);

    const missing = {
      academicYearId: durabilityYear2026,
      classReference: 'class-reference:missing' as CouncilClassReferenceV1,
      studentReference: 'student-reference:missing' as CouncilStudentReferenceV1,
    } satisfies CouncilDecisionStoreKeyV1;
    await expect(restarted.getCurrent(missing)).resolves.toBeNull();
    await expect(restarted.getHistory(missing)).resolves.toEqual([]);
    await expect(restarted.getHistorical(missing, 1)).resolves.toBeNull();
  });

  it('pagina o histórico com bounds e cursor opaco', async () => {
    const db = await database();
    const store = createGradebookD1CouncilDecisionStoreV1(db);
    for (const expectedVersion of [0, 1, 2]) {
      await store.append(councilDecision(councilKeyA, expectedVersion));
    }

    const firstPage = await store.getHistoryPage({ key: councilKeyA, limit: 2, cursor: null });
    expect(firstPage.items.map(({ version }) => version)).toEqual([3, 2]);
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = await store.getHistoryPage({
      key: councilKeyA,
      limit: 2,
      cursor: firstPage.nextCursor,
    });
    expect(secondPage.items.map(({ version }) => version)).toEqual([1]);
    expect(secondPage.nextCursor).toBeNull();

    await expect(
      store.getHistoryPage({ key: councilKeyA, limit: 101, cursor: null }),
    ).rejects.toEqual(expect.objectContaining({ code: 'invalid-page' }));
    await expect(
      store.getHistoryPage({ key: councilKeyA, limit: 1, cursor: 'invalid' as never }),
    ).rejects.toBeInstanceOf(GradebookD1CouncilDecisionErrorV1);
  });

  it('carrega versões de uma página inteira em uma única query, inclusive ausentes', async () => {
    const db = await database();
    const store = createGradebookD1CouncilDecisionStoreV1(db);
    await store.append(councilDecision(councilKeyA, 0));
    await store.append(councilDecision(councilKeyB, 0));
    const missing = {
      academicYearId: durabilityYear2026,
      classReference: 'class-reference:durability:missing' as CouncilClassReferenceV1,
      studentReference: 'student-reference:durability:missing' as CouncilStudentReferenceV1,
    } satisfies CouncilDecisionStoreKeyV1;
    const prepare = vi.spyOn(db, 'prepare');

    await expect(store.getVersions([councilKeyA, missing, councilKeyB])).resolves.toEqual([
      { key: councilKeyA, version: 1 },
      { key: missing, version: 0 },
      { key: councilKeyB, version: 1 },
    ]);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare.mock.calls[0]?.[0]).toContain('WITH requested');
  });
});
