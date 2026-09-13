import { z } from 'zod';
import type { StudentPortalPostgresSqlV1 } from '../persistence/postgres-persistence-v1';

const ipV1 = z.union([z.ipv4(), z.ipv6()]);

/** Call only on the original incoming Cloudflare request, before service-binding forwarding.
 * IP describes the network peer, never identity. Worker subrequests may report a Worker address.
 * https://developers.cloudflare.com/fundamentals/reference/http-headers/
 */
export function cloudflareClientIpV1(request: Request): string | null {
  const cf = (request as Request & { cf?: { colo?: unknown } }).cf;
  if (!cf || typeof cf.colo !== 'string' || !cf.colo) return null;
  const parsed = ipV1.safeParse(request.headers.get('cf-connecting-ip'));
  return parsed.success ? parsed.data : null;
}

/** SET LOCAL uses the same physical transaction and cannot leak through a pooled connection. */
export function withAuditSqlV1(sql: StudentPortalPostgresSqlV1, clientIp: string | null): StudentPortalPostgresSqlV1 {
  const ip = ipV1.nullable().parse(clientIp);
  return {
    unsafe: (query, parameters) => sql.unsafe(query, parameters),
    begin: (operation) => sql.begin(async (tx) => {
      await tx.unsafe("SELECT set_config('student_portal.audit_client_ip',$1,true)", [ip ?? '']);
      return operation(tx);
    }),
  };
}

// Static SQL fragments only; caller data always remains bound parameters.
export const AUDIT_IP_SOURCE_V1 = "(SELECT NULLIF(current_setting('student_portal.audit_client_ip',true),'')::inet AS client_ip) audit_ip";
export const AUDIT_IP_MASK_V1 = 'CASE WHEN client_ip IS NOT NULL THEN network(set_masklen(client_ip,CASE WHEN family(client_ip)=4 THEN 24 ELSE 48 END))::text END';
