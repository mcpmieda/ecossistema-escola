import { StrictMode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../src/App';

const authenticated = () => Response.json({ authenticated: true, capabilities: [] });
const login = () => screen.queryByRole('button', { name: 'Entrar com conta institucional' });

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each([401, 200])('shows login for an authoritative anonymous response (%s)', async (status) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ authenticated: false }, { status })),
  );
  render(<App />);
  expect(
    await screen.findByRole('button', { name: 'Entrar com conta institucional' }),
  ).toBeTruthy();
});

it.each(['403', '503', 'network', 'invalid-json', 'invalid-identity', 'invalid-capabilities'])(
  'keeps %s distinct from logout and recovers without signing in again',
  async (failure) => {
    const fetcher = vi.fn<typeof fetch>();
    if (failure === 'network') fetcher.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    else if (failure === 'invalid-json')
      fetcher.mockResolvedValueOnce(new Response('<html>unavailable</html>'));
    else if (failure === 'invalid-identity') fetcher.mockResolvedValueOnce(Response.json({}));
    else if (failure === 'invalid-capabilities')
      fetcher.mockResolvedValueOnce(
        Response.json({ authenticated: true, capabilities: 'invalid' }),
      );
    else fetcher.mockResolvedValueOnce(new Response(null, { status: Number(failure) }));
    fetcher.mockResolvedValueOnce(authenticated());
    vi.stubGlobal('fetch', fetcher);
    render(<App />);
    expect(await screen.findByText('Não foi possível verificar seu acesso.')).toBeTruthy();
    expect(login()).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Você não tem acesso a esta área')).toBeTruthy();
    expect(login()).toBeNull();
    expect(screen.queryByText('Não foi possível verificar seu acesso.')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]![1]).toMatchObject({
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
    });
  },
);

it('keeps both login and protected shell hidden while the initial response is pending', () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => new Promise(() => {})),
  );
  render(<App />);
  expect(screen.getByRole('main', { name: 'Carregando Centro de Administração' })).toBeTruthy();
  expect(login()).toBeNull();
  expect(screen.queryByRole('navigation')).toBeNull();
});

it.each(['anonymous', 'failure', 'json'])(
  'ignores an obsolete %s response after a newer authenticated entry',
  async (oldResult) => {
    let resolveOld!: (response: Response) => void;
    let rejectOld!: (reason: Error) => void;
    const pending = new Promise<Response>((resolve, reject) => {
      resolveOld = resolve;
      rejectOld = reject;
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce(authenticated());
    vi.stubGlobal('fetch', fetcher);
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    expect(await screen.findByText('Você não tem acesso a esta área')).toBeTruthy();
    expect(fetcher.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    await act(async () => {
      if (oldResult === 'failure') rejectOld(new TypeError('Failed to fetch'));
      else
        resolveOld(
          oldResult === 'anonymous'
            ? new Response(null, { status: 401 })
            : Response.json({ authenticated: false }),
        );
    });
    expect(screen.getByText('Você não tem acesso a esta área')).toBeTruthy();
    expect(login()).toBeNull();
    expect(screen.queryByText('Não foi possível verificar seu acesso.')).toBeNull();
  },
);
