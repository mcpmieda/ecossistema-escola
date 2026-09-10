import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('current import diagnostics retention', () => {
  it('replaces the diagnostic snapshot for the same academic year and file', () => {
    const route = source('functions/api/gradebook/import-diagnostics.ts');
    const deletion = route.indexOf('DELETE FROM gradebook.importacao_diagnostico');
    const insertion = route.indexOf('INSERT INTO gradebook.importacao_diagnostico');

    expect(deletion).toBeGreaterThanOrEqual(0);
    expect(insertion).toBeGreaterThan(deletion);
    expect(route).toContain('WHERE ano IS NOT DISTINCT FROM ?');
    expect(route).toContain('AND arquivo = ?');
    expect(route).toContain('if (request.diagnostics.length === 0) return clearedCount;');
  });

  it('removes diagnostics from older hashes on every valid canonical reimport', () => {
    const route = source('functions/api/gradebook/import-persistence.ts');
    const cleanup = route.indexOf('await clearStaleImportDiagnostics(database, canonical);');
    const persistence = route.indexOf('createGradebookRelationalImportServiceV11(database).execute(canonical)');

    expect(route).toContain('AND hash <> decode(?, \'hex\')');
    expect(cleanup).toBeGreaterThanOrEqual(0);
    expect(persistence).toBeGreaterThan(cleanup);
  });
});
