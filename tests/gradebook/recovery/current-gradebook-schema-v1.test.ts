import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  GRADEBOOK_CURRENT_CATALOG_V1,
  GRADEBOOK_CURRENT_SCHEMA_PLAN_V1,
  GRADEBOOK_CURRENT_SEQUENCE_NAMES_V1,
  GRADEBOOK_CURRENT_TABLES_V1,
} from '../../../server/gradebook/recovery/current-gradebook-schema-v1';

const root = process.cwd();

describe('current Gradebook recovery catalog V1', () => {
  it('pins the current physical catalog measured by the native PostgreSQL gate', () => {
    expect(GRADEBOOK_CURRENT_CATALOG_V1).toEqual({
      tables: 30,
      columns: 251,
      constraints: 223,
      indexes: 70,
      foreignKeys: 52,
      sequences: 13,
      functions: 4,
      triggers: 3,
    });
    expect(GRADEBOOK_CURRENT_TABLES_V1).toHaveLength(30);
    expect(new Set(GRADEBOOK_CURRENT_TABLES_V1).size).toBe(30);
    expect(GRADEBOOK_CURRENT_SEQUENCE_NAMES_V1).toHaveLength(13);
    expect(new Set(GRADEBOOK_CURRENT_SEQUENCE_NAMES_V1).size).toBe(13);
  });

  it('replays the current migration lineage without replaying historical 0002', () => {
    expect(GRADEBOOK_CURRENT_SCHEMA_PLAN_V1).toContain('0001_current_schema.sql');
    expect(GRADEBOOK_CURRENT_SCHEMA_PLAN_V1).not.toContain('0002_import_diagnostics_audit_v1.sql');
    expect(GRADEBOOK_CURRENT_SCHEMA_PLAN_V1.at(-1)).toBe('current_cross_schema_indexes_v1.sql');

    for (const file of GRADEBOOK_CURRENT_SCHEMA_PLAN_V1) {
      expect(
        existsSync(join(root, 'migrations/gradebook-simplified', file)),
        file,
      ).toBe(true);
    }
  });

  it('keeps cross-schema indexes tied to the Portal migration that owns them', () => {
    const supplement = readFileSync(
      join(root, 'migrations/gradebook-simplified/current_cross_schema_indexes_v1.sql'),
      'utf8',
    );
    const portal = readFileSync(
      join(root, 'migrations/student-portal/0010_incremental_publication_v3.sql'),
      'utf8',
    );
    for (const index of [
      'gradebook_nota_history_student_v3',
      'gradebook_nota_history_instrument_v3',
      'gradebook_closing_history_student_v3',
      'gradebook_closing_history_offer_v3',
    ]) {
      expect(supplement).toContain(index);
      expect(portal).toContain(index);
    }
    expect(supplement).toContain('NOT a production migration');
  });

  it('keeps recovery V2 explicitly historical instead of relabeling old data as current', () => {
    const v2 = readFileSync(
      join(root, 'server/gradebook/recovery/logical-backup-recovery-v2.ts'),
      'utf8',
    );
    expect(v2).toContain('Historical recovery contract');
    expect(v2).toContain('must not be');
    expect(v2).toContain('current-gradebook-schema-v1.ts');
  });
});
