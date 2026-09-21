import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  AcademicYearId,
  AcademicYearV1,
  SchoolId,
} from '../../../../shared/gradebook-contracts/entities';
import { createGradebookD1WriteUnitOfWorkV1 } from '../../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import { ACADEMIC_CONTEXT_2026_IDENTITY_V1 } from '../../../../src/gradebook-domain/context/academic-context-2026-v1';
import type {
  AcademicEntityRecordV1,
  AcademicPersistenceContextV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  instant,
  openMigratedDatabase,
  type SqliteD1Database,
} from '../d1-transaction/d1-write-test-support';

const academicYearIdA = 'academic-year:d1-context:2026:a' as AcademicYearId;
const academicYearIdB = 'academic-year:d1-context:2026:b' as AcademicYearId;
const schoolIdA = 'school:d1-context:a' as SchoolId;
const schoolIdB = 'school:d1-context:b' as SchoolId;
const contextA = { academicYearId: academicYearIdA } satisfies AcademicPersistenceContextV1;
const contextB = { academicYearId: academicYearIdB } satisfies AcademicPersistenceContextV1;

let database: SqliteD1Database;

beforeEach(async () => {
  database = await openMigratedDatabase();
});

afterEach(() => {
  database.raw.close();
});

function academicYear(
  id = academicYearIdA,
  schoolId = schoolIdA,
  overrides: Partial<AcademicYearV1> = {},
): AcademicYearV1 {
  return {
    id,
    schoolId,
    year: ACADEMIC_CONTEXT_2026_IDENTITY_V1.academicYear,
    status: 'active',
    startsOn: '2026-02-01',
    endsOn: '2026-12-20',
    activeEvaluationProfileId: ACADEMIC_CONTEXT_2026_IDENTITY_V1.evaluationProfileId,
    configurationVersion: String(ACADEMIC_CONTEXT_2026_IDENTITY_V1.configurationVersion),
    ...overrides,
  };
}

function academicYearRecord(value = academicYear()): AcademicEntityRecordV1 {
  return { kind: 'academic-year', value };
}

function unit() {
  return createGradebookD1WriteUnitOfWorkV1(database, { now: () => instant });
}

describe('contexto acadêmico D1 local V1', () => {
  it('grava e reconstrói o academic-year com a configuração 2026 pela porta existente', async () => {
    const persistence = unit();
    const record = academicYearRecord();

    await expect(
      persistence.entities.appendVersion(contextA, record, { expectedVersion: null }),
    ).resolves.toEqual({
      status: 'written',
      record: { value: record, version: 1, recordedAt: instant },
    });

    await expect(
      persistence.entities.get(contextA, { kind: 'academic-year', id: academicYearIdA }),
    ).resolves.toEqual({ value: record, version: 1, recordedAt: instant });
    await expect(
      persistence.entities.list(contextA, 'academic-year', { limit: 2, cursor: null }),
    ).resolves.toEqual({
      items: [{ value: record, version: 1, recordedAt: instant }],
      nextCursor: null,
    });

    expect(
      database.raw
        .prepare(
          `SELECT configuration_id, version, previous_version, evaluation_profile_id
           FROM academic_year_configuration_versions
           WHERE academic_year_id = ?`,
        )
        .all(academicYearIdA),
    ).toEqual([
      {
        configuration_id: ACADEMIC_CONTEXT_2026_IDENTITY_V1.configurationId,
        version: ACADEMIC_CONTEXT_2026_IDENTITY_V1.configurationVersion,
        previous_version: null,
        evaluation_profile_id: ACADEMIC_CONTEXT_2026_IDENTITY_V1.evaluationProfileId,
      },
    ]);
  });

  it('mantém histórico append-only do ano e reutiliza a configuração técnica inalterada', async () => {
    const persistence = unit();
    const first = academicYearRecord(academicYear(undefined, undefined, { endsOn: '2026-12-10' }));
    const second = academicYearRecord(academicYear(undefined, undefined, { endsOn: '2026-12-20' }));

    await persistence.entities.appendVersion(contextA, first, { expectedVersion: null });
    await expect(
      persistence.entities.appendVersion(contextA, second, { expectedVersion: 1 }),
    ).resolves.toEqual({
      status: 'written',
      record: { value: second, version: 2, recordedAt: instant },
    });

    expect(
      database.raw
        .prepare(
          `SELECT version, previous_version, ends_on
           FROM academic_year_versions
           WHERE academic_year_id = ? ORDER BY version`,
        )
        .all(academicYearIdA),
    ).toEqual([
      { version: 1, previous_version: null, ends_on: '2026-12-10' },
      { version: 2, previous_version: 1, ends_on: '2026-12-20' },
    ]);
    expect(
      database.raw
        .prepare(
          `SELECT current_version FROM academic_years WHERE academic_year_id = ?`,
        )
        .get(academicYearIdA),
    ).toEqual({ current_version: 2 });
    expect(
      database.raw
        .prepare(
          `SELECT COUNT(*) AS count
           FROM academic_year_configuration_versions WHERE academic_year_id = ?`,
        )
        .get(academicYearIdA),
    ).toEqual({ count: 1 });
    await expect(
      persistence.entities.get(contextA, { kind: 'academic-year', id: academicYearIdA }),
    ).resolves.toEqual({ value: second, version: 2, recordedAt: instant });
  });

  it('retorna conflito para expectativa nula ou obsoleta sem criar versão ou ponteiro órfão', async () => {
    const persistence = unit();
    const record = academicYearRecord();
    await persistence.entities.appendVersion(contextA, record, { expectedVersion: null });

    await expect(
      persistence.entities.appendVersion(contextA, record, { expectedVersion: null }),
    ).resolves.toEqual({ status: 'version-conflict', currentVersion: 1 });
    await expect(
      persistence.entities.appendVersion(contextA, record, { expectedVersion: 2 }),
    ).resolves.toEqual({ status: 'version-conflict', currentVersion: 1 });

    const missingRecord = academicYearRecord(academicYear(academicYearIdB, schoolIdB));
    await expect(
      persistence.entities.appendVersion(contextB, missingRecord, { expectedVersion: 1 }),
    ).resolves.toEqual({ status: 'version-conflict', currentVersion: null });

    expect(
      database.raw.prepare('SELECT COUNT(*) AS count FROM academic_years').get(),
    ).toEqual({ count: 1 });
    expect(
      database.raw.prepare('SELECT COUNT(*) AS count FROM academic_year_versions').get(),
    ).toEqual({ count: 1 });
    expect(
      database.raw
        .prepare('SELECT COUNT(*) AS count FROM academic_year_configuration_versions')
        .get(),
    ).toEqual({ count: 1 });
    expect(
      database.raw
        .prepare('SELECT current_version FROM academic_years WHERE academic_year_id = ?')
        .get(academicYearIdA),
    ).toEqual({ current_version: 1 });
  });

  it('reverte raiz e configuração quando a versão histórica viola uma constraint', async () => {
    const persistence = unit();
    const invalid = academicYearRecord(
      academicYear(undefined, undefined, {
        startsOn: '2026-12-20',
        endsOn: '2026-02-01',
      }),
    );

    await expect(
      persistence.entities.appendVersion(contextA, invalid, { expectedVersion: null }),
    ).rejects.toMatchObject({
      code: 'database-write-failed',
    });

    expect(
      database.raw.prepare('SELECT COUNT(*) AS count FROM academic_years').get(),
    ).toEqual({ count: 0 });
    expect(
      database.raw.prepare('SELECT COUNT(*) AS count FROM academic_year_versions').get(),
    ).toEqual({ count: 0 });
    expect(
      database.raw
        .prepare('SELECT COUNT(*) AS count FROM academic_year_configuration_versions')
        .get(),
    ).toEqual({ count: 0 });
  });

  it('reverte o ponteiro quando a configuração persistida é incompatível', async () => {
    const persistence = unit();
    const record = academicYearRecord();
    await persistence.entities.appendVersion(contextA, record, { expectedVersion: null });
    database.raw
      .prepare(
        `UPDATE academic_year_configuration_versions
         SET evaluation_profile_id = 'evaluation-profile:incompatible'
         WHERE academic_year_id = ?`,
      )
      .run(academicYearIdA);

    await expect(
      persistence.entities.appendVersion(contextA, record, { expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: 'incompatible-write' });

    expect(
      database.raw
        .prepare('SELECT current_version FROM academic_years WHERE academic_year_id = ?')
        .get(academicYearIdA),
    ).toEqual({ current_version: 1 });
    expect(
      database.raw
        .prepare(
          'SELECT version, previous_version FROM academic_year_versions WHERE academic_year_id = ?',
        )
        .all(academicYearIdA),
    ).toEqual([{ version: 1, previous_version: null }]);
  });

  it('isola leitura e histórico por academicYearId', async () => {
    const persistence = unit();
    const recordA = academicYearRecord(academicYear(academicYearIdA, schoolIdA));
    const recordB = academicYearRecord(academicYear(academicYearIdB, schoolIdB));

    await persistence.entities.appendVersion(contextA, recordA, { expectedVersion: null });
    await persistence.entities.appendVersion(contextB, recordB, { expectedVersion: null });

    await expect(
      persistence.entities.get(contextA, { kind: 'academic-year', id: academicYearIdB }),
    ).resolves.toBeNull();
    await expect(
      persistence.entities.list(contextA, 'academic-year', { limit: 2, cursor: null }),
    ).resolves.toEqual({
      items: [{ value: recordA, version: 1, recordedAt: instant }],
      nextCursor: null,
    });
    await expect(
      persistence.entities.list(contextB, 'academic-year', { limit: 2, cursor: null }),
    ).resolves.toEqual({
      items: [{ value: recordB, version: 1, recordedAt: instant }],
      nextCursor: null,
    });
  });

  it('recusa ano, perfil ou versão de configuração incompatíveis antes de escrever', async () => {
    const persistence = unit();
    const incompatibleRecords = [
      academicYearRecord(academicYear(undefined, undefined, { year: 2027 })),
      academicYearRecord(
        academicYear(undefined, undefined, {
          activeEvaluationProfileId: 'evaluation-profile:other',
        }),
      ),
      academicYearRecord(academicYear(undefined, undefined, { configurationVersion: '2' })),
    ];

    for (const record of incompatibleRecords) {
      await expect(
        persistence.entities.appendVersion(contextA, record, { expectedVersion: null }),
      ).rejects.toMatchObject({ code: 'incompatible-write' });
    }

    expect(
      database.raw.prepare('SELECT COUNT(*) AS count FROM academic_years').get(),
    ).toEqual({ count: 0 });
  });
});
