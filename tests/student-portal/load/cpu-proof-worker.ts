import { PortalCryptoV1 } from '../../../server/student-portal/crypto/crypto-v1';

/** Explicit, temporary remote measurement. No database or production key; remove after collection. */
export default {
  async fetch(request: Request, env: { PROOF_TOKEN?: string }) {
    if (!env.PROOF_TOKEN || request.headers.get('authorization') !== `Bearer ${env.PROOF_TOKEN}`)
      return new Response(null, { status: 403 });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/proof') return new Response(null, { status: 404 });
    const cryptography = new PortalCryptoV1(new Map([[1, new Uint8Array(32).fill(61)]]), new Map([[1, new Uint8Array(32).fill(62)]]));
    const verifier = await cryptography.deriveVerifier('2001', 1);
    const ok = verifier.algorithm === 'scrypt-hmac-sha256-v1';
    return Response.json({ ok, calls: 1 }, { headers: { 'cache-control': 'no-store' } });
  },
};
