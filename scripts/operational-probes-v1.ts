export type OperationalProbeStateV1 = 'ok' | 'failed' | 'unavailable' | 'inconclusive';
export type OperationalProbeV1 = {
  id:
    | 'portal-health'
    | 'portal-document'
    | 'portal-access'
    | 'portal-status'
    | 'admin-document'
    | 'admin-health'
    | 'school-document'
    | 'portal-assets';
  state: OperationalProbeStateV1;
  healthy: boolean;
  durationMs: number;
  status?: number;
  headers?: { csp: boolean; hsts: boolean; nosniff: boolean };
  checkedAssets?: number;
};
export type OperationalProbesResultV1 = {
  contractVersion: 1;
  checkedAt: string;
  probes: OperationalProbeV1[];
  sonar: { state: OperationalProbeStateV1; status?: 'OK' | 'ERROR' | 'WARN' | 'NONE' };
};
const PORTAL = 'https://aluno.escolaieda.com';
const SONAR =
  'https://sonarcloud.io/api/qualitygates/project_status?projectKey=mcpmieda_ecossistema-escola';
const MAX_BYTES = 512_000;
const TIMEOUT_MS = 10_000;
type ResponseData = {
  status: number;
  contentType: string;
  body: string;
  headers: NonNullable<OperationalProbeV1['headers']>;
};

async function readBounded(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BYTES) throw new Error('response-limit');
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function request(url: string, fetcher: typeof fetch, body = true): Promise<ResponseData> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error('timeout'));
    }, TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      expired,
      (async () => {
        const response = await fetcher(url, {
          method: body ? 'GET' : 'HEAD',
          redirect: 'error',
          credentials: 'omit',
          signal: controller.signal,
        });
        const headers = {
          csp: Boolean(response.headers.get('content-security-policy')),
          hsts: Boolean(response.headers.get('strict-transport-security')),
          nosniff: response.headers.get('x-content-type-options')?.toLowerCase() === 'nosniff',
        };
        const contentType =
          response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
        const text = body ? await readBounded(response) : '';
        if (!body) await response.body?.cancel();
        return { status: response.status, headers, contentType, body: text };
      })(),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
function object(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function elapsed(start: number): number {
  return Math.max(0, Math.round(performance.now() - start));
}
const html = (data: ResponseData) =>
  data.contentType === 'text/html' && /<(?:!doctype\s+html|html)\b/i.test(data.body);
const json = (data: ResponseData) =>
  data.contentType === 'application/json' ? object(data.body) : {};
function portalStatus(data: ResponseData): boolean {
  const value = json(data);
  return value.contractVersion === 1 && value.state === 'status' && value.scope === 'school';
}
const routes = [
  {
    id: 'portal-health',
    url: `${PORTAL}/healthz`,
    valid: (data: ResponseData) => json(data).state === 'ok' && json(data).contractVersion === 1,
  },
  { id: 'portal-document', url: PORTAL + '/', valid: html },
  { id: 'portal-access', url: PORTAL + '/access', valid: html },
  { id: 'portal-status', url: PORTAL + '/api/student/status', valid: portalStatus },
  { id: 'admin-document', url: 'https://admin.escolaieda.com/', valid: html },
  {
    id: 'admin-health',
    url: 'https://admin.escolaieda.com/api/health',
    valid: (data: ResponseData) =>
      json(data).status === 'ok' && json(data).service === 'ecossistema-escola',
  },
  { id: 'school-document', url: 'https://escolaieda.com/', valid: html },
] as const;

function assetPaths(document: string): string[] {
  // Only simple, same-origin Vite assets; never accept arbitrary URLs from HTML.
  return [
    ...new Set(
      [
        ...document.matchAll(/(?:src|href)\s*=\s*["'](\/assets\/[A-Za-z0-9_-]+\.(?:js|css))["']/g),
      ].map((match) => match[1]!),
    ),
  ].slice(0, 5);
}
async function probeAssets(
  document: string | undefined,
  fetcher: typeof fetch,
): Promise<OperationalProbeV1> {
  const start = performance.now();
  const paths = assetPaths(document ?? '');
  if (!paths.length)
    return {
      id: 'portal-assets',
      state: 'inconclusive',
      healthy: false,
      durationMs: elapsed(start),
      checkedAssets: 0,
    };
  try {
    const checks = await Promise.all(
      paths.map(async (path) => {
        const response = await request(PORTAL + path, fetcher, false);
        const expected = path.endsWith('.css')
          ? ['text/css']
          : ['application/javascript', 'text/javascript'];
        return response.status === 200 && expected.includes(response.contentType);
      }),
    );
    const healthy = checks.every(Boolean);
    return {
      id: 'portal-assets',
      state: healthy ? 'ok' : 'failed',
      healthy,
      durationMs: elapsed(start),
      checkedAssets: checks.length,
    };
  } catch {
    return {
      id: 'portal-assets',
      state: 'unavailable',
      healthy: false,
      durationMs: elapsed(start),
      checkedAssets: 0,
    };
  }
}
async function probeSonar(fetcher: typeof fetch): Promise<OperationalProbesResultV1['sonar']> {
  try {
    const data = await request(SONAR, fetcher);
    if (data.status !== 200) return { state: 'unavailable' };
    const project = json(data).projectStatus;
    const status =
      project && typeof project === 'object' && 'status' in project ? project.status : undefined;
    if (status === 'OK' || status === 'ERROR' || status === 'WARN' || status === 'NONE') {
      return {
        state: status === 'OK' ? 'ok' : status === 'NONE' ? 'inconclusive' : 'failed',
        status,
      };
    }
    return { state: 'inconclusive' };
  } catch {
    return { state: 'unavailable' };
  }
}

/** Fixed anonymous, read-only probes. Availability is not authenticated-use validation. */
export async function collectOperationalProbesV1(
  options: { fetcher?: typeof fetch; now?: Date } = {},
): Promise<OperationalProbesResultV1> {
  const fetcher = options.fetcher ?? fetch;
  let document: string | undefined;
  const probes = await Promise.all(
    routes.map(async (route): Promise<OperationalProbeV1> => {
      const start = performance.now();
      try {
        const data = await request(route.url, fetcher);
        const healthy = data.status === 200 && route.valid(data);
        if (route.id === 'portal-document' && healthy) document = data.body;
        return {
          id: route.id,
          state: healthy ? 'ok' : 'failed',
          healthy,
          status: data.status,
          durationMs: elapsed(start),
          headers: data.headers,
        };
      } catch {
        return { id: route.id, state: 'unavailable', healthy: false, durationMs: elapsed(start) };
      }
    }),
  );
  const [assets, sonar] = await Promise.all([probeAssets(document, fetcher), probeSonar(fetcher)]);
  return {
    contractVersion: 1,
    checkedAt: (options.now ?? new Date()).toISOString(),
    probes: [...probes, assets],
    sonar,
  };
}
