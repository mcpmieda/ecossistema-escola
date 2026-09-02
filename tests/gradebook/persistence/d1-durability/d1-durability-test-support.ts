import type {
  BulletinDataVersionV1,
  BulletinIssuerIdV1,
  BulletinSnapshotIdV1,
  BulletinSnapshotV1,
} from '../../../../shared/gradebook-contracts/bulletins/bulletin-contract-v1';
import {
  BULLETIN_CONTRACT_VERSION_V1,
  BULLETIN_MODEL_VERSION_V1,
} from '../../../../shared/gradebook-contracts/bulletins/bulletin-contract-v1';
import type {
  CouncilActorReferenceV1,
  CouncilClassReferenceV1,
  CouncilStudentReferenceV1,
} from '../../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import type {
  AcademicYearId,
  ClassGroupId,
  EnrollmentId,
  StudentId,
} from '../../../../shared/gradebook-contracts/entities';
import type {
  CouncilDecisionAppendV1,
  CouncilDecisionStoreKeyV1,
} from '../../../../server/gradebook/application/council/council-decision-store-v1';
import type { BulletinSnapshotSeriesKeyV1 } from '../../../../server/gradebook/application/bulletins/bulletin-snapshot-repository-v1';
import {
  openMigratedDatabase,
  type SqliteD1Database,
} from '../d1-transaction/d1-write-test-support';

export const durabilityYear2026 = 'academic-year:durability:2026' as AcademicYearId;
export const durabilityYear2027 = 'academic-year:durability:2027' as AcademicYearId;
export const durabilityClassA = 'class-group:durability:a' as ClassGroupId;
export const durabilityClassB = 'class-group:durability:b' as ClassGroupId;
export const durabilityStudentA = 'student:durability:a' as StudentId;
export const durabilityStudentB = 'student:durability:b' as StudentId;
export const durabilityEnrollmentA = 'enrollment:durability:a' as EnrollmentId;
export const durabilityEnrollmentB = 'enrollment:durability:b' as EnrollmentId;
export const durabilitySeriesA = 'series:durability:a' as BulletinSnapshotSeriesKeyV1;
export const durabilitySeriesB = 'series:durability:b' as BulletinSnapshotSeriesKeyV1;
export const durabilitySnapshotA = 'snapshot:durability:a' as BulletinSnapshotIdV1;
export const durabilitySnapshotB = 'snapshot:durability:b' as BulletinSnapshotIdV1;

export async function openDurabilityDatabase(): Promise<SqliteD1Database> {
  const database = await openMigratedDatabase();
  database.raw
    .prepare(
      `INSERT INTO academic_years (
         academic_year_id, school_id, year, current_version, created_at
       ) VALUES (?, ?, ?, 1, ?)`,
    )
    .run(durabilityYear2026, 'school:durability:a', 2026, '2026-09-02T10:00:00.000Z');
  database.raw
    .prepare(
      `INSERT INTO academic_years (
         academic_year_id, school_id, year, current_version, created_at
       ) VALUES (?, ?, ?, 1, ?)`,
    )
    .run(durabilityYear2027, 'school:durability:a', 2027, '2026-09-02T10:00:00.000Z');
  return database;
}

export interface SnapshotFixtureOptionsV1 {
  readonly academicYearId?: AcademicYearId;
  readonly classGroupId?: ClassGroupId;
  readonly studentId?: StudentId;
  readonly enrollmentId?: EnrollmentId;
  readonly snapshotId?: BulletinSnapshotIdV1;
  readonly emittedMinute?: number;
  readonly displayName?: string;
}

export function durabilitySnapshot(
  version: number,
  options: SnapshotFixtureOptionsV1 = {},
): BulletinSnapshotV1 {
  const academicYearId = options.academicYearId ?? durabilityYear2026;
  const classGroupId = options.classGroupId ?? durabilityClassA;
  const studentId = options.studentId ?? durabilityStudentA;
  const enrollmentId = options.enrollmentId ?? durabilityEnrollmentA;
  return {
    contractVersion: BULLETIN_CONTRACT_VERSION_V1,
    snapshotId: options.snapshotId ?? durabilitySnapshotA,
    snapshotVersion: version,
    modelVersion: BULLETIN_MODEL_VERSION_V1,
    dataVersion: `bulletin-data:durability:${String(version)}` as BulletinDataVersionV1,
    emittedAt: `2026-09-02T10:${String(options.emittedMinute ?? version).padStart(2, '0')}:00.000Z`,
    issuerId: 'issuer:durability:server' as BulletinIssuerIdV1,
    presentation: { locale: 'pt-BR', dateStyle: 'short' },
    model: {
      contractVersion: BULLETIN_CONTRACT_VERSION_V1,
      modelVersion: BULLETIN_MODEL_VERSION_V1,
      modelKind: 'synthetic',
      academicYearId,
      period: { kind: 'annual' },
      student: {
        id: studentId,
        enrollmentId,
        displayName: options.displayName ?? `Estudante Sintético ${studentId}`,
      },
      classGroup: { id: classGroupId, code: classGroupId === durabilityClassA ? 'A' : 'B' },
      authorityMode: 'imported-source',
      subjects: [],
    },
  };
}

export const councilKeyA = {
  academicYearId: durabilityYear2026,
  classReference: 'class-reference:durability:a' as CouncilClassReferenceV1,
  studentReference: 'student-reference:durability:a' as CouncilStudentReferenceV1,
} satisfies CouncilDecisionStoreKeyV1;

export const councilKeyB = {
  academicYearId: durabilityYear2026,
  classReference: 'class-reference:durability:b' as CouncilClassReferenceV1,
  studentReference: 'student-reference:durability:b' as CouncilStudentReferenceV1,
} satisfies CouncilDecisionStoreKeyV1;

export const councilKeyOtherYear = {
  academicYearId: durabilityYear2027,
  classReference: councilKeyA.classReference,
  studentReference: councilKeyA.studentReference,
} satisfies CouncilDecisionStoreKeyV1;

export function councilDecision(
  key: CouncilDecisionStoreKeyV1,
  expectedVersion: number,
  outcome: 'approved' | 'failed' = 'approved',
): CouncilDecisionAppendV1 {
  return {
    ...key,
    expectedVersion,
    decision:
      outcome === 'approved'
        ? { outcome: 'approved', resultingState: 'approved-by-council' }
        : { outcome: 'failed', resultingState: 'failed-by-council-decision' },
    justification: `Justificativa sintética da versão ${String(expectedVersion + 1)}.`,
    actorReference: 'actor:durability:server' as CouncilActorReferenceV1,
    decidedAt: `2026-09-02T11:${String(expectedVersion + 1).padStart(2, '0')}:00.000Z`,
  };
}
