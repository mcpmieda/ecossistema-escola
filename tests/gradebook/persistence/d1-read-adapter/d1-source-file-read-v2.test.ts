import { beforeEach, describe, expect, it } from 'vitest';

import type { LogicalSourceIdV1 } from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import { createGradebookD1PersistenceUnitOfWorkV2 } from '../../../../server/gradebook/persistence/d1/composition/d1-persistence-unit-of-work-v1';
import {
  createGradebookD1WriteUnitOfWorkV1,
  type D1WriteDatabaseV1,
  type D1WriteRunResultV1,
  type D1WriteStatementV1,
  type D1WriteValueV1,
} from '../../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import {
  academicYearId,
  context,
  instant,
  logicalSourceId,
  openMigratedDatabase,
  seedContext,
  sourceFileVersion,
  type SqliteD1Database,
} from '../d1-transaction/d1-write-test-support';

class CountingStatement implements D1WriteStatementV1 {
  constructor(
    private readonly base: D1WriteStatementV1,
    private readonly counts: { first: number; all: number; run: number },
  ) {}

  bind(...values: D1WriteValueV1[]): D1WriteStatementV1 {
    return new CountingStatement(this.base.bind(...values), this.counts);
  }

  async first<Row extends Record<string, unknown>>(): Promise<Row | null> {
    this.counts.first += 1;
    return this.base.first<Row>();
  }

  async all<Row extends Record<string, unknown>>(): Promise<{ readonly results: readonly Row[] }> {
    this.counts.all += 1;
    return this.base.all<Row>();
  }

  async run(): Promise<D1WriteRunResultV1> {
    this.counts.run += 1;
    return this.base.run();
  }
}

class CountingDatabase implements D1WriteDatabaseV1 {
  readonly counts = { first: 0, all: 0, run: 0 };

  constructor(private readonly base: D1WriteDatabaseV1) {}

  prepare(query: string): D1WriteStatementV1 {
    return new CountingStatement(this.base.prepare(query), this.counts);
  }

  exec(query: string): unknown {
    return this.base.exec(query);
  }

  reset(): void {
    this.counts.first = 0;
    this.counts.all = 0;
    this.counts.run = 0;
  }
}

let database: SqliteD1Database;

beforeEach(async () => {
  database = await openMigratedDatabase();
  seedContext(database);
});

async function append(value: ReturnType<typeof sourceFileVersion>): Promise<void> {
  const writer = createGradebookD1WriteUnitOfWorkV1(database, { now: () => instant });
  const result = await writer.imports.appendSourceFileVersion(context, value, {
    expectedVersion: null,
  });
  expect(result.status).toBe('written');
}

function insertLogicalSource(id: LogicalSourceIdV1): void {
  database.raw
    .prepare(
      `INSERT INTO logical_sources (
         academic_year_id, logical_source_id, source_context, created_at
       ) VALUES (?, ?, 'synthetic-write-context', ?)`,
    )
    .run(academicYearId, id, instant);
}

describe('D1 source-file single read V2', () => {
  it('uses one physical D1 call for hash and manifest lookups through the official composition', async () => {
    const value = sourceFileVersion('a');
    await append(value);
    const counting = new CountingDatabase(database);
    const unit = createGradebookD1PersistenceUnitOfWorkV2(counting, { now: () => instant });

    counting.reset();
    await expect(unit.imports.findSourceFileByHash(context, value.manifest.sha256)).resolves.toEqual({
      value,
      version: 1,
      recordedAt: instant,
    });
    expect(counting.counts).toEqual({ first: 0, all: 1, run: 0 });

    counting.reset();
    await expect(unit.imports.getSourceFileVersion(context, value.manifest.id)).resolves.toEqual({
      value,
      version: 1,
      recordedAt: instant,
    });
    expect(counting.counts).toEqual({ first: 0, all: 1, run: 0 });
  });

  it('preserves unmatched, candidate and confirmed logical-source relations', async () => {
    const candidateA = 'logical-source:d1-source-read:candidate-a' as LogicalSourceIdV1;
    const candidateB = 'logical-source:d1-source-read:candidate-b' as LogicalSourceIdV1;
    insertLogicalSource(candidateA);
    insertLogicalSource(candidateB);

    const confirmed = sourceFileVersion('a');
    const candidate = {
      ...sourceFileVersion('b'),
      logicalSource: {
        state: 'candidate' as const,
        candidateLogicalSourceIds: [candidateB, candidateA],
      },
    };
    const unmatched = {
      ...sourceFileVersion('c'),
      logicalSource: { state: 'unmatched' as const },
    };
    await append(confirmed);
    await append(candidate);
    await append(unmatched);

    const unit = createGradebookD1PersistenceUnitOfWorkV2(database, { now: () => instant });
    await expect(unit.imports.findSourceFileByHash(context, confirmed.manifest.sha256)).resolves.toMatchObject({
      value: confirmed,
    });
    await expect(unit.imports.findSourceFileByHash(context, candidate.manifest.sha256)).resolves.toMatchObject({
      value: candidate,
    });
    await expect(unit.imports.findSourceFileByHash(context, unmatched.manifest.sha256)).resolves.toMatchObject({
      value: unmatched,
    });
  });

  it('fails closed when candidate rows disagree with a confirmed payload', async () => {
    const value = sourceFileVersion('d');
    await append(value);
    const conflictingCandidate = 'logical-source:d1-source-read:conflict' as LogicalSourceIdV1;
    insertLogicalSource(conflictingCandidate);
    database.raw
      .prepare(
        `INSERT INTO source_file_logical_source_candidates (
           academic_year_id, manifest_id, source_file_version, logical_source_id
         ) VALUES (?, ?, 1, ?)`,
      )
      .run(academicYearId, value.manifest.id, conflictingCandidate);

    const counting = new CountingDatabase(database);
    const unit = createGradebookD1PersistenceUnitOfWorkV2(counting, { now: () => instant });
    await expect(
      unit.imports.findSourceFileByHash(context, value.manifest.sha256),
    ).rejects.toMatchObject({ code: 'incompatible-row' });
    expect(counting.counts).toEqual({ first: 0, all: 1, run: 0 });
  });
});
