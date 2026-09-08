import { describe, it, expect } from 'vitest';
import {
  valuesRequestV8,
  seededValuesDatabaseV8,
  AtomicMeasuredDatabaseV8,
} from './values-v8-test-support';
import { createGradebookImportPersistenceServiceV8 } from '../../../server/gradebook/application/import/import-persistence-service-v8';
import { createGradebookImportPersistenceServiceV6 } from '../../../server/gradebook/application/import/import-persistence-service-v6';
import { createGradebookD1PersistenceUnitOfWorkV2 } from '../../../server/gradebook/persistence/d1/composition/d1-persistence-unit-of-work-v1';
import { GradebookD1ImportBootstrapTransactionV2 } from '../../../server/gradebook/persistence/d1/transaction/d1-import-bootstrap-transaction-v2';
import { createGradebookD1ImportAnnualStateSourceV1 } from '../../../server/gradebook/persistence/d1/imports/d1-import-annual-state-source-v1';
import {
  snapshotRequestAsV6,
  isGradebookImportPersistenceRequestV8,
  isGradebookImportPersistenceResponseV8,
} from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v8';
import { instant } from '../persistence/d1-transaction/d1-write-test-support';
import type { D1WriteDatabaseV1 } from '../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';

export function valuesDependenciesV8(db: D1WriteDatabaseV1) {
  let sequence = 0;
  return {
    unitOfWork: createGradebookD1PersistenceUnitOfWorkV2(db, { now: () => instant }),
    transaction: new GradebookD1ImportBootstrapTransactionV2(db, { now: () => instant }),
    annualStateSource: createGradebookD1ImportAnnualStateSourceV1(db),
    now: () => instant,
    createId: (kind: string) => `${kind}:synthetic-values:${++sequence}`,
  };
}

describe('Values V8 persistence and legacy continuity', () => {
  it('persists snapshot evidence, not formulas, preserves REC 0 flags, and reimports without academic writes', async () => {
    const base = await seededValuesDatabaseV8();
    try {
      const db = new AtomicMeasuredDatabaseV8(base);
      const req = valuesRequestV8();
      expect(isGradebookImportPersistenceRequestV8(req)).toBe(true);
      const service = createGradebookImportPersistenceServiceV8(valuesDependenciesV8(db));
      const first = await service.execute(req);
      expect(first).toMatchObject({ transportVersion: 8, state: 'applied' });
      expect(isGradebookImportPersistenceResponseV8(first)).toBe(true);
      const rows = base.raw
        .prepare(
          "SELECT payload_json FROM academic_record_versions WHERE record_kind='grade-entry'",
        )
        .all() as { payload_json: string }[];
      expect(rows).toHaveLength(6);
      const values = rows.map((row) => JSON.parse(row.payload_json).value.value.imported);
      expect(values.some((v) => v.value.state === 'official-zero')).toBe(true);
      expect(values.every((v) => v.evidence[0].classification === 'snapshot-value')).toBe(true);
      expect(rows.every((row) => !row.payload_json.includes('"formula"'))).toBe(true);
      const before = base.raw.prepare('SELECT COUNT(*) AS n FROM academic_record_versions').get();
      const sourceVersionsBefore = base.raw
        .prepare('SELECT COUNT(*) AS n FROM source_file_versions')
        .get();
      const batchVersionsBefore = base.raw
        .prepare('SELECT COUNT(*) AS n FROM import_batch_versions')
        .get();
      const second = await service.execute(req);
      expect(second).toMatchObject({ state: 'no-changes' });
      expect(base.raw.prepare('SELECT COUNT(*) AS n FROM academic_record_versions').get()).toEqual(
        before,
      );
      expect(base.raw.prepare('SELECT COUNT(*) AS n FROM source_file_versions').get()).toEqual(
        sourceVersionsBefore,
      );
      expect(base.raw.prepare('SELECT COUNT(*) AS n FROM import_batch_versions').get()).toEqual(
        batchVersionsBefore,
      );
    } finally {
      base.raw.close();
    }
  });
  it('recompares an identical binary hash under the new zero rule without deleting history', async () => {
    const base = await seededValuesDatabaseV8();
    try {
      const db = new AtomicMeasuredDatabaseV8(base);
      const deps = valuesDependenciesV8(db);
      const values = valuesRequestV8();
      const legacy = snapshotRequestAsV6(values);
      const old = {
        ...legacy,
        courses: legacy.courses.map((course) => ({
          ...course,
          terms: course.terms.map((term) => ({
            ...term,
            rows: term.rows.map(([position, cells]) => [
              position,
              { ...cells, R: 0, S: ['f', 0.1, 0.1, 'SYNTHETIC_FORMULA()'] },
            ]),
          })),
        })),
      } as unknown as typeof legacy;
      expect(await createGradebookImportPersistenceServiceV6(deps).execute(old)).toMatchObject({
        state: 'applied',
      });
      const before = base.raw
        .prepare('SELECT * FROM academic_record_versions ORDER BY record_kind,stream_key,version')
        .all();
      const next = {
        ...values,
        manifest: { ...values.manifest, parserVersion: 'synthetic:values-v2' },
        courses: values.courses.map((c) => ({
          ...c,
          terms: c.terms.map((t) => ({
            ...t,
            rows: t.rows.map(([position, cells]) => [position, { ...cells, R: 0 }] as const),
          })),
        })),
      } as unknown as typeof values;
      const service = createGradebookImportPersistenceServiceV8(deps);
      expect(await service.execute(next)).toMatchObject({ state: 'applied' });
      const current = base.raw
        .prepare(
          "SELECT v.payload_json FROM academic_record_versions v JOIN academic_record_streams s ON s.academic_year_id=v.academic_year_id AND s.record_kind=v.record_kind AND s.stream_key=v.stream_key AND s.current_version=v.version WHERE v.record_kind='grade-entry'",
        )
        .all() as { payload_json: string }[];
      const semantics = current.map(
        (r) => JSON.parse(r.payload_json).value.value.imported.value.state,
      );
      expect(semantics.filter((s) => s === 'absent')).toHaveLength(3);
      expect(semantics.filter((s) => s === 'official-zero')).toHaveLength(3);
      for (const row of before as Record<string, unknown>[]) {
        expect(
          base.raw
            .prepare(
              'SELECT * FROM academic_record_versions WHERE academic_year_id=? AND record_kind=? AND stream_key=? AND version=?',
            )
            .get(
              row.academic_year_id as string,
              row.record_kind as string,
              row.stream_key as string,
              row.version as number,
            ),
        ).toEqual(row);
      }
      expect(await service.execute(next)).toMatchObject({ state: 'no-changes' });
    } finally {
      base.raw.close();
    }
  });
  it('preserves unavailable cached values as insufficient data, never a silently invented zero', async () => {
    const base = await seededValuesDatabaseV8();
    try {
      const request = valuesRequestV8();
      const req = {
        ...request,
        courses: request.courses.map((c) => ({
          ...c,
          terms: c.terms.map((t) => ({
            ...t,
            rows: t.rows.map(([p, cells]) => [p, { ...cells, R: ['u'], AM: ['u'] }] as const),
          })),
        })),
      } as unknown as typeof request;
      expect(isGradebookImportPersistenceRequestV8(req)).toBe(true);
      const service = createGradebookImportPersistenceServiceV8(
        valuesDependenciesV8(new AtomicMeasuredDatabaseV8(base)),
      );
      expect(await service.execute(req)).toMatchObject({ state: 'applied' });
      const records = base.raw
        .prepare('SELECT payload_json FROM academic_record_versions')
        .all() as { payload_json: string }[];
      expect(records.some((r) => r.payload_json.includes('snapshot-unavailable'))).toBe(true);
      expect(records.some((r) => r.payload_json.includes('snapshot-value-unavailable'))).toBe(true);
    } finally {
      base.raw.close();
    }
  });
});
