import type {
  AcademicYearId,
  AcademicYearStatusV1,
  SchoolId,
} from '../../../../../shared/gradebook-contracts/entities';
import type {
  AcademicYearManagementItemV1,
  AcademicYearManagementResponseV1,
} from '../../../../../shared/gradebook-contracts/operational-workspace/academic-year-management-v1';
import { supportsAtomicBatch } from '../transaction/d1-batch-promotion-transaction-v1';
import type { D1WriteDatabaseV1 } from '../write/d1-write-adapter-v1';

type Row = Record<string, unknown>;

function item(row: Row): AcademicYearManagementItemV1 {
  if (
    typeof row.academic_year_id !== 'string' ||
    typeof row.year !== 'number' ||
    !Number.isSafeInteger(row.year) ||
    (row.status !== 'planned' && row.status !== 'active' && row.status !== 'closed')
  ) {
    throw new TypeError('incompatible-academic-year-row');
  }
  return {
    id: row.academic_year_id as AcademicYearId,
    year: row.year,
    status: row.status as AcademicYearStatusV1,
  };
}

export function createAcademicYearManagementV1(input: {
  readonly database: D1WriteDatabaseV1;
  readonly schoolId: SchoolId;
  readonly now?: () => string;
}) {
  const list = async (): Promise<readonly AcademicYearManagementItemV1[]> => {
    const rows = await input.database
      .prepare(
        `SELECT y.academic_year_id, y.year, v.status
           FROM academic_years y
           JOIN academic_year_versions v
             ON v.academic_year_id=y.academic_year_id AND v.version=y.current_version
          WHERE y.school_id = ?
          ORDER BY y.year DESC, y.academic_year_id ASC`,
      )
      .bind(input.schoolId)
      .all<Row>();
    return rows.results.map(item);
  };

  return {
    async list(): Promise<AcademicYearManagementResponseV1> {
      return { managementVersion: 1, state: 'ready', items: await list() };
    },

    async create(year: number): Promise<AcademicYearManagementResponseV1> {
      const existing = (await list()).find((candidate) => candidate.year === year);
      if (existing) return { managementVersion: 1, state: 'already-present', item: existing };

      const academicYearId = `academic-year:${input.schoolId}:${year}` as AcademicYearId;
      const status: AcademicYearStatusV1 = year === 2026 ? 'active' : 'planned';
      const evaluationProfileId = `evaluation-profile:${year}`;
      const configurationId = `academic-year-configuration:${year}`;
      const recordedAt = (input.now ?? (() => new Date().toISOString()))();
      const payload = JSON.stringify({
        id: academicYearId,
        schoolId: input.schoolId,
        year,
        status,
        activeEvaluationProfileId: evaluationProfileId,
        configurationVersion: '1',
      });

      const insertYear = input.database
        .prepare(
          `INSERT INTO academic_years (
             academic_year_id, school_id, year, current_version, created_at
           ) VALUES (?, ?, ?, 1, ?)
           ON CONFLICT (school_id, year) DO NOTHING`,
        )
        .bind(academicYearId, input.schoolId, year, recordedAt);
      const insertConfiguration = input.database
        .prepare(
          `INSERT INTO academic_year_configuration_versions (
             academic_year_id, configuration_id, version, previous_version,
             evaluation_profile_id, payload_json, recorded_at
           ) VALUES (?, ?, 1, NULL, ?, '{}', ?)`,
        )
        .bind(academicYearId, configurationId, evaluationProfileId, recordedAt);
      const insertVersion = input.database
        .prepare(
          `INSERT INTO academic_year_versions (
             academic_year_id, version, previous_version, status, starts_on, ends_on,
             active_evaluation_profile_id, configuration_id, configuration_version,
             payload_json, recorded_at
           ) VALUES (?, 1, NULL, ?, NULL, NULL, ?, ?, 1, ?, ?)`,
        )
        .bind(academicYearId, status, evaluationProfileId, configurationId, payload, recordedAt);

      if (supportsAtomicBatch(input.database)) {
        try {
          const results = await input.database.batch([
            insertYear,
            insertConfiguration,
            insertVersion,
          ]);
          const changes = results[0]?.meta?.changes ?? results[0]?.changes;
          if (changes !== 1) throw new Error('academic-year-create-conflict');
        } catch (cause) {
          const concurrent = (await list()).find((candidate) => candidate.year === year);
          if (!concurrent) throw cause;
          return { managementVersion: 1, state: 'already-present', item: concurrent };
        }
        return {
          managementVersion: 1,
          state: 'created',
          item: { id: academicYearId, year, status },
        };
      }

      await input.database.exec('SAVEPOINT gradebook_academic_year_management');
      try {
        const inserted = await insertYear.run();
        const changes = inserted.meta?.changes ?? inserted.changes;
        if (changes !== 1) {
          await input.database.exec('ROLLBACK TO SAVEPOINT gradebook_academic_year_management');
          await input.database.exec('RELEASE SAVEPOINT gradebook_academic_year_management');
          const concurrent = (await list()).find((candidate) => candidate.year === year);
          if (!concurrent) throw new Error('academic-year-create-conflict');
          return { managementVersion: 1, state: 'already-present', item: concurrent };
        }
        await insertConfiguration.run();
        await insertVersion.run();
        await input.database.exec('RELEASE SAVEPOINT gradebook_academic_year_management');
      } catch (cause) {
        try {
          await input.database.exec('ROLLBACK TO SAVEPOINT gradebook_academic_year_management');
          await input.database.exec('RELEASE SAVEPOINT gradebook_academic_year_management');
        } catch {
          throw new Error('academic-year-rollback-failed');
        }
        throw cause;
      }
      return {
        managementVersion: 1,
        state: 'created',
        item: { id: academicYearId, year, status },
      };
    },
  };
}
