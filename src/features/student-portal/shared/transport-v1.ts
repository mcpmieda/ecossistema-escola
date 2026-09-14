import type { z } from 'zod';
import {
  ERROR_HTTP_V1,
  failureV1,
  type FailureV1,
} from '../../../../shared/student-portal-contracts/core-v1';

export type PortalFetchV1 = (path: string, init: RequestInit) => Promise<Response>;
export type PortalClientStateV1 = FailureV1['state'] | 'invalid-response' | 'network-error';
export class PortalClientErrorV1 extends Error {
  constructor(
    readonly state: PortalClientStateV1,
    readonly status = 0,
    readonly retryAfterSeconds?: number,
    readonly requestId?: string,
  ) {
    super(state);
    this.name = 'PortalClientErrorV1';
  }
}
export function isAmbiguousPortalResponseV1(error: unknown): error is PortalClientErrorV1 {
  if (!(error instanceof PortalClientErrorV1) || error.retryAfterSeconds !== undefined)
    return false;
  if (error.state === 'network-error' || error.state === 'unavailable') return true;
  return (
    error.state === 'invalid-response' &&
    (error.status === 0 || error.status === 200 || error.status >= 500)
  );
}
export interface PortalTransportOptionsV1 {
  fetch?: PortalFetchV1;
  onUnauthorized?: () => void;
  respectRetryAfter?: boolean;
}

/** Pages adds private/no-cache directives; require the exact no-store directive, not header equality. */
export function hasPortalNoStoreV1(headers: Headers): boolean {
  return (headers.get('Cache-Control') ?? '')
    .split(',')
    .some((value) => value.trim().toLowerCase() === 'no-store');
}

function retryDelay(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = /^\d+$/u.test(header)
    ? Number(header)
    : Math.ceil((Date.parse(header) - Date.now()) / 1000);
  return Number.isFinite(seconds) ? Math.min(86400, Math.max(1, seconds)) : undefined;
}

/** Fixed same-origin paths only; no identity headers, persistence, logging or automatic retries. */
export function createPortalTransportV1(options: PortalTransportOptionsV1 = {}) {
  const fetcher = options.fetch ?? ((path, init) => fetch(path, init));
  const cooldowns = new Map<string, number>();
  return async <T>(
    path: string,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
    body?: string,
  ): Promise<T> => {
    if (
      !/^\/api\/(?:student\/(?:session|me|auth\/(?:challenge|activate|login|logout))|student-portal\/admin\/(?:query|command))$/u.test(
        path,
      )
    )
      throw new PortalClientErrorV1('invalid-request');
    signal?.throwIfAborted();
    const remaining = (cooldowns.get(path) ?? 0) - Date.now();
    if (options.respectRetryAfter && remaining > 0)
      throw new PortalClientErrorV1('rate-limited', 429, Math.ceil(remaining / 1000));
    let response: Response;
    try {
      response = await fetcher(path, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal,
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body }),
      });
    } catch {
      signal?.throwIfAborted();
      throw new PortalClientErrorV1('network-error');
    }
    signal?.throwIfAborted();
    if (response.status === 401) options.onUnauthorized?.();
    const delay = retryDelay(response.headers.get('Retry-After'));
    let value: unknown;
    try {
      if (!response.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))
        throw new Error();
      value = await response.json();
    } catch {
      signal?.throwIfAborted();
      throw new PortalClientErrorV1('invalid-response', response.status, delay);
    }
    signal?.throwIfAborted();
    const failure = failureV1.safeParse(value);
    if (failure.success && response.status === ERROR_HTTP_V1[failure.data.state]) {
      if (options.respectRetryAfter && failure.data.state === 'rate-limited')
        cooldowns.set(
          path,
          Date.now() + Math.max(delay ?? 1, failure.data.retryAfterSeconds ?? 1) * 1000,
        );
      throw new PortalClientErrorV1(
        failure.data.state,
        response.status,
        Math.max(delay ?? 0, failure.data.retryAfterSeconds ?? 0) || undefined,
        failure.data.requestId,
      );
    }
    const success = schema.safeParse(value);
    if (response.status !== 200 || !success.success || !hasPortalNoStoreV1(response.headers))
      throw new PortalClientErrorV1('invalid-response', response.status, delay);
    return success.data;
  };
}

export function portalRequestBodyV1<T>(schema: z.ZodType<T>, input: unknown): string {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new PortalClientErrorV1('invalid-request');
  return JSON.stringify(parsed.data);
}
