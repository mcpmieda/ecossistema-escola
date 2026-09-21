import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  academicRecordStreamKeyV1,
  logicalSourceRecordAssociationStreamForV1,
} from '../../../../server/gradebook/application/import/import-reconciliation-v1';
import {
  createGradebookD1WriteUnitOfWorkV1,
  GradebookD1WriteErrorV1,
  type D1WriteDatabaseV1,
} from '../../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import type {
  AcademicRecordStreamV1,
  LogicalSourceIdV1,
  LogicalSourceRecordAssociationV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  academicYearId,
  context,
  gradeRecord,
  gradeStream,
  instant,
  logicalSourceId,
  openMigratedDatabase,
  otherAcademicYearId,
  seedContext,
  sourceFileVersion,
  type SqliteD1Database,
} from '../d1-transaction/d1-write-test-support';

let database: SqliteD1Database;

beforeEach(async () => {
  database = await openMigratedDatabase();
  seedContext(database);
});

afterEach(() => {
  database.raw.close();
});

function association(
  source = sourceFileVersion(),
  sourceManifestVersion = 1,
): LogicalSourceRecordAssociationV1 {
  return {
    academicYearId,
    logicalSourceId,
    academicRecordStream: gradeStream,
    stableKey: academicRecordStreamKeyV1(gradeStream),
    state: 'active',
    sourceManifestId: source.manifest.id,
    sourceManifestVersion,
  };
}

describe('adaptador D1 local de escrita V1', () => {
  it('consome 0001–0006 com FKs ativas e grava fonte, registro e associação iniciais', async () => {
    expect(database.raw.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    expect(
      database.raw
        .prepare('SELECT version FROM gradebook_schema_migrations ORDER BY version')
        .all(),
    ).toEqual([
      { version: 1 },
      { version: 2 },
      { version: 3 },
      { version: 4 },
      { version: 5 },
      { version: 6 },
    ]);

    const unit = createGradebookD1WriteUnitOfWorkV1(database, { now: () => instant });
    const source = sourceFileVersion();
    await expect(
      unit.imports.appendSourceFileVersion(context, source, { expectedVersion: null }),
    ).resolves.toEqual({
      status: 'written',
      record: { value: source, version: 1, recordedAt: instant },
    });
    await expect(
      unit.academicRecords.appendVersion(context, gradeStream, gradeRecord(8), {
        expectedVersion: null,
      }),
    ).resolves.toMatchObject({ status: 'written', record: { version: 1 } });
    const associationStream = logicalSourceRecordAssociationStreamForV1(
      logicalSourceId,
      gradeStream,
    );
    await expect(
      unit.logicalSourceRecords.appendVersion(context, associationStream, association(), {
        expectedVersion: null,
      }),
    ).resolves.toMatchObject({ status: 'written', record: { version: 1 } });

    await expect(unit.imports.getSourceFileVersion(context, source.manifest.id)).resolves.toEqual({
      value: source,
      version: 1,
      recordedAt: instant,
    });
    await expect(unit.academicRecords.getCurrent(context, gradeStream)).resolves.toMatchObject({
      value: gradeRecord(8),
      version: 1,
    });
    await expect(
      unit.logicalSourceRecords.getCurrent(context, associationStream),
    ).resolves.toMatchObject({ value: association(), version: 1 });
  });

  it('faz compare-and-set e preserva o histórico append-only em atualizações válidas', async () => {
    const unit = createGradebookD1WriteUnitOfWorkV1(database, { now: () => instant });
    const firstSource = sourceFileVersion('a', 'synthetic-gradebook.xlsx');
    const renamedSource = sourceFileVersion('a', 'synthetic-gradebook-renamed.xlsx');
    const associationStream = logicalSourceRecordAssociationStreamForV1(
      logicalSourceId,
      gradeStream,
    );

    await unit.imports.appendSourceFileVersion(context, firstSource, { expectedVersion: null });
    await unit.academicRecords.appendVersion(context, gradeStream, gradeRecord(8), {
      expectedVersion: null,
    });
    await unit.logicalSourceRecords.appendVersion(
      context,
      associationStream,
      association(firstSource),
      { expectedVersion: null },
    );

    await expect(
      unit.imports.appendSourceFileVersion(context, renamedSource, { expectedVersion: 1 }),
    ).resolves.toMatchObject({ status: 'written', record: { version: 2 } });
    await expect(
      unit.academicRecords.appendVersion(context, gradeStream, gradeRecord(9, '002'), {
        expectedVersion: 1,
      }),
    ).resolves.toMatchObject({ status: 'written', record: { version: 2 } });
    await expect(
      unit.logicalSourceRecords.appendVersion(
        context,
        associationStream,
        association(renamedSource, 2),
        { expectedVersion: 1 },
      ),
    ).resolves.toMatchObject({ status: 'written', record: { version: 2 } });

    expect(
      database.raw
        .prepare(
          `SELECT version, previous_version, file_name FROM source_file_versions
           ORDER BY version`,
        )
        .all(),
    ).toEqual([
      { version: 1, previous_version: null, file_name: 'synthetic-gradebook.xlsx' },
      { version: 2, previous_version: 1, file_name: 'synthetic-gradebook-renamed.xlsx' },
    ]);
    expect(
      database.raw
        .prepare(`SELECT version, previous_version FROM academic_record_versions ORDER BY version`)
        .all(),
    ).toEqual([
      { version: 1, previous_version: null },
      { version: 2, previous_version: 1 },
    ]);
    expect(
      database.raw
        .prepare(
          `SELECT version, previous_version, source_manifest_version
           FROM logical_source_record_versions ORDER BY version`,
        )
        .all(),
    ).toEqual([
      { version: 1, previous_version: null, source_manifest_version: 1 },
      { version: 2, previous_version: 1, source_manifest_version: 2 },
    ]);
  });

  it('retorna conflito para expectativa nula ou versão obsoleta sem acrescentar histórico', async () => {
    const unit = createGradebookD1WriteUnitOfWorkV1(database, { now: () => instant });
    const source = sourceFileVersion();
    const associationStream = logicalSourceRecordAssociationStreamForV1(
      logicalSourceId,
      gradeStream,
    );
    await unit.imports.appendSourceFileVersion(context, source, { expectedVersion: null });
    await unit.academicRecords.appendVersion(context, gradeStream, gradeRecord(8), {
      expectedVersion: null,
    });
    await unit.logicalSourceRecords.appendVersion(context, associationStream, association(), {
      expectedVersion: null,
    });

    await expect(
      unit.imports.appendSourceFileVersion(context, source, { expectedVersion: null }),
    ).resolves.toEqual({ status: 'version-conflict', currentVersion: 1 });
    await expect(
      unit.imports.appendSourceFileVersion(context, source, { expectedVersion: 2 }),
    ).resolves.toEqual({ status: 'version-conflict', currentVersion: 1 });
    await expect(
      unit.academicRecords.appendVersion(context, gradeStream, gradeRecord(9, '002'), {
        expectedVersion: 2,
      }),
    ).resolves.toEqual({ status: 'version-conflict', currentVersion: 1 });
    await expect(
      unit.logicalSourceRecords.appendVersion(context, associationStream, association(), {
        expectedVersion: 2,
      }),
    ).resolves.toEqual({ status: 'version-conflict', currentVersion: 1 });
    await expect(
      unit.academicRecords.appendVersion(context, gradeStream, gradeRecord(9, '002'), {
        expectedVersion: null,
      }),
    ).resolves.toEqual({ status: 'version-conflict', currentVersion: 1 });
    await expect(
      unit.logicalSourceRecords.appendVersion(context, associationStream, association(), {
        expectedVersion: null,
      }),
    ).resolves.toEqual({ status: 'version-conflict', currentVersion: 1 });

    for (const table of [
      'source_file_versions',
      'academic_record_versions',
      'logical_source_record_versions',
    ]) {
      expect(database.raw.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({
        count: 1,
      });
    }
  });

  it('reverte raízes e ponteiros em falhas de FK, shape e JSON', async () => {
    const unit = createGradebookD1WriteUnitOfWorkV1(database, { now: () => instant });
    const missingSource = {
      ...sourceFileVersion('b'),
      logicalSource: {
        state: 'confirmed' as const,
        logicalSourceId: 'logical-source:d1-write:missing' as LogicalSourceIdV1,
      },
    };
    await expect(
      unit.imports.appendSourceFileVersion(context, missingSource, { expectedVersion: null }),
    ).rejects.toMatchObject({
      code: 'database-write-failed',
      message: 'Não foi possível gravar os dados acadêmicos persistidos.',
    });
    expect(database.raw.prepare('SELECT COUNT(*) AS count FROM source_file_streams').get()).toEqual(
      {
        count: 0,
      },
    );

    const malformed = gradeRecord(8) as AcademicRecordStreamV1 extends never ? never : unknown;
    (malformed as { value: { academicYearId: string } }).value.academicYearId =
      'academic-year:d1-write:other';
    await expect(
      unit.academicRecords.appendVersion(context, gradeStream, malformed as never, {
        expectedVersion: null,
      }),
    ).rejects.toMatchObject({ code: 'incompatible-write' });
    expect(
      database.raw.prepare('SELECT COUNT(*) AS count FROM academic_record_streams').get(),
    ).toEqual({ count: 0 });

    const circularSource = sourceFileVersion('c') as SourceFileVersionWithCircular;
    circularSource.circular = circularSource;
    await expect(
      unit.imports.appendSourceFileVersion(context, circularSource, { expectedVersion: null }),
    ).rejects.toMatchObject({ code: 'incompatible-write' });

    const validSource = sourceFileVersion('d');
    await unit.imports.appendSourceFileVersion(context, validSource, { expectedVersion: null });
    await unit.academicRecords.appendVersion(context, gradeStream, gradeRecord(8), {
      expectedVersion: null,
    });
    const associationStream = logicalSourceRecordAssociationStreamForV1(
      logicalSourceId,
      gradeStream,
    );
    await expect(
      unit.logicalSourceRecords.appendVersion(
        context,
        associationStream,
        association(validSource, 99),
        { expectedVersion: null },
      ),
    ).rejects.toMatchObject({ code: 'database-write-failed' });
    expect(
      database.raw.prepare('SELECT COUNT(*) AS count FROM logical_source_record_streams').get(),
    ).toEqual({ count: 0 });
  });

  it('isola streams por ano letivo e sanitiza erro bruto do driver', async () => {
    const unit = createGradebookD1WriteUnitOfWorkV1(database, { now: () => instant });
    await unit.academicRecords.appendVersion(context, gradeStream, gradeRecord(8), {
      expectedVersion: null,
    });
    database.raw
      .prepare(
        `INSERT INTO academic_years (
           academic_year_id, school_id, year, current_version, created_at
         ) VALUES (?, 'school:d1-write:002', 2027, 1, ?)`,
      )
      .run(otherAcademicYearId, instant);
    for (const [kind, id] of [
      ['student', gradeStream.studentId],
      ['enrollment', gradeStream.enrollmentId],
      ['assessment-component', gradeStream.assessmentComponentId],
    ] as const) {
      database.raw
        .prepare(
          `INSERT INTO academic_entity_streams (
             academic_year_id, entity_kind, entity_id, current_version, created_at
           ) VALUES (?, ?, ?, 1, ?)`,
        )
        .run(otherAcademicYearId, kind, id, instant);
    }
    const otherRecord = {
      ...gradeRecord(9, '002'),
      value: { ...gradeRecord(9, '002').value, academicYearId: otherAcademicYearId },
    } as const;
    await expect(
      unit.academicRecords.appendVersion(
        { academicYearId: otherAcademicYearId },
        gradeStream,
        otherRecord,
        { expectedVersion: null },
      ),
    ).resolves.toMatchObject({ status: 'written', record: { version: 1 } });
    expect(
      database.raw
        .prepare(
          `SELECT academic_year_id, current_version FROM academic_record_streams
           ORDER BY academic_year_id`,
        )
        .all(),
    ).toEqual([
      { academic_year_id: academicYearId, current_version: 1 },
      { academic_year_id: otherAcademicYearId, current_version: 1 },
    ]);

    const brokenDatabase = {
      prepare: () => {
        throw new Error('private SQL and academic payload');
      },
      exec: () => undefined,
    } as unknown as D1WriteDatabaseV1;
    const broken = createGradebookD1WriteUnitOfWorkV1(brokenDatabase, { now: () => instant });
    const write = broken.imports.appendSourceFileVersion(context, sourceFileVersion(), {
      expectedVersion: null,
    });
    await expect(write).rejects.toBeInstanceOf(GradebookD1WriteErrorV1);
    await expect(write).rejects.toMatchObject({
      code: 'database-write-failed',
      message: 'Não foi possível gravar os dados acadêmicos persistidos.',
    });
  });
});

type SourceFileVersionWithCircular = ReturnType<typeof sourceFileVersion> & {
  circular?: SourceFileVersionWithCircular;
};
