import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StudentPortalApp } from '../../../src/student-portal/app';
import { createPortalSelfClientV1 } from '../../../src/features/student-portal/shared/self-client-v1';
import {
  SYNTHETIC_ID_V1,
  SYNTHETIC_SELF_V1,
} from '../../../shared/student-portal-contracts/fixtures-v1';
import { setupOperationsDomV1 } from '../ui/overview/dom-v1';

const meta = { contractVersion: 1, requestId: SYNTHETIC_ID_V1 };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it('keeps the anonymous file input mounted when the native picker returns focus', async () => {
  const fetcher = vi.fn(async () => json({ ...meta, state: 'unauthenticated' }, 401));
  render(<StudentPortalApp client={createPortalSelfClientV1({ fetch: fetcher })} />);
  await screen.findByRole('button', { name: 'Escolher imagem' });
  const input = document.querySelector('input[type="file"]');
  expect(input).toBeTruthy();
  await act(async () => {
    fireEvent(window, new Event('blur'));
    fireEvent(window, new Event('focus'));
  });
  expect(document.querySelector('input[type="file"]')).toBe(input);
  expect(input?.isConnected).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each(['focus', 'pageshow', 'popstate'])(
  'ignores passive %s and refuses revoked access on explicit reload',
  async (event) => {
    let revoked = false;
    const fetcher = vi.fn(async (path: string) =>
      path === '/api/student/session'
        ? revoked
          ? json({ ...meta, state: 'unauthenticated' }, 401)
          : json({
              ...meta,
              state: 'authenticated',
              persistent: false,
              expiresAt: new Date(Date.now() + 3600_000).toISOString(),
            })
        : json(SYNTHETIC_SELF_V1),
    );
    const client = createPortalSelfClientV1({ fetch: fetcher });
    const view = render(<StudentPortalApp client={client} />);
    await screen.findByText(SYNTHETIC_SELF_V1.profile.name);
    revoked = true;
    await act(async () => {
      fireEvent(window, new Event(event));
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.getByText(SYNTHETIC_SELF_V1.profile.name)).toBeTruthy();
    // A full reload creates a new application lifetime, not a passive focus event.
    view.unmount();
    render(<StudentPortalApp client={client} />);
    expect(screen.queryByText(SYNTHETIC_SELF_V1.profile.name)).toBeNull();
    await screen.findByRole('button', { name: 'Escolher imagem' });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/student/me')).toHaveLength(1);
    expect(screen.queryByText(SYNTHETIC_SELF_V1.profile.name)).toBeNull();
  },
);

it.each([false, true])(
  'clears protected history and reauthorizes only on explicit retry (persisted=%s)',
  async (persisted) => {
    const restoredSession = deferredResponse();
    let restoring = false;
    const fetcher = vi.fn((path: string) => {
      if (path === '/api/student/session') {
        if (restoring) return restoredSession.promise;
        return Promise.resolve(json({
          ...meta,
          state: 'authenticated',
          persistent: false,
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        }));
      }
      return Promise.resolve(json(SYNTHETIC_SELF_V1));
    });
    render(<StudentPortalApp client={createPortalSelfClientV1({ fetch: fetcher })} />);
    await screen.findByText(SYNTHETIC_SELF_V1.profile.name);
    act(() => {
      fireEvent(window, new Event('pagehide'));
      expect(screen.queryByText(SYNTHETIC_SELF_V1.profile.name)).toBeNull();
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    restoring = true;
    const show = new Event('pageshow');
    Object.defineProperty(show, 'persisted', { value: persisted });
    await act(async () => { fireEvent(window, show); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(SYNTHETIC_SELF_V1.profile.name)).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' })); });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(screen.queryByText(SYNTHETIC_SELF_V1.profile.name)).toBeNull();
    await act(async () => restoredSession.resolve(json({ ...meta, state: 'unauthenticated' }, 401)));
    await screen.findByRole('button', { name: 'Escolher imagem' });
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/student/me')).toHaveLength(1);
    expect(screen.queryByText(SYNTHETIC_SELF_V1.profile.name)).toBeNull();
  },
);

beforeEach(() => {
  setupOperationsDomV1();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([401, 503])(
  'shows a neutral initial state and never requests a profile when session returns %s',
  async (status) => {
    const session = deferredResponse();
    const fetcher = vi.fn((path: string) => {
      if (path !== '/api/student/session') throw new Error('Unexpected private request');
      return session.promise;
    });
    render(<StudentPortalApp client={createPortalSelfClientV1({ fetch: fetcher })} />);
    expect(screen.getByText('Verificando acesso…').getAttribute('role')).toBe('status');
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Perfil do aluno' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Minhas notas' })).toBeNull();
    await act(async () =>
      session.resolve(
        json({ ...meta, state: status === 401 ? 'unauthenticated' : 'unavailable' }, status),
      ),
    );
    if (status === 401)
      expect(await screen.findByRole('button', { name: 'Ler QR com câmera' })).toBeTruthy();
    else expect(await screen.findByText('Portal temporariamente indisponível')).toBeTruthy();
    expect(fetcher.mock.calls).toHaveLength(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/student/session');
    expect(screen.queryByText(SYNTHETIC_SELF_V1.profile.name)).toBeNull();
  },
);

it('reveals the complete student page only after both server session and private profile succeed', async () => {
  const session = deferredResponse(),
    profile = deferredResponse();
  const paths: string[] = [];
  const client = createPortalSelfClientV1({
    fetch: (path) => {
      paths.push(path);
      return path === '/api/student/session' ? session.promise : profile.promise;
    },
  });
  render(<StudentPortalApp client={client} />);
  expect(paths).toEqual(['/api/student/session']);
  await act(async () =>
    session.resolve(
      json({
        ...meta,
        state: 'authenticated',
        persistent: false,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      }),
    ),
  );
  await waitFor(() => expect(paths).toEqual(['/api/student/session', '/api/student/me']));
  expect(screen.queryByRole('banner')).toBeNull();
  expect(screen.queryByText(SYNTHETIC_SELF_V1.profile.name)).toBeNull();
  await act(async () => profile.resolve(json(SYNTHETIC_SELF_V1)));
  expect(await screen.findByText(SYNTHETIC_SELF_V1.profile.name)).toBeTruthy();
  expect(screen.getByRole('banner')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Sair' })).toBeTruthy();
});

it.each(['unavailable', 'network-error'] as const)(
  'does not send a session to login on reload failure %s and recovers by explicit retry',
  async (failure) => {
    let failing = false;
    const client = createPortalSelfClientV1({
      fetch: async (path) => {
        if (path === '/api/student/session') {
          if (failing && failure === 'network-error') throw new TypeError('Synthetic offline');
          if (failing) return json({ ...meta, state: 'unavailable' }, 503);
          return json({
            ...meta,
            state: 'authenticated',
            persistent: false,
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          });
        }
        return json(SYNTHETIC_SELF_V1);
      },
    });
    const view = render(<StudentPortalApp client={client} />);
    await screen.findByText(SYNTHETIC_SELF_V1.profile.name);
    failing = true;
    view.unmount();
    render(<StudentPortalApp client={client} />);
    expect(await screen.findByRole('button', { name: 'Tentar novamente' })).toBeTruthy();
    expect(screen.queryByText(SYNTHETIC_SELF_V1.profile.name)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Acessar minhas notas' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Entrar' })).toBeNull();
    failing = false;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    });
    expect(await screen.findByText(SYNTHETIC_SELF_V1.profile.name)).toBeTruthy();
  },
);
