import { describe, expect, it, vi } from 'vitest';
import {
  collectOperationalTelemetryV1,
  collectOperationalHourlyTelemetryV1,
} from '../scripts/operational-telemetry-v1';

const options = {
  accountId: 'a'.repeat(32),
  token: 'credential-not-for-output',
  start: new Date('2026-09-29T12:00:00Z'),
  end: new Date('2026-09-29T12:15:00Z'),
};
const keys = [
  'event',
  'step',
  'outcome',
  'callback',
  'codeClass',
  'operation',
  '$workers.outcome',
  '$metadata.type',
].map((key) => ({ key, type: 'string' }));
keys.push({ key: 'elapsedMs', type: 'number' });
function json(result: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, result }), { status });
}
function aggregate(groups: Record<string, unknown>, value: unknown, sampleInterval: unknown = 1) {
  return {
    groups: Object.entries(groups).map(([key, value]) => ({ key, value })),
    value,
    sampleInterval,
  };
}
function result(aggregates: unknown[]) {
  return { run: { status: 'COMPLETED' }, calculations: [{ alias: 'eventCount', aggregates }] };
}
function mockFetch(authResult: unknown) {
  return vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).endsWith('/keys')) return json(keys);
    const body = JSON.parse(String(init?.body)) as { queryId: string };
    return json(body.queryId.endsWith('auth-result') ? authResult : result([]));
  });
}
describe('operational hourly telemetry', () => {
  const daily = {
    ...options,
    start: new Date('2026-09-28T03:00:00Z'),
    end: new Date('2026-09-29T03:00:00Z'),
  };
  it('uses one discovery, 48 bounded aggregate queries, and at most three concurrent requests', async () => {
    let active = 0;
    let maximum = 0;
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith('/keys')) return json(keys);
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      const body = JSON.parse(String(init?.body));
      expect(body.timeframe.to - body.timeframe.from).toBe(3_600_000);
      expect(body.queryId).toMatch(/(auth-result|native-outcome)$/);
      return json(
        result(
          body.queryId.endsWith('auth-result')
            ? [aggregate({ step: 'login', outcome: 'issued' }, 2)]
            : [aggregate({ '$workers.outcome': 'ok' }, 5)],
        ),
      );
    });
    const report = await collectOperationalHourlyTelemetryV1({ ...daily, fetcher });
    expect(fetcher).toHaveBeenCalledTimes(49);
    expect(maximum).toBe(3);
    expect(report.buckets).toHaveLength(24);
    expect(report.buckets[0]?.start).toBe(daily.start.toISOString());
    expect(report.buckets[23]?.end).toBe(daily.end.toISOString());
    expect(report.state).toBe('observed');
    expect(
      report.buckets.every((bucket) => bucket.state === 'observed' && bucket.sources.length === 2),
    ).toBe(true);
  });
  it('stops queued work on denial and never invents zero traffic for unavailable buckets', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith('/keys') ? json(keys) : new Response('private-denial', { status: 403 }),
    );
    const report = await collectOperationalHourlyTelemetryV1({ ...daily, fetcher });
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(4);
    expect(report.state).toBe('permission-required');
    expect(
      report.buckets.every((bucket) =>
        bucket.sources.every(
          (source) => source.state === 'permission-required' && source.rows.length === 0,
        ),
      ),
    ).toBe(true);
    expect(JSON.stringify(report)).not.toContain('private-denial');
  });
  it('bounds partial last hours, sanitizes every bucket, and avoids calls without credentials', async () => {
    const fetcher = mockFetch(result([aggregate({ step: 'login', outcome: 'private-name' }, 3)]));
    const report = await collectOperationalHourlyTelemetryV1({ ...options, fetcher });
    expect(report.buckets).toHaveLength(1);
    expect(report.buckets[0]?.end).toBe(options.end.toISOString());
    expect(JSON.stringify(report)).not.toContain('private-name');
    const missingFetcher = vi.fn<typeof fetch>();
    const missing = await collectOperationalHourlyTelemetryV1({
      ...daily,
      token: '',
      fetcher: missingFetcher,
    });
    expect(missing.state).toBe('credential-missing');
    expect(missingFetcher).not.toHaveBeenCalled();
    await expect(
      collectOperationalHourlyTelemetryV1({
        ...daily,
        end: new Date('2026-10-01T03:00:00Z'),
        fetcher,
      }),
    ).rejects.toThrow('Invalid telemetry time window');
  });
});
describe('operational telemetry read-only aggregates', () => {
  it('queries only fixed scopes and aggregates without saving queries or requesting raw events', async () => {
    const fetcher = mockFetch(result([aggregate({ step: 'login', outcome: 'issued' }, 3)]));
    const report = await collectOperationalTelemetryV1({ ...options, fetcher });
    expect(report.sources[0]?.rows).toEqual([
      { dimensions: { step: 'login', outcome: 'issued' }, count: 3 },
    ]);
    expect(report.coverage).toBe('stored-logs-only');
    for (const [url, init] of fetcher.mock.calls) {
      expect(String(url)).toMatch(/\/telemetry\/(keys|query)$/);
      expect(init?.method).toBe('POST');
      expect(init?.redirect).toBe('error');
      const body = JSON.parse(String(init?.body));
      if (String(url).endsWith('/query')) {
        expect(body).toMatchObject({
          dry: true,
          view: 'calculations',
          chartType: 'aggregate',
          ignoreSeries: true,
        });
        expect(body.parameters.filters[0]).toMatchObject({
          key: '$workers.scriptName',
          value: 'student-portal-production',
        });
      }
    }
    expect(JSON.stringify(report)).not.toContain(options.token);
    expect(JSON.stringify(report)).not.toContain(options.accountId);
  });
  it('drops unrecognized enums, extra dimensions and invalid numbers rather than publishing them', async () => {
    const payload = result([
      aggregate({ step: 'login', outcome: 'private-student-name' }, 3),
      aggregate({ step: 'login', outcome: 'issued', secret: 'private-secret' }, 4),
      aggregate({ step: 'activate', outcome: 'issued' }, -1),
      aggregate({ step: 'challenge', outcome: 'required' }, '5'),
      aggregate({ step: 'login', outcome: 'denied' }, 1),
    ]);
    Object.assign(payload, {
      events: [{ source: 'private-raw-log' }],
      accountId: options.accountId,
    });
    const report = await collectOperationalTelemetryV1({ ...options, fetcher: mockFetch(payload) });
    expect(report.sources[0]).toMatchObject({
      state: 'partial',
      discardedGroups: 4,
      rows: [{ dimensions: { step: 'login', outcome: 'denied' }, count: 1 }],
    });
    expect(JSON.stringify(report)).not.toMatch(/private-|credential-/);
  });
  it('does not label absence of traffic or missing indexed fields as healthy', async () => {
    const report = await collectOperationalTelemetryV1({
      ...options,
      fetcher: mockFetch(result([])),
    });
    expect(report.state).toBe('inconclusive');
    expect(report.sources[0]).toMatchObject({
      state: 'inconclusive',
      reason: 'no-observed-events',
    });
    const missing = await collectOperationalTelemetryV1({
      ...options,
      fetcher: async () => json([]),
    });
    expect(missing.sources[0]).toMatchObject({
      state: 'inconclusive',
      reason: 'fields-unavailable',
    });
  });
  it.each([401, 403])(
    'classifies HTTP %i without emitting provider errors or circumventing access',
    async (status) => {
      const fetcher = vi.fn<typeof fetch>(
        async () => new Response('secret denied details', { status }),
      );
      const report = await collectOperationalTelemetryV1({ ...options, fetcher });
      expect(report.state).toBe('permission-required');
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(report)).not.toContain('secret denied');
    },
  );
  it('fails missing credentials without network calls and validates window bounds', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const report = await collectOperationalTelemetryV1({ ...options, token: '', fetcher });
    expect(report.state).toBe('credential-missing');
    expect(fetcher).not.toHaveBeenCalled();
    await expect(
      collectOperationalTelemetryV1({ ...options, end: new Date('2026-10-01T00:00:00Z'), fetcher }),
    ).rejects.toThrow('Invalid telemetry time window');
    await expect(
      collectOperationalTelemetryV1({ ...options, accountId: '../secret', fetcher }),
    ).rejects.toThrow('Invalid Cloudflare account selector');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('marks sampled data, unfinished queries and malformed envelopes explicitly', async () => {
    const sampled = await collectOperationalTelemetryV1({
      ...options,
      fetcher: mockFetch(result([aggregate({ step: 'login', outcome: 'issued' }, 5, 10)])),
    });
    expect(sampled.sources[0]).toMatchObject({ state: 'partial', maximumSampleInterval: 10 });
    const incomplete = await collectOperationalTelemetryV1({
      ...options,
      fetcher: mockFetch({ run: { status: 'STARTED' } }),
    });
    expect(incomplete.sources[0]).toMatchObject({
      state: 'inconclusive',
      reason: 'query-incomplete',
    });
    const invalid = await collectOperationalTelemetryV1({
      ...options,
      fetcher: async () => json({ arbitrary: 'secret' }),
    });
    expect(invalid.state).toBe('unavailable');
  });
  it('keeps each query independent when one fails and never copies thrown exception messages', async () => {
    const base = mockFetch(result([aggregate({ step: 'login', outcome: 'issued' }, 2)]));
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (String(init?.body).includes('operational-monitor-v1-live-close'))
        throw new Error('private-token-url');
      return base(url, init);
    });
    const report = await collectOperationalTelemetryV1({ ...options, fetcher });
    expect(report.sources[0]?.state).toBe('observed');
    expect(report.sources[1]?.state).toBe('unavailable');
    expect(JSON.stringify(report)).not.toContain('private-token-url');
  });
  it('matches operation latency to the same bounded group and supports indexed source aliases', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith('/keys'))
        return json(
          keys.map((item) => ({
            ...item,
            key: item.key.startsWith('$') ? item.key : `source.${item.key}`,
          })),
        );
      const body = JSON.parse(String(init?.body));
      if (!body.queryId.endsWith('operation')) return json(result([]));
      expect(body.parameters.filters[1].key).toBe('source.event');
      const dimensions = { 'source.operation': 'auth', 'source.outcome': 'ok' };
      return json({
        run: { status: 'COMPLETED' },
        calculations: [
          { alias: 'eventCount', aggregates: [aggregate(dimensions, 10)] },
          { alias: 'elapsedMsP95', aggregates: [aggregate(dimensions, 148.2)] },
        ],
      });
    });
    const report = await collectOperationalTelemetryV1({ ...options, fetcher });
    expect(report.sources.find((source) => source.id === 'operation')?.rows).toEqual([
      { dimensions: { operation: 'auth', outcome: 'ok' }, count: 10, elapsedMsP95: 148.2 },
    ]);
  });
});
