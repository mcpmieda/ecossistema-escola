import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('Gradebook import V7 scale guard', () => {
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

  it('keeps non-JSON transport diagnostics metadata-only', () => {
    const client = source('src/features/gradebook/import/import-persistence-client-v7.ts');
    const hook = source('src/features/gradebook/import/use-import-batch.ts');

    expect(client).toContain('responseContentKind(response)');
    expect(client).not.toContain('await response.text()');
    expect(hook).toContain("state: 'transport-failed'");
    expect(hook).toContain('httpStatus: cause.status');
    expect(hook).toContain('contentKind: cause.contentKind');
  });
});
