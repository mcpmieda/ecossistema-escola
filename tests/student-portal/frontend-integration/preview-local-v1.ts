import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import postgres from 'postgres';
import QRCode from 'qrcode';
import { createIntegrationHarnessV1 } from './harness-v1';
import { localPortalDatabaseV1 } from '../frontend-foundation/harness-v1';
import { createPortalAdminClientV1 } from '../../../src/features/student-portal-admin/shared/admin-client-v1';
import { createPortalAdminReadClientV2 } from '../../../src/features/student-portal-admin/accounts/accounts-client-v2';

/** Manual QA only. Loopback and disposable DB guard are mandatory; never a production entrypoint. */
const target = process.env.PORTAL_TEST_DATABASE_URL ?? '';
localPortalDatabaseV1(target);
const sql = postgres(target, { max: 1, onnotice: () => undefined });
const harness = await createIntegrationHarnessV1(target);
const fetcher = async (path: string, init: RequestInit) =>
  harness.fetch({
    surface: 'admin',
    path,
    method: init.method,
    body: init.body as string | undefined,
  }) as unknown as Promise<Response>;
const client = createPortalAdminClientV1({ fetch: fetcher });
const reader = createPortalAdminReadClientV2({ fetch: fetcher });
const candidates = await sql.unsafe(
  "SELECT a.id FROM student_portal.account a JOIN gradebook.aluno g ON g.id=a.gradebook_student_id AND g.ano=a.academic_year WHERE g.nome LIKE 'SYNTHETIC P757 % ONE' ORDER BY a.created_at DESC LIMIT 1",
);
let card: Buffer | undefined;
if (candidates[0]) {
  const scope = {
    kind: 'account' as const,
    academicYear: 2026 as const,
    accountId: String(candidates[0].id),
  };
  const accounts = await reader.query({
    contractVersion: 2,
    operation: 'accounts-read',
    scope,
    page: {},
  });
  if (accounts.state === 'accounts-read') {
    const result = await client.command({
      contractVersion: 1,
      operation: 'qr-reprint',
      accountId: scope.accountId,
      expectedVersion: accounts.items[0]!.version,
      idempotencyKey: crypto.randomUUID(),
    });
    if (result.state === 'qr')
      card = await QRCode.toBuffer(result.cards[0]!.qr, {
        width: 640,
        margin: 4,
        errorCorrectionLevel: 'M',
      });
  }
}
await sql.end({ timeout: 2 });
const adminHeaders = Object.fromEntries(
  readFileSync('public/_headers', 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('  '))
    .map((line) => {
      const index = line.indexOf(':');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    })
    .filter(([key]) => key !== 'Cache-Control'),
);
const servers = (['admin', 'student'] as const).map((surface, index) => {
  const server = createServer(async (request, response) => {
    try {
      if (request.headers.host !== '127.0.0.1:' + (4182 + index)) {
        response.writeHead(403).end();
        return;
      }
      const path = request.url ?? '/';
      if (surface === 'student' && path === '/synthetic-card.png') {
        response
          .writeHead(card ? 200 : 404, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' })
          .end(card);
        return;
      }
      if (surface === 'admin' && !path.startsWith('/api/') && !path.startsWith('/auth/')) {
        const root = resolve('dist');
        const file = resolve(
          root,
          path === '/' ? 'index.html' : '.' + decodeURIComponent(path.split('?')[0]!),
        );
        if (!file.startsWith(root + sep) || !existsSync(file)) {
          response.writeHead(404).end();
          return;
        }
        const ext = file.split('.').at(-1)!;
        const type =
          (
            {
              html: 'text/html; charset=utf-8',
              css: 'text/css',
              js: 'text/javascript',
              woff2: 'font/woff2',
              png: 'image/png',
              svg: 'image/svg+xml',
            } as Record<string, string>
          )[ext] ?? 'application/octet-stream';
        const bytes = readFileSync(file);
        response
          .writeHead(200, { ...adminHeaders, 'Content-Type': type, 'Cache-Control': 'no-store' })
          .end(bytes);
        return;
      }
      let body = '';
      for await (const chunk of request) {
        body += String(chunk);
        if (body.length > 1024 * 1024) throw new Error('Local request too large');
      }
      const result = await harness.fetch({
        surface,
        path,
        method: request.method,
        cookie: request.headers.cookie,
        ...(body ? { body } : {}),
      });
      const bytes = Buffer.from(await result.arrayBuffer());
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(bytes);
    } catch {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      response
        .writeHead(503, { 'Cache-Control': 'no-store' })
        .end('Disposable preview unavailable');
    }
  });
  server.listen(4182 + index, '127.0.0.1');
  return server;
});
console.log(
  'Disposable preview ready: ADM 127.0.0.1:4182; student 127.0.0.1:4183. Synthetic data only.',
);
const close = async () => {
  for (const server of servers) server.close();
  await harness.dispose();
  process.exit(0);
};
process.on('SIGTERM', () => void close());
process.on('SIGINT', () => void close());
