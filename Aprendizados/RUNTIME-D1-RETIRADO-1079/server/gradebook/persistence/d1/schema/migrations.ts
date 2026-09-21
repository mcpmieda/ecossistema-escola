export interface GradebookD1Migration {
  readonly version: number;
  readonly name: string;
  readonly fileName: string;
}

export const GRADEBOOK_D1_MIGRATIONS = [
  {
    version: 1,
    name: 'gradebook_context_entities_imports_v1',
    fileName: '0001_gradebook_context_entities_imports_v1.sql',
  },
  {
    version: 2,
    name: 'gradebook_records_audit_v1',
    fileName: '0002_gradebook_records_audit_v1.sql',
  },
] as const satisfies readonly GradebookD1Migration[];

/**
 * Ordered local schema including the read-catalog and durability extensions. The original
 * export remains the frozen 0001–0002 baseline consumed by the #227 suite.
 */
export const GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS = [
  ...GRADEBOOK_D1_MIGRATIONS,
  {
    version: 3,
    name: 'logical_source_record_catalog_v1',
    fileName: '0003_logical_source_record_catalog_v1.sql',
  },
  {
    version: 4,
    name: 'bulletin_council_durability_v1',
    fileName: '0004_bulletin_council_durability_v1.sql',
  },
  {
    version: 5,
    name: 'council_session_durability_v2',
    fileName: '0005_council_session_durability_v2.sql',
  },
  {
    version: 6,
    name: 'import_staging_v1',
    fileName: '0006_import_staging_v1.sql',
  },
] as const satisfies readonly GradebookD1Migration[];
