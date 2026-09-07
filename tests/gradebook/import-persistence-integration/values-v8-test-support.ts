import type { GradebookImportPersistenceRequestV8 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v8';
import { SOURCE_VALUES_POLICY_V5 } from '../../../shared/gradebook-contracts/source/source-values-contract-v5';
import { createGradebookD1PersistenceUnitOfWorkV2 } from '../../../server/gradebook/persistence/d1/composition/d1-persistence-unit-of-work-v1';
import { ACADEMIC_CONTEXT_2026_IDENTITY_V1 } from '../../../src/gradebook-domain/context/academic-context-2026-v1';
import {
  academicYearId,
  instant,
  openMigratedDatabase,
  type SqliteD1Database,
} from '../persistence/d1-transaction/d1-write-test-support';
import type {
  D1WriteDatabaseV1,
  D1WriteStatementV1,
  D1WriteValueV1,
} from '../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';

export function valuesRequestV8(): GradebookImportPersistenceRequestV8 {
  const term = (value: 1 | 2 | 3) => ({
    term: value,
    sourceSheetName: `6S${value}D1`,
    assessmentDefinitions: [
      ['R', 10],
      ['S', 10],
    ] as const,
    rows: [
      [1, { R: 5, S: 0.1, T: 10, AK: 10, AM: 20, ...(value === 3 ? { AN: 60 } : {}) }],
    ] as const,
  });
  return {
    transportVersion: 8,
    valuePolicy: SOURCE_VALUES_POLICY_V5,
    operation: 'persist-recognized-file',
    manifest: {
      fileName: 'sintetico-values.xlsb',
      extension: 'xlsb',
      reportedMimeType: null,
      sizeBytes: 256,
      lastModifiedAt: null,
      sha256: 'a'.repeat(64),
      sourceContractVersion: 2,
      parserVersion: 'synthetic:values-v1',
      readAt: instant,
    },
    recognizedSuggestions: { academicYear: 2026, teacherName: 'Docente Sintético' },
    confirmedContext: { academicYearId },
    sourceResolution: { mode: 'resolve-or-create' },
    rosters: [{ classGroupLabel: '6S', students: [[1, 'Estudante Sintético']] }],
    courses: [
      {
        classGroupLabel: '6S',
        subjectLabel: 'Componente Sintético',
        disciplineIndex: 'D1',
        terms: [term(1), term(2), term(3)],
        recovery: {
          sourceSheetName: '6SRECD1',
          rows: [[1, 5, { X: 20, Y: 20, AA: 20, AB: 60, AC: 0, AD: 0, AE: 0 }]],
        },
      },
    ],
    diagnostics: [],
  };
}
export async function seededValuesDatabaseV8() {
  const db = await openMigratedDatabase();
  const unit = createGradebookD1PersistenceUnitOfWorkV2(db, { now: () => instant });
  const write = await unit.entities.appendVersion(
    { academicYearId },
    {
      kind: 'academic-year',
      value: {
        id: academicYearId,
        schoolId: 'school:synthetic' as never,
        year: 2026,
        status: 'active',
        startsOn: '2026-01-01',
        endsOn: '2026-12-31',
        activeEvaluationProfileId: ACADEMIC_CONTEXT_2026_IDENTITY_V1.evaluationProfileId,
        configurationVersion: String(ACADEMIC_CONTEXT_2026_IDENTITY_V1.configurationVersion),
      },
    },
    { expectedVersion: null },
  );
  if (write.status !== 'written') throw new Error('synthetic seed failed');
  return db;
}

function serializedBytes(sql: string, params: readonly D1WriteValueV1[]): number {
  return new TextEncoder().encode(JSON.stringify({ sql, params })).byteLength;
}

export class MeasuredStatementV8 implements D1WriteStatementV1 {
  constructor(
    readonly owner: AtomicMeasuredDatabaseV8,
    readonly sql: string,
    readonly params: readonly D1WriteValueV1[] = [],
  ) {}
  bind(...params: D1WriteValueV1[]) {
    return new MeasuredStatementV8(this.owner, this.sql, params);
  }
  first<Row extends Record<string, unknown>>() {
    return this.owner.base
      .prepare(this.sql)
      .bind(...this.params)
      .first<Row>();
  }
  all<Row extends Record<string, unknown>>() {
    return this.owner.base
      .prepare(this.sql)
      .bind(...this.params)
      .all<Row>();
  }
  run() {
    this.owner.recordRun(this);
    return this.owner.base
      .prepare(this.sql)
      .bind(...this.params)
      .run();
  }
}
export class AtomicMeasuredDatabaseV8 implements D1WriteDatabaseV1 {
  readonly calls: { bytes: number; sql: readonly string[] }[] = [];
  readonly runs: { bytes: number; sql: string }[] = [];
  beforeBatch?: (statements: readonly MeasuredStatementV8[]) => void;
  afterBatch?: (statements: readonly MeasuredStatementV8[]) => void;
  beforeRun?: (statement: MeasuredStatementV8) => void;
  constructor(readonly base: SqliteD1Database) {}
  prepare(sql: string) {
    return new MeasuredStatementV8(this, sql);
  }
  exec(sql: string) {
    this.base.exec(sql);
  }
  recordRun(statement: MeasuredStatementV8) {
    this.beforeRun?.(statement);
    this.runs.push({ bytes: serializedBytes(statement.sql, statement.params), sql: statement.sql });
  }
  async batch(statements: readonly D1WriteStatementV1[]) {
    const items = statements as MeasuredStatementV8[];
    const bytes = new TextEncoder().encode(
      JSON.stringify(items.map(({ sql, params }) => ({ sql, params }))),
    ).byteLength;
    this.calls.push({ bytes, sql: items.map((s) => s.sql) });
    this.beforeBatch?.(items);
    this.base.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of items) {
        // Execute through the raw delegate so staging/run instrumentation does not
        // misclassify statements inside the one atomic academic batch.
        const raw = this.base.prepare(statement.sql).bind(...statement.params);
        if (/^\s*SELECT/iu.test(statement.sql)) {
          results.push({
            success: true,
            results: (await raw.all()).results,
            meta: { changes: 0 },
          });
        } else results.push(await raw.run());
      }
      this.base.exec('COMMIT');
      this.afterBatch?.(items);
      return results;
    } catch (cause) {
      try {
        this.base.exec('ROLLBACK');
      } catch {
        /* transaction already committed */
      }
      throw cause;
    }
  }
}
