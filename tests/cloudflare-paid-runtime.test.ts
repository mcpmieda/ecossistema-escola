import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('Cloudflare Workers Paid runtime configuration', () => {
  it('pins the Pages Functions CPU safety envelope to 30 seconds', () => {
    const config = JSON.parse(source('wrangler.jsonc')) as {
      readonly limits?: { readonly cpu_ms?: unknown };
      readonly env?: { readonly production?: { readonly limits?: unknown } };
    };

    expect(config.limits).toEqual({ cpu_ms: 30_000 });
    expect(config.env?.production?.limits).toBeUndefined();
  });

  it('keeps the production D1 binding private while deploying the inherited CPU limit', () => {
    const config = source('wrangler.jsonc');
    const workflow = source('.github/workflows/deploy-cloudflare-pages.yml');

    expect(config).not.toContain('database_id');
    expect(config).not.toContain('GRADEBOOK_D1');
    expect(workflow).toContain('GRADEBOOK_D1_BINDING_CONFIG');
    expect(workflow).toContain('d1_databases: [binding]');
    expect(workflow).toContain("config.env.production = {");
    expect(workflow).not.toContain('cpu_ms');
  });
});
