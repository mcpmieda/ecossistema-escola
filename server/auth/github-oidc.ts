import { z } from 'zod';
import { decodeBase64Url, decodeJson } from './base64url';

const ISSUER = 'https://token.actions.githubusercontent.com';
const EXPECTED_SUBJECT =
  'repo:mcpmieda@268288370/ecossistema-escola@1345061518:environment:production';
export const MAINTENANCE_ROTATION_AUDIENCE =
  'https://admin.escolaieda.com/api/maintenance/rotation/validate';
export const MAINTENANCE_RECOVERY_AUDIENCE =
  'https://admin.escolaieda.com/api/maintenance/recovery/verify';

const discoverySchema = z.object({ issuer: z.string(), jwks_uri: z.string().url() });
const jwksSchema = z.object({
  keys: z.array(
    z.object({
      kty: z.literal('RSA'),
      kid: z.string(),
      n: z.string(),
      e: z.string(),
      alg: z.string().optional(),
      use: z.string().optional(),
    }),
  ),
});
const headerSchema = z.object({
  alg: z.literal('RS256'),
  kid: z.string(),
  typ: z.string().optional(),
});
const claimsSchema = z.object({
  iss: z.literal(ISSUER),
  sub: z.literal(EXPECTED_SUBJECT),
  aud: z.union([z.string(), z.array(z.string())]),
  exp: z.number().int(),
  nbf: z.number().int().optional(),
  iat: z.number().int().optional(),
  repository: z.literal('mcpmieda/ecossistema-escola').optional(),
  environment: z.literal('production').optional(),
});

export type MaintenanceAudience =
  | typeof MAINTENANCE_ROTATION_AUDIENCE
  | typeof MAINTENANCE_RECOVERY_AUDIENCE;

export async function verifyGitHubMaintenanceToken(
  authorization: string | null,
  expectedAudience: MaintenanceAudience = MAINTENANCE_ROTATION_AUDIENCE,
  fetcher: typeof fetch = (input, init) => fetch(input, init),
): Promise<void> {
  if (!authorization?.startsWith('Bearer ')) throw new Error('Missing maintenance token');
  const token = authorization.slice('Bearer '.length);
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed maintenance token');
  const header = headerSchema.parse(decodeJson(parts[0]!));
  const claims = claimsSchema.parse(decodeJson(parts[1]!));
  if (
    (Array.isArray(claims.aud) && !claims.aud.includes(expectedAudience)) ||
    (!Array.isArray(claims.aud) && claims.aud !== expectedAudience)
  ) {
    throw new Error('Invalid maintenance audience');
  }
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp <= now || (claims.nbf !== undefined && claims.nbf > now + 30)) {
    throw new Error('Expired maintenance token');
  }
  const discoveryResponse = await fetcher(`${ISSUER}/.well-known/openid-configuration`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!discoveryResponse.ok) throw new Error('Unable to load GitHub OIDC discovery');
  const discovery = discoverySchema.parse(await discoveryResponse.json());
  if (
    discovery.issuer !== ISSUER ||
    new URL(discovery.jwks_uri).hostname !== 'token.actions.githubusercontent.com'
  ) {
    throw new Error('Invalid GitHub OIDC discovery');
  }
  const jwksResponse = await fetcher(discovery.jwks_uri, { signal: AbortSignal.timeout(5_000) });
  if (!jwksResponse.ok) throw new Error('Unable to load GitHub OIDC keys');
  const jwk = jwksSchema
    .parse(await jwksResponse.json())
    .keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error('Unknown GitHub OIDC signing key');
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    Uint8Array.from(decodeBase64Url(parts[2]!)).buffer,
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) throw new Error('Invalid maintenance token signature');
}
