import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AuditWorkspaceListRequestV1 } from '../../../shared/gradebook-contracts/audit-workspace/audit-workspace-contract-v1';
import type { AcademicYearId } from '../../../shared/gradebook-contracts/entities';
import type { ImportBatchId } from '../../../shared/gradebook-contracts/imports/import-ids-v1';
import { AuditWorkspaceSourceErrorV1 } from '../../../server/gradebook/application/audit-workspace/audit-workspace-source-v1';
import { createGradebookD1AuditWorkspaceSourceV1 } from '../../../server/gradebook/persistence/d1/audit-workspace/d1-audit-workspace-source-v1';
import type { D1WriteDatabaseV1 } from '../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import {
  openMigratedDatabase,
  type SqliteD1Database,
} from '../persistence/d1-transaction/d1-write-test-support';

const year = 'academic-year:audit-workspace:2026' as AcademicYearId;
const otherYear = 'academic-year:audit-workspace:2027' as AcademicYearId;
const batchA = 'import-batch:audit-workspace:a' as ImportBatchId;
const batchB = 'import-batch:audit-workspace:b' as ImportBatchId;
const batchC = 'import-batch:audit-workspace:c' as ImportBatchId;

let database: SqliteD1Database;

beforeEach(async () => {
  database = await openMigratedDatabase();
  database.raw.exec('PRAGMA foreign_keys = OFF;');
  seedYear(year, 'school:audit-workspace:one', 2026);
  seedYear(otherYear, 'school:audit-workspace:two', 2027);
});

afterEach(() => database.raw.close());

function seedYear(id: AcademicYearId, school: string, value: number): void {
  database.raw
    .prepare(
      `INSERT INTO academic_years (
         academic_year_id, school_id, year, current_version, created_at
       ) VALUES (?, ?, ?, 1, '2026-01-01T00:00:00.000Z')`,
    )
    .run(id, school, value);
}

function seedBatch(
  academicYearId: AcademicYearId,
  id: ImportBatchId,
  status: 'approved' | 'review-required',
  updatedAt: string,
): void {
  database.raw
    .prepare(
      `INSERT INTO import_batch_streams (
         academic_year_id, import_batch_id, current_version, created_at
       ) VALUES (?, ?, 1, ?)`,
    )
    .run(academicYearId, id, updatedAt);
  database.raw
    .prepare(
      `INSERT INTO import_batch_versions (
         academic_year_id, import_batch_id, version, previous_version, status,
         received_at, updated_at, summary_json, payload_json, recorded_at
       ) VALUES (?, ?, 1, NULL, ?, ?, ?, '{}', '{}', ?)`,
    )
    .run(academicYearId, id, status, updatedAt, updatedAt, updatedAt);
}

function seedOccurrence(options: {
  readonly academicYearId?: AcademicYearId;
  readonly id: string;
  readonly batchId?: ImportBatchId;
  readonly state: 'open' | 'acknowledged' | 'resolved';
  readonly severity: 'warning' | 'blocking-error';
  readonly category: string;
  readonly createdAt: string;
}): void {
  const academicYearId = options.academicYearId ?? year;
  database.raw
    .prepare(
      `INSERT INTO audit_record_streams (
         academic_year_id, audit_kind, audit_record_id, current_version, created_at
       ) VALUES (?, 'occurrence', ?, 1, ?)`,
    )
    .run(academicYearId, options.id, options.createdAt);
  const payload = JSON.stringify({
    kind: 'occurrence',
    value: {
      id: options.id,
      ...(options.batchId === undefined ? {} : { importBatchId: options.batchId }),
      severity: options.severity,
      category: options.category,
      message: 'Ocorrência sintética.',
      createdAt: options.createdAt,
      state: options.state,
      stateHistory: [],
    },
  });
  database.raw
    .prepare(
      `INSERT INTO audit_record_versions (
         academic_year_id, audit_kind, audit_record_id, version, previous_version,
         import_batch_id, severity, category, occurrence_state, payload_json, recorded_at
       ) VALUES (?, 'occurrence', ?, 1, NULL, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      academicYearId,
      options.id,
      options.batchId ?? null,
      options.severity,
      options.category,
      options.state,
      payload,
      options.createdAt,
    );
}

function seedReconciliation(options: {
  readonly academicYearId?: AcademicYearId;
  readonly id: string;
  readonly status: 'match' | 'mismatch';
  readonly targetKind: 'grade-entry' | 'annual-result';
  readonly recordedAt: string;
}): void {
  const academicYearId = options.academicYearId ?? year;
  database.raw
    .prepare(
      `INSERT INTO audit_record_streams (
         academic_year_id, audit_kind, audit_record_id, current_version, created_at
       ) VALUES (?, 'reconciliation', ?, 1, ?)`,
    )
    .run(academicYearId, options.id, options.recordedAt);
  database.raw
    .prepare(
      `INSERT INTO audit_record_versions (
         academic_year_id, audit_kind, audit_record_id, version, previous_version,
         reconciliation_status, target_kind, target_record_id, target_stream_key,
         difference, tolerance, rule_version, payload_json, recorded_at
       ) VALUES (?, 'reconciliation', ?, 1, NULL, ?, ?, ?, ?, 0, 0.1,
                 'synthetic-reconciliation-v1', '{}', ?)`,
    )
    .run(
      academicYearId,
      options.id,
      options.status,
      options.targetKind,
      `${options.targetKind}:synthetic`,
      `${options.targetKind}|synthetic`,
      options.recordedAt,
    );
}

function batchRequest(
  overrides: Partial<AuditWorkspaceListRequestV1> = {},
): Extract<AuditWorkspaceListRequestV1, { readonly collection: 'import-batches' }> {
  return {
    contractVersion: 1,
    academicYearId: year,
    collection: 'import-batches',
    filters: {},
    page: { limit: 100, cursor: null },
    order: 'updated-at-desc-id-asc',
    ...overrides,
  } as Extract<AuditWorkspaceListRequestV1, { readonly collection: 'import-batches' }>;
}

describe('read-source D1 do workspace de Auditoria V1', () => {
  it('enumera as três coleções em uma consulta por página, isoladas por ano e nas ordens congeladas', async () => {
    seedBatch(year, batchB, 'approved', '2026-08-02T00:00:00.000Z');
    seedBatch(year, batchA, 'review-required', '2026-08-02T00:00:00.000Z');
    seedBatch(otherYear, batchC, 'approved', '2026-09-01T00:00:00.000Z');
    seedOccurrence({
      id: 'audit-occurrence:b',
      batchId: batchA,
      state: 'open',
      severity: 'warning',
      category: 'synthetic',
      createdAt: '2026-08-03T00:00:00.000Z',
    });
    seedOccurrence({
      id: 'audit-occurrence:a',
      batchId: batchA,
      state: 'acknowledged',
      severity: 'blocking-error',
      category: 'synthetic',
      createdAt: '2026-08-03T00:00:00.000Z',
    });
    seedOccurrence({
      academicYearId: otherYear,
      id: 'audit-occurrence:other-year',
      state: 'open',
      severity: 'warning',
      category: 'synthetic',
      createdAt: '2026-09-01T00:00:00.000Z',
    });
    seedReconciliation({
      id: 'reconciliation:b',
      status: 'match',
      targetKind: 'annual-result',
      recordedAt: '2026-08-04T00:00:00.000Z',
    });
    seedReconciliation({
      id: 'reconciliation:a',
      status: 'mismatch',
      targetKind: 'grade-entry',
      recordedAt: '2026-08-04T00:00:00.000Z',
    });
    seedReconciliation({
      academicYearId: otherYear,
      id: 'reconciliation:other-year',
      status: 'match',
      targetKind: 'grade-entry',
      recordedAt: '2026-09-01T00:00:00.000Z',
    });

    let queryCount = 0;
    const traced: D1WriteDatabaseV1 = {
      prepare(query) {
        queryCount += 1;
        return database.prepare(query);
      },
      exec(query) {
        return database.exec(query);
      },
    };
    const source = createGradebookD1AuditWorkspaceSourceV1(traced);
    const batches = await source.list(batchRequest());
    const occurrences = await source.list({
      contractVersion: 1,
      academicYearId: year,
      collection: 'audit-occurrences',
      filters: {},
      page: { limit: 100, cursor: null },
      order: 'created-at-desc-id-asc',
    });
    const reconciliations = await source.list({
      contractVersion: 1,
      academicYearId: year,
      collection: 'reconciliations',
      filters: {},
      page: { limit: 100, cursor: null },
      order: 'recorded-at-desc-id-asc',
    });

    expect(queryCount).toBe(3);
    expect(batches.items.map((item) => item.reference.id)).toEqual([batchA, batchB]);
    expect(occurrences.items.map((item) => item.reference.id)).toEqual([
      'audit-occurrence:a',
      'audit-occurrence:b',
    ]);
    expect(reconciliations.items.map((item) => item.reference.id)).toEqual([
      'reconciliation:a',
      'reconciliation:b',
    ]);
  });

  it('combina filtros existentes no SQL e enumera pendências correntes do lote sem N+1', async () => {
    seedBatch(year, batchA, 'review-required', '2026-08-02T00:00:00.000Z');
    seedOccurrence({
      id: 'audit-occurrence:matching',
      batchId: batchA,
      state: 'open',
      severity: 'warning',
      category: 'synthetic-category',
      createdAt: '2026-08-03T00:00:00.000Z',
    });
    seedOccurrence({
      id: 'audit-occurrence:wrong-state',
      batchId: batchA,
      state: 'resolved',
      severity: 'warning',
      category: 'synthetic-category',
      createdAt: '2026-08-03T01:00:00.000Z',
    });
    const source = createGradebookD1AuditWorkspaceSourceV1(database);
    const page = await source.list({
      contractVersion: 1,
      academicYearId: year,
      collection: 'audit-occurrences',
      filters: {
        importBatchId: batchA,
        occurrenceStates: ['open'],
        severities: ['warning'],
        categories: ['synthetic-category'],
        period: {
          fromInclusive: '2026-08-01T00:00:00.000Z',
          toExclusive: '2026-09-01T00:00:00.000Z',
        },
      },
      page: { limit: 10, cursor: null },
      order: 'created-at-desc-id-asc',
    });

    expect(page.items.map((item) => item.reference.id)).toEqual(['audit-occurrence:matching']);
    await expect(
      source.listPendingOccurrenceIdsForImportBatch({ academicYearId: year }, batchA),
    ).resolves.toEqual(['audit-occurrence:matching']);
  });

  it('pagina por chave opaca e rejeita cursor malformado ou de outro escopo', async () => {
    seedBatch(year, batchA, 'approved', '2026-08-03T00:00:00.000Z');
    seedBatch(year, batchB, 'approved', '2026-08-02T00:00:00.000Z');
    const source = createGradebookD1AuditWorkspaceSourceV1(database);
    const first = await source.list(batchRequest({ page: { limit: 1, cursor: null } }));
    expect(first.items.map((item) => item.reference.id)).toEqual([batchA]);
    expect(first.nextCursor).not.toBeNull();
    expect(first.nextCursor).not.toContain(batchA);

    const second = await source.list(
      batchRequest({ page: { limit: 1, cursor: first.nextCursor } }),
    );
    expect(second.items.map((item) => item.reference.id)).toEqual([batchB]);
    expect(second.nextCursor).toBeNull();

    await expect(
      source.list(
        batchRequest({ academicYearId: otherYear, page: { limit: 1, cursor: first.nextCursor } }),
      ),
    ).rejects.toEqual(new AuditWorkspaceSourceErrorV1('invalid-cursor'));
    await expect(
      source.list(
        batchRequest({ page: { limit: 1, cursor: 'not-a-cursor' as typeof first.nextCursor } }),
      ),
    ).rejects.toEqual(new AuditWorkspaceSourceErrorV1('invalid-cursor'));
  });
});
