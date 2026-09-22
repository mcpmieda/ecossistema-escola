// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StudentPortalApp } from '../../../src/student-portal/app';
import { clientFixtureV1, SESSION } from '../ui/auth/fixtures-v1';
import { setupOperationsDomV1 } from '../ui/overview/dom-v1';

beforeEach(() => {
  setupOperationsDomV1();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('renders the actual student application with only the security channel and no background notices', async () => {
  const socket = vi.fn(function () {
    return { addEventListener: vi.fn(), close: vi.fn(), send: vi.fn() };
  });
  const fetcher = vi.fn();
  vi.stubGlobal('WebSocket', socket);
  vi.stubGlobal('fetch', fetcher);
  const client = clientFixtureV1();
  // Keep the UI scheduler's real clock; only the synthetic session needs a future expiry.
  client.session.mockResolvedValue({
    ...SESSION,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  });
  render(<StudentPortalApp client={client} />);
  await screen.findByRole('heading', { name: 'Minhas notas' });
  expect(screen.getByRole('button', { name: 'Sair' })).toBeTruthy();
  act(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  // Only the security-only channel (revocation/presence) may connect; grades stay manual.
  expect(socket).toHaveBeenCalledTimes(1);
  const url = new URL(String((socket.mock.calls[0] as unknown[])[0]));
  expect(url.pathname).toBe('/api/student/live');
  expect(url.searchParams.get('purpose')).toBe('security');
  expect(fetcher).not.toHaveBeenCalled();
  expect(client.session).toHaveBeenCalledTimes(1);
  expect(client.me).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/recuperação periódica continua ativa/u)).toBeNull();
});
