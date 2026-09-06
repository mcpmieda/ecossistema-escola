import type {
  AcademicEntityRecordV1,
  AcademicPersistenceContextV1,
  VersionedRecordV1,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  createGradebookD1AcademicEntityReadAdapterV1,
  GradebookD1ReadErrorV1,
  type D1ReadDatabaseV1,
  type D1ReadStatementV1,
} from './d1-read-adapter-v1';
import { createGradebookD1ImportCatalogBulkReadV1 } from './d1-import-catalog-bulk-read-v1';

type Row = Record<string, unknown>;
type AcademicYearRecord = VersionedRecordV1<
  Extract<AcademicEntityRecordV1, { readonly kind: 'academic-year' }>
>;

const MAX_BOOTSTRAP_SNAPSHOT_ROWS_V1 = 6_002;
const CATALOG_SNAPSHOT_SIGNATURE =
  "'teacher', 'class-group', 'subject', 'teaching-assignment', 'student', 'enrollment'";

export interface GradebookD1ImportCatalogBootstrapSnapshotV1 {
  readonly academicYear: AcademicYearRecord | null;
  readonly catalog: readonly VersionedRecordV1<AcademicEntityRecordV1>[] | null;
}

export interface GradebookD1ImportCatalogBootstrapReadV1 {
  getImportCatalogBootstrapSnapshot(
    context: AcademicPersistenceContextV1,
  ): Promise<GradebookD1ImportCatalogBootstrapSnapshotV1>;
}

function memoryStatement(input: {
  readonly first: Row | null;
  readonly rows: readonly Row[];
}): D1ReadStatementV1 {
  const statement: D1ReadStatementV1 = {
    bind() {
      return statement;
    },
    async first<T extends Row>() {
      return input.first as T | null;
    },
    async all<T extends Row>() {
      return { results: input.rows as readonly T[] };
    },
  };
  return statement;
}

function validationDatabase(input: {
  readonly academicYear: Row | null;
  readonly catalog: readonly Row[];
}): D1ReadDatabaseV1 {
  return {
    prepare(query: string) {
      if (query.includes('FROM academic_years y')) {
        return memoryStatement({ first: input.academicYear, rows: [] });
      }
      if (query.includes(CATALOG_SNAPSHOT_SIGNATURE)) {
        return memoryStatement({ first: null, rows: input.catalog });
      }
      throw new GradebookD1ReadErrorV1('database-read-failed');
    },
  };
}

export class GradebookD1ImportCatalogBootstrapReaderV1
  implements GradebookD1ImportCatalogBootstrapReadV1
{
  constructor(private readonly database: D1ReadDatabaseV1) {}

  async getImportCatalogBootstrapSnapshot(
    context: AcademicPersistenceContextV1,
  ): Promise<GradebookD1ImportCatalogBootstrapSnapshotV1> {
    if (typeof context.academicYearId !== 'string' || context.academicYearId.length === 0) {
      throw new GradebookD1ReadErrorV1('incompatible-row');
    }

    let rows: readonly Row[];
    try {
      rows = (
        await this.database
          .prepare(
            `SELECT
               'academic-year' AS snapshot_kind,
               y.academic_year_id,
               y.school_id,
               y.year AS academic_year,
               y.current_version,
               v.version AS persisted_version,
               v.status,
               v.starts_on,
               v.ends_on,
               v.active_evaluation_profile_id,
               v.configuration_id,
               v.configuration_version,
               v.payload_json AS year_payload_json,
               v.recorded_at,
               c.configuration_id AS persisted_configuration_id,
               c.version AS persisted_configuration_version,
               c.evaluation_profile_id AS configuration_evaluation_profile_id,
               c.payload_json AS configuration_payload_json,
               NULL AS entity_kind,
               NULL AS entity_id,
               NULL AS teacher_ref_kind,
               NULL AS teacher_id,
               NULL AS class_group_ref_kind,
               NULL AS class_group_id,
               NULL AS subject_ref_kind,
               NULL AS subject_id,
               NULL AS student_ref_kind,
               NULL AS student_id,
               NULL AS enrollment_ref_kind,
               NULL AS enrollment_id,
               NULL AS teaching_assignment_ref_kind,
               NULL AS teaching_assignment_id,
               NULL AS term,
               NULL AS display_code,
               NULL AS lifecycle_state,
               NULL AS payload_json
             FROM academic_years y
             LEFT JOIN academic_year_versions v
               ON v.academic_year_id = y.academic_year_id
              AND v.version = y.current_version
             LEFT JOIN academic_year_configuration_versions c
               ON c.academic_year_id = v.academic_year_id
              AND c.configuration_id = v.configuration_id
              AND c.version = v.configuration_version
             WHERE y.academic_year_id = ?
             UNION ALL
             SELECT
               'catalog' AS snapshot_kind,
               s.academic_year_id,
               NULL AS school_id,
               NULL AS academic_year,
               s.current_version,
               e.version AS persisted_version,
               NULL AS status,
               NULL AS starts_on,
               NULL AS ends_on,
               NULL AS active_evaluation_profile_id,
               NULL AS configuration_id,
               NULL AS configuration_version,
               NULL AS year_payload_json,
               e.recorded_at,
               NULL AS persisted_configuration_id,
               NULL AS persisted_configuration_version,
               NULL AS configuration_evaluation_profile_id,
               NULL AS configuration_payload_json,
               s.entity_kind,
               s.entity_id,
               e.teacher_ref_kind,
               e.teacher_id,
               e.class_group_ref_kind,
               e.class_group_id,
               e.subject_ref_kind,
               e.subject_id,
               e.student_ref_kind,
               e.student_id,
               e.enrollment_ref_kind,
               e.enrollment_id,
               e.teaching_assignment_ref_kind,
               e.teaching_assignment_id,
               e.term,
               e.display_code,
               e.lifecycle_state,
               e.payload_json
             FROM academic_entity_streams s
             LEFT JOIN academic_entity_versions e
               ON e.academic_year_id = s.academic_year_id
              AND e.entity_kind = s.entity_kind
              AND e.entity_id = s.entity_id
              AND e.version = s.current_version
             WHERE s.academic_year_id = ?
               AND s.entity_kind IN (
                 'teacher', 'class-group', 'subject', 'teaching-assignment', 'student', 'enrollment'
               )
             ORDER BY snapshot_kind, entity_kind, entity_id
             LIMIT ?`,
          )
          .bind(
            context.academicYearId,
            context.academicYearId,
            MAX_BOOTSTRAP_SNAPSHOT_ROWS_V1,
          )
          .all<Row>()
      ).results;
    } catch (cause) {
      if (cause instanceof GradebookD1ReadErrorV1) throw cause;
      throw new GradebookD1ReadErrorV1('database-read-failed');
    }

    const academicYearRows = rows.filter(({ snapshot_kind }) => snapshot_kind === 'academic-year');
    const catalogRows = rows.filter(({ snapshot_kind }) => snapshot_kind === 'catalog');
    if (academicYearRows.length > 1) throw new GradebookD1ReadErrorV1('incompatible-row');

    const memory = validationDatabase({
      academicYear: academicYearRows[0] ?? null,
      catalog: catalogRows,
    });
    const academicYearReader = createGradebookD1AcademicEntityReadAdapterV1(memory);
    const catalogReader = createGradebookD1ImportCatalogBulkReadV1(memory);
    const academicYear = await academicYearReader.get(context, {
      kind: 'academic-year',
      id: context.academicYearId,
    });
    const catalog = await catalogReader.getImportCatalogSnapshot(context);

    if (academicYear !== null && academicYear.value.kind !== 'academic-year') {
      throw new GradebookD1ReadErrorV1('incompatible-row');
    }
    return {
      academicYear: academicYear as AcademicYearRecord | null,
      catalog,
    };
  }
}

export function createGradebookD1ImportCatalogBootstrapReadV1(
  database: D1ReadDatabaseV1,
): GradebookD1ImportCatalogBootstrapReadV1 {
  return new GradebookD1ImportCatalogBootstrapReaderV1(database);
}
