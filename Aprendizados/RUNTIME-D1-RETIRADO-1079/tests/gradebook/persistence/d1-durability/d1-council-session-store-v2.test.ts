import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  CouncilReviewReferenceV2,
} from '../../../../shared/gradebook-contracts/council/council-institutional-contract-v2';
import type {
  CouncilActorReferenceV1,
  CouncilClassReferenceV1,
  CouncilStudentReferenceV1,
} from '../../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import type { CouncilSessionStoreKeyV2 } from '../../../../server/gradebook/application/council/council-session-store-v2';
import { createGradebookD1CouncilSessionStoreV2 } from '../../../../server/gradebook/persistence/d1/durability/d1-council-session-store-v2';
import {
  durabilityYear2026,
  openDurabilityDatabase,
} from './d1-durability-test-support';

const openedDatabases: Awaited<ReturnType<typeof openDurabilityDatabase>>[] = [];

const key = {
  academicYearId: durabilityYear2026,
  classReference: 'class-reference:durability:session:a' as CouncilClassReferenceV1,
} satisfies CouncilSessionStoreKeyV2;
const studentA = 'student-reference:durability:session:a' as CouncilStudentReferenceV1;
const studentB = 'student-reference:durability:session:b' as CouncilStudentReferenceV1;
const actor = 'actor:durability:session' as CouncilActorReferenceV1;
const review = 'council-review:durability:session' as CouncilReviewReferenceV2;

async function database() {
  const value = await openDurabilityDatabase();
  openedDatabases.push(value);
  return value;
}

afterEach(() => {
  for (const value of openedDatabases.splice(0)) value.raw.close();
});

describe('store D1 da sessão institucional do Conselho V2', () => {
  it('recupera estado, voto, fechamento e histórico depois de reinstanciação', async () => {
    const db = await database();
    const first = createGradebookD1CouncilSessionStoreV2(db);

    await expect(first.getState(key)).resolves.toMatchObject({ state: 'open', version: 0, votes: [] });
    const voted = await first.recordVote({
      ...key,
      studentReference: studentA,
      expectedVersion: 0,
      approvedVotes: 4,
      failedVotes: 2,
      actorReference: actor,
      recordedAt: '2026-09-03T00:00:01.000Z',
    });
    expect(voted).toMatchObject({
      status: 'applied',
      version: 1,
      vote: { studentReference: studentA, comparison: 'approved-leading' },
    });

    const restartedOpen = createGradebookD1CouncilSessionStoreV2(db);
    const openState = await restartedOpen.getState(key);
    expect(openState).toMatchObject({
      state: 'open',
      version: 1,
      votes: [{ studentReference: studentA, approvedVotes: 4, failedVotes: 2, version: 1 }],
    });
    expect(Object.isFrozen(openState)).toBe(true);
    expect(Object.isFrozen(openState.votes)).toBe(true);

    const closed = await restartedOpen.close({
      ...key,
      expectedVersion: 1,
      reviewReference: review,
      items: [],
      actorReference: actor,
      closedAt: '2026-09-03T00:00:02.000Z',
    });
    expect(closed.status).toBe('closed');
    if (closed.status !== 'closed') return;
    expect(Object.isFrozen(closed.snapshot)).toBe(true);

    const restartedClosed = createGradebookD1CouncilSessionStoreV2(db);
    await expect(restartedClosed.getState(key)).resolves.toMatchObject({
      state: 'closed',
      version: 2,
      closure: { closureReference: closed.snapshot.closureReference, closedBy: actor },
    });
    await expect(restartedClosed.getHistory(key)).resolves.toEqual([closed.snapshot]);
    await expect(restartedClosed.touchOpen(key)).resolves.toEqual({
      status: 'closed',
      currentVersion: 2,
    });
    await expect(
      restartedClosed.recordVote({
        ...key,
        studentReference: studentB,
        expectedVersion: 2,
        approvedVotes: 1,
        failedVotes: 1,
        actorReference: actor,
        recordedAt: '2026-09-03T00:00:03.000Z',
      }),
    ).resolves.toEqual({ status: 'closed', currentVersion: 2 });
    await expect(
      restartedClosed.close({
        ...key,
        expectedVersion: 2,
        reviewReference: review,
        items: [],
        actorReference: actor,
        closedAt: '2026-09-03T00:00:04.000Z',
      }),
    ).resolves.toEqual({ status: 'already-closed', currentVersion: 2 });
  });

  it('resolve CAS concorrente com um vencedor sem versão parcial', async () => {
    const db = await database();
    const left = createGradebookD1CouncilSessionStoreV2(db);
    const right = createGradebookD1CouncilSessionStoreV2(db);

    const results = await Promise.all([
      left.recordVote({
        ...key,
        studentReference: studentA,
        expectedVersion: 0,
        approvedVotes: 2,
        failedVotes: 1,
        actorReference: actor,
        recordedAt: '2026-09-03T00:01:01.000Z',
      }),
      right.recordVote({
        ...key,
        studentReference: studentB,
        expectedVersion: 0,
        approvedVotes: 1,
        failedVotes: 2,
        actorReference: actor,
        recordedAt: '2026-09-03T00:01:02.000Z',
      }),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual(['applied', 'version-conflict']);
    expect(
      db.raw
        .prepare(
          `SELECT current_version, state FROM council_session_streams
            WHERE academic_year_id = ? AND class_reference = ?`,
        )
        .get(key.academicYearId, key.classReference),
    ).toEqual({ current_version: 1, state: 'open' });
    expect(
      db.raw
        .prepare(
          `SELECT version, previous_version FROM council_session_versions
            WHERE academic_year_id = ? AND class_reference = ? ORDER BY version`,
        )
        .all(key.academicYearId, key.classReference),
    ).toEqual([{ version: 1, previous_version: null }]);
  });

  it('carrega estado e histórico fechado sem N+1', async () => {
    const db = await database();
    const store = createGradebookD1CouncilSessionStoreV2(db);
    await store.recordVote({
      ...key,
      studentReference: studentA,
      expectedVersion: 0,
      approvedVotes: 3,
      failedVotes: 0,
      actorReference: actor,
      recordedAt: '2026-09-03T00:02:01.000Z',
    });
    await store.close({
      ...key,
      expectedVersion: 1,
      reviewReference: review,
      items: [],
      actorReference: actor,
      closedAt: '2026-09-03T00:02:02.000Z',
    });

    const restarted = createGradebookD1CouncilSessionStoreV2(db);
    const prepare = vi.spyOn(db, 'prepare');
    await restarted.getState(key);
    expect(prepare).toHaveBeenCalledTimes(1);
    prepare.mockClear();
    await restarted.getHistory(key);
    expect(prepare).toHaveBeenCalledTimes(1);
  });
});
