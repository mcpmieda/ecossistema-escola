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
import type { AcademicRecordStreamV1 } from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import { ACADEMIC_CONTEXT_2026_IDENTITY_V1 } from '../../../src/gradebook-domain/context/academic-context-2026-v1';
import { splitCompactGradebookImportV6 } from '../../../src/features/gradebook/import/import-staging-client-v1';
import {
  academicYearId,
  openMigratedDatabase,
  SqliteD1Database,
} from '../persistence/d1-transaction/d1-write-test-support';

const schoolId = 'school:staged-import-hardening-v1' as SchoolId;
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
  const unit = createGradebookD1PersistenceUnitOfWorkV2(database, { now: () => instant });
  const result = await unit.entities.appendVersion(
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
  );
  expect(result.status).toBe('written');
});

afterEach(() => database.raw.close());

function term(
  termValue: 1 | 2 | 3,
  options: { readonly changedFirstR?: number; readonly omitLastR?: boolean } = {},
) {
  const official = termValue === 3 ? 25 : 20;
  return {
    term: termValue,
    sourceSheetName: `8H${termValue}ºD1`,
    assessmentDefinitions: [
      ['R', 10] as const,
      ['S', 10] as const,
    ],
    rows: Array.from({ length: 9 }, (_, index) => {
      const position = index + 1;
      const r = index === 0 && options.changedFirstR !== undefined
        ? options.changedFirstR
        : 5 + (index % 3);
      const includeR = !(options.omitLastR && termValue === 1 && position === 9);
      return [
        position,
        {
          ...(includeR ? { R: r } : {}),
          T: termValue === 3 ? 12 : 10,
          AK: termValue === 3 ? 13 : 10,
          AM: official,
          ...(termValue === 3 ? { AN: 65 } : {}),
        },
      ] as const;
    }),
  };
}

function request(
  hashChar: string,
  options: { readonly changedFirstR?: number; readonly omitLastR?: boolean } = {},
): GradebookImportPersistenceRequestV6 {
  return {
    transportVersion: 6,
    operation: 'persist-recognized-file',
    manifest: {
      fileName: 'fixture-staging-hardening-sintetica.xlsb',
      extension: 'xlsb',
      reportedMimeType: null,
      sizeBytes: 2048,
      lastModifiedAt: null,
      sha256: hashChar.repeat(64),
      sourceContractVersion: 2,
      parserVersion: 'synthetic-staging-hardening-v1',
      readAt: instant,
    },
    recognizedSuggestions: { academicYear: 2026, teacherName: 'Docente Sintético Hardening' },
    confirmedContext: { academicYearId },
    sourceResolution: { mode: 'resolve-or-create' },
    rosters: [
      {
        classGroupLabel: '8º ANO HARDENING',
        students: Array.from({ length: 9 }, (_, index) => [
          index + 1,
          `Estudante Hardening ${String(index + 1).padStart(2, '0')}`,
          index === 8 ? 'TRANSFERIDO' : 'ATIVO',
        ] as const),
      },
    ],
    courses: [
      {
        classGroupLabel: '8º ANO HARDENING',
        subjectLabel: 'Componente Sintético Hardening',
        disciplineIndex: 'D1',
        terms: [term(1, options), term(2, options), term(3, options)],
        recovery: null,
      },
    ],
    diagnostics: [],
  };
}

function count(table: string): number {
  return (database.raw.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}

function services() {
  const unit = createGradebookD1PersistenceUnitOfWorkV2(database, { now: () => instant });
  const repository = new GradebookD1ImportStagingRepositoryV1(database);
  return {
    unit,
    repository,
    staging: new GradebookImportStagingServiceV1(
      repository,
      unit,
      createGradebookD1ImportAnnualStateSourceV1(database),
    ),
    promotion: new GradebookD1ImportStagingPromotionV1(database, () => instant),
  };
}

async function prepareAll(input: GradebookImportPersistenceRequestV6) {
  const { repository, staging, promotion, unit } = services();
  const chunks = splitCompactGradebookImportV6(input);
  const begin = await staging.begin(input, instant);
  for (const [index, chunk] of chunks.entries()) {
    const result = await staging.prepare(begin.sessionId, index, chunk);
    expect(['prepared', 'already-prepared']).toContain(result.state);
  }
  const session = await repository.getSession(begin.sessionId);
  expect(session).not.toBeNull();
  return { repository, staging, promotion, unit, chunks, session: session!, sessionId: begin.sessionId };
}

async function commit(input: GradebookImportPersistenceRequestV6) {
  const prepared = await prepareAll(input);
  const response = await prepared.promotion.finalize(prepared.session);
  expect(response.state).toBe('applied');
  return response;
}

describe('staged V6 import hardening', () => {
  it('rejects different content for an already prepared chunk index', async () => {
    const input = request('c');
    const chunks = splitCompactGradebookImportV6(input);
    const { staging } = services();
    const begin = await staging.begin(input, instant);
    expect((await staging.prepare(begin.sessionId, 0, chunks[0]!)).state).toBe('prepared');

    const course = chunks[0]!.courses[0]!;
    const firstTerm = course.terms[0];
    const changedRows = firstTerm.rows.map((row) =>
      row[0] === 1 ? ([row[0], { ...row[1], R: 9 }] as const) : row,
    );
    const changedCourse = {
      ...course,
      terms: [
        { ...firstTerm, rows: changedRows },
        course.terms[1],
        course.terms[2],
      ] as GradebookImportPersistenceRequestV6['courses'][number]['terms'],
    };
    const divergent: GradebookImportPersistenceRequestV6 = {
      ...chunks[0]!,
      courses: [changedCourse],
    };

    expect((await staging.prepare(begin.sessionId, 0, divergent)).state).toBe('conflict');
    expect(count('gradebook_import_stage_chunks')).toBe(1);
    expect(count('academic_record_streams')).toBe(0);
  });

  it('reimports identical content as no-changes without academic versions', async () => {
    const input = request('d');
    await commit(input);
    const versionsBefore = count('academic_record_versions');
    const second = await prepareAll(input);
    const response = await second.promotion.finalize(second.session);
    expect(response.state).toBe('no-changes');
    expect(count('academic_record_versions')).toBe(versionsBefore);
  });

  it('detects a record missing from a new full source and performs no delete or partial write', async () => {
    await commit(request('e'));
    const versionsBefore = count('academic_record_versions');
    const streamsBefore = count('academic_record_streams');

    const changed = await prepareAll(request('f', { omitLastR: true }));
    const response = await changed.promotion.finalize(changed.session);
    expect(response.state).toBe('review-required');
    if (response.state === 'review-required') {
      expect(response.issues.some((issue) => issue.code === 'missing-from-new-source')).toBe(true);
    }
    expect(count('academic_record_versions')).toBe(versionsBefore);
    expect(count('academic_record_streams')).toBe(streamsBefore);
  });

  it('rolls the staged promotion back when a current stream changes after prepare', async () => {
    await commit(request('g'));
    const changed = await prepareAll(request('h', { changedFirstR: 9 }));

    const row = database.raw
      .prepare(
        `SELECT json_extract(j.value, '$.stream') AS stream_json
         FROM gradebook_import_stage_chunks c, json_each(c.payload_json, '$.writes.academicRecords') j
         WHERE c.session_id = ?
         ORDER BY c.chunk_index
         LIMIT 1`,
      )
      .get(changed.sessionId) as { stream_json: string } | undefined;
    expect(row?.stream_json).toBeTruthy();
    const stream = JSON.parse(row!.stream_json) as AcademicRecordStreamV1;
    const current = await changed.unit.academicRecords.getCurrent({ academicYearId }, stream);
    expect(current).not.toBeNull();
    const competing = await changed.unit.academicRecords.appendVersion(
      { academicYearId },
      stream,
      current!.value,
      { expectedVersion: current!.version },
    );
    expect(competing.status).toBe('written');

    const versionsBeforeFinalize = count('academic_record_versions');
    const response = await changed.promotion.finalize(changed.session);
    expect(response.state).toBe('conflict');
    expect(count('academic_record_versions')).toBe(versionsBeforeFinalize);
  });
});
