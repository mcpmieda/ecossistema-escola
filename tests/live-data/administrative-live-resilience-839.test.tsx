// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AdministrativeLiveProviderV1, useAdministrativeLiveV1 } from '../../src/shared/live-data/administrative-live-v1';
import { useRemoteLiveV1 } from '../../src/shared/live-data/use-remote-live-v1';
import { notifyLiveChangeV1, subscribeLiveChangesV1 } from '../../src/shared/live-data/live-refresh-v1';

class Socket extends EventTarget {
  static instances: Socket[] = [];
  closed = false;
  send = vi.fn();
  close = vi.fn(() => { this.closed = true; this.dispatchEvent(new CloseEvent('close', { code: 1000 })); });
  constructor(readonly url: string | URL) { super(); Socket.instances.push(this); }
  open() { this.dispatchEvent(new Event('open')); }
  message(data: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) })); }
  deny() { this.closed = true; this.dispatchEvent(new CloseEvent('close', { code: 4403 })); }
}
const dispose: Array<() => void> = [];
const change = { contractVersion: 1, type: 'change', cursor: '00000000000000000001',
  domain: 'gradebook', version: 'revision:1', occurredAt: '2026-09-17T15:54:00.000Z' };
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
beforeEach(() => {
  vi.useFakeTimers(); vi.spyOn(Math, 'random').mockReturnValue(0);
  Socket.instances = []; vi.stubGlobal('WebSocket', Socket);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});
afterEach(() => { cleanup(); dispose.splice(0).forEach((stop) => stop());
  vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
function Consumer({ label }: { label: string }) {
  const state = useAdministrativeLiveV1({ identityKey: 'synthetic-user' });
  return <output data-testid={label}>{state}</output>;
}
function Remote({ identityKey = 'synthetic-a', onLost = () => undefined, path = '/api/student-portal/admin/live' }: {
  identityKey?: string; onLost?: () => void; path?: string;
}) {
  const state = useRemoteLiveV1({ path, identityKey, enabled: true, onAuthorizationLost: onLost });
  return <output data-testid="remote-state">{state}</output>;
}
it('uses one administrative socket for multiple consumers under the authenticated owner', async () => {
  render(<AdministrativeLiveProviderV1 identityKey="synthetic-session" enabled>
    <Consumer label="bank" /><Consumer label="portal" /><Consumer label="drawer" />
  </AdministrativeLiveProviderV1>);
  expect(Socket.instances).toHaveLength(1);
  await act(async () => Socket.instances[0]!.message({ contractVersion: 1, type: 'connected', cursor: null }));
  for (const label of ['bank', 'portal', 'drawer']) expect(screen.getByTestId(label).textContent).toBe('connected');
});
it('does not enable a socket without a server identity or capability', () => {
  const view = render(<AdministrativeLiveProviderV1 enabled><Consumer label="bank" /></AdministrativeLiveProviderV1>);
  expect(Socket.instances).toHaveLength(0);
  view.rerender(<AdministrativeLiveProviderV1 enabled={false} identityKey="synthetic-session"><Consumer label="bank" /></AdministrativeLiveProviderV1>);
  expect(Socket.instances).toHaveLength(0);
});
it('keeps at most one socket during StrictMode replay and disposes the final one', () => {
  const view = render(<StrictMode><AdministrativeLiveProviderV1 identityKey="synthetic-session" enabled>
    <Consumer label="bank" /><Consumer label="portal" />
  </AdministrativeLiveProviderV1></StrictMode>);
  expect(Socket.instances.filter((socket) => !socket.closed)).toHaveLength(1);
  view.unmount();
  expect(Socket.instances.filter((socket) => !socket.closed)).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
});
it('resets the cursor on identity change and ignores the detached prior connection', async () => {
  const notices = vi.fn(); dispose.push(subscribeLiveChangesV1(notices));
  const view = render(<Remote />); const old = Socket.instances[0]!;
  await act(async () => old.message(change));
  view.rerender(<Remote identityKey="synthetic-b" />);
  expect(old.closed).toBe(true);
  const current = Socket.instances[1]!;
  await act(async () => { current.open(); old.message({ ...change, cursor: '00000000000000000002' }); });
  expect(JSON.parse(current.send.mock.calls[0]![0])).toEqual({ contractVersion: 1, type: 'resume', cursor: null });
  expect(notices).toHaveBeenCalledTimes(1);
});
it('bounds an absent handshake without resetting backoff merely on TCP open', async () => {
  render(<Remote />);
  await act(async () => Socket.instances[0]!.open());
  await advance(10_000);
  expect(Socket.instances[0]!.closed).toBe(true); expect(Socket.instances).toHaveLength(1);
  await advance(1_000); expect(Socket.instances).toHaveLength(2);
  await act(async () => Socket.instances[1]!.open());
  await advance(10_000); await advance(1_000); expect(Socket.instances).toHaveLength(2);
  await advance(1_000); expect(Socket.instances).toHaveLength(3);
});
it('does not bypass reconnection backoff on repeated visibility events', async () => {
  render(<Remote />);
  await act(async () => Socket.instances[0]!.dispatchEvent(new Event('error')));
  await act(async () => { for (let i = 0; i < 10; i++) document.dispatchEvent(new Event('visibilitychange')); });
  await advance(999); expect(Socket.instances).toHaveLength(1);
  await advance(1); expect(Socket.instances).toHaveLength(2);
});
it.each(['hidden', 'offline'])('closes while %s and reconnects once on return', async (condition) => {
  render(<Remote />);
  await act(async () => Socket.instances[0]!.message({ contractVersion: 1, type: 'connected', cursor: null }));
  if (condition === 'hidden') Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  else Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  await act(async () => condition === 'hidden' ? document.dispatchEvent(new Event('visibilitychange')) : window.dispatchEvent(new Event('offline')));
  expect(Socket.instances[0]!.closed).toBe(true);
  await advance(60_000); expect(Socket.instances).toHaveLength(1);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  await act(async () => { window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); });
  expect(Socket.instances).toHaveLength(2);
});
it('treats authenticated denial as terminal until the identity scope changes', async () => {
  const lost = vi.fn(); const view = render(<Remote onLost={lost} />);
  await act(async () => Socket.instances[0]!.deny()); await advance(60_000);
  await act(async () => { window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); });
  expect(lost).toHaveBeenCalledTimes(1); expect(Socket.instances).toHaveLength(1);
  expect(screen.getByTestId('remote-state').textContent).toBe('idle');
  view.rerender(<Remote onLost={lost} identityKey="synthetic-new-session" />);
  expect(Socket.instances).toHaveLength(2);
});
it('deduplicates exact changes but never suppresses resync or echoes remote notices to other tabs', async () => {
  const notices = vi.fn(), post = vi.fn();
  class Channel { postMessage = post; close = vi.fn(); }
  vi.stubGlobal('BroadcastChannel', Channel); dispose.push(subscribeLiveChangesV1(notices));
  render(<Remote />); const socket = Socket.instances[0]!;
  await act(async () => { socket.message(change); socket.message(change); });
  expect(notices).toHaveBeenCalledTimes(1);
  const resync = { contractVersion: 1, type: 'resync', cursor: change.cursor, domains: ['gradebook'] };
  await act(async () => { socket.message(resync); socket.message(resync); });
  expect(notices).toHaveBeenCalledTimes(3); expect(post).not.toHaveBeenCalled();
  await act(async () => notifyLiveChangeV1('gradebook'));
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith({ type: 'invalidate', domain: 'gradebook' });
});
it('rejects a cross-origin live path without connecting', () => {
  render(<Remote path="https://untrusted.invalid/live" />);
  expect(Socket.instances).toHaveLength(0);
  expect(screen.getByTestId('remote-state').textContent).toBe('unsupported');
});
