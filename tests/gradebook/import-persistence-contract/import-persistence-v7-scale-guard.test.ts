import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('Gradebook import V7/V8 scale guard', () => {
  it('inspects every V6 item once inside the V7 request inspector', () => {
    const contract = source(
      'shared/gradebook-contracts/imports/import-persistence-transport-v7.ts',
    );

    expect(contract).toContain('const inspection = inspectGradebookImportPersistenceRequestV6(request);');
    expect(contract).not.toContain('isGradebookImportPersistenceRequestV6(request)');
  });

  it('reuses the single V7 inspection in the HTTP route', () => {
    const route = source('server/gradebook/http/import-persistence-routes-v2.ts');

    expect(route).toContain('const bytes = version === 7 ? null : serializedByteLength(payload);');
    expect(route).not.toContain('isGradebookImportPersistenceBatchRequestV7(payload)');
    expect(route).toContain('.execute(payload as GradebookImportPersistenceBatchRequestV7);');
  });

  it('keeps V7 and V8 transport diagnostics metadata-only without reading private response text', () => {
    const v7Client = source('src/features/gradebook/import/import-persistence-client-v7.ts');
    const v8Client = source('src/features/gradebook/import/import-persistence-client-v8.ts');
    const hook = source('src/features/gradebook/import/use-import-batch.ts');

    expect(v7Client).toContain('responseContentKind(response)');
    expect(v7Client).not.toContain('await response.text()');
    expect(v8Client).not.toContain('await response.text()');
    expect(v8Client).toContain('GRADEBOOK_IMPORT_FAILURE_HEADER_V1');
    expect(hook).toContain("mode: 'values-v8'");
    expect(hook).toContain("state: 'transport-failed'");
    expect(hook).toContain("'[gradebook-import-server-failure]'");
  });
});
