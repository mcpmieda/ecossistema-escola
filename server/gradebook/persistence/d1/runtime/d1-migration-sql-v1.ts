import migration0001 from '../../../../../migrations/gradebook/0001_gradebook_context_entities_imports_v1.sql';
import migration0002 from '../../../../../migrations/gradebook/0002_gradebook_records_audit_v1.sql';
import migration0003 from '../../../../../migrations/gradebook/0003_logical_source_record_catalog_v1.sql';
import migration0004 from '../../../../../migrations/gradebook/0004_bulletin_council_durability_v1.sql';
import migration0005 from '../../../../../migrations/gradebook/0005_council_session_durability_v2.sql';
import migration0006 from '../../../../../migrations/gradebook/0006_import_staging_v1.sql';

export const GRADEBOOK_D1_MIGRATION_SQL_V1: readonly string[] = [
  migration0001,
  migration0002,
  migration0003,
  migration0004,
  migration0005,
  migration0006,
];
