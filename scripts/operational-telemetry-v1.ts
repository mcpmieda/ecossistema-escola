/** Read-only aggregate queries. Never export provider payloads, identifiers or log messages.
 * API contract: https://developers.cloudflare.com/api/resources/workers/subresources/observability/subresources/telemetry/methods/query/
 */
export type TelemetryStateV1 =
  | 'observed'
  | 'inconclusive'
  | 'partial'
  | 'credential-missing'
  | 'permission-required'
  | 'unavailable';
type SourceId = 'auth-result' | 'live-close' | 'edge-result' | 'operation' | 'native-outcome';
type Reason =
  | 'no-observed-events'
  | 'fields-unavailable'
  | 'source-not-configured'
  | 'invalid-response'
  | 'query-incomplete'
  | 'provider-unavailable'
  | 'permission-required'
  | 'credential-missing'
  | 'sampled-or-truncated';
export interface TelemetrySourceV1 {
  id: SourceId;
  state: TelemetryStateV1;
  reason?: Reason;
  rows: Array<{
    dimensions: Record<string, string | number>;
    count: number;
    elapsedMsP95?: number;
  }>;
  discardedGroups: number;
  maximumSampleInterval: number | null;
}
export interface OperationalTelemetryV1 {
  schemaVersion: 1;
  start: string;
  end: string;
  state: TelemetryStateV1;
  coverage: 'stored-logs-only';
  sources: TelemetrySourceV1[];
}
interface Options {
  accountId: string;
  token: string;
  start: Date;
  end: Date;
  fetcher?: typeof fetch;
}
type Dimension = { name: string; values: readonly string[] };
type Spec = { id: SourceId; event?: string; dimensions: Dimension[]; latency?: boolean };
const SPECS: Spec[] = [
  {
    id: 'auth-result',
    event: 'student-portal-auth-result-v1',
    dimensions: [
      { name: 'step', values: ['challenge', 'activate', 'login'] },
      {
        name: 'outcome',
        values: [
          'required',
          'issued',
          'denied',
          'blocked',
          'access-closed',
          'invalid-request',
          'unavailable',
        ],
      },
    ],
  },
  {
    id: 'live-close',
    event: 'student-portal-live-close-v1',
    dimensions: [
      { name: 'callback', values: ['close', 'error'] },
      {
        name: 'codeClass',
        values: [
          'normal',
          'going-away',
          'auth-expired',
          'no-status',
          'abnormal',
          'tls-reserved',
          'other-sendable',
          'other-invalid',
          'not-applicable',
        ],
      },
    ],
  },
  {
    id: 'operation',
    event: 'student-portal-operation-v1',
    latency: true,
    dimensions: [
      {
        name: 'operation',
        values: [
          'auth',
          'self',
          'admin-query',
          'admin-command',
          'cleanup',
          'publication',
          'live',
          'live-drain',
        ],
      },
      { name: 'outcome', values: ['ok', 'denied', 'unavailable'] },
    ],
  },
  {
    id: 'native-outcome',
    dimensions: [
      {
        name: '$workers.outcome',
        values: [
          'ok',
          'exception',
          'exceededCpu',
          'exceededMemory',
          'canceled',
          'unknown',
          'scriptNotFound',
          'responseStreamDisconnected',
        ],
      },
    ],
  },
];
const WORKER_FILTER = {
  key: '$workers.scriptName',
  operation: 'eq',
  type: 'string',
  value: 'student-portal-production',
};
const LIMIT = 100;
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const number = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= Number.MAX_SAFE_INTEGER;
function empty(id: SourceId, state: TelemetryStateV1, reason: Reason): TelemetrySourceV1 {
  return { id, state, reason, rows: [], discardedGroups: 0, maximumSampleInterval: null };
}
type ApiResult =
  | { state: 'observed'; result: unknown }
  | { state: 'permission-required' | 'unavailable'; reason: Reason };
async function request(
  options: Options,
  endpoint: 'keys' | 'query',
  body: unknown,
): Promise<ApiResult> {
  try {
    const response = await (options.fetcher ?? fetch)(
      `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/workers/observability/telemetry/${endpoint}`,
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (response.status === 401 || response.status === 403)
      return { state: 'permission-required', reason: 'permission-required' };
    if (!response.ok) return { state: 'unavailable', reason: 'provider-unavailable' };
    const payload = object(await response.json());
    if (payload.success !== true || !('result' in payload))
      return { state: 'unavailable', reason: 'invalid-response' };
    return { state: 'observed', result: payload.result };
  } catch {
    return { state: 'unavailable', reason: 'provider-unavailable' };
  }
}

/** Resolve only known field aliases; arbitrary provider keys cannot enter queries or reports. */
function field(keys: unknown[], name: string, type = 'string'): string | undefined {
  const aliases = name.startsWith('$') ? [name] : [name, `source.${name}`];
  return aliases.find((alias) =>
    keys.some((item) => object(item).key === alias && object(item).type === type),
  );
}
function groupDimensions(
  raw: unknown,
  spec: Spec,
  fields: string[],
): Record<string, string> | null {
  if (!Array.isArray(raw) || raw.length !== fields.length) return null;
  const result: Record<string, string> = {};
  for (let i = 0; i < fields.length; i++) {
    const dimension = spec.dimensions[i];
    if (!dimension) return null;
    const matches = raw.filter((item) => object(item).key === fields[i]);
    if (matches.length !== 1) return null;
    const value = object(matches[0]).value;
    if (typeof value !== 'string' || !dimension.values.includes(value)) return null;
    const outputName = dimension.name === '$workers.outcome' ? 'outcome' : dimension.name;
    result[outputName] = value;
  }
  return result;
}
function appendAggregate(
  source: TelemetrySourceV1,
  item: unknown,
  spec: Spec,
  fields: string[],
  latencyGroups: unknown[],
  seen: Set<string>,
): void {
  const aggregate = object(item);
  const dimensions = groupDimensions(aggregate.groups, spec, fields);
  const key = JSON.stringify(dimensions);
  if (
    !dimensions ||
    !number(aggregate.value) ||
    !Number.isSafeInteger(aggregate.value) ||
    seen.has(key)
  ) {
    source.discardedGroups++;
    return;
  }
  seen.add(key);
  if (number(aggregate.sampleInterval) && aggregate.sampleInterval >= 1) {
    source.maximumSampleInterval = Math.max(
      source.maximumSampleInterval ?? 1,
      aggregate.sampleInterval,
    );
  }
  if (aggregate.value === 0) return;
  const latency = object(
    latencyGroups.find(
      (group) => JSON.stringify(groupDimensions(object(group).groups, spec, fields)) === key,
    ),
  ).value;
  source.rows.push({
    dimensions,
    count: aggregate.value,
    ...(spec.latency && number(latency) ? { elapsedMsP95: latency } : {}),
  });
}
function parseCalculations(raw: unknown, spec: Spec, fields: string[]): TelemetrySourceV1 {
  const payload = object(raw);
  if (object(payload.run).status !== 'COMPLETED')
    return empty(spec.id, 'inconclusive', 'query-incomplete');
  if (!Array.isArray(payload.calculations))
    return empty(spec.id, 'unavailable', 'invalid-response');
  const counts = payload.calculations.filter((item) => object(item).alias === 'eventCount');
  if (counts.length !== 1 || !Array.isArray(object(counts[0]).aggregates))
    return empty(spec.id, 'unavailable', 'invalid-response');
  const aggregates = object(counts[0]).aggregates as unknown[];
  const p95 = payload.calculations.find((item) => object(item).alias === 'elapsedMsP95');
  const latencyGroups = Array.isArray(object(p95).aggregates)
    ? (object(p95).aggregates as unknown[])
    : [];
  const source: TelemetrySourceV1 = {
    id: spec.id,
    state: 'observed',
    rows: [],
    discardedGroups: 0,
    maximumSampleInterval: null,
  };
  const seen = new Set<string>();
  for (const item of aggregates.slice(0, LIMIT)) {
    appendAggregate(source, item, spec, fields, latencyGroups, seen);
  }
  if (
    source.discardedGroups > 0 ||
    aggregates.length >= LIMIT ||
    (source.maximumSampleInterval ?? 0) > 1
  ) {
    source.state = 'partial';
    source.reason = 'sampled-or-truncated';
  } else if (source.rows.length === 0) {
    source.state = 'inconclusive';
    source.reason = 'no-observed-events';
  }
  return source;
}
async function collectSource(
  options: Options,
  spec: Spec,
  keys: unknown[],
): Promise<TelemetrySourceV1> {
  const fields = spec.dimensions.map((dimension) => field(keys, dimension.name));
  const eventField = field(keys, 'event');
  const nativeType = field(keys, '$metadata.type');
  const elapsed = field(keys, 'elapsedMs', 'number');
  if (
    fields.some((key) => !key) ||
    (spec.event && !eventField) ||
    (!spec.event && !nativeType) ||
    (spec.latency && !elapsed)
  ) {
    return empty(spec.id, 'inconclusive', 'fields-unavailable');
  }
  const resolved = fields as string[];
  const filters = [
    WORKER_FILTER,
    spec.event
      ? { key: eventField, operation: 'eq', type: 'string', value: spec.event }
      : { key: nativeType, operation: 'eq', type: 'string', value: 'cf-worker-event' },
  ];
  const response = await request(options, 'query', {
    queryId: `operational-monitor-v1-${spec.id}`,
    dry: true,
    view: 'calculations',
    chartType: 'aggregate',
    ignoreSeries: true,
    limit: LIMIT,
    timeframe: { from: options.start.getTime(), to: options.end.getTime() },
    parameters: {
      filters,
      filterCombination: 'and',
      groupBys: resolved.map((value) => ({ value, type: 'string' })),
      calculations: [
        { operator: 'count', alias: 'eventCount' },
        ...(spec.latency
          ? [{ operator: 'p95', key: elapsed, keyType: 'number', alias: 'elapsedMsP95' }]
          : []),
      ],
    },
  });
  return response.state === 'observed'
    ? parseCalculations(response.result, spec, resolved)
    : empty(spec.id, response.state, response.reason);
}
function overall(sources: TelemetrySourceV1[]): TelemetryStateV1 {
  if (sources.every((source) => source.state === 'observed')) return 'observed';
  if (sources.every((source) => source.state === 'credential-missing')) return 'credential-missing';
  if (
    sources.every(
      (source) =>
        source.state === 'permission-required' || source.reason === 'source-not-configured',
    )
  )
    return 'permission-required';
  if (sources.some((source) => source.state === 'observed' || source.state === 'partial'))
    return 'partial';
  if (sources.some((source) => source.state === 'unavailable')) return 'unavailable';
  return 'inconclusive';
}
function validateOptions(options: Options): void {
  const startMs = options.start.getTime();
  const endMs = options.end.getTime();
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs ||
    endMs - startMs > 86_400_000
  )
    throw new Error('Invalid telemetry time window');
  if (options.accountId && !/^[a-f0-9]{32}$/i.test(options.accountId))
    throw new Error('Invalid Cloudflare account selector');
}
export async function collectOperationalTelemetryV1(
  options: Options,
): Promise<OperationalTelemetryV1> {
  validateOptions(options);
  const startMs = options.start.getTime();
  const endMs = options.end.getTime();
  let sources: TelemetrySourceV1[];
  if (!options.token || !options.accountId) {
    sources = [...SPECS.map((spec) => spec.id), 'edge-result' as const].map((id) =>
      empty(id, 'credential-missing', 'credential-missing'),
    );
  } else {
    const keys = await request(options, 'keys', {
      from: startMs,
      to: endMs,
      filters: [WORKER_FILTER],
      limit: 1000,
    });
    if (keys.state !== 'observed')
      sources = SPECS.map((spec) => empty(spec.id, keys.state, keys.reason));
    else if (!Array.isArray(keys.result))
      sources = SPECS.map((spec) => empty(spec.id, 'unavailable', 'invalid-response'));
    else
      sources = await Promise.all(
        SPECS.map((spec) => collectSource(options, spec, keys.result as unknown[])),
      );
    // Pages deployment script identifiers differ from the project name. Never guess a selector and report a false zero.
    sources.push(empty('edge-result', 'inconclusive', 'source-not-configured'));
  }
  return {
    schemaVersion: 1,
    start: options.start.toISOString(),
    end: options.end.toISOString(),
    state: overall(sources),
    coverage: 'stored-logs-only',
    sources,
  };
}

export interface OperationalHourlyTelemetryV1 {
  schemaVersion: 1;
  start: string;
  end: string;
  state: TelemetryStateV1;
  coverage: 'stored-logs-only';
  buckets: Array<{
    start: string;
    end: string;
    state: TelemetryStateV1;
    sources: TelemetrySourceV1[];
  }>;
}

/** At most 49 reads for 24 hours: one field discovery and two aggregates/hour.
 * Three bounded consumers cap concurrency; 20s request deadlines keep worst-case
 * network waiting below six minutes. Denial stops all not-yet-started queries.
 * Counts represent stored log events, never distinct students or online users.
 */
export async function collectOperationalHourlyTelemetryV1(
  options: Options,
): Promise<OperationalHourlyTelemetryV1> {
  validateOptions(options);
  const specs = SPECS.filter((spec) => spec.id === 'auth-result' || spec.id === 'native-outcome');
  const buckets: OperationalHourlyTelemetryV1['buckets'] = [];
  for (let cursor = options.start.getTime(); cursor < options.end.getTime(); cursor += 3_600_000) {
    buckets.push({
      start: new Date(cursor).toISOString(),
      end: new Date(Math.min(cursor + 3_600_000, options.end.getTime())).toISOString(),
      state: 'inconclusive',
      sources: [],
    });
  }
  const discovery: ApiResult | { state: 'credential-missing'; reason: 'credential-missing' } =
    !options.accountId || !options.token
      ? { state: 'credential-missing', reason: 'credential-missing' }
      : await request(options, 'keys', {
          from: options.start.getTime(),
          to: options.end.getTime(),
          filters: [WORKER_FILTER],
          limit: 1000,
        });
  const jobs = buckets.flatMap((bucket) => specs.map((spec) => ({ bucket, spec })));
  let next = 0;
  let denied = false;
  const consume = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      if (!job) return;
      const { bucket, spec } = job;
      let source: TelemetrySourceV1;
      if (denied) source = empty(spec.id, 'permission-required', 'permission-required');
      else if (discovery.state !== 'observed')
        source = empty(spec.id, discovery.state, discovery.reason);
      else if (!Array.isArray(discovery.result))
        source = empty(spec.id, 'unavailable', 'invalid-response');
      else
        source = await collectSource(
          { ...options, start: new Date(bucket.start), end: new Date(bucket.end) },
          spec,
          discovery.result,
        );
      if (source.state === 'permission-required') denied = true;
      bucket.sources.push(source);
    }
  };
  await Promise.all([consume(), consume(), consume()]);
  for (const bucket of buckets) {
    bucket.sources.sort((a, b) => a.id.localeCompare(b.id));
    bucket.state = overall(bucket.sources);
  }
  return {
    schemaVersion: 1,
    start: options.start.toISOString(),
    end: options.end.toISOString(),
    state: overall(buckets.flatMap((bucket) => bucket.sources)),
    coverage: 'stored-logs-only',
    buckets,
  };
}
