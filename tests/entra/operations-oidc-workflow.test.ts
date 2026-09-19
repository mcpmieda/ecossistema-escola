import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/entra-operations-audit.yml', 'utf8');

describe('Entra Operations OIDC workflow', () => {
  it('uses short-lived OIDC with read-only repository permissions', () => {
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("allow-no-subscriptions: true");
    expect(workflow).toContain("azure/login@a641126d1b8aa4d1fa005f4f92df94a3a4c4c906");
  });

  it('uses repository variables instead of Microsoft client secrets', () => {
    for (const variable of [
      'ENTRA_TENANT_ID',
      'ENTRA_OPERATIONS_CLIENT_ID',
      'WEB_APPLICATION_OBJECT_ID',
      'GRAPH_APPLICATION_OBJECT_ID',
    ]) {
      expect(workflow).toContain(`vars.${variable}`);
    }
    expect(workflow).not.toContain('AZURE_CLIENT_SECRET');
    expect(workflow).not.toMatch(/secrets\.(ENTRA|AZURE|GRAPH|WEB)/u);
  });

  it('runs the real audit only on explicit workflow dispatch from main', () => {
    expect(workflow).toContain("if: github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain('test "$GITHUB_REF" = "refs/heads/main"');
    expect(workflow).toContain('az account get-access-token --resource-type ms-graph');
    expect(workflow).toContain('scripts/entra/operations-audit.ts');
  });
});
