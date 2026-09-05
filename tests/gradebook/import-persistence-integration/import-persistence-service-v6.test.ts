import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AcademicYearId, SchoolId } from '../../../shared/gradebook-contracts/entities';
import {
  isGradebookImportPersistenceResponseV6,
  type GradebookImportPersistenceRequestV6,
} from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import { createGradebookImportPersistenceServiceV6 } from '../../../server/gradebook/application/import/import-persistence-service-v6';
import { createGradebookD1PersistenceUnitOfWorkV2 } from '../../../server/gradebook/persistence/d1/composition/d1-persistence-unit-of-work-v1';
import { createGradebookD1ImportAnnualStateSourceV1 } from '../../../server/gradebook/persistence/d1/imports/d1-import-annual-state-source-v1';
import { GradebookD1ImportBootstrapTransactionV2 } from '../../../server/gradebook/persistence/d1/transaction/d1-import-bootstrap-transaction-v2';
import { ACADEMIC_CONTEXT_2026_IDENTITY_V1 } from '../../../src/gradebook-domain/context/academic-context-2026-v1';
import {
  academicYearId,
  instant,
  openMigratedDatabase,
  type SqliteD1Database,
} from '../persistence/d1-transaction/d1-write-test-support';

const schoolId = 'school:v6-compact-bootstrap' as SchoolId;
let database: SqliteD1Database;

beforeEach(async () => {
  database = await openMigratedDatabase();
  const unit = createGradebookD1PersistenceUnitOfWorkV2(database, { now: () => instant });
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

function term(term: 1 | 2 | 3, total: number, official: number, annual?: number) {
  return {
    term,
    sourceSheetName: `6S${term}ºD1`,
    assessmentDefinitions: [
      ['R', 10] as const,
      ['S', 10] as const,
      ['AA', null, 'Atividade sintética sem máximo'] as const,
    ],
    rows: [
      [
        1,
        {
          R: 5,
          AA: 2,
          T: total,
          AK: 2,
          AM: official,
          ...(annual === undefined ? {} : { AN: annual }),
        },
      ] as const,
    ],
  };
}

function request(hash = 'a'): GradebookImportPersistenceRequestV6 {
  return {
    transportVersion: 6,
    operation: 'persist-recognized-file',
    manifest: {
      fileName: 'fixture-v6-compacta.xlsb',
      extension: 'xlsb',
      reportedMimeType: null,
      sizeBytes: 256,
      lastModifiedAt: null,
      sha256: hash.repeat(64),
      sourceContractVersion: 2,
      parserVersion: 'synthetic-v6-compact',
      readAt: instant,
    },
    recognizedSuggestions: { academicYear: 2026, teacherName: 'Docente Sintético' },
    confirmedContext: { academicYearId },
    sourceResolution: { mode: 'resolve-or-create' },
    rosters: [
      {
        classGroupLabel: '6º ANO SINTÉTICO',
        students: [[1, 'Estudante Sintético', 'FOI PARA 6B']],
      },
    ],
    courses: [
      {
        classGroupLabel: '6º ANO SINTÉTICO',
        subjectLabel: 'Componente Sintético',
        disciplineIndex: 'D1',
        terms: [term(1, 10, 20), term(2, 10, 20), term(3, 12, 25, 65)],
        recovery: {
          sourceSheetName: '6SRECD1',
          rows: [[1, 5, { X: 20, Y: 20, AA: 25, AB: 65, AC: 0, AD: 0, AE: 0 }]],
        },
      },
    ],
    diagnostics: [],
  };
}

function service() {
  let sequence = 0;
  const unitOfWork = createGradebookD1PersistenceUnitOfWorkV2(database, { now: () => instant });
  return createGradebookImportPersistenceServiceV6({
    unitOfWork,
    transaction: new GradebookD1ImportBootstrapTransactionV2(database, { now: () => instant }),
    annualStateSource: createGradebookD1ImportAnnualStateSourceV1(database),
    now: () => instant,
    createId: (kind) => `${kind}:v6-compact:${++sequence}`,
  });
}

function count(table: string, where = ''): number {
  return (
    database.raw.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get() as { count: number }
  ).count;
}

describe('Import persistence service V6 compact', () => {
  it('persists official records and source status in the same bootstrap path without duplicating on reimport', async () => {
    const persistence = service();
    const first = await persistence.execute(request());

    expect(isGradebookImportPersistenceResponseV6(first)).toBe(true);
    expect(first).toMatchObject({ transportVersion: 6, state: 'applied' });
    expect(count('academic_record_streams', "WHERE record_kind='grade-entry'")).toBe(6);
    expect(count('academic_record_streams', "WHERE record_kind='term-result'")).toBe(3);
    expect(count('academic_record_streams', "WHERE record_kind='final-recovery'")).toBe(3);
    expect(count('academic_record_streams', "WHERE record_kind='annual-result'")).toBe(1);
    expect(count('academic_entity_streams', "WHERE entity_kind='student-status-event'")).toBe(1);

    const persistedStatus = database.raw
      .prepare(
        "SELECT payload_json FROM academic_entity_versions WHERE entity_kind='student-status-event' LIMIT 1",
      )
      .get() as { payload_json: string };
    expect(JSON.parse(persistedStatus.payload_json)).toMatchObject({
      kind: 'student-status-event',
      value: {
        status: 'transferred',
        sourceText: 'FOI PARA 6B',
        sourceReference: 'RELACAO',
        transfer: { destinationClassGroupCode: '6B' },
      },
    });

    const second = await persistence.execute(request());
    expect(isGradebookImportPersistenceResponseV6(second)).toBe(true);
    expect(second).toMatchObject({ transportVersion: 6, state: 'no-changes' });
    expect(count('academic_entity_streams', "WHERE entity_kind='student-status-event'")).toBe(1);
    expect(count('academic_entity_versions', "WHERE entity_kind='student-status-event'")).toBe(1);
  });
});
