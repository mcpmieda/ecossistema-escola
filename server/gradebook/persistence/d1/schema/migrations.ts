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
