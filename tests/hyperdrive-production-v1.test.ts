import { describe, expect, it, vi } from 'vitest';
import { configureProductionHyperdriveV1, hyperdrivePatchV1 } from '../scripts/hyperdrive-production-v1';

const accountId = 'a'.repeat(32);
const token = 'synthetic-test-token';
const gradebook = '476b417597c84b4c994bd36f1a65cb70';
const portal = '46ac2fcb25ad4ad5b5662d536ccd968a';
const response = (result: unknown, status = 200) => new Response(JSON.stringify({ success: status === 200, result }),
  { status, headers: { 'Content-Type': 'application/json' } });
function stored(name: 'gradebook' | 'portal', limit: number, disabled: boolean) {
  return { origin: { user: name === 'gradebook' ? 'gradebook_app' : 'student_portal_app', host: 'synthetic.invalid', database: 'synthetic' },
    origin_connection_limit: limit, caching: { disabled } };
}
describe('production Hyperdrive safety and capacity #806', () => {
  it('changes only the cache flag and upper origin pool budget', () => {
    expect(hyperdrivePatchV1('gradebook', stored('gradebook', 50, false)))
      .toEqual({ caching: { disabled: true }, origin_connection_limit: 20 });
    expect(hyperdrivePatchV1('portal', stored('portal', 10, false)))
      .toEqual({ caching: { disabled: true }, origin_connection_limit: 8 });
    expect(hyperdrivePatchV1('portal', stored('portal', 5, true))).toEqual({ caching: { disabled: true }, origin_connection_limit: 5 });
    expect(() => hyperdrivePatchV1('portal', stored('gradebook', 10, false))).toThrow('Unexpected');
    expect(() => hyperdrivePatchV1('portal', { origin: { user: 'student_portal_app' } })).toThrow('Unknown');
  });
  it('does not write already compliant settings', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      expect(init?.method).toBeUndefined();
      return response(String(url).endsWith(gradebook) ? stored('gradebook', 20, true) : stored('portal', 8, true));
    });
    expect(await configureProductionHyperdriveV1({ accountId, token, apply: true, fetcher })).toEqual([
      { name: 'gradebook', state: 'verified', cacheDisabled: true, originConnections: 20 },
      { name: 'portal', state: 'verified', cacheDisabled: true, originConnections: 8 },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('verifies each successful patch with an independent GET and never includes origin secrets', async () => {
    const configs = new Map([[gradebook, stored('gradebook', 50, false)], [portal, stored('portal', 10, false)]]);
    const writes: unknown[] = [];
    const fetcher = vi.fn<typeof fetch>(async (raw, init) => {
      const url = new URL(String(raw));
      expect(url.origin).toBe('https://api.cloudflare.com');
      expect(init?.redirect).toBe('error');
      const id = url.pathname.split('/').at(-1)!;
      const value = configs.get(id)!;
      if (init?.method === 'PATCH') {
        const patch = JSON.parse(String(init.body)) as { caching: { disabled: boolean }; origin_connection_limit: number };
        writes.push(patch); configs.set(id, { ...value, ...patch }); return response({ accepted: true });
      }
      return response(value);
    });
    const result = await configureProductionHyperdriveV1({ accountId, token, apply: true, fetcher });
    expect(result.every((item) => item.state === 'updated')).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(writes).toEqual([{ caching: { disabled: true }, origin_connection_limit: 20 }, { caching: { disabled: true }, origin_connection_limit: 8 }]);
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain('synthetic.invalid');
  });
  it('stops at permission denial without searching for a bypass or changing another resource', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response({}, 403));
    const result = await configureProductionHyperdriveV1({ accountId, token, apply: true, fetcher });
    expect(result.map((item) => item.state)).toEqual(['permission-required', 'permission-required']);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([, init]) => init?.method === undefined)).toBe(true);
  });
  it('does not claim a PATCH response proved the final state', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, init) => init?.method === 'PATCH'
      ? response({ accepted: true }) : response(String(url).endsWith(gradebook) ? stored('gradebook', 50, false) : stored('portal', 10, false)));
    const result = await configureProductionHyperdriveV1({ accountId, token, apply: true, fetcher });
    expect(result.every((item) => item.state === 'unavailable')).toBe(true);
  });
});
