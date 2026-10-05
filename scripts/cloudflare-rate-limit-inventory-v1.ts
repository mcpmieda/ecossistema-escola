import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import type { CloudflareResourceStateV1 } from './cloudflare-operator-v1.ts';

const API = 'https://api.cloudflare.com/client/v4';
const PORTAL = 'student-portal-production';
const NAME = /^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,127}$/u;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
const TARGETS = Array.from({ length: 11 }, (_, index) => String(3101249 + index));
const MAX_SCRIPTS = 100;
const MAX_BYTES = 2 * 1024 * 1024;

type ObjectV1 = Record<string, unknown>;
type BindingV1 = { name: string; namespaceId: string; limit: number; period: number };
type SnapshotV1 = { script: string; source: 'settings' | 'active-version'; bindings: BindingV1[] };
export type RateLimitInventoryV1 = {
  contractVersion: 1;
  operation: 'portal-rate-limits';
  checkedAt: string;
  state: CloudflareResourceStateV1;
  complete: boolean;
  scriptsInspected: number;
  activeVersionsInspected: number;
  portal: {
    present: boolean;
    settings: BindingV1[];
    activeVersions: Array<{ versionId: string; percentage: number; bindings: BindingV1[] }>;
  };
  namespaces: Array<{
    namespaceId: string;
    state: 'unused' | 'portal-only' | 'collision' | 'unverified';
    foreignWorkers: number;
    portalBindingNames: string[];
  }>;
};

function objectV1(value: unknown): ObjectV1 | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as ObjectV1)
    : null;
}

// Never retain provider bodies, other binding values, error text or authorization headers.
async function getV1(url: string, token: string, fetcher: typeof fetch, signal: AbortSignal) {
  try {
    const response = await fetcher(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const state: CloudflareResourceStateV1 =
        response.status === 401 || response.status === 403
          ? 'permission-required'
          : response.status === 404
            ? 'not-found'
            : 'unavailable';
      return { state, body: null };
    }
    const reader = response.body?.getReader();
    if (!reader) return { state: 'inconclusive' as const, body: null };
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return { state: 'inconclusive' as const, body: null };
      }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body = objectV1(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    if (body?.success !== true) return { state: 'inconclusive' as const, body: null };
    return { state: 'accessible' as const, body };
  } catch {
    return { state: 'unavailable' as const, body: null };
  }
}

function bindingsV1(value: unknown): BindingV1[] | null {
  if (!Array.isArray(value) || value.length > 1000) return null;
  const bindings: BindingV1[] = [];
  const names = new Set<string>();
  for (const item of value) {
    const binding = objectV1(item);
    if (!binding || typeof binding.type !== 'string') return null;
    if (binding.type !== 'ratelimit') continue;
    const simple = objectV1(binding.simple);
    if (
      typeof binding.name !== 'string' ||
      !NAME.test(binding.name) ||
      names.has(binding.name) ||
      typeof binding.namespace_id !== 'string' ||
      !/^[1-9][0-9]{0,19}$/u.test(binding.namespace_id) ||
      typeof simple?.limit !== 'number' ||
      !Number.isSafeInteger(simple.limit) ||
      simple.limit <= 0 ||
      (simple.period !== 10 && simple.period !== 60)
    )
      return null;
    names.add(binding.name);
    bindings.push({
      name: binding.name,
      namespaceId: binding.namespace_id,
      limit: simple.limit,
      period: simple.period,
    });
  }
  return bindings.sort((a, b) => a.name.localeCompare(b.name));
}

function singlePageV1(value: unknown, count: number): boolean {
  if (value === undefined || value === null) return true;
  const info = objectV1(value);
  if (!info) return false;
  const allowed = new Set(['count', 'total_count', 'page', 'per_page', 'total_pages']);
  if (Object.keys(info).some((key) => !allowed.has(key))) return false;
  if (info.count !== undefined && info.count !== count) return false;
  if (info.total_count !== undefined && info.total_count !== count) return false;
  if (info.page !== undefined && info.page !== 1) return false;
  if (info.total_pages !== undefined && info.total_pages !== 1) return false;
  if (
    info.per_page !== undefined &&
    (typeof info.per_page !== 'number' ||
      !Number.isSafeInteger(info.per_page) ||
      info.per_page < count)
  )
    return false;
  return true;
}

function failV1(
  result: RateLimitInventoryV1,
  state: CloudflareResourceStateV1,
): RateLimitInventoryV1 {
  result.state = state;
  // Partial observations must never attest absence of a collision.
  result.complete = false;
  return result;
}

export async function inspectCloudflareRateLimitsV1(input: {
  accountId: string;
  token: string;
  fetcher?: typeof fetch;
  now?: Date;
}): Promise<RateLimitInventoryV1> {
  if (!/^[a-f0-9]{32}$/u.test(input.accountId))
    throw new Error('Invalid Cloudflare account selector');
  const result: RateLimitInventoryV1 = {
    contractVersion: 1,
    operation: 'portal-rate-limits',
    checkedAt: (input.now ?? new Date()).toISOString(),
    state: 'inconclusive',
    complete: false,
    scriptsInspected: 0,
    activeVersionsInspected: 0,
    portal: { present: false, settings: [], activeVersions: [] },
    namespaces: TARGETS.map((namespaceId) => ({
      namespaceId,
      state: 'unverified',
      foreignWorkers: 0,
      portalBindingNames: [],
    })),
  };
  if (!input.token) return failV1(result, 'credential-missing');
  const fetcher = input.fetcher ?? fetch;
  const signal = AbortSignal.timeout(120_000);
  const base = `${API}/accounts/${input.accountId}/workers/scripts`;
  const listing = await getV1(base, input.token, fetcher, signal);
  if (listing.state !== 'accessible' || !listing.body) return failV1(result, listing.state);
  const scripts = listing.body.result;
  // The official scripts.list endpoint is SinglePage, without page/per_page input.
  // Reject a changed/truncated API shape instead of guessing that the inventory is complete.
  if (
    !Array.isArray(scripts) ||
    scripts.length === 0 ||
    scripts.length > MAX_SCRIPTS ||
    !singlePageV1(listing.body.result_info, scripts.length) ||
    listing.body.cursor !== undefined
  )
    return failV1(result, 'inconclusive');
  const names: string[] = [];
  for (const item of scripts) {
    const name = objectV1(item)?.id;
    if (typeof name !== 'string' || !NAME.test(name) || names.includes(name))
      return failV1(result, 'inconclusive');
    names.push(name);
  }
  const snapshots: SnapshotV1[] = [];
  for (const script of names.sort()) {
    if (signal.aborted) return failV1(result, 'unavailable');
    const root = `${base}/${encodeURIComponent(script)}`;
    const settings = await getV1(`${root}/settings`, input.token, fetcher, signal);
    if (settings.state !== 'accessible' || !settings.body) return failV1(result, settings.state);
    const parsedSettings = bindingsV1(objectV1(settings.body.result)?.bindings);
    if (!parsedSettings) return failV1(result, 'inconclusive');
    snapshots.push({ script, source: 'settings', bindings: parsedSettings });
    if (script === PORTAL) {
      result.portal.present = true;
      result.portal.settings = parsedSettings;
    }
    const deployments = await getV1(`${root}/deployments`, input.token, fetcher, signal);
    if (deployments.state !== 'accessible' || !deployments.body)
      return failV1(result, deployments.state);
    const items = objectV1(deployments.body.result)?.deployments;
    if (!Array.isArray(items) || items.length === 0) return failV1(result, 'inconclusive');
    // API and Wrangler define deployments[0] as the version(s) currently serving traffic.
    const active = objectV1(items[0])?.versions;
    if (!Array.isArray(active) || active.length < 1 || active.length > 2)
      return failV1(result, 'inconclusive');
    let percentage = 0;
    const seen = new Set<string>();
    for (const item of active) {
      const version = objectV1(item);
      if (
        typeof version?.version_id !== 'string' ||
        !UUID.test(version.version_id) ||
        seen.has(version.version_id) ||
        typeof version.percentage !== 'number' ||
        !Number.isFinite(version.percentage) ||
        version.percentage < 0 ||
        version.percentage > 100
      )
        return failV1(result, 'inconclusive');
      seen.add(version.version_id);
      percentage += version.percentage;
      const read = await getV1(
        `${root}/versions/${version.version_id}`,
        input.token,
        fetcher,
        signal,
      );
      if (read.state !== 'accessible' || !read.body) return failV1(result, read.state);
      const versionBody = objectV1(read.body.result);
      if (versionBody?.id !== version.version_id) return failV1(result, 'inconclusive');
      const parsed = bindingsV1(objectV1(versionBody.resources)?.bindings);
      if (!parsed) return failV1(result, 'inconclusive');
      snapshots.push({ script, source: 'active-version', bindings: parsed });
      result.activeVersionsInspected++;
      if (script === PORTAL)
        result.portal.activeVersions.push({
          versionId: version.version_id,
          percentage: version.percentage,
          bindings: parsed,
        });
    }
    if (Math.abs(percentage - 100) > 0.0001) return failV1(result, 'inconclusive');
    result.scriptsInspected++;
  }
  if (!result.portal.present) return failV1(result, 'not-found');
  result.namespaces = TARGETS.map((namespaceId) => {
    const references = snapshots.flatMap((snapshot) =>
      snapshot.bindings
        .filter((binding) => binding.namespaceId === namespaceId)
        .map((binding) => ({ script: snapshot.script, binding })),
    );
    const foreignWorkers = new Set(
      references.filter((ref) => ref.script !== PORTAL).map((ref) => ref.script),
    ).size;
    const portalBindingNames = [
      ...new Set(references.filter((ref) => ref.script === PORTAL).map((ref) => ref.binding.name)),
    ].sort();
    return {
      namespaceId,
      foreignWorkers,
      portalBindingNames,
      state:
        foreignWorkers > 0 || portalBindingNames.length > 1
          ? 'collision'
          : references.length === 0
            ? 'unused'
            : 'portal-only',
    };
  });
  result.complete = true;
  result.state = 'accessible';
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output' || !args[1])
    throw new Error('Expected --output <path>');
  const result = await inspectCloudflareRateLimitsV1({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
    token: process.env.CLOUDFLARE_API_TOKEN ?? '',
  });
  await writeFile(args[1], `${JSON.stringify(result, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      event: 'cloudflare-rate-limit-inventory-v1',
      state: result.state,
      complete: result.complete,
    }),
  );
}
