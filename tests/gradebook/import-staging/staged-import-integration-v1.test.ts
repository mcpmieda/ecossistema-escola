import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AcademicYearId, SchoolId } from '../../../shared/gradebook-contracts/entities';
import type { GradebookImportPersistenceRequestV6 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import { GradebookImportStagingServiceV1 } from '../../../server/gradebook/application/import/import-staging-service-v1';
import { createGradebookD1PersistenceUnitOfWorkV2 } from '../../../server/gradebook/persistence/d1/composition/d1-persistence-unit-of-work-v1';
import { createGradebookD1ImportAnnualStateSourceV1 } from '../../../server/gradebook/persistence/d1/imports/d1-import-annual-state-source-v1';
import { GradebookD1ImportStagingRepositoryV1 } from '../../../server/gradebook/persistence/d1/imports/d1-import-staging-repository-v1';
import { GradebookD1ImportStagingPromotionV1 } from '../../../server/gradebook/persistence/d1/transaction/d1-import-staging-promotion-v1';
import type {
  D1WriteRunResultV1,
  D1WriteStatementV1,
} from '../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import { ACADEMIC_CONTEXT_2026_IDENTITY_V1 } from '../../../src/gradebook-domain/context/academic-context-2026-v1';
import { splitCompactGradebookImportV6 } from '../../../src/features/gradebook/import/import-staging-client-v1';
import {
  academicYearId,
  openMigratedDatabase,
  SqliteD1Database,
} from '../persistence/d1-transaction/d1-write-test-support';

const schoolId = 'school:staged-import-v1' as SchoolId;
const instant = new Date().toISOString();
let database: AtomicSqliteD1Database;

class AtomicSqliteD1Database extends SqliteD1Database {
  async batch(statements: readonly D1WriteStatementV1[]): Promise<readonly D1WriteRunResultV1[]> {
    this.raw.exec('BEGIN IMMEDIATE');
    try {
      const results: D1WriteRunResultV1[] = [];
      for (const statement of statements) results.push(await statement.run());
      this.raw.exec('COMMIT');
      return results;
    } catch (cause) {
      this.raw.exec('ROLLBACK');
      throw cause;
    }
  }
}

beforeEach(async () => {
  const migrated = await openMigratedDatabase();
  database = new AtomicSqliteD1Database(migrated.raw);
  const unit = createGradebookD1PersistenceUnitOfWorkV2(database, {
    now: () => instant,
  });
  expect(
    (
      await unit.entities.appendVersion(
        { academicYearId },
        {
          kind: 'academic-year',
          value: {
            id: academicYearId as AcademicYearId,
            schoolId,
            year: 2026,
            status: 'active',
            startsOn: '2026-02-01',
            endsOn: '2026-12-20',
            activeEvaluationProfileId: ACADEMIC_CONTEXT_2026_IDENTITY_V1.evaluationProfileId,
            configurationVersion: String(ACADEMIC_CONTEXT_2026_IDENTITY_V1.configurationVersion),
          },
        },
        { expectedVersion: null },
      )
    ).status,
  ).toBe('written');
});

afterEach(() => database.raw.close());

function term(termValue: 1 | 2 | 3) {
  const official = termValue === 3 ? 25 : 20;
  const quantitative = termValue === 3 ? 12 : 10;
  const qualitative = termValue === 3 ? 13 : 10;
  return {
    term: termValue,
    sourceSheetName: `9S${termValue}ºD1`,
    assessmentDefinitions: [
      ['R', 10] as const,
      ['S', 10] as const,
    ],
    rows: Array.from({ length: 9 }, (_, index) => {
      const position = index + 1;
      return [
        position,
        {
          R: 5 + (index % 3),
          T: quantitative,
          AK: qualitative,
          AM: official,
          ...(termValue === 3 ? { AN: 65 } : {}),
        },
      ] as const;
    }),
  };
}

function request(hash = 'a'): GradebookImportPersistenceRequestV6 {
  return {
    transportVersion: 6,
    operation: 'persist-recognized-file',
    manifest: {
      fileName: 'fixture-staging-sintetica.xlsb',
      extension: 'xlsb',
      reportedMimeType: null,
      sizeBytes: 1024,
      lastModifiedAt: null,
      sha256: hash.repeat(64),
      sourceContractVersion: 2,
      parserVersion: 'synthetic-staging-v1',
      readAt: instant,
    },
    recognizedSuggestions: { academicYear: 2026, teacherName: 'Docente Sintético de Staging' },
    confirmedContext: { academicYearId },
    sourceResolution: { mode: 'resolve-or-create' },
    rosters: [
      {
        classGroupLabel: '9º ANO SINTÉTICO',
        students: Array.from({ length: 9 }, (_, index) => [
          index + 1,
          `Estudante Sintético ${String(index + 1).padStart(2, '0')}`,
          index === 8 ? 'TRANSFERIDO' : 'ATIVO',
        ] as const),
      },
    ],
    courses: [
      {
        classGroupLabel: '9º ANO SINTÉTICO',
        subjectLabel: 'Componente Sintético de Staging',
        disciplineIndex: 'D1',
        terms: [term(1), term(2), term(3)],
        recovery: null,
      },
    ],
    diagnostics: [],
  };
}

function count(table: string, where = ''): number {
  return (
    database.raw.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get() as { count: number }
  ).count;
}

function services() {
  const unit = createGradebookD1PersistenceUnitOfWorkV2(database, {
    now: () => instant,
  });
  const repository = new GradebookD1ImportStagingRepositoryV1(database);
  return {
    repository,
    staging: new GradebookImportStagingServiceV1(
      repository,
      unit,
      createGradebookD1ImportAnnualStateSourceV1(database),
    ),
    promotion: new GradebookD1ImportStagingPromotionV1(
      database,
      () => instant,
    ),
  };
}

describe('staged V6 import', () => {
  it('prepares bounded chunks without official writes and promotes direct annual approval without REC rows', async () => {
    const input = request();
    const chunks = splitCompactGradebookImportV6(input);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.courses[0]!.terms[0].rows).toHaveLength(8);
    expect(chunks[1]!.courses[0]!.terms[0].rows).toHaveLength(1);

    const { repository, staging, promotion } = services();
    const begin = await staging.begin(input, instant);
    expect(begin).toMatchObject({ state: 'ready', chunkCount: 2 });

    const first = await staging.prepare(begin.sessionId, 0, chunks[0]!);
    expect(first.state).toBe('prepared');
    expect(count('gradebook_import_stage_chunks')).toBe(1);
    expect(count('academic_record_streams')).toBe(0);
    expect(count('logical_source_record_streams')).toBe(0);

    const repeated = await staging.prepare(begin.sessionId, 0, chunks[0]!);
    expect(repeated.state).toBe('already-prepared');
    expect(count('gradebook_import_stage_chunks')).toBe(1);

    const second = await staging.prepare(begin.sessionId, 1, chunks[1]!);
    expect(second.state).toBe('prepared');
    expect(count('gradebook_import_stage_chunks')).toBe(2);
    expect(count('academic_record_streams')).toBe(0);

    const session = await repository.getSession(begin.sessionId);
    expect(session).not.toBeNull();
    const response = await promotion.finalize(session!);
    expect(response).toMatchObject({ transportVersion: 6, state: 'applied' });
    expect(count('academic_record_streams', "WHERE record_kind='grade-entry'")).toBe(27);
    expect(count('academic_record_streams', "WHERE record_kind='term-result'")).toBe(27);
    expect(count('academic_record_streams', "WHERE record_kind='annual-result'")).toBe(9);
    expect(count('logical_source_record_streams')).toBe(63);
    expect(count('academic_entity_streams', "WHERE entity_kind='student'")).toBe(9);
    expect(count('academic_entity_streams', "WHERE entity_kind='enrollment'")).toBe(9);
    expect(count('academic_entity_streams', "WHERE entity_kind='student-status-event'")).toBe(9);

    const committed = await repository.getSession(begin.sessionId);
    expect(committed).toMatchObject({ state: 'committed' });
    const repeatedFinalize = await promotion.finalize(committed!);
    expect(repeatedFinalize).toEqual(response);
    expect(count('academic_record_streams')).toBe(63);
  });

  it('does not promote an incomplete session', async () => {
    const input = request('b');
    const chunks = splitCompactGradebookImportV6(input);
    const { repository, staging, promotion } = services();
    const begin = await staging.begin(input, instant);
    await staging.prepare(begin.sessionId, 0, chunks[0]!);
    const session = await repository.getSession(begin.sessionId);
    expect(await promotion.finalize(session!)).toEqual({ transportVersion: 6, state: 'conflict' });
    expect(count('academic_record_streams')).toBe(0);
  });
});
