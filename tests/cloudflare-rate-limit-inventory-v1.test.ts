import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { inspectCloudflareRateLimitsV1 } from '../scripts/cloudflare-rate-limit-inventory-v1';

const ACCOUNT = 'a'.repeat(32);
const PORTAL = 'student-portal-production';
const VERSION = '11111111-1111-1111-1111-111111111111';
const SECOND = '22222222-2222-2222-2222-222222222222';
const TOKEN = 'synthetic-private-token';
const NOW = new Date('2026-10-05T16:00:00Z');
const rate = (name = 'PORTAL_SESSION_ACCOUNT', namespace_id = '3101249') => ({
  type: 'ratelimit',
  name,
  namespace_id,
  simple: { limit: 120, period: 60 },
});
const secret = { type: 'plain_text', name: 'SYNTHETIC_PRIVATE', text: 'never-publish-this-value' };
const json = (result: unknown, extras: object = {}) =>
  Response.json({ success: true, result, ...extras });

type Fixture = {
  scripts?: string[];
  settings?: Record<string, unknown[]>;
  versions?: Record<string, unknown[]>;
  active?: Array<{ version_id: string; percentage: number }>;
  override?: (url: string) => Response | undefined;
};
function fixture(input: Fixture = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = vi.fn<typeof fetch>(async (target, init) => {
    const url = String(target);
    calls.push({ url, init });
    const override = input.override?.(url);
    if (override) return override;
    const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts`;
    if (url === base)
      return json((input.scripts ?? [PORTAL, 'other-worker']).map((id) => ({ id })));
    const suffix = url.slice(base.length + 1).split('/');
    const script = suffix[0]!;
    if (suffix[1] === 'settings') return json({ bindings: input.settings?.[script] ?? [secret] });
    if (suffix[1] === 'deployments')
      return json({
        deployments: [
          {
            versions: input.active ?? [{ version_id: VERSION, percentage: 100 }],
            author_email: 'never-publish-author@example.invalid',
          },
        ],
      });
    if (suffix[1] === 'versions')
      return json({
        id: suffix[2],
        resources: { bindings: input.versions?.[`${script}/${suffix[2]}`] ?? [secret] },
        metadata: { author_email: 'never-publish-author@example.invalid' },
      });
    throw new Error('Unexpected endpoint with private payload');
  });
  return { fetcher, calls };
}
const inspect = (fetcher: typeof fetch, token = TOKEN) =>
  inspectCloudflareRateLimitsV1({ accountId: ACCOUNT, token, fetcher, now: NOW });

describe('bounded Cloudflare rate limit metadata inventory', () => {
  it('reads every listed Worker settings and current version with GET only and strips private fields', async () => {
    const { fetcher, calls } = fixture();
    const result = await inspect(fetcher);
    expect(result).toMatchObject({
      state: 'accessible',
      complete: true,
      scriptsInspected: 2,
      activeVersionsInspected: 2,
      checkedAt: NOW.toISOString(),
    });
    expect(result.namespaces).toHaveLength(11);
    expect(result.namespaces.every((entry) => entry.state === 'unused')).toBe(true);
    expect(result.portal.activeVersions).toEqual([
      { versionId: VERSION, percentage: 100, bindings: [] },
    ]);
    expect(calls).toHaveLength(7);
    for (const call of calls) {
      expect(call.init?.method).toBe('GET');
      expect(call.init?.redirect).toBe('error');
      expect(call.init?.body).toBeUndefined();
      expect(call.init?.headers).toEqual({
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/json',
      });
      expect(call.url).toMatch(
        /^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/[a-f0-9]{32}\/workers\/scripts(?:\/[a-z0-9_-]+\/(?:settings|deployments|versions\/[a-f0-9-]+))?$/u,
      );
    }
    const output = JSON.stringify(result);
    for (const forbidden of [
      TOKEN,
      'never-publish',
      'SYNTHETIC_PRIVATE',
      'other-worker',
      'plain_text',
    ])
      expect(output).not.toContain(forbidden);
  });

  it('reports Portal-only tuples without claiming the configured quota is approved', async () => {
    const { fetcher } = fixture({
      settings: { [PORTAL]: [rate()] },
      versions: { [`${PORTAL}/${VERSION}`]: [rate()] },
    });
    const result = await inspect(fetcher);
    expect(result.namespaces[0]).toEqual({
      namespaceId: '3101249',
      state: 'portal-only',
      foreignWorkers: 0,
      portalBindingNames: ['PORTAL_SESSION_ACCOUNT'],
    });
    expect(result.portal.settings).toEqual([
      { name: 'PORTAL_SESSION_ACCOUNT', namespaceId: '3101249', limit: 120, period: 60 },
    ]);
    expect(result.portal.activeVersions[0]?.bindings).toEqual(result.portal.settings);
  });

  it.each(['settings', 'active-version'])(
    'finds collisions in another Worker %s',
    async (source) => {
      const binding = rate('OTHER_LIMITER');
      const { fetcher } = fixture(
        source === 'settings'
          ? { settings: { 'other-worker': [binding] } }
          : { versions: { [`other-worker/${VERSION}`]: [binding] } },
      );
      const result = await inspect(fetcher);
      expect(result.complete).toBe(true);
      expect(result.namespaces[0]).toMatchObject({ state: 'collision', foreignWorkers: 1 });
      expect(JSON.stringify(result)).not.toContain('OTHER_LIMITER');
    },
  );

  it('inspects both gradual versions, including 0% versions callable by override', async () => {
    const { fetcher, calls } = fixture({
      active: [
        { version_id: VERSION, percentage: 100 },
        { version_id: SECOND, percentage: 0 },
      ],
      versions: { [`other-worker/${SECOND}`]: [rate()] },
    });
    const result = await inspect(fetcher);
    expect(result.activeVersionsInspected).toBe(4);
    expect(result.namespaces[0]?.state).toBe('collision');
    expect(calls.filter((call) => call.url.includes(`/versions/${SECOND}`))).toHaveLength(2);
  });

  it('finds accidental reuse by different Portal binding names', async () => {
    const { fetcher } = fixture({ settings: { [PORTAL]: [rate('A'), rate('B')] } });
    expect((await inspect(fetcher)).namespaces[0]).toMatchObject({
      state: 'collision',
      portalBindingNames: ['A', 'B'],
    });
  });

  it.each([401, 403, 404, 429, 500])(
    'fails closed on HTTP %s without leaking provider errors',
    async (status) => {
      const { fetcher } = fixture({
        override: (url) =>
          url.endsWith('/settings')
            ? Response.json({ errors: ['private provider failure'] }, { status })
            : undefined,
      });
      const result = await inspect(fetcher);
      expect(result.complete).toBe(false);
      expect(result.state).toBe(
        status === 401 || status === 403
          ? 'permission-required'
          : status === 404
            ? 'not-found'
            : 'unavailable',
      );
      expect(result.namespaces.every((entry) => entry.state === 'unverified')).toBe(true);
      expect(JSON.stringify(result)).not.toContain('private provider failure');
    },
  );

  it('rejects a truncated or changed listing rather than declaring all namespaces unused', async () => {
    const { fetcher, calls } = fixture({
      override: (url) =>
        url.endsWith('/scripts')
          ? json([{ id: PORTAL }], { result_info: { total_count: 2 } })
          : undefined,
    });
    expect(await inspect(fetcher)).toMatchObject({ state: 'inconclusive', complete: false });
    expect(calls).toHaveLength(1);
  });

  it.each([null, {}, { count: 2, total_count: 2, page: 1, total_pages: 1, per_page: 100 }])(
    'accepts coherent SinglePage metadata (%j)',
    async (result_info) => {
      const { fetcher } = fixture({
        override: (url) =>
          url.endsWith('/scripts')
            ? json([{ id: PORTAL }, { id: 'other-worker' }], { result_info })
            : undefined,
      });
      expect(await inspect(fetcher)).toMatchObject({ state: 'accessible', complete: true });
    },
  );

  it('bounds account inventory before following any Worker name', async () => {
    const { fetcher, calls } = fixture({
      scripts: Array.from({ length: 101 }, (_, index) => `worker-${index}`),
    });
    expect(await inspect(fetcher)).toMatchObject({ state: 'inconclusive', complete: false });
    expect(calls).toHaveLength(1);
  });

  it.each(['../secrets', 'worker?filter=private', 'https://private.example', 'worker\nprivate'])(
    'rejects unsafe provider script selector %s',
    async (name) => {
      const { fetcher, calls } = fixture({ scripts: [name] });
      expect(await inspect(fetcher)).toMatchObject({ state: 'inconclusive', complete: false });
      expect(calls).toHaveLength(1);
    },
  );

  it.each([
    { ...rate(), namespace_id: '03101249' },
    { ...rate(), namespace_id: 3101249 },
    { ...rate(), simple: { limit: 120, period: 45 } },
    { ...rate(), simple: { limit: -1, period: 60 } },
    { ...rate(), name: 'bad\nname' },
  ])('does not ignore a malformed rate-limit binding (%j)', async (binding) => {
    const { fetcher } = fixture({ settings: { [PORTAL]: [binding] } });
    const result = await inspect(fetcher);
    expect(result).toMatchObject({ state: 'inconclusive', complete: false });
    expect(result.namespaces.every((entry) => entry.state === 'unverified')).toBe(true);
  });

  it.each(
    [
      [{ version_id: VERSION, percentage: 80 }],
      [{ version_id: VERSION, percentage: -1 }],
      [{ version_id: 'invalid', percentage: 100 }],
      [
        { version_id: VERSION, percentage: 50 },
        { version_id: VERSION, percentage: 50 },
      ],
      [],
    ].map((active) => ({ active })),
  )('rejects malformed current deployment (%j)', async ({ active }) => {
    const { fetcher } = fixture({ active });
    expect(await inspect(fetcher)).toMatchObject({ state: 'inconclusive', complete: false });
  });

  it('rejects absent binding metadata and mismatched version identity', async () => {
    for (const body of [
      { id: VERSION, resources: {} },
      { id: SECOND, resources: { bindings: [] } },
    ]) {
      const { fetcher } = fixture({
        override: (url) => (url.includes('/versions/') ? json(body) : undefined),
      });
      expect(await inspect(fetcher)).toMatchObject({ state: 'inconclusive', complete: false });
    }
  });

  it('bounds the decoded response and never exports oversized payloads', async () => {
    const { fetcher } = fixture({ override: () => json({ private: 'x'.repeat(2 * 1024 * 1024) }) });
    expect(await inspect(fetcher)).toMatchObject({ state: 'inconclusive', complete: false });
  });

  it('does not open network without the existing credential and rejects invalid account selectors', async () => {
    const { fetcher } = fixture();
    expect(await inspect(fetcher, '')).toMatchObject({
      state: 'credential-missing',
      complete: false,
    });
    await expect(
      inspectCloudflareRateLimitsV1({ accountId: '../other', token: TOKEN, fetcher }),
    ).rejects.toThrow('Invalid Cloudflare account selector');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('sanitizes transport failures without interpreting them as absence', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new Error('private secret value');
    });
    const result = await inspect(fetcher);
    expect(result).toMatchObject({ state: 'unavailable', complete: false });
    expect(JSON.stringify(result)).not.toContain('private secret value');
  });

  it('keeps the extension in the existing owner-authorized manual Portal diagnostic', () => {
    const workflow = readFileSync('.github/workflows/cloudflare-on-demand.yml', 'utf8');
    const execute = workflow.split('\n  execute:')[1]!.split('\n  monitor:')[0]!;
    const monitor = workflow.split('\n  monitor:')[1]!;
    expect(execute).toContain('github.actor_id == github.repository_owner_id');
    expect(execute).toContain('ref: refs/heads/main');
    expect(execute).toContain("steps.request.outputs.operation == 'portal'");
    expect(execute).toContain('scripts/cloudflare-rate-limit-inventory-v1.ts');
    expect(execute).toContain('secrets.CLOUDFLARE_DEPLOY_TOKEN');
    expect(monitor).not.toContain('cloudflare-rate-limit-inventory');
    expect(workflow).not.toContain('pull_request_target');
  });
});
