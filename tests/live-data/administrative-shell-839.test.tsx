// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { PLATFORM_CAPABILITIES } from '../../shared/platform-contract';
import { buildPlatformSnapshot } from '../../server/platform/snapshot';

const { reads } = vi.hoisted(() => ({ reads: vi.fn(async () => true) }));
vi.mock('../../src/platform/pages', async () => {
  const React = await import('react');
  const { useAdministrativeLiveV1 } = await import('../../src/shared/live-data/administrative-live-v1');
  const { useLiveRefreshV1 } = await import('../../src/shared/live-data/use-live-refresh-v1');
  const { useDraftNavigationGuardV1 } = await import('../../src/shared/forms/draft-navigation-v1');
  return {
    LoadingWorkspace: () => <p>Carregando área sintética</p>,
    PageContent: function Workspace({ route }: { route: string }) {
      const [value, setValue] = React.useState('');
      const live = useAdministrativeLiveV1();
      useDraftNavigationGuardV1(value !== '');
      useLiveRefreshV1(reads, { domains: ['gradebook'], canRefresh: () => value === '' });
      return <><input aria-label={`workspace-${route}`} value={value} onChange={(event) => setValue(event.target.value)} />
        <span data-testid="workspace-live">{live}</span></>;
    },
  };
});
class Socket extends EventTarget {
  static instances: Socket[] = [];
  closed = false;
  constructor(readonly url: string | URL) { super(); Socket.instances.push(this); }
  send() {}
  close() { this.closed = true; }
  message(input: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(input) })); }
  deny() { this.closed = true; this.dispatchEvent(new CloseEvent('close', { code: 4403 })); }
}
const snapshot = () => buildPlatformSnapshot({ lists: [], moduleItems: [], configurationItems: [], auditItems: [], migrationItems: [], correlationId: 'synthetic' }, PLATFORM_CAPABILITIES);
let key: string;
let status: number;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
const flush = () => act(async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
beforeEach(() => {
  vi.useFakeTimers(); vi.spyOn(Math, 'random').mockReturnValue(0);
  reads.mockClear(); Socket.instances = []; key = 'synthetic-a'; status = 200;
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  window.history.replaceState(null, '', '/#/banco-de-notas');
  vi.stubGlobal('WebSocket', Socket);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  fetcher = vi.fn<typeof fetch>(async (path) => {
    if (path === '/api/me') return status === 200
      ? Response.json({ authenticated: true, identityKey: key, expiresAt, capabilities: PLATFORM_CAPABILITIES })
      : new Response(null, { status });
    if (path === '/api/platform/bootstrap' || path === '/api/platform/snapshot-v2') return Response.json(snapshot());
    throw new Error('Unexpected synthetic request');
  });
  vi.stubGlobal('fetch', fetcher);
});
afterEach(async () => { cleanup(); await flush(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
it('the real App owns one socket, routes a notice to its Bank reader, and preserves a draft on a broad update', async () => {
  render(<App />); await flush();
  const input = screen.getByLabelText('workspace-banco-de-notas') as HTMLInputElement;
  expect(Socket.instances).toHaveLength(1);
  const notice = { contractVersion: 1, type: 'change', cursor: '00000000000000000001', domain: 'gradebook', version: 'revision:1', occurredAt: new Date().toISOString() };
  await act(async () => Socket.instances[0]!.message(notice)); await advance(250);
  expect(reads).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { value: 'rascunho local' } });
  await act(async () => Socket.instances[0]!.message({ ...notice, cursor: '00000000000000000002' }));
  await advance(2_000);
  expect(reads).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Há atualizações a conferir/)).toBeTruthy();
  expect(screen.getByLabelText('workspace-banco-de-notas')).toBe(input);
  expect(input.value).toBe('rascunho local');
  expect(fetcher.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
});
it.each([401, 403])('confirmed identity denial %i removes the workspace after a socket denial', async (code) => {
  render(<App />); await flush();
  expect(screen.getByLabelText('workspace-banco-de-notas')).toBeTruthy();
  status = code;
  await act(async () => Socket.instances[0]!.deny()); await flush();
  expect(screen.queryByLabelText('workspace-banco-de-notas')).toBeNull();
  expect(Socket.instances.every((socket) => socket.closed)).toBe(true);
});
it('a transient identity error retains the same draft; an actual identity change resets it', async () => {
  render(<App />); await flush();
  const input = screen.getByLabelText('workspace-banco-de-notas') as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'edição não salva' } });
  status = 503;
  await act(async () => Socket.instances[0]!.deny()); await flush();
  expect(screen.getByLabelText('workspace-banco-de-notas')).toBe(input);
  expect(input.value).toBe('edição não salva');
  status = 200; key = 'synthetic-b';
  await advance(10_000);
  await act(async () => window.dispatchEvent(new Event('focus'))); await flush();
  const next = screen.getByLabelText('workspace-banco-de-notas') as HTMLInputElement;
  expect(next).not.toBe(input); expect(next.value).toBe('');
  expect(Socket.instances.filter((socket) => !socket.closed)).toHaveLength(1);
});
