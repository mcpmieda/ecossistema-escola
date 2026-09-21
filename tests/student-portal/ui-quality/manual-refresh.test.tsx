import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StudentPortalApp } from '../../../src/student-portal/app';
import { clientFixtureV1, NOW } from '../ui/auth/fixtures-v1';
import { setupOperationsDomV1 } from '../ui/overview/dom-v1';

beforeEach(() => {
  setupOperationsDomV1();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('renders the actual student application without a live connection or background notices', async () => {
  const socket = vi.fn(function () {
    return { addEventListener: vi.fn(), close: vi.fn(), send: vi.fn() };
  });
  const fetcher = vi.fn();
  vi.stubGlobal('WebSocket', socket);
  vi.stubGlobal('fetch', fetcher);
  const client = clientFixtureV1();
  render(<StudentPortalApp client={client} />);
  await screen.findByRole('button', { name: 'Sair' });
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(socket).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  expect(client.session).toHaveBeenCalledTimes(1);
  expect(client.me).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/recuperação periódica continua ativa/u)).toBeNull();
});
