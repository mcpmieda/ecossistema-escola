// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mockSecureJitterV1 } from './secure-jitter-fixture';
import { subscribeLiveRefreshV1 } from '../../src/shared/live-data/live-refresh-v1';
import { useRemoteLiveV1, type RemoteLiveStateV1 } from '../../src/shared/live-data/use-remote-live-v1';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly sent: string[] = [];
  readonly listeners = new Map<string, Set<(event: Event) => void>>();
  closed = false;
  constructor(readonly url: string | URL) { FakeWebSocket.instances.push(this); }
  addEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(type) ?? new Set(); listeners.add(listener); this.listeners.set(type, listeners);
  }
  send(value: string) { this.sent.push(value); }
  close() { this.closed = true; }
  emit(type: string, event: Event) { this.listeners.get(type)?.forEach((listener) => listener(event)); }
}

let root: Root | null;
let host: HTMLDivElement;
let state: RemoteLiveStateV1;
let authorizationLost: () => void;
let authorizationLostCalls: number;
function Probe() {
  state = useRemoteLiveV1({ path: '/api/student/live', enabled: true, onAuthorizationLost: authorizationLost });
  return null;
}
beforeEach(() => {
  vi.useFakeTimers(); mockSecureJitterV1(0);
  FakeWebSocket.instances = []; authorizationLostCalls = 0; authorizationLost = () => { authorizationLostCalls += 1; }; state = 'idle';
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  vi.stubGlobal('WebSocket', FakeWebSocket);
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null; host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function mount() { await act(async () => root!.render(createElement(Probe))); }

it('resumes in memory and turns a minimal remote notice into a coalesced authorized read', async () => {
  const refresh = vi.fn(async () => undefined);
  const dispose = subscribeLiveRefreshV1({ domains: ['portal'], refresh });
  await mount();
  const socket = FakeWebSocket.instances[0]!;
  expect(String(socket.url)).toBe('ws://localhost:3000/api/student/live');
  await act(async () => socket.emit('open', new Event('open')));
  expect(JSON.parse(socket.sent[0]!)).toEqual({ contractVersion: 1, type: 'resume', cursor: null });
  await act(async () => socket.emit('message', new MessageEvent('message', { data: JSON.stringify({
    contractVersion: 1, type: 'change', cursor: '00000000000000000001', domain: 'portal', version: '7',
    occurredAt: '2026-09-15T12:00:00.000Z',
  }) })));
  await vi.advanceTimersByTimeAsync(250);
  expect(state).toBe('connected'); expect(refresh).toHaveBeenCalledTimes(1);
  dispose();
});

it('closes while offline, reconnects only after online, and reports an authenticated denial', async () => {
  await mount();
  const first = FakeWebSocket.instances[0]!;
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  await act(async () => window.dispatchEvent(new Event('offline')));
  expect(first.closed).toBe(true); expect(state).toBe('reconnecting');
  await vi.advanceTimersByTimeAsync(60_000); expect(FakeWebSocket.instances).toHaveLength(1);
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  await act(async () => window.dispatchEvent(new Event('online')));
  const second = FakeWebSocket.instances[1]!;
  await act(async () => second.emit('close', new CloseEvent('close', { code: 4401 })));
  expect(authorizationLostCalls).toBe(1); expect(state).toBe('idle');
});
