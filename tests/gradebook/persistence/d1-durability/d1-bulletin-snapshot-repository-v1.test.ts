import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BULLETIN_CONTRACT_VERSION_V1,
  type BulletinSnapshotIdV1,
} from '../../../../shared/gradebook-contracts/bulletins/bulletin-contract-v1';
import type { StudentId } from '../../../../shared/gradebook-contracts/entities';
import { createBulletinEmissionServiceV1 } from '../../../../server/gradebook/application/bulletins/bulletin-emission-service-v1';
import type { BulletinSnapshotSeriesKeyV1 } from '../../../../server/gradebook/application/bulletins/bulletin-snapshot-repository-v1';
import {
  createGradebookD1BulletinSnapshotRepositoryV1,
  GradebookD1BulletinSnapshotErrorV1,
} from '../../../../server/gradebook/persistence/d1/bulletins/d1-bulletin-snapshot-repository-v1';
import type { AcademicRecordRepositoryV1 } from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  durabilityClassA,
  durabilityClassB,
  durabilityEnrollmentB,
  durabilitySeriesA,
  durabilitySeriesB,
  durabilitySnapshot,
  durabilitySnapshotB,
  durabilityStudentA,
  durabilityStudentB,
  durabilityYear2026,
  durabilityYear2027,
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

describe('repositório D1 de snapshots de Boletins V1', () => {
  it('faz append inicial/subsequente com CAS, histórico imutável e payload canônico idêntico', async () => {
    const db = await database();
    const repository = createGradebookD1BulletinSnapshotRepositoryV1(db);
    const firstCandidate = durabilitySnapshot(1);

    const first = await repository.append(durabilitySeriesA, firstCandidate, 0);
    expect(first.status).toBe('appended');
    if (first.status !== 'appended') return;
    expect(first.snapshot).toEqual(firstCandidate);
    expect(Object.isFrozen(first.snapshot)).toBe(true);
    expect(Object.isFrozen(first.snapshot.model)).toBe(true);

    (firstCandidate.model.student as { displayName: string }).displayName = 'Mutação descartada';
    expect(
      (await repository.getHistorical(first.snapshot.snapshotId, 1))?.model.student.displayName,
    ).not.toBe('Mutação descartada');

    await expect(repository.append(durabilitySeriesA, durabilitySnapshot(1), 0)).resolves.toEqual({
      status: 'version-conflict',
    });
    const second = await repository.append(durabilitySeriesA, durabilitySnapshot(2), 1);
    expect(second.status).toBe('appended');
    expect((await repository.getLatest(durabilitySeriesA))?.snapshotVersion).toBe(2);
    await expect(
      repository.listHistory({
        academicYearId: durabilityYear2026,
        classGroupId: durabilityClassA,
        studentIds: [durabilityStudentA],
      }),
    ).resolves.toMatchObject([{ snapshotVersion: 2 }, { snapshotVersion: 1 }]);
  });

  it('resolve concorrência optimistic/CAS com um único vencedor e sem versão órfã', async () => {
    const db = await database();
    const repository = createGradebookD1BulletinSnapshotRepositoryV1(db);
    await repository.append(durabilitySeriesA, durabilitySnapshot(1), 0);

    const results = await Promise.all([
      repository.append(durabilitySeriesA, durabilitySnapshot(2), 1),
      repository.append(durabilitySeriesA, durabilitySnapshot(2), 1),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual(['appended', 'version-conflict']);
    expect(
      db.raw
        .prepare('SELECT current_version FROM bulletin_snapshot_streams WHERE series_key = ?')
        .get(durabilitySeriesA),
    ).toEqual({ current_version: 2 });
    expect(
      db.raw
        .prepare(
          'SELECT version FROM bulletin_snapshot_versions WHERE series_key = ? ORDER BY version',
        )
        .all(durabilitySeriesA),
    ).toEqual([{ version: 1 }, { version: 2 }]);
  });

  it('sobrevive à reinstanciação e mantém lookup histórico, páginas bounded e isolamento', async () => {
    const db = await database();
    const firstRuntime = createGradebookD1BulletinSnapshotRepositoryV1(db);
    for (const version of [1, 2, 3]) {
      await firstRuntime.append(durabilitySeriesA, durabilitySnapshot(version), version - 1);
    }
    await firstRuntime.append(
      durabilitySeriesB,
      durabilitySnapshot(1, {
        classGroupId: durabilityClassB,
        studentId: durabilityStudentB,
        enrollmentId: durabilityEnrollmentB,
        snapshotId: durabilitySnapshotB,
      }),
      0,
    );
    await firstRuntime.append(
      'series:durability:other-year' as BulletinSnapshotSeriesKeyV1,
      durabilitySnapshot(1, {
        academicYearId: durabilityYear2027,
        snapshotId: 'snapshot:durability:other-year' as BulletinSnapshotIdV1,
      }),
      0,
    );

    const restarted = createGradebookD1BulletinSnapshotRepositoryV1(db);
    expect((await restarted.getLatest(durabilitySeriesA))?.snapshotVersion).toBe(3);
    await expect(
      restarted.getHistorical('snapshot:durability:missing' as BulletinSnapshotIdV1, 1),
    ).resolves.toBeNull();

    const prepare = vi.spyOn(db, 'prepare');
    const firstPage = await restarted.listHistoryPage({
      academicYearId: durabilityYear2026,
      classGroupId: durabilityClassA,
      studentIds: [durabilityStudentA],
      limit: 1,
      cursor: null,
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare.mock.calls[0]?.[0]).toContain('bulletin_snapshot_versions');
    prepare.mockRestore();
    expect(firstPage.items.map(({ snapshotVersion }) => snapshotVersion)).toEqual([3]);
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = await restarted.listHistoryPage({
      academicYearId: durabilityYear2026,
      classGroupId: durabilityClassA,
      studentIds: [durabilityStudentA],
      limit: 1,
      cursor: firstPage.nextCursor,
    });
    expect(secondPage.items.map(({ snapshotVersion }) => snapshotVersion)).toEqual([2]);

    await expect(
      restarted.listHistory({
        academicYearId: durabilityYear2026,
        classGroupId: durabilityClassA,
        studentIds: [durabilityStudentB],
      }),
    ).resolves.toEqual([]);
    await expect(
      restarted.listHistory({
        academicYearId: durabilityYear2027,
        classGroupId: durabilityClassA,
        studentIds: [durabilityStudentA],
      }),
    ).resolves.toHaveLength(1);
  });

  it('reimprime snapshot persistido após restart com zero leitura acadêmica atual', async () => {
    const db = await database();
    const writer = createGradebookD1BulletinSnapshotRepositoryV1(db);
    await writer.append(durabilitySeriesA, durabilitySnapshot(1), 0);
    const restarted = createGradebookD1BulletinSnapshotRepositoryV1(db);
    const classGroupRead = vi.fn(async () => {
      throw new Error('reprint-must-not-read-class-group');
    });
    const currentRead = vi.fn(async () => {
      throw new Error('reprint-must-not-read-academic-record');
    });
    const academicRecords: AcademicRecordRepositoryV1 = {
      getCurrent: currentRead,
      async listVersions() {
        return { items: [], nextCursor: null };
      },
      async appendVersion() {
        throw new Error('read-only');
      },
    };
    const service = createBulletinEmissionServiceV1({
      classGroups: { get: classGroupRead },
      academicRecords,
      snapshots: restarted,
      now: () => {
        throw new Error('reprint-must-not-read-clock');
      },
      createSnapshotId: () => {
        throw new Error('reprint-must-not-create-snapshot');
      },
    });

    const result = await service.reprint(
      {
        contractVersion: BULLETIN_CONTRACT_VERSION_V1,
        snapshotId: durabilitySnapshot(1).snapshotId,
        snapshotVersion: 1,
      },
      { decision: 'allowed' },
    );
    expect(result).toMatchObject({
      status: 'ready',
      source: 'historical-snapshot',
      snapshot: { snapshotVersion: 1 },
    });
    expect(classGroupRead).not.toHaveBeenCalled();
    expect(currentRead).not.toHaveBeenCalled();
  });

  it('rejeita paginação/cursor fora dos bounds sem revelar conteúdo', async () => {
    const db = await database();
    const repository = createGradebookD1BulletinSnapshotRepositoryV1(db);
    const base = {
      academicYearId: durabilityYear2026,
      classGroupId: durabilityClassA,
      studentIds: [durabilityStudentA] as readonly StudentId[],
    };

    await expect(repository.listHistoryPage({ ...base, limit: 0, cursor: null })).rejects.toEqual(
      expect.objectContaining({ code: 'invalid-page' }),
    );
    await expect(
      repository.listHistoryPage({ ...base, limit: 1, cursor: 'not-a-cursor' as never }),
    ).rejects.toBeInstanceOf(GradebookD1BulletinSnapshotErrorV1);
  });
});
