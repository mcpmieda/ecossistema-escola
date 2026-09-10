import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGradebookD1PersistenceUnitOfWorkV2 } from '../../../server/gradebook/persistence/d1/composition/d1-persistence-unit-of-work-v1';
import { GradebookD1AtomicBatchRecorderV1 } from '../../../server/gradebook/persistence/d1/transaction/d1-batch-promotion-transaction-v1';
import { createGradebookD1ImportBootstrapBulkUnitOfWorkV1 } from '../../../server/gradebook/persistence/d1/transaction/d1-import-bootstrap-bulk-write-v1';
import type {
  D1WriteDatabaseV1,
  D1WriteRunResultV1,
  D1WriteStatementV1,
  D1WriteValueV1,
} from '../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import type { AcademicEntityRecordV1 } from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  context,
  gradeRecord,
  gradeStream,
  instant,
  openMigratedDatabase,
  seedContext,
  type SqliteD1Database,
} from '../persistence/d1-transaction/d1-write-test-support';

class CapturedStatement implements D1WriteStatementV1 {
  constructor(
    private readonly inner: D1WriteStatementV1,
    readonly sql: string,
    readonly params: readonly D1WriteValueV1[] = [],
  ) {}
  bind(...params: D1WriteValueV1[]) {
    return new CapturedStatement(this.inner.bind(...params), this.sql, params);
  }
  first<Row extends Record<string, unknown>>() {
    return this.inner.first<Row>();
  }
  all<Row extends Record<string, unknown>>() {
    return this.inner.all<Row>();
  }
  run() {
    return this.inner.run();
  }
}
class CapturedDatabase implements D1WriteDatabaseV1 {
  readonly batches: CapturedStatement[][] = [];
  constructor(readonly base: SqliteD1Database) {}
  prepare(sql: string) {
    return new CapturedStatement(this.base.prepare(sql), sql);
  }
  exec(sql: string) {
    this.base.exec(sql);
  }
  async batch(statements: readonly D1WriteStatementV1[]): Promise<readonly D1WriteRunResultV1[]> {
    this.batches.push(statements as CapturedStatement[]);
    this.base.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.base.exec('COMMIT');
      return results;
    } catch (cause) {
      this.base.exec('ROLLBACK');
      throw cause;
    }
  }
}
function writer(db: CapturedDatabase) {
  const recorder = new GradebookD1AtomicBatchRecorderV1(db);
  const bulk = createGradebookD1ImportBootstrapBulkUnitOfWorkV1({
    database: db,
    recorder,
    baseUnitOfWork: createGradebookD1PersistenceUnitOfWorkV2(recorder, { now: () => instant }),
    now: () => instant,
  });
  return { recorder, bulk };
}

describe('Import commit payload projection (#559)', () => {
  it('keeps full evidence in immutable versions but never sends it to stream statements', async () => {
    const base = await openMigratedDatabase();
    try {
      seedContext(base);
      const db = new CapturedDatabase(base);
      for (const expectedVersion of [null, 1] as const) {
        const { recorder, bulk } = writer(db);
        const entity: AcademicEntityRecordV1 = {
          kind: 'teacher',
          value: {
            id: 'teacher:projection-synthetic' as never,
            displayName: 'Docente sintético',
            sourceNames: ['SINTETICO'.repeat(1000)],
            status: 'active',
          },
        };
        const record = gradeRecord(expectedVersion === null ? 5 : 6);
        await bulk.unitOfWork.entities.appendVersion(context, entity, { expectedVersion });
        await bulk.unitOfWork.academicRecords.appendVersion(context, gradeStream, record, {
          expectedVersion,
        });
        bulk.flush();
        await recorder.commit();
        const batch = db.batches.at(-1)!;
        const streams = batch.filter((s) =>
          /(?:INSERT INTO|UPDATE) academic_(?:entity|record)_streams/u.test(s.sql),
        );
        const versions = batch.filter((s) =>
          /INSERT INTO academic_(?:entity|record)_versions/u.test(s.sql),
        );
        expect(streams).toHaveLength(2);
        expect(versions).toHaveLength(2);
        for (const statement of streams) {
          const rows = JSON.parse(statement.params[0] as string) as Record<string, unknown>[];
          expect(rows.every((row) => !Object.hasOwn(row, 'payloadJson'))).toBe(true);
          expect(statement.sql).not.toContain('$.payloadJson');
        }
        for (const statement of versions) {
          const rows = JSON.parse(statement.params[0] as string) as { payloadJson: string }[];
          expect(rows[0]!.payloadJson).toBe(
            JSON.stringify(statement.sql.includes('academic_entity_versions') ? entity : record),
          );
        }
        expect(streams.reduce((sum, s) => sum + (s.params[0] as string).length, 0)).toBeLessThan(
          versions.reduce((sum, s) => sum + (s.params[0] as string).length, 0) / 2,
        );
        const version = (expectedVersion ?? 0) + 1;
        expect(
          base.raw
            .prepare(
              "SELECT payload_json FROM academic_entity_versions WHERE entity_kind='teacher' AND version=?",
            )
            .get(version),
        ).toEqual({ payload_json: JSON.stringify(entity) });
        expect(
          base.raw
            .prepare('SELECT payload_json FROM academic_record_versions WHERE version=?')
            .get(version),
        ).toEqual({ payload_json: JSON.stringify(record) });
      }
      expect(db.batches).toHaveLength(2); // one atomic call per commit, never split across requests
      expect(base.raw.prepare('SELECT COUNT(*) AS n FROM academic_record_versions').get()).toEqual({
        n: 2,
      });
    } finally {
      base.raw.close();
    }
  });

  it('does not bypass the full-row limit by projecting a smaller stream row', async () => {
    const base = await openMigratedDatabase();
    try {
      seedContext(base);
      const db = new CapturedDatabase(base);
      const { bulk } = writer(db);
      const original = gradeRecord(5);
      const record = {
        ...original,
        value: { ...original.value, ruleVersion: 'S'.repeat(600_000) },
      };
      await bulk.unitOfWork.academicRecords.appendVersion(context, gradeStream, record, {
        expectedVersion: null,
      });
      expect(() => bulk.flush()).toThrow();
      expect(db.batches).toHaveLength(0);
      expect(base.raw.prepare('SELECT COUNT(*) AS n FROM academic_record_versions').get()).toEqual({
        n: 0,
      });
    } finally {
      base.raw.close();
    }
  });

  it('protects the assumption that all six stream SQL statements ignore payloadJson', () => {
    const source = readFileSync(
      'server/gradebook/persistence/d1/transaction/d1-import-bootstrap-bulk-write-v1.ts',
      'utf8',
    );
    for (const family of ['ENTITY', 'RECORD', 'ASSOCIATION'])
      for (const action of ['INSERT', 'UPDATE']) {
        const sql = new RegExp(`const ${family}_STREAM_${action} = ` + '`([^`]+)`').exec(
          source,
        )?.[1];
        expect(sql).toBeDefined();
        expect(sql).not.toContain('payloadJson');
        expect(sql).not.toContain('payload_json');
      }
  });
});
