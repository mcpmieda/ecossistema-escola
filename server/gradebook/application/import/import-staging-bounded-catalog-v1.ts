import type {
  AcademicEntityRecordV1,
  AcademicPersistenceContextV1,
  VersionedRecordV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type { PersistenceUnitOfWorkV2 } from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import type { GradebookImportPersistenceRequestV6 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';

type ImportRosterMatchV1 =
  | { readonly state: 'missing' }
  | { readonly state: 'ambiguous' }
  | {
      readonly state: 'ready';
      readonly enrollment: VersionedRecordV1<
        Extract<AcademicEntityRecordV1, { readonly kind: 'enrollment' }>
      >;
      readonly student: VersionedRecordV1<
        Extract<AcademicEntityRecordV1, { readonly kind: 'student' }>
      >;
    };

type ImportCatalogEntitiesV1 = PersistenceUnitOfWorkV2['entities'] & {
  readonly getImportRosterMany?: (
    context: AcademicPersistenceContextV1,
    requested: readonly { readonly classGroupId: string; readonly sourcePosition: number }[],
  ) => Promise<readonly ImportRosterMatchV1[]>;
};

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toUpperCase();
}

async function findClassGroup(
  entities: ImportCatalogEntitiesV1,
  context: AcademicPersistenceContextV1,
  label: string,
): Promise<Extract<AcademicEntityRecordV1, { readonly kind: 'class-group' }> | null> {
  const expected = normalize(label);
  let cursor: string | null = null;
  const seen = new Set<string>();
  for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
    const page = await entities.list(context, 'class-group', { limit: 100, cursor });
    for (const entry of page.items) {
      if (
        entry.value.kind === 'class-group' &&
        entry.value.value.academicYearId === context.academicYearId &&
        normalize(entry.value.value.code) === expected
      ) {
        return entry.value;
      }
    }
    if (page.nextCursor === null) return null;
    if (seen.has(page.nextCursor)) throw new Error('staged-catalog-class-cursor-cycle');
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  throw new Error('staged-catalog-class-too-large');
}

/**
 * The canonical bootstrap historically lists every student/enrollment in the year. A staged chunk
 * only contains a handful of positions, so production D1 may expose an optional set-based resolver
 * that narrows those two list calls without changing any domain contract or identity rule.
 */
export async function createGradebookImportStagingBoundedCatalogV1(
  base: PersistenceUnitOfWorkV2,
  request: GradebookImportPersistenceRequestV6,
): Promise<PersistenceUnitOfWorkV2> {
  const entities = base.entities as ImportCatalogEntitiesV1;
  if (!entities.getImportRosterMany) return base;
  if (request.courses.length !== 1 || request.rosters.length !== 1) {
    throw new Error('staged-catalog-chunk-shape-invalid');
  }
  const course = request.courses[0]!;
  const roster = request.rosters[0]!;
  if (normalize(course.classGroupLabel) !== normalize(roster.classGroupLabel)) {
    throw new Error('staged-catalog-roster-mismatch');
  }
  const context = { academicYearId: request.confirmedContext.academicYearId };
  const classGroup = await findClassGroup(entities, context, course.classGroupLabel);
  if (!classGroup) {
    return {
      ...base,
      entities: {
        ...entities,
        list: (listContext, kind, page) =>
          kind === 'student' || kind === 'enrollment'
            ? Promise.resolve({ items: [], nextCursor: null })
            : entities.list(listContext, kind, page),
      },
    };
  }

  let matches: readonly ImportRosterMatchV1[];
  try {
    matches = await entities.getImportRosterMany(
      context,
      roster.students.map((student) => ({
        classGroupId: classGroup.value.id,
        sourcePosition: student[0],
      })),
    );
  } catch {
    // Preserve the historical full-catalog behavior for incompatible/corrupt stores. This path is
    // exceptional; the normal production path remains set-based and bounded.
    return base;
  }
  if (matches.length !== roster.students.length || matches.some((match) => match.state === 'ambiguous')) {
    return base;
  }

  const enrollmentItems = matches.flatMap((match) =>
    match.state === 'ready' ? [match.enrollment as VersionedRecordV1<AcademicEntityRecordV1>] : [],
  );
  const studentById = new Map<string, VersionedRecordV1<AcademicEntityRecordV1>>();
  for (const match of matches) {
    if (match.state === 'ready') studentById.set(match.student.value.value.id, match.student);
  }
  const studentItems = [...studentById.values()];

  return {
    ...base,
    entities: {
      ...entities,
      list: (listContext, kind, page) => {
        if (kind !== 'student' && kind !== 'enrollment') {
          return entities.list(listContext, kind, page);
        }
        if (
          listContext.academicYearId !== context.academicYearId ||
          page.cursor !== null && page.cursor !== undefined ||
          page.limit < 1
        ) {
          return Promise.reject(new Error('staged-catalog-page-invalid'));
        }
        const items = kind === 'student' ? studentItems : enrollmentItems;
        return Promise.resolve({ items: items.slice(0, page.limit), nextCursor: null });
      },
    },
  };
}
