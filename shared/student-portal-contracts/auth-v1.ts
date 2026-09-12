import { z } from 'zod';
import { instantV1, opaqueV1, portalIdV1, PORTAL_ORIGIN_V1 } from './core-v1';

export const pinV1 = z.string().regex(/^[0-9]{4}$/u);
export const passwordV1 = z.string().regex(/^[0-9]{6}$/u);
export const qrPayloadV1 = z.object({
  formatVersion: z.literal(1), credentialId: opaqueV1, keyVersion: z.number().int().positive(), signature: opaqueV1,
}).strict();
export const qrUrlV1 = z.string().max(2048).refine((value) => {
  try {
    const url = new URL(value);
    return url.origin === PORTAL_ORIGIN_V1 && url.pathname === '/access' && !url.username && !url.password &&
      !url.search && /^#v1\.[A-Za-z0-9_-]{32,128}\.[1-9][0-9]{0,5}\.[A-Za-z0-9_-]{43}$/u.test(url.hash);
  } catch { return false; }
}, 'Expected a Portal V1 credential URL');
const input = { contractVersion: z.literal(1) };
export const challengeRequestV1 = z.object({ ...input, qr: qrUrlV1, pin: pinV1.optional(), riskToken: z.string().min(1).max(2048).optional() }).strict();
export const activateRequestV1 = z.object({
  ...input, challenge: opaqueV1, password: passwordV1, confirmation: passwordV1, keepConnected: z.boolean(),
}).strict().refine((v) => v.password === v.confirmation, { path: ['confirmation'], message: 'Confirmation mismatch' });
export const loginRequestV1 = z.object({
  ...input, qr: qrUrlV1, password: passwordV1, keepConnected: z.boolean(), riskToken: z.string().min(1).max(2048).optional(),
}).strict();
export const logoutRequestV1 = z.object(input).strict();
export const challengeResponseV1 = z.discriminatedUnion('state', [
  z.object({ ...input, requestId: portalIdV1, state: z.literal('credential-required'), next: z.enum(['pin', 'password', 'risk']) }).strict(),
  z.object({ ...input, requestId: portalIdV1, state: z.literal('password-creation'), challenge: opaqueV1, expiresAt: instantV1 }).strict(),
]);
export const sessionResponseV1 = z.object({ ...input, requestId: portalIdV1, state: z.literal('authenticated'), expiresAt: instantV1, persistent: z.boolean() }).strict();
export const logoutResponseV1 = z.object({ ...input, requestId: portalIdV1, state: z.literal('logged-out') }).strict();
export const SESSION_COOKIE_V1 = { name: '__Host-student_portal_session', path: '/', secure: true, httpOnly: true, sameSite: 'Strict' } as const;
export const AUTH_BODY_BYTES_V1 = 8192;
export type ActivateRequestV1 = z.infer<typeof activateRequestV1>;
