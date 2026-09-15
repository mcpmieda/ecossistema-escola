export type LiveDomainV1 = 'gradebook' | 'portal';
export const LIVE_REFRESH_INTERVAL_V1 = 30_000;
const MIN_GAP = 2_000;
const CHANNEL = 'ecossistema-invalidation-v1';
interface Subscription {
  domains: readonly LiveDomainV1[];
  refresh: () => void | Promise<unknown>;
  canRefresh: () => boolean;
  interval: number;
  nextAt: number;
  lastAt: number;
  pending: boolean;
  dirty: boolean;
}
const subscriptions = new Set<Subscription>();
let timer: ReturnType<typeof setTimeout> | undefined;
let channel: BroadcastChannel | undefined;
let listening = false;
const visible = () => document.visibilityState !== 'hidden' && navigator.onLine !== false;
const jitter = () => Math.floor(Math.random() * 1_000);
function wake() {
  clearTimeout(timer);
  timer = undefined;
  if (!subscriptions.size || !visible()) return;
  const next = Math.min(...Array.from(subscriptions).filter((entry) => !entry.pending).map((entry) => entry.nextAt));
  if (!Number.isFinite(next)) return;
  timer = setTimeout(tick, Math.max(0, next - Date.now()));
}
function request(entry: Subscription) {
  if (entry.pending) { entry.dirty = true; return; }
  entry.nextAt = Math.min(entry.nextAt, Math.max(Date.now() + 250, entry.lastAt + MIN_GAP));
}
function invalidate(domain: LiveDomainV1) {
  for (const entry of subscriptions) if (entry.domains.includes(domain)) request(entry);
  wake();
}
function resume() {
  if (visible()) for (const entry of subscriptions) request(entry);
  wake();
}
function tick() {
  timer = undefined;
  if (!visible()) return;
  const now = Date.now();
  for (const entry of subscriptions) {
    if (entry.pending || entry.nextAt > now) continue;
    if (!entry.canRefresh()) { entry.nextAt = now + 1_000; continue; }
    entry.pending = true;
    entry.dirty = false;
    entry.lastAt = now;
    void Promise.resolve().then(entry.refresh).catch(() => {
      // The owning reader reports its typed failure; the scheduler never retries a write.
    }).finally(() => {
      entry.pending = false;
      if (!subscriptions.has(entry)) return;
      entry.nextAt = Date.now() + entry.interval + jitter();
      if (entry.dirty) request(entry);
      wake();
    });
  }
  wake();
}
function start() {
  if (listening) return;
  listening = true;
  window.addEventListener('focus', resume);
  window.addEventListener('online', resume);
  window.addEventListener('offline', resume);
  document.addEventListener('visibilitychange', resume);
  try {
    if (typeof window.BroadcastChannel === 'function') {
      channel = new window.BroadcastChannel(CHANNEL);
      channel.onmessage = ({ data }: MessageEvent<unknown>) => {
        if (data === null || typeof data !== 'object' || Array.isArray(data)) return;
        const value = data as Record<string, unknown>;
        if (Object.keys(value).length !== 2 || value.type !== 'invalidate') return;
        if (value.domain === 'gradebook' || value.domain === 'portal') invalidate(value.domain);
      };
    }
  } catch { channel = undefined; } // Polling remains available when channels are unavailable.
}
function stop() {
  if (subscriptions.size || !listening) return;
  clearTimeout(timer); timer = undefined;
  window.removeEventListener('focus', resume);
  window.removeEventListener('online', resume);
  window.removeEventListener('offline', resume);
  document.removeEventListener('visibilitychange', resume);
  channel?.close(); channel = undefined; listening = false;
}
/** Read invalidation only. No identity, academic data, credential, payload or storage is shared.
 * Same-origin BroadcastChannel is not a server push connection or a cross-device transport.
 */
export function notifyLiveChangeV1(domain: LiveDomainV1) {
  if (typeof window === 'undefined') return;
  invalidate(domain);
  try {
    if (channel) channel.postMessage({ type: 'invalidate', domain });
    else if (typeof window.BroadcastChannel === 'function') {
      const temporary = new window.BroadcastChannel(CHANNEL);
      temporary.postMessage({ type: 'invalidate', domain });
      temporary.close();
    }
  } catch { /* An optional notification never changes a committed operation's result. */ }
}
/** One listener set and one clock per document; at most one read in flight per subscriber.
 * An invalidation received during a read is coalesced into one later revalidation.
 */
export function subscribeLiveRefreshV1(options: {
  domains: readonly LiveDomainV1[];
  refresh: () => void | Promise<unknown>;
  canRefresh?: () => boolean;
  intervalMs?: number;
}): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined;
  const interval = Math.max(10_000, options.intervalMs ?? LIVE_REFRESH_INTERVAL_V1);
  const entry: Subscription = {
    domains: options.domains, refresh: options.refresh, canRefresh: options.canRefresh ?? (() => true),
    interval, nextAt: Date.now() + interval + jitter(), lastAt: 0, pending: false, dirty: false,
  };
  subscriptions.add(entry); start(); wake();
  return () => { subscriptions.delete(entry); stop(); if (subscriptions.size) wake(); };
}
