import { z } from 'zod';
import type { RuntimeEnv } from '../env';
import { decodeBase64Url, decodeJson } from './base64url';

const uuidSchema = z.string().uuid();

const jwtHeaderSchema = z.object({
  alg: z.literal('RS256'),
  kid: z.string().min(1),
});

const accessTokenClaimsSchema = z.object({
  ver: z.literal('2.0'),
  aud: uuidSchema,
  iss: z.string().url(),
  tid: uuidSchema,
  oid: uuidSchema,
  sub: z.string().min(1),
  exp: z.number(),
  nbf: z.number().optional(),
  iat: z.number().optional(),
  scp: z.string().min(1),
  azp: uuidSchema,
  azpacr: z.enum(['0', '1', '2']).optional(),
  preferred_username: z.string().optional(),
  name: z.string().optional(),
});

const configuredScopeSchema = z.string().min(3).max(120).regex(/^\S+$/u);

const jwksSchema = z.object({
  keys: z.array(
    z.object({
      kid: z.string(),
      kty: z.string(),
      use: z.string().optional(),
      n: z.string(),
      e: z.string(),
      alg: z.string().optional(),
    }),
  ),
});

export type EntraAccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>;

export class BearerAuthenticationError extends Error {
  readonly status = 401;

  constructor(message: string) {
    super(message);
    this.name = 'BearerAuthenticationError';
  }
}

export class BearerAuthorizationError extends Error {
  readonly status = 403;

  constructor(message: string) {
    super(message);
    this.name = 'BearerAuthorizationError';
  }
}

export class BearerConfigurationError extends Error {
  readonly status = 503;

  constructor(message: string) {
    super(message);
    this.name = 'BearerConfigurationError';
  }
}

export class BearerVerificationUnavailableError extends Error {
  readonly status = 503;

  constructor(message: string) {
    super(message);
    this.name = 'BearerVerificationUnavailableError';
  }
}

function bearerToken(authorization: string | null): string {
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/iu);
  if (!match?.[1]) throw new BearerAuthenticationError('Missing or malformed bearer token');
  return match[1];
}

export async function verifyMicrosoftEntraAccessToken(args: {
  authorization: string | null;
  tenantId: string;
  audience: string;
  authorizedParty: string;
  requiredScope: string;
  now?: number;
  fetcher?: typeof fetch;
}): Promise<EntraAccessTokenClaims> {
  const token = bearerToken(args.authorization);
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new BearerAuthenticationError('Malformed access token');
  }

  let header: z.infer<typeof jwtHeaderSchema>;
  let claims: EntraAccessTokenClaims;
  try {
    header = jwtHeaderSchema.parse(decodeJson(parts[0]));
    claims = accessTokenClaimsSchema.parse(decodeJson(parts[1]));
  } catch {
    throw new BearerAuthenticationError('Invalid access token claims');
  }

  const fetcher = args.fetcher ?? fetch;
  let jwksResponse: Response;
  try {
    jwksResponse = await fetcher(
      `https://login.microsoftonline.com/${args.tenantId}/discovery/v2.0/keys`,
      { signal: AbortSignal.timeout(8_000) },
    );
  } catch {
    throw new BearerVerificationUnavailableError('Microsoft Entra signing keys unavailable');
  }
  if (!jwksResponse.ok) {
    throw new BearerVerificationUnavailableError('Microsoft Entra signing keys unavailable');
  }

  let jwks: z.infer<typeof jwksSchema>;
  try {
    jwks = jwksSchema.parse(await jwksResponse.json());
  } catch {
    throw new BearerVerificationUnavailableError('Microsoft Entra signing key response invalid');
  }
  const jwk = jwks.keys.find((candidate) => candidate.kid === header.kid);
  if (!jwk) throw new BearerAuthenticationError('Unknown signing key');

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
  } catch {
    throw new BearerAuthenticationError('Invalid signing key');
  }

  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      Uint8Array.from(decodeBase64Url(parts[2])).buffer,
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    throw new BearerAuthenticationError('Invalid access token signature');
  }
  if (!valid) throw new BearerAuthenticationError('Invalid access token signature');

  const now = args.now ?? Math.floor(Date.now() / 1000);
  const issuer = `https://login.microsoftonline.com/${args.tenantId}/v2.0`;
  if (claims.tid !== args.tenantId || claims.iss !== issuer || claims.aud !== args.audience) {
    throw new BearerAuthenticationError('Invalid access token authority');
  }
  if (claims.exp <= now || (claims.nbf !== undefined && claims.nbf > now + 60)) {
    throw new BearerAuthenticationError('Invalid access token lifetime');
  }
  if (claims.azp !== args.authorizedParty) {
    throw new BearerAuthorizationError('Client application is not authorized');
  }
  if (claims.azpacr !== undefined && claims.azpacr !== '0') {
    throw new BearerAuthorizationError('Confidential client tokens are not accepted');
  }

  const scopes = new Set(claims.scp.split(/\s+/u).filter(Boolean));
  if (!scopes.has(args.requiredScope)) {
    throw new BearerAuthorizationError('Required delegated scope is missing');
  }
  return claims;
}

export async function verifyBancoNotasAddinToken(args: {
  authorization: string | null;
  env: RuntimeEnv;
  now?: number;
  fetcher?: typeof fetch;
}): Promise<EntraAccessTokenClaims> {
  const audience = uuidSchema.safeParse(args.env.BANCO_NOTAS_ADDIN_AUDIENCE);
  const requiredScope = configuredScopeSchema.safeParse(args.env.BANCO_NOTAS_ADDIN_SCOPE);
  if (!audience.success || !requiredScope.success) {
    throw new BearerConfigurationError('Banco de Notas add-in identity is not configured');
  }
  return verifyMicrosoftEntraAccessToken({
    authorization: args.authorization,
    tenantId: args.env.TENANT_ID,
    audience: audience.data,
    authorizedParty: audience.data,
    requiredScope: requiredScope.data,
    now: args.now,
    fetcher: args.fetcher,
  });
}
