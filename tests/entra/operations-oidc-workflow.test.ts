import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/entra-operations-audit.yml', 'utf8');

describe('Entra Operations OIDC workflow', () => {
  it('uses short-lived OIDC with read-only repository permissions', () => {
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("api%3A%2F%2FAzureADTokenExchange");
    expect(workflow).not.toContain("azure/login@");
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
    expect(workflow).toContain('ACTIONS_ID_TOKEN_REQUEST_URL');
    expect(workflow).toContain('client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
    expect(workflow).toContain('https://graph.microsoft.com/.default');
    expect(workflow).toContain('scripts/entra/operations-audit.ts');
  });
});
