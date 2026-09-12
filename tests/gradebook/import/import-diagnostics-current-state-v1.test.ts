import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string { return readFileSync(path,'utf8'); }

describe('current import diagnostics retention', () => {
  it('routes complete observations through the atomic snapshot service', () => {
    const route = source('functions/api/gradebook/import-diagnostics.ts');
    const service = source('server/gradebook/application/import/import-diagnostics-snapshot-v1.ts');
    expect(route).toContain('replaceGradebookImportDiagnosticsSnapshotV1(database,payload)');
    expect(service).toContain('.transaction(async (transaction)');
    expect(service).toContain('pg_advisory_xact_lock');
    expect(service).toContain('ano IS NOT DISTINCT FROM ? AND arquivo = ?');
    expect(service).toContain('recordChanges');
    expect(service).toContain('writtenCount !== rows.length');
    expect(route).not.toContain('DELETE FROM');
  });

  it('sends empty observations and prevents academic persistence from clearing diagnostics independently', () => {
    const hook = source('src/features/gradebook/import/use-import-batch.ts');
    const route = source('functions/api/gradebook/import-persistence.ts');
    expect(hook).not.toContain('if (diagnostics.length === 0) return;');
    expect(hook).toContain('await auditDiagnostics(result, diagnostics);');
    expect(route).not.toContain('DELETE FROM gradebook.importacao_diagnostico');
    expect(route).not.toContain('clearStaleImportDiagnostics');
    expect(route).toContain('createGradebookRelationalImportServiceV11(database).execute(canonical)');
  });
});
