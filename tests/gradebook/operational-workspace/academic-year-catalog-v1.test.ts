import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  OperationalWorkspaceAcademicYearCatalogErrorV1,
  createOperationalWorkspaceAcademicYearCatalogV1,
} from '../../../server/gradebook/persistence/d1/operational-workspace/academic-year-catalog-v1';
import type { D1ReadDatabaseV1 } from '../../../server/gradebook/persistence/d1/read/d1-read-adapter-v1';
import { SqliteD1Database } from '../persistence/d1-transaction/d1-write-test-support';

async function openDatabase(): Promise<{
  readonly raw: DatabaseSync;
  readonly database: SqliteD1Database;
}> {
  const sqliteModuleName = 'node:sqlite';
  const sqlite = await import(/* @vite-ignore */ sqliteModuleName);
  const raw = new sqlite.DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON;');
  raw.exec(
    readFileSync(
      join(process.cwd(), 'migrations', 'gradebook', '0001_gradebook_context_entities_imports_v1.sql'),
      'utf8',
    ),
  );
  return { raw, database: new SqliteD1Database(raw) };
}

describe('operational workspace academic year catalog v1', () => {
  it('lists only opaque id and year label in deterministic order', async () => {
    const { raw, database } = await openDatabase();
    try {
      const instant = '2026-09-01T18:00:00.000Z';
      raw.prepare(
        `INSERT INTO academic_years (
           academic_year_id, school_id, year, current_version, created_at
         ) VALUES (?, ?, ?, 1, ?)`,
      ).run('academic-year:catalog:2026', 'school:catalog:synthetic', 2026, instant);
      raw.prepare(
        `INSERT INTO academic_years (
           academic_year_id, school_id, year, current_version, created_at
         ) VALUES (?, ?, ?, 1, ?)`,
      ).run('academic-year:catalog:2027', 'school:catalog:synthetic', 2027, instant);

      await expect(createOperationalWorkspaceAcademicYearCatalogV1(database).list()).resolves.toEqual([
        { id: 'academic-year:catalog:2027', label: '2027' },
        { id: 'academic-year:catalog:2026', label: '2026' },
      ]);
    } finally {
      raw.close();
    }
  });

  it('fails closed on incompatible rows without exposing raw values', async () => {
    const database = {
      prepare: () => ({
        bind() {
          return this;
        },
        first: async () => null,
        all: async () => ({ results: [{ academic_year_id: 'synthetic', year: '2026' }] }),
      }),
    } as D1ReadDatabaseV1;

    await expect(createOperationalWorkspaceAcademicYearCatalogV1(database).list()).rejects.toMatchObject({
      name: 'OperationalWorkspaceAcademicYearCatalogErrorV1',
      code: 'incompatible-row',
    } satisfies Partial<OperationalWorkspaceAcademicYearCatalogErrorV1>);
  });
});
