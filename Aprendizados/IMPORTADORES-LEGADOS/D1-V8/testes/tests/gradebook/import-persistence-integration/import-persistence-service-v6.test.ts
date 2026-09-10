import {
  GRADEBOOK_IMPORT_FAILURE_HEADER_V1,
  parseGradebookImportFailureDiagnosticV1,
} from '../../../shared/gradebook-import-diagnostics-v1';
import { handleGradebookImportPersistenceRequestV4 } from '../../../server/gradebook/http/import-persistence-routes-v2';
import { seal } from '../../../server/auth/sealed';
import { SESSION_COOKIE } from '../../../server/auth/session';
import { testEnv } from '../../fixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import type {
  AcademicEntityRecordV1,
  AcademicPersistenceContextV1,
  VersionedRecordV1,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
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
  let physicalStatusBulkCalls = 0;
  const unitOfWork = createGradebookD1PersistenceUnitOfWorkV2(database, { now: () => instant });
  type StatusBulkEntities = typeof unitOfWork.entities & {
    readonly getStudentStatusEventsMany?: (
      context: AcademicPersistenceContextV1,
      ids: readonly string[],
    ) => Promise<readonly (VersionedRecordV1<AcademicEntityRecordV1> | null)[]>;
  };
  const baseEntities = unitOfWork.entities as StatusBulkEntities;
  const baseStatusBulk = baseEntities.getStudentStatusEventsMany;
  const entities: StatusBulkEntities = {
    ...baseEntities,
    ...(baseStatusBulk
      ? {
          async getStudentStatusEventsMany(
            context: AcademicPersistenceContextV1,
            ids: readonly string[],
          ) {
            physicalStatusBulkCalls += 1;
            return baseStatusBulk(context, ids);
          },
        }
      : {}),
  };
  const persistence = createGradebookImportPersistenceServiceV6({
    unitOfWork: { ...unitOfWork, entities },
    transaction: new GradebookD1ImportBootstrapTransactionV2(database, { now: () => instant }),
    annualStateSource: createGradebookD1ImportAnnualStateSourceV1(database),
    now: () => instant,
    createId: (kind) => `${kind}:v6-compact:${++sequence}`,
  });
  return { persistence, physicalStatusBulkCalls: () => physicalStatusBulkCalls };
}

function count(table: string, where = ''): number {
  return (
    database.raw.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get() as {
      count: number;
    }
  ).count;
}

describe('Import persistence service V6 compact', () => {
  it('persists official records and source status in the same bootstrap path without a separate status read', async () => {
    const { persistence, physicalStatusBulkCalls } = service();
    const first = await persistence.execute(request());

    expect(isGradebookImportPersistenceResponseV6(first)).toBe(true);
    expect(first).toMatchObject({ transportVersion: 6, state: 'applied' });
    expect(count('academic_record_streams', "WHERE record_kind='grade-entry'")).toBe(6);
    expect(count('academic_record_streams', "WHERE record_kind='term-result'")).toBe(3);
    expect(count('academic_record_streams', "WHERE record_kind='final-recovery'")).toBe(3);
    expect(count('academic_record_streams', "WHERE record_kind='annual-result'")).toBe(1);
    expect(count('academic_entity_streams', "WHERE entity_kind='student-status-event'")).toBe(1);
    expect(physicalStatusBulkCalls()).toBe(0);

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
    expect(physicalStatusBulkCalls()).toBe(0);
  });
});

async function authorizedV7(binding: unknown, role = 'ADMINISTRADOR') {
  const origin = 'http://localhost:8788';
  const cookie = await seal(
    {
      oid: '00000000-0000-4000-8000-000000000557',
      name: 'Pessoa Sintética',
      username: 'synthetic@example.test',
      roles: [role],
      exp: Math.floor(Date.now() / 1000) + 600,
    },
    testEnv.SESSION_SECRET,
  );
  return handleGradebookImportPersistenceRequestV4(
    new Request(`${origin}/api/gradebook/import-persistence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: `${SESSION_COOKIE}=${cookie}`,
      },
      body: JSON.stringify({
        transportVersion: 7,
        operation: 'persist-recognized-batch-v7',
        requests: [request()],
      }),
    }),
    { ...testEnv, OFFICIAL_ORIGIN: origin, RUNTIME_ENVIRONMENT: 'local', GRADEBOOK_D1: binding },
  );
}

describe('Failure diagnostics through authorized V7 HTTP', () => {
  it('preserves partial/unavailable and exposes only safe commit failure categories', async () => {
    const marker = 'SYNTHETIC_PRIVATE_MARKER';
    const batch = vi.fn(async () => {
      throw new Error(`D1_ERROR: UNIQUE constraint failed: ${marker}`);
    });
    const response = await authorizedV7({
      prepare: database.prepare.bind(database),
      exec: database.exec.bind(database),
      batch,
    });
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Cache-Control')).toContain('no-store');
    const diagnostic = response?.headers.get(GRADEBOOK_IMPORT_FAILURE_HEADER_V1) ?? null;
    const parsed = parseGradebookImportFailureDiagnosticV1(diagnostic);
    expect(parsed?.events).toContainEqual({ phase: 'd1', code: 'd1-unique', operation: 'batch' });
    expect(parsed?.events).toContainEqual({
      phase: 'transaction',
      code: 'transaction-failed',
      operation: 'none',
    });
    expect(diagnostic).not.toContain(marker);
    const body = await response?.json();
    expect(body).toMatchObject({
      state: 'partial',
      items: [{ attempts: 1, failureCategory: 'operational', response: { state: 'unavailable' } }],
    });
    expect(JSON.stringify(body)).not.toContain(marker);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(count('academic_record_streams')).toBe(0);
  });

  it('reports a catalog read failure instead of a presumed commit error', async () => {
    const failure = new Error('D1_ERROR: string or blob too big: SQLITE_TOOBIG');
    const read = vi.fn(async () => {
      throw failure;
    });
    const statement = { bind: () => statement, first: read, all: read, run: vi.fn() };
    const response = await authorizedV7({ prepare: () => statement, exec: vi.fn() });
    const diagnostic = parseGradebookImportFailureDiagnosticV1(
      response?.headers.get(GRADEBOOK_IMPORT_FAILURE_HEADER_V1) ?? null,
    );
    expect(diagnostic?.events).toContainEqual({
      phase: 'd1',
      code: 'd1-size-limit',
      operation: 'all',
    });
    expect(diagnostic?.events.some((event) => event.phase === 'catalog')).toBe(true);
    expect(diagnostic?.events.some((event) => event.phase === 'transaction')).toBe(false);
  });

  it('neither exposes diagnostics nor touches D1 for unauthorized users', async () => {
    const prepare = vi.fn(() => {
      throw new Error('must-not-run');
    });
    const response = await authorizedV7({ prepare, exec: vi.fn() }, 'PROFESSOR');
    expect(response?.status).toBe(403);
    expect(response?.headers.has(GRADEBOOK_IMPORT_FAILURE_HEADER_V1)).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('does not add failure headers to successful imports or identical reimports', async () => {
    const binding = {
      prepare: database.prepare.bind(database),
      exec: database.exec.bind(database),
    };
    for (const expected of ['applied', 'no-changes']) {
      const response = await authorizedV7(binding);
      expect(response?.headers.has(GRADEBOOK_IMPORT_FAILURE_HEADER_V1)).toBe(false);
      expect(await response?.json()).toMatchObject({
        state: 'completed',
        items: [{ response: { state: expected } }],
      });
    }
  });
});
