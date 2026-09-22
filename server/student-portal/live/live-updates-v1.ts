import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';
import {
  liveAudienceV1,
  livePublishEventV1,
  liveResumeV1,
  type LivePublishEventV1,
} from '../../../shared/student-portal-contracts/live-v1';
import type { PortalCompositionEnvV1 } from '../composition/config-v1';
import { PortalSignalBufferV1 } from '../observability/signal-buffer-v1';

const socketIdentityV1 = z.object({
  audience: liveAudienceV1,
  expiresAt: z.iso.datetime({ offset: true }),
  accountId: z.uuid().nullable(),
  studentId: z.number().int().positive().safe().nullable(),
  classId: z.number().int().positive().safe().nullable(),
}).strict();
type SocketIdentityV1 = z.infer<typeof socketIdentityV1> & { resumed: boolean };
const socketAttachmentV1 = socketIdentityV1.extend({ resumed: z.boolean() }).strict();

/** One SQLite-backed coordination atom per authenticated audience/year. Browser sockets never access it directly. */
export class PortalLiveUpdatesV1 extends DurableObject<PortalCompositionEnvV1> {
  private signals: PortalSignalBufferV1 | undefined;
  constructor(ctx: DurableObjectState, env: PortalCompositionEnvV1) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS live_head_v1 (
      singleton INTEGER PRIMARY KEY CHECK(singleton=1),
      cursor TEXT NOT NULL,
      domain TEXT NOT NULL,
      version TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    )`);
  }
  private signalBuffer(): PortalSignalBufferV1 {
    if (this.signals) return this.signals;
    const sql = this.ctx.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS operational_signal_checkpoint_v1 (singleton INTEGER PRIMARY KEY CHECK(singleton=1), payload TEXT NOT NULL)');
    this.signals = new PortalSignalBufferV1({
      read: () => {
        const row = sql.exec<{ payload: string }>('SELECT payload FROM operational_signal_checkpoint_v1 WHERE singleton=1').toArray()[0];
        try { return row ? JSON.parse(row.payload) as unknown : null; } catch { return null; }
      },
      write: (value) => { sql.exec('INSERT INTO operational_signal_checkpoint_v1(singleton,payload) VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET payload=excluded.payload', JSON.stringify(value)); },
    });
    return this.signals;
  }
  async recordOperationalSignal(input: unknown): Promise<boolean> { return this.signalBuffer().record(input); }
  async operationalSignals() { return this.signalBuffer().snapshot(); }

  private head(): string | null {
    const row = this.ctx.storage.sql.exec<{ cursor: string }>(
      'SELECT cursor FROM live_head_v1 WHERE singleton=1',
    ).toArray()[0];
    return row?.cursor ?? null;
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.method !== 'GET' || request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
      return new Response(null, { status: 404 });
    const parsed = socketIdentityV1.safeParse({
      audience: request.headers.get('x-live-audience'),
      expiresAt: request.headers.get('x-live-expires-at'),
      accountId: request.headers.get('x-live-account-id') || null,
      studentId: request.headers.get('x-live-student-id') ? Number(request.headers.get('x-live-student-id')) : null,
      classId: request.headers.get('x-live-class-id') ? Number(request.headers.get('x-live-class-id')) : null,
    });
    if (!parsed.success || Date.parse(parsed.data.expiresAt) <= Date.now())
      return new Response(null, { status: 403 });
    if (parsed.data.audience === 'student' && (!parsed.data.accountId || !parsed.data.studentId))
      return new Response(null, { status: 403 });
    if (parsed.data.audience === 'admin' && (parsed.data.accountId || parsed.data.studentId || parsed.data.classId))
      return new Response(null, { status: 403 });
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server, [parsed.data.audience]);
    server.serializeAttachment({ ...parsed.data, resumed: false } satisfies SocketIdentityV1);
    return new Response(null, { status: 101, webSocket: client });
  }

  async publish(input: unknown): Promise<'delivered' | 'duplicate'> {
    const event = livePublishEventV1.parse(input);
    const previous = this.head();
    const outOfOrder = previous !== null && previous >= event.cursor;
    if (!outOfOrder) this.ctx.storage.sql.exec(
      `INSERT INTO live_head_v1(singleton,cursor,domain,version,occurred_at) VALUES(1,?,?,?,?)
       ON CONFLICT(singleton) DO UPDATE SET cursor=excluded.cursor,domain=excluded.domain,
         version=excluded.version,occurred_at=excluded.occurred_at WHERE excluded.cursor>live_head_v1.cursor`,
      event.cursor, event.domain, event.version, event.occurredAt,
    );
    // Sequence allocation is not commit/delivery order. A late event or an ambiguous retry
    // must not disappear just because another domain advanced the high-water cursor.
    const message = JSON.stringify(outOfOrder
      ? { contractVersion: 1, type: 'resync', cursor: previous, domains: [event.domain] }
      : { contractVersion: 1, type: 'change', cursor: event.cursor,
          domain: event.domain, version: event.version, occurredAt: event.occurredAt });
    for (const socket of this.ctx.getWebSockets(event.audience)) {
      const identity = socketAttachmentV1.safeParse(socket.deserializeAttachment());
      if (!identity.success || Date.parse(identity.data.expiresAt) <= Date.now()) {
        socket.close(4401, 'authorization-expired');
        continue;
      }
      if (event.audience === 'student' && !this.matches(identity.data, event)) continue;
      try { socket.send(message); } catch { socket.close(1011, 'delivery-failed'); }
    }
    return outOfOrder ? 'duplicate' : 'delivered';
  }

  private matches(identity: z.infer<typeof socketIdentityV1>, event: LivePublishEventV1): boolean {
    if (event.accountId) return identity.accountId === event.accountId;
    if (event.classId) return identity.classId === event.classId;
    if (event.studentIds.length) return identity.studentId !== null && event.studentIds.includes(identity.studentId);
    return true;
  }

  override webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== 'string' || message.length > 512) {
      socket.close(1003, 'invalid-message');
      return;
    }
    let input: unknown;
    try { input = JSON.parse(message); } catch { socket.close(1003, 'invalid-message'); return; }
    const resume = liveResumeV1.safeParse(input);
    const identity = socketAttachmentV1.safeParse(socket.deserializeAttachment());
    if (!identity.success || Date.parse(identity.data.expiresAt) <= Date.now()) {
      socket.close(4401, 'authorization-expired');
      return;
    }
    if (!resume.success) { socket.close(1003, 'invalid-message'); return; }
    const cursor = this.head();
    // A high-water cursor cannot prove that all smaller transactions committed before
    // disconnection. Always revalidate once on reconnect if either side has history.
    const needsResync = cursor !== null || resume.data.cursor !== null;
    socket.send(JSON.stringify(needsResync
      ? { contractVersion: 1, type: 'resync', cursor, domains: ['gradebook', 'portal'] }
      : { contractVersion: 1, type: 'connected', cursor }));
    socket.serializeAttachment({ ...identity.data, resumed: true } satisfies SocketIdentityV1);
  }

  override webSocketClose(socket: WebSocket, code: number, reason: string): void { socket.close(code, reason); }
  override webSocketError(socket: WebSocket): void { socket.close(1011, 'socket-error'); }
}
