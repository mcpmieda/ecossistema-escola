import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openMigratedDatabase } from '../persistence/d1-transaction/d1-write-test-support';

const source = readFileSync(
  join(
    process.cwd(),
    'server/gradebook/persistence/d1/transaction/d1-import-bootstrap-bulk-write-v1.ts',
  ),
  'utf8',
);

// Exercise the exact production SQL against the actual migrated schema. Wall-clock
// assertions are intentionally avoided: index lookup, isolation and CAS are invariant.
describe('Bounded indexed import UPDATE plans (#551)', () => {
  it.each([
    ['ENTITY_STREAM_UPDATE', 'academic_entity_streams'],
    ['RECORD_STREAM_UPDATE', 'academic_record_streams'],
    ['ASSOCIATION_STREAM_UPDATE', 'logical_source_record_streams'],
  ])(
    '%s uses primary-key lookup instead of scanning all existing streams',
    async (constant, table) => {
      const db = await openMigratedDatabase();
      try {
        const sql = new RegExp('const ' + constant + ' = `([^`]+)`;').exec(source)?.[1];
        expect(sql).toBeDefined();
        const rows = Array.from({ length: 200 }, (_, index) => ({
          academicYearId: 'year:synthetic',
          entityKind: 'teacher',
          entityId: `entity:${index}`,
          recordKind: 'annual-result',
          streamKey: `stream:${index}`,
          logicalSourceId: 'source:synthetic',
          expectedVersion: 1,
          nextVersion: 2,
          state: 'inactive',
        }));
        const payload = JSON.stringify(rows);
        const plan = db.raw.prepare(`EXPLAIN QUERY PLAN ${sql!}`).all(payload) as {
          detail: string;
        }[];
        expect(
          plan.some((row) =>
            /SEARCH target USING (?:COVERING )?(?:INDEX|PRIMARY KEY)/u.test(row.detail),
          ),
        ).toBe(true);
        expect(
          plan.some(
            (row) => row.detail === 'SCAN target' || row.detail.startsWith(`SCAN ${table}`),
          ),
        ).toBe(false);
        expect(plan.some((row) => /CORRELATED/u.test(row.detail))).toBe(false);

        // The production migration constraints remain enabled in integration tests;
        // here disable only foreign keys to cheaply populate unrelated synthetic streams.
        db.raw.exec('PRAGMA foreign_keys = OFF');
        const entity = table === 'academic_entity_streams';
        const association = table === 'logical_source_record_streams';
        const columns = entity
          ? 'academic_year_id, entity_kind, entity_id, current_version, created_at'
          : association
            ? 'academic_year_id, logical_source_id, record_kind, stream_key, current_version, current_state, created_at'
            : 'academic_year_id, record_kind, stream_key, current_version, student_id, enrollment_id, teaching_assignment_ref_kind, teaching_assignment_id, created_at';
        const width = entity ? 5 : association ? 7 : 9;
        const insert = db.raw.prepare(
          `INSERT INTO ${table} (${columns}) VALUES (${Array(width).fill('?').join(',')})`,
        );
        db.raw.exec('BEGIN');
        for (let index = 0; index < 20_000; index += 1) {
          const values = entity
            ? ['year:synthetic', 'teacher', `entity:${index}`, 1, '2026-09-01T00:00:00Z']
            : association
              ? [
                  'year:synthetic',
                  'source:synthetic',
                  'annual-result',
                  `stream:${index}`,
                  1,
                  'active',
                  '2026-09-01T00:00:00Z',
                ]
              : [
                  'year:synthetic',
                  'annual-result',
                  `stream:${index}`,
                  1,
                  'student:synthetic',
                  'enrollment:synthetic',
                  'teaching-assignment',
                  'assignment:synthetic',
                  '2026-09-01T00:00:00Z',
                ];
          insert.run(...values);
        }
        db.raw.exec('COMMIT');
        expect(Number(db.raw.prepare(sql!).run(payload).changes)).toBe(200);
        expect(Number(db.raw.prepare(sql!).run(payload).changes)).toBe(0); // stale CAS, no overwrite
        expect(
          db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE current_version = 2`).get(),
        ).toMatchObject({ n: 200 });
        expect(
          db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE current_version = 1`).get(),
        ).toMatchObject({ n: 19_800 });
        if (association) {
          expect(
            db.raw
              .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE current_state = 'inactive'`)
              .get(),
          ).toMatchObject({ n: 200 });
        }
      } finally {
        db.raw.close();
      }
    },
  );
});
