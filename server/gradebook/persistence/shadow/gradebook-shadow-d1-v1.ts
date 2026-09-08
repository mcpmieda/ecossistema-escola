import type {
  AcademicEntityReferenceV1,
  AcademicEntityRecordV1,
  AcademicPersistenceContextV1,
  AcademicRecordStreamV1,
  AcademicRecordV1,
  LogicalSourceRecordAssociationStreamV1,
  LogicalSourceRecordAssociationV1,
  VersionedRecordV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type { PersistenceUnitOfWorkV2 } from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import type {
  D1WriteDatabaseV1,
  D1WriteStatementV1,
  D1WriteValueV1,
} from '../d1/write/d1-write-adapter-v1';

export interface GradebookShadowD1GuardV1 {
  readonly database: D1WriteDatabaseV1;
  readonly writeAttempts: () => number;
}

class ReadOnlyShadowStatementV1 implements D1WriteStatementV1 {
  constructor(
    private readonly inner: D1WriteStatementV1,
    private readonly rejectWrite: () => never,
  ) {}

  bind(...values: D1WriteValueV1[]): D1WriteStatementV1 {
    return new ReadOnlyShadowStatementV1(this.inner.bind(...values), this.rejectWrite);
  }

  first<Row extends Record<string, unknown>>() {
    return this.inner.first<Row>();
  }

  all<Row extends Record<string, unknown>>() {
    return this.inner.all<Row>();
  }

  run(): never {
    return this.rejectWrite();
  }
}

/**
 * Read-only view over the production D1 binding used by shadow benchmarks.
 * Any mutation path fails closed before reaching D1.
 */
export function createGradebookShadowReadOnlyD1V1(
  base: D1WriteDatabaseV1,
): GradebookShadowD1GuardV1 {
  let attempts = 0;
  const rejectWrite = (): never => {
    attempts += 1;
    throw new Error('gradebook-shadow-d1-write-blocked');
  };
  return {
    database: {
      prepare: (query) => new ReadOnlyShadowStatementV1(base.prepare(query), rejectWrite),
      exec: () => rejectWrite(),
      batch: () => rejectWrite(),
    },
    writeAttempts: () => attempts,
  };
}

type EntityBulkRepositoryV1 = PersistenceUnitOfWorkV2['entities'] & {
  readonly getMany?: (
    context: AcademicPersistenceContextV1,
    references: readonly AcademicEntityReferenceV1[],
  ) => Promise<readonly (VersionedRecordV1<AcademicEntityRecordV1> | null)[]>;
  readonly getStudentStatusEventsMany?: (
    context: AcademicPersistenceContextV1,
    ids: readonly string[],
  ) => Promise<readonly (VersionedRecordV1<AcademicEntityRecordV1> | null)[]>;
};

type AcademicBulkRepositoryV1 = PersistenceUnitOfWorkV2['academicRecords'] & {
  readonly getCurrentMany?: (
    context: AcademicPersistenceContextV1,
    streams: readonly AcademicRecordStreamV1[],
  ) => Promise<readonly (VersionedRecordV1<AcademicRecordV1> | null)[]>;
};

type AssociationBulkRepositoryV1 = PersistenceUnitOfWorkV2['logicalSourceRecords'] & {
  readonly getCurrentMany?: (
    context: AcademicPersistenceContextV1,
    streams: readonly LogicalSourceRecordAssociationStreamV1[],
  ) => Promise<readonly (VersionedRecordV1<LogicalSourceRecordAssociationV1> | null)[]>;
};

/**
 * Keeps official catalog/context reads in D1 while presenting an empty persistence target.
 * This forces the real V8 planner/materializer to produce the complete initial-write capture
 * without changing the institutional database.
 */
export function createGradebookShadowEmptyTargetUnitOfWorkV1(
  base: PersistenceUnitOfWorkV2,
): PersistenceUnitOfWorkV2 {
  const baseEntities = base.entities as EntityBulkRepositoryV1;
  const baseAcademicRecords = base.academicRecords as AcademicBulkRepositoryV1;
  const baseAssociations = base.logicalSourceRecords as AssociationBulkRepositoryV1;

  const entities = Object.assign(
    {},
    baseEntities,
    {
      get: async (
        context: AcademicPersistenceContextV1,
        reference: AcademicEntityReferenceV1,
      ) =>
        reference.kind === 'assessment-component'
          ? null
          : baseEntities.get(context, reference),
    },
    baseEntities.getMany
      ? {
          getMany: async (
            context: AcademicPersistenceContextV1,
            references: readonly AcademicEntityReferenceV1[],
          ) => {
            const values = await baseEntities.getMany!(context, references);
            if (values.length !== references.length) {
              throw new Error('gradebook-shadow-entity-read-count-mismatch');
            }
            return values.map((value, index) =>
              references[index]?.kind === 'assessment-component' ? null : value,
            );
          },
        }
      : {},
    baseEntities.getStudentStatusEventsMany
      ? {
          getStudentStatusEventsMany: async (
            _context: AcademicPersistenceContextV1,
            ids: readonly string[],
          ) => ids.map(() => null),
        }
      : {},
  );

  const academicRecords = Object.assign({}, baseAcademicRecords, {
    getCurrent: async () => null,
    ...(baseAcademicRecords.getCurrentMany
      ? { getCurrentMany: async (_context: AcademicPersistenceContextV1, streams: readonly AcademicRecordStreamV1[]) => streams.map(() => null) }
      : {}),
  });

  const logicalSourceRecords = Object.assign({}, baseAssociations, {
    getCurrent: async () => null,
    listCurrentStreams: async () => [],
    ...(baseAssociations.getCurrentMany
      ? {
          getCurrentMany: async (
            _context: AcademicPersistenceContextV1,
            streams: readonly LogicalSourceRecordAssociationStreamV1[],
          ) => streams.map(() => null),
        }
      : {}),
  });

  return {
    ...base,
    entities,
    imports: {
      ...base.imports,
      findSourceFileByHash: async () => null,
      getSourceFileVersion: async () => null,
    },
    academicRecords,
    logicalSourceRecords,
  };
}
