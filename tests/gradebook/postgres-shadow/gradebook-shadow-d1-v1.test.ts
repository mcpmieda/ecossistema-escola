import { describe, expect, it, vi } from 'vitest';
import type {
  AcademicEntityReferenceV1,
  AcademicPersistenceContextV1,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type { PersistenceUnitOfWorkV2 } from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import type {
  D1WriteDatabaseV1,
  D1WriteStatementV1,
  D1WriteValueV1,
} from '../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import {
  createGradebookShadowEmptyTargetUnitOfWorkV1,
  createGradebookShadowReadOnlyD1V1,
} from '../../../server/gradebook/persistence/shadow/gradebook-shadow-d1-v1';

class FakeStatement implements D1WriteStatementV1 {
  constructor(readonly values: readonly D1WriteValueV1[] = []) {}
  bind(...values: D1WriteValueV1[]) {
    return new FakeStatement(values);
  }
  async first<Row extends Record<string, unknown>>() {
    return { ok: 1, values: this.values } as unknown as Row;
  }
  async all<Row extends Record<string, unknown>>() {
    return { results: [{ ok: 1, values: this.values } as unknown as Row] };
  }
  async run() {
    return { success: true, meta: { changes: 1 } };
  }
}

describe('Postgres V8 shadow D1 guards', () => {
  it('allows reads but blocks run, exec and batch before the base write path', async () => {
    const baseRun = vi.fn();
    const baseExec = vi.fn();
    const baseBatch = vi.fn();
    const base: D1WriteDatabaseV1 = {
      prepare: () => {
        const statement = new FakeStatement();
        return Object.assign(statement, { run: baseRun });
      },
      exec: baseExec,
      batch: baseBatch,
    };
    const guard = createGradebookShadowReadOnlyD1V1(base);
    expect(await guard.database.prepare('select 1').bind('x').first()).toMatchObject({ ok: 1 });
    expect(await guard.database.prepare('select 1').all()).toMatchObject({ results: [{ ok: 1 }] });
    expect(() => guard.database.prepare('update x').run()).toThrow(
      'gradebook-shadow-d1-write-blocked',
    );
    expect(() => guard.database.exec('delete from x')).toThrow('gradebook-shadow-d1-write-blocked');
    expect(() => guard.database.batch!([])).toThrow('gradebook-shadow-d1-write-blocked');
    expect(baseRun).not.toHaveBeenCalled();
    expect(baseExec).not.toHaveBeenCalled();
    expect(baseBatch).not.toHaveBeenCalled();
    expect(guard.writeAttempts()).toBe(3);
  });

  it('keeps catalog reads while presenting an empty versioned persistence target', async () => {
    const context = { academicYearId: 'academic-year:synthetic' } as AcademicPersistenceContextV1;
    const teacherReference = {
      kind: 'teacher',
      id: 'teacher:synthetic',
    } as AcademicEntityReferenceV1;
    const componentReference = {
      kind: 'assessment-component',
      id: 'assessment-component:synthetic',
    } as AcademicEntityReferenceV1;
    const teacherRecord = {
      value: {
        kind: 'teacher',
        value: { id: teacherReference.id, displayName: 'Synthetic' },
      },
      version: 1,
      recordedAt: '2026-01-01T00:00:00.000Z',
    } as never;
    const get = vi.fn(async (_context, reference: AcademicEntityReferenceV1) =>
      reference.kind === 'teacher' ? teacherRecord : null,
    );
    const getMany = vi.fn(async (_context, references: readonly AcademicEntityReferenceV1[]) =>
      references.map((reference) =>
        reference.kind === 'teacher'
          ? teacherRecord
          : ({ value: {}, version: 1, recordedAt: 'x' } as never),
      ),
    );
    const base = {
      entities: {
        get,
        getMany,
        getStudentStatusEventsMany: vi.fn(async () => [teacherRecord]),
        list: vi.fn(),
        appendVersion: vi.fn(),
      },
      imports: {
        findSourceFileByHash: vi.fn(async () => ({ value: {}, version: 1, recordedAt: 'x' })),
        getSourceFileVersion: vi.fn(async () => ({ value: {}, version: 1, recordedAt: 'x' })),
      },
      academicRecords: {
        getCurrent: vi.fn(async () => ({ value: {}, version: 1, recordedAt: 'x' })),
        getCurrentMany: vi.fn(async () => [{ value: {}, version: 1, recordedAt: 'x' }]),
      },
      logicalSourceRecords: {
        getCurrent: vi.fn(async () => ({ value: {}, version: 1, recordedAt: 'x' })),
        getCurrentMany: vi.fn(async () => [{ value: {}, version: 1, recordedAt: 'x' }]),
        listCurrentStreams: vi.fn(async () => [{ kind: 'annual-result' }]),
      },
      logicalSources: {},
      audit: {},
    } as unknown as PersistenceUnitOfWorkV2;

    const shadow = createGradebookShadowEmptyTargetUnitOfWorkV1(base);
    expect(await shadow.entities.get(context, teacherReference)).toBe(teacherRecord);
    expect(await shadow.entities.get(context, componentReference)).toBeNull();
    const shadowEntities = shadow.entities as unknown as {
      getMany: typeof getMany;
      getStudentStatusEventsMany: (
        context: AcademicPersistenceContextV1,
        ids: readonly string[],
      ) => Promise<readonly unknown[]>;
    };
    const bulk = await shadowEntities.getMany(context, [teacherReference, componentReference]);
    expect(bulk[0]).toBe(teacherRecord);
    expect(bulk[1]).toBeNull();
    expect(await shadow.imports.findSourceFileByHash(context, 'a'.repeat(64))).toBeNull();
    expect(
      await shadow.imports.getSourceFileVersion(context, 'manifest:synthetic' as never),
    ).toBeNull();
    expect(
      await shadow.academicRecords.getCurrent(context, { kind: 'annual-result' } as never),
    ).toBeNull();
    expect(
      await shadow.logicalSourceRecords.listCurrentStreams(context, 'logical:synthetic' as never),
    ).toEqual([]);
    expect(await shadow.logicalSourceRecords.getCurrent(context, {} as never)).toBeNull();
    expect(await shadowEntities.getStudentStatusEventsMany(context, ['one', 'two'])).toEqual([
      null,
      null,
    ]);
  });
});
