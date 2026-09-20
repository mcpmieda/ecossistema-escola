import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export type CloudflareTokenKindV1 = 'deploy' | 'hyperdrive';
export type CloudflareCapabilityStateV1 =
  | 'accessible'
  | 'permission-required'
  | 'inconclusive'
  | 'unavailable'
  | 'credential-missing';

export type CloudflareCapabilityV1 = {
  id:
    | 'workers.scripts.read'
    | 'pages.projects.read'
    | 'hyperdrive.configs.read'
    | 'zones.read'
    | 'analytics.workers.read';
  label: string;
  state: CloudflareCapabilityStateV1;
};

export type CloudflareProbeResultV1 = {
  contractVersion: 1;
  tokenKind: CloudflareTokenKindV1;
  checkedAt: string;
  capabilities: CloudflareCapabilityV1[];
};

type Fetcher = typeof fetch;
type JsonObject = Record<string, unknown>;

const API_BASE = 'https://api.cloudflare.com/client/v4';
const ACCOUNT_ID = /^[a-f0-9]{32}$/u;

const definitions = [
  { id: 'workers.scripts.read', label: 'Workers scripts' },
  { id: 'pages.projects.read', label: 'Pages projects' },
  { id: 'hyperdrive.configs.read', label: 'Hyperdrive configs' },
  { id: 'zones.read', label: 'Zones' },
  { id: 'analytics.workers.read', label: 'Workers analytics' },
] as const;

function stateForStatusV1(status: number): CloudflareCapabilityStateV1 {
  if (status === 401 || status === 403) return 'permission-required';
  if (status === 429 || status >= 500) return 'unavailable';
  return status >= 200 && status < 300 ? 'accessible' : 'unavailable';
}

async function readJsonV1(response: Response): Promise<JsonObject | null> {
  try {
    const value = (await response.json()) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as JsonObject)
      : null;
  } catch {
    return null;
  }
}

async function restProbeV1(
  url: string,
  token: string,
  fetcher: Fetcher,
): Promise<CloudflareCapabilityStateV1> {
  try {
    const response = await fetcher(url, {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    const state = stateForStatusV1(response.status);
    if (state !== 'accessible') {
      await response.body?.cancel();
      return state;
    }
    const body = await readJsonV1(response);
    if (body && body.success === false) return 'inconclusive';
    return 'accessible';
  } catch {
    return 'unavailable';
  }
}

function analyticsBodyV1(accountId: string, now: Date) {
  const end = now.toISOString();
  const start = new Date(now.getTime() - 5 * 60_000).toISOString();
  return {
    query: 'query CapabilityProbe($accountTag: string, $datetimeStart: string, $datetimeEnd: string) {' +
      ' viewer { accounts(filter: { accountTag: $accountTag }) {' +
      ' workersInvocationsAdaptive(limit: 1, filter: { datetime_geq: $datetimeStart, datetime_leq: $datetimeEnd }) {' +
      ' sum { requests } } } } }',
    variables: { accountTag: accountId, datetimeStart: start, datetimeEnd: end },
  };
}

async function analyticsProbeV1(
  accountId: string,
  token: string,
  fetcher: Fetcher,
  now: Date,
): Promise<CloudflareCapabilityStateV1> {
  try {
    const response = await fetcher(API_BASE + '/graphql', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(analyticsBodyV1(accountId, now)),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    const state = stateForStatusV1(response.status);
    if (state !== 'accessible') {
      await response.body?.cancel();
      return state;
    }
    const body = await readJsonV1(response);
    if (!body) return 'inconclusive';
    const errors = body.errors;
    if (Array.isArray(errors) && errors.length > 0) return 'inconclusive';
    const data = body.data;
    if (!data || typeof data !== 'object') return 'inconclusive';
    const viewer = (data as JsonObject).viewer;
    if (!viewer || typeof viewer !== 'object') return 'inconclusive';
    const accounts = (viewer as JsonObject).accounts;
    return Array.isArray(accounts) ? 'accessible' : 'inconclusive';
  } catch {
    return 'unavailable';
  }
}

export async function probeCloudflareCapabilitiesV1(input: {
  accountId: string;
  token: string;
  tokenKind: CloudflareTokenKindV1;
  fetcher?: Fetcher;
  now?: Date;
}): Promise<CloudflareProbeResultV1> {
  const now = input.now ?? new Date();
  const fetcher = input.fetcher ?? fetch;

  if (!ACCOUNT_ID.test(input.accountId)) throw new Error('Invalid Cloudflare account selector');

  if (!input.token) {
    return {
      contractVersion: 1,
      tokenKind: input.tokenKind,
      checkedAt: now.toISOString(),
      capabilities: definitions.map((item) => ({ ...item, state: 'credential-missing' })),
    };
  }

  const account = encodeURIComponent(input.accountId);
  const rest = {
    'workers.scripts.read': API_BASE + '/accounts/' + account + '/workers/scripts',
    'pages.projects.read': API_BASE + '/accounts/' + account + '/pages/projects?page=1&per_page=1',
    'hyperdrive.configs.read': API_BASE + '/accounts/' + account + '/hyperdrive/configs?page=1&per_page=1',
    'zones.read': API_BASE + '/zones?account.id=' + account + '&page=1&per_page=1',
  } as const;

  const capabilities: CloudflareCapabilityV1[] = [];
  for (const item of definitions) {
    const state =
      item.id === 'analytics.workers.read'
        ? await analyticsProbeV1(input.accountId, input.token, fetcher, now)
        : await restProbeV1(rest[item.id], input.token, fetcher);
    capabilities.push({ ...item, state });
  }

  return {
    contractVersion: 1,
    tokenKind: input.tokenKind,
    checkedAt: now.toISOString(),
    capabilities,
  };
}

function parseArgsV1(argv: readonly string[]) {
  const kindIndex = argv.indexOf('--token-kind');
  const outputIndex = argv.indexOf('--output');
  const tokenKind = argv[kindIndex + 1];
  const output = argv[outputIndex + 1];
  if ((tokenKind !== 'deploy' && tokenKind !== 'hyperdrive') || !output)
    throw new Error('Expected --token-kind <deploy|hyperdrive> and --output <path>');
  return { tokenKind, output } as const;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { tokenKind, output } = parseArgsV1(process.argv.slice(2));
  const result = await probeCloudflareCapabilitiesV1({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
    token: process.env.CLOUDFLARE_API_TOKEN ?? '',
    tokenKind,
  });
  await writeFile(output, JSON.stringify(result, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  console.log(
    JSON.stringify({
      event: 'cloudflare-readonly-probe-v1',
      tokenKind,
      capabilities: result.capabilities.map(({ id, state }) => ({ id, state })),
    }),
  );
}
