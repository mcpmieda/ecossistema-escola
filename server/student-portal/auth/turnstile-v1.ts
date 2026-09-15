import { z } from 'zod';

export const TURNSTILE_ACTION_V1 = 'student_portal_auth';
export interface RiskVerifierV1 { verify(token: string): Promise<boolean> }

/** No caller-supplied endpoint/hostname, IP identity, caching or token logging. */
export class TurnstileVerifierV1 implements RiskVerifierV1 {
  constructor(private readonly secret: string, private readonly fetcher: typeof fetch = fetch) {
    if (!secret) throw new Error('student-portal-risk-unavailable');
  }
  async verify(token: string): Promise<boolean> {
    if (!z.string().min(1).max(2048).safeParse(token).success) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await this.fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        // Workers rejects redirect=error before the subrequest. Manual mode
        // prevents the secret from following a redirect; response.ok below
        // keeps every 3xx response fail-closed.
        method: 'POST', redirect: 'manual', signal: controller.signal,
        body: new URLSearchParams({ secret: this.secret, response: token }),
      });
      if (!response.ok) throw new Error('student-portal-risk-unavailable');
      const result = z.object({ success: z.boolean(), hostname: z.string().optional(), action: z.string().optional() }).parse(await response.json());
      return result.success && result.hostname === 'aluno.escolaieda.com' && result.action === TURNSTILE_ACTION_V1;
    } catch { throw new Error('student-portal-risk-unavailable'); }
    finally { clearTimeout(timer); }
  }
}
