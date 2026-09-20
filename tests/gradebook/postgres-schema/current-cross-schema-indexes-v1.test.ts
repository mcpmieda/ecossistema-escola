import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const supplement = readFileSync(
  join(root, 'migrations/gradebook-simplified/current_cross_schema_indexes_v1.sql'),
  'utf8',
);
const portalMigration = readFileSync(
  join(root, 'migrations/student-portal/0010_incremental_publication_v3.sql'),
  'utf8',
);

const indexes = [
  'gradebook_nota_history_student_v3',
  'gradebook_nota_history_instrument_v3',
  'gradebook_closing_history_student_v3',
  'gradebook_closing_history_offer_v3',
] as const;

describe('current Gradebook cross-schema index reconstruction', () => {
  it('keeps the reconstruction supplement aligned with the owning Portal migration', () => {
    for (const index of indexes) {
      expect(portalMigration).toContain(index);
      expect(supplement).toContain(index);
    }
  });

  it('is reconstruction-only, not an independent production migration', () => {
    expect(supplement).toContain('NOT a production migration');
    expect(supplement).toContain('student-portal/0010_incremental_publication_v3.sql');
    expect(supplement).toContain('CREATE INDEX IF NOT EXISTS');
  });
});
