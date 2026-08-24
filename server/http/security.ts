import type { RuntimeEnv } from '../env';

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy':
    "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
};

export function withSecurityHeaders(response: Response, protectedRoute = false): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  if (protectedRoute) headers.set('Cache-Control', 'no-store, private');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function enforceOfficialOrigin(request: Request, env: RuntimeEnv): void {
  if (new URL(request.url).origin !== env.OFFICIAL_ORIGIN)
    throw new HttpError(421, 'Misdirected request');
}

export function enforceWriteOrigin(request: Request, env: RuntimeEnv): void {
  const origin = request.headers.get('Origin');
  if (origin !== env.OFFICIAL_ORIGIN) throw new HttpError(403, 'Invalid origin');
}

export async function readBoundedJson(request: Request, maxBytes = 16_384): Promise<unknown> {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))
    throw new HttpError(415, 'Expected application/json');
  const length = Number(request.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(length) && length > maxBytes)
    throw new HttpError(413, 'Request body too large');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Missing request body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, 'Request body too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
