import { describe, expect, it, vi } from 'vitest';
import type {
  AcademicYearId,
  ClassGroupId,
  EnrollmentId,
  StudentId,
} from '../../../shared/gradebook-contracts/entities';
import {
  BULLETIN_CONTRACT_VERSION_V1,
  BULLETIN_MODEL_VERSION_V1,
  type BulletinDataVersionV1,
  type BulletinIssuerIdV1,
  type BulletinSnapshotIdV1,
  type BulletinSnapshotV1,
} from '../../../shared/gradebook-contracts/bulletins/bulletin-contract-v1';
import { createBulletinEmissionServiceV1 } from '../../../server/gradebook/application/bulletins/bulletin-emission-service-v1';
import {
  createLocalBulletinSnapshotRepositoryV1,
  type BulletinSnapshotSeriesKeyV1,
} from '../../../server/gradebook/application/bulletins/bulletin-snapshot-repository-v1';
import type { AcademicRecordRepositoryV1 } from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';

const academicYearId = 'academic-year:synthetic:2026' as AcademicYearId;
const classGroupId = 'class-group:synthetic:6a' as ClassGroupId;
const studentId = 'student:synthetic:a' as StudentId;
const enrollmentId = 'enrollment:synthetic:a' as EnrollmentId;
const snapshotId = 'snapshot:synthetic:history' as BulletinSnapshotIdV1;
const seriesKey = 'series:synthetic:history' as BulletinSnapshotSeriesKeyV1;

function snapshot(version: number): BulletinSnapshotV1 {
  return {
    contractVersion: BULLETIN_CONTRACT_VERSION_V1,
    snapshotId,
    snapshotVersion: version,
    modelVersion: BULLETIN_MODEL_VERSION_V1,
    dataVersion: `bulletin-data-v1:synthetic:${version}` as BulletinDataVersionV1,
    emittedAt: `2026-09-01T1${version}:00:00.000Z`,
    issuerId: 'issuer:synthetic:server' as BulletinIssuerIdV1,
    presentation: { locale: 'pt-BR', dateStyle: 'short' },
    model: {
      contractVersion: BULLETIN_CONTRACT_VERSION_V1,
      modelVersion: BULLETIN_MODEL_VERSION_V1,
      modelKind: 'synthetic',
      academicYearId,
      period: { kind: 'term', term: 1 },
      student: { id: studentId, enrollmentId, displayName: 'Aluno Sintético' },
      classGroup: { id: classGroupId, code: '6A' },
      authorityMode: 'imported-source',
      subjects: [],
    },
  };
}

describe('histórico e reimpressão de Boletins V1', () => {
  it('mantém append-only, CAS, imutabilidade profunda e histórico filtrável no registry local', async () => {
    const repository = createLocalBulletinSnapshotRepositoryV1();
    const source = snapshot(1);
    const first = await repository.append(seriesKey, source, 0);
    expect(first.status).toBe('appended');
    if (first.status !== 'appended') return;
    expect(Object.isFrozen(first.snapshot)).toBe(true);
    expect(Object.isFrozen(first.snapshot.model)).toBe(true);
    expect(Object.isFrozen(first.snapshot.model.subjects)).toBe(true);

    const conflict = await repository.append(seriesKey, snapshot(1), 0);
    expect(conflict).toEqual({ status: 'version-conflict' });

    const second = await repository.append(seriesKey, snapshot(2), 1);
    expect(second.status).toBe('appended');
    const history = await repository.listHistory?.({ academicYearId, classGroupId, studentIds: [studentId] });
    expect(history?.map(({ snapshotVersion }) => snapshotVersion)).toEqual([2, 1]);

    const foreign = await repository.listHistory?.({
      academicYearId,
      classGroupId,
      studentIds: ['student:synthetic:other' as StudentId],
    });
    expect(foreign).toEqual([]);
  });

  it('reimprime exclusivamente o snapshot histórico com zero leitura acadêmica atual', async () => {
    const repository = createLocalBulletinSnapshotRepositoryV1();
    await repository.append(seriesKey, snapshot(1), 0);
    const classGroupRead = vi.fn(async () => {
      throw new Error('reprint-must-not-read-class-group');
    });
    const currentRead = vi.fn(async () => {
      throw new Error('reprint-must-not-read-academic-record');
    });
    const academicRecords: AcademicRecordRepositoryV1 = {
      getCurrent: currentRead,
      async listVersions() { return { items: [], nextCursor: null }; },
      async appendVersion() { throw new Error('read-only'); },
    };
    const service = createBulletinEmissionServiceV1({
      classGroups: { get: classGroupRead },
      academicRecords,
      snapshots: repository,
      now: () => { throw new Error('reprint-must-not-read-clock'); },
      createSnapshotId: () => { throw new Error('reprint-must-not-create-snapshot'); },
    });

    const result = await service.reprint(
      { contractVersion: BULLETIN_CONTRACT_VERSION_V1, snapshotId, snapshotVersion: 1 },
      { decision: 'allowed' },
    );
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.source).toBe('historical-snapshot');
      expect(result.snapshot).toEqual(snapshot(1));
      expect(Object.isFrozen(result.snapshot)).toBe(true);
    }
    expect(classGroupRead).not.toHaveBeenCalled();
    expect(currentRead).not.toHaveBeenCalled();
  });
});
