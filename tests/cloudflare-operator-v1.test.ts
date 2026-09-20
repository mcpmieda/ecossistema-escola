import { describe, expect, it, vi } from 'vitest';
import { probeCloudflareCapabilitiesV1 } from '../scripts/cloudflare-operator-v1';

const ACCOUNT = 'a'.repeat(32);
const NOW = new Date('2026-09-20T16:00:00.000Z');

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Cloudflare read-only operator', () => {
  it('fails before network access when the account selector is invalid', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      probeCloudflareCapabilitiesV1({
        accountId: 'invalid',
        token: 'secret',
        tokenKind: 'deploy',
        fetcher,
        now: NOW,
      }),
    ).rejects.toThrow('Invalid Cloudflare account selector');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reports a missing existing credential without making requests', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await probeCloudflareCapabilitiesV1({
      accountId: ACCOUNT,
      token: '',
      tokenKind: 'hyperdrive',
      fetcher,
      now: NOW,
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.capabilities).toHaveLength(5);
    expect(result.capabilities.every((item) => item.state === 'credential-missing')).toBe(true);
  });

  it('probes only the fixed read/query allowlist and sanitizes provider outcomes', async () => {
    const token = 'synthetic-super-secret-token';
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith('/workers/scripts')) return json({ success: true, result: [] });
      if (url.includes('/pages/projects')) return json({ success: false }, 403);
      if (url.includes('/hyperdrive/configs')) return json({ success: false }, 500);
      if (url.includes('/zones?')) return json({ success: false, errors: [{ message: 'private' }] });
      if (url.endsWith('/graphql'))
        return json({ data: { viewer: { accounts: [] } }, errors: null });
      throw new Error('Unexpected URL');
    });

    const result = await probeCloudflareCapabilitiesV1({
      accountId: ACCOUNT,
      token,
      tokenKind: 'deploy',
      fetcher,
      now: NOW,
    });

    expect(result.capabilities.map(({ id, state }) => [id, state])).toEqual([
      ['workers.scripts.read', 'accessible'],
      ['pages.projects.read', 'permission-required'],
      ['hyperdrive.configs.read', 'unavailable'],
      ['zones.read', 'inconclusive'],
      ['analytics.workers.read', 'accessible'],
    ]);
    expect(calls).toHaveLength(5);
    for (const call of calls.slice(0, 4)) expect(call.init?.method).toBe('GET');
    expect(calls[4]?.init?.method).toBe('POST');
    const graphqlBody = JSON.parse(String(calls[4]?.init?.body));
    expect(graphqlBody.query).toContain('query CapabilityProbe');
    expect(graphqlBody.query).not.toContain('mutation');
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it('treats GraphQL application errors as inconclusive instead of requesting a new token', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/graphql')) return json({ data: null, errors: [{ message: 'denied' }] });
      return json({ success: true, result: [] });
    });
    const result = await probeCloudflareCapabilitiesV1({
      accountId: ACCOUNT,
      token: 'synthetic',
      tokenKind: 'deploy',
      fetcher,
      now: NOW,
    });
    expect(result.capabilities.find((item) => item.id === 'analytics.workers.read')?.state).toBe(
      'inconclusive',
    );
  });

  it('maps transport failures to unavailable without exposing the error', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new Error('provider secret diagnostic');
    });
    const result = await probeCloudflareCapabilitiesV1({
      accountId: ACCOUNT,
      token: 'synthetic',
      tokenKind: 'deploy',
      fetcher,
      now: NOW,
    });
    expect(result.capabilities.every((item) => item.state === 'unavailable')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('provider secret diagnostic');
  });
});
