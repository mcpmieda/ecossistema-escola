import { createHash } from 'node:crypto';
import { z } from 'zod';
import { seal, unseal } from '../../auth/sealed';
import { opaqueV1 } from '../../../shared/student-portal-contracts/core-v1';
import type { AdminQueryV1 } from '../../../shared/student-portal-contracts/admin-v1';

const cursorV1 = z.object({ v: z.literal(1), a: z.uuid(), q: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  e: z.number().int().positive(), k: z.uuid(), t: z.iso.datetime().optional() }).strict();
export class AdminCursorV1 {
  private readonly secret: string;
  constructor(secret: string) {
    if (secret.length < 43) throw new Error('student-portal-cursor-key-unavailable');
    this.secret = `student-portal-admin-cursor-v1:${secret}`;
  }
  private queryDigest(query: AdminQueryV1): string {
    return createHash('sha256').update(JSON.stringify({ ...query, page: { limit: query.page.limit } })).digest('base64url');
  }
  async read(query: AdminQueryV1, actor: string, now: Date): Promise<{ id: string; at?: string } | null> {
    if (!query.page.cursor) return null;
    const parsed = cursorV1.safeParse(await unseal(query.page.cursor, this.secret));
    if (!parsed.success || parsed.data.a !== actor || parsed.data.q !== this.queryDigest(query)
      || parsed.data.e <= now.getTime() || parsed.data.e > now.getTime() + 300_000)
      throw new Error('student-portal-cursor-invalid-request');
    return { id: parsed.data.k, ...(parsed.data.t ? { at: parsed.data.t } : {}) };
  }
  async next(query: AdminQueryV1, actor: string, now: Date, id: string, at?: string): Promise<string> {
    return opaqueV1.parse(await seal(cursorV1.parse({ v: 1, a: actor, q: this.queryDigest(query), e: now.getTime() + 300_000, k: id,
      ...(at ? { t: at } : {}) }), this.secret));
  }
}
