import { z } from 'zod';
import type { RuntimeEnv } from '../env';
import { createClientAssertion } from '../auth/client-assertion';
import { graphCredentials, type GraphCredentialSlot } from '../auth/technical-identity';

const tokenSchema = z.object({ access_token: z.string(), expires_in: z.number() });
export type GraphDependencies = {
  fetch: typeof fetch;
  sleep: (milliseconds: number) => Promise<void>;
};
const defaults: GraphDependencies = {
  fetch: (input, init) => fetch(input, init),
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

export async function getGraphToken(
  env: RuntimeEnv,
  dependencies: GraphDependencies = defaults,
  slot?: GraphCredentialSlot,
): Promise<string> {
  const endpoint = `https://login.microsoftonline.com/${env.TENANT_ID}/oauth2/v2.0/token`;
  let lastStatus = 0;
  for (const credential of graphCredentials(env, slot)) {
    const assertion = await createClientAssertion({
      clientId: env.GRAPH_CLIENT_ID,
      tenantId: env.TENANT_ID,
      privateKeyPkcs8: credential.privateKeyPkcs8,
      certificateThumbprint: credential.certificateThumbprint,
    });
    const response = await dependencies.fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GRAPH_CLIENT_ID,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: assertion,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    lastStatus = response.status;
    if (response.ok) return tokenSchema.parse(await response.json()).access_token;
  }
  throw new Error(`Graph token request failed (${lastStatus})`);
}

export async function graphRequest<T>(input: {
  env: RuntimeEnv;
  path: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  etag?: string;
  correlationId?: string;
  dependencies?: GraphDependencies;
  token?: string;
  credentialSlot?: GraphCredentialSlot;
}): Promise<{ data: T; etag: string | null; correlationId: string }> {
  const dependencies = input.dependencies ?? defaults;
  const token = input.token ?? (await getGraphToken(input.env, dependencies, input.credentialSlot));
  const correlationId = input.correlationId ?? crypto.randomUUID();
  let lastStatus = 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    const headers = new Headers({
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'client-request-id': correlationId,
      'return-client-request-id': 'true',
    });
    if (input.body !== undefined) headers.set('Content-Type', 'application/json');
    if (input.etag) headers.set('If-Match', input.etag);
    const response = await dependencies.fetch(`https://graph.microsoft.com/v1.0${input.path}`, {
      method: input.method ?? 'GET',
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: AbortSignal.timeout(12_000),
    });
    lastStatus = response.status;
    if (response.ok) {
      const data = response.status === 204 ? null : await response.json();
      return { data: data as T, etag: response.headers.get('ETag'), correlationId };
    }
    if (response.status !== 429 && response.status < 500)
      throw new GraphError(response.status, correlationId);
    if (attempt === 4) break;
    const retryHeader = response.headers.get('Retry-After');
    const retrySeconds =
      retryHeader && /^\d+$/u.test(retryHeader) ? Number(retryHeader) : Math.min(8, 2 ** attempt);
    const jitter = crypto.getRandomValues(new Uint8Array(1))[0]! / 255;
    await dependencies.sleep(Math.min(10_000, retrySeconds * 1000 + Math.floor(jitter * 250)));
  }
  throw new GraphError(lastStatus, correlationId);
}

export async function graphContentRequest(input: {
  env: RuntimeEnv;
  path: string;
  method: 'GET' | 'PUT';
  body?: Uint8Array;
  contentType?: string;
  correlationId?: string;
  dependencies?: GraphDependencies;
  token?: string;
  credentialSlot?: GraphCredentialSlot;
}): Promise<{ response: Response; correlationId: string }> {
  const dependencies = input.dependencies ?? defaults;
  const token = input.token ?? (await getGraphToken(input.env, dependencies, input.credentialSlot));
  const correlationId = input.correlationId ?? crypto.randomUUID();
  if (input.method === 'PUT' && !input.contentType) {
    throw new Error('Graph binary PUT requires contentType');
  }
  const body =
    input.body === undefined
      ? undefined
      : new Blob([new Uint8Array(input.body)], {
          type: input.contentType ?? 'application/octet-stream',
        });
  let lastStatus = 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    const headers = new Headers({
      Authorization: `Bearer ${token}`,
      'client-request-id': correlationId,
      'return-client-request-id': 'true',
    });
    if (input.contentType) headers.set('Content-Type', input.contentType);
    const response = await dependencies.fetch(`https://graph.microsoft.com/v1.0${input.path}`, {
      method: input.method,
      headers,
      body,
      signal: AbortSignal.timeout(30_000),
    });
    lastStatus = response.status;
    if (response.ok) return { response, correlationId };
    if (response.status !== 429 && response.status < 500) {
      throw new GraphError(response.status, correlationId);
    }
    if (attempt === 4) break;
    const retryHeader = response.headers.get('Retry-After');
    const retrySeconds =
      retryHeader && /^\d+$/u.test(retryHeader) ? Number(retryHeader) : Math.min(8, 2 ** attempt);
    const jitter = crypto.getRandomValues(new Uint8Array(1))[0]! / 255;
    await dependencies.sleep(Math.min(10_000, retrySeconds * 1000 + Math.floor(jitter * 250)));
  }
  throw new GraphError(lastStatus, correlationId);
}

export async function graphAllPages<T>(
  env: RuntimeEnv,
  initialPath: string,
  token?: string,
): Promise<T[]> {
  const values: T[] = [];
  let next: string | null = initialPath;
  for (let page = 0; next && page < 10; page++) {
    const path: string = next.startsWith('https://graph.microsoft.com/v1.0')
      ? next.slice('https://graph.microsoft.com/v1.0'.length)
      : next;
    const result: {
      data: { value: T[]; '@odata.nextLink'?: string };
      etag: string | null;
      correlationId: string;
    } = await graphRequest<{ value: T[]; '@odata.nextLink'?: string }>({
      env,
      path,
      token,
    });
    values.push(...result.data.value);
    next = result.data['@odata.nextLink'] ?? null;
  }
  if (next) throw new Error('Graph pagination limit exceeded');
  return values;
}

export async function graphBatch(
  env: RuntimeEnv,
  requests: Array<{ id: string; method: string; url: string }>,
): Promise<unknown> {
  if (requests.length === 0 || requests.length > 20)
    throw new Error('Graph batch requires 1 to 20 requests');
  return (await graphRequest<unknown>({ env, path: '/$batch', method: 'POST', body: { requests } }))
    .data;
}

export class GraphError extends Error {
  constructor(
    readonly status: number,
    readonly correlationId: string,
  ) {
    super(`Graph request failed (${status})`);
  }
}
