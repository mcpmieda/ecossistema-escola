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
  'removes revoked data after revalidation on %s, clearing history immediately',
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
    render(<StudentPortalApp client={createPortalSelfClientV1({ fetch: fetcher })} />);
    await screen.findByText(SYNTHETIC_SELF_V1.profile.name);
    revoked = true;
    act(() => {
      fireEvent(window, new Event(event));
    });
    if (event !== 'focus') expect(screen.queryByText(SYNTHETIC_SELF_V1.profile.name)).toBeNull();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.queryByText(SYNTHETIC_SELF_V1.profile.name)).toBeNull());
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
    expect(screen.getByRole('status').textContent).toBe('Verificando acesso…');
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
  'does not send an existing session to login on %s and recovers without credentials',
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
    render(<StudentPortalApp client={client} />);
    await screen.findByText(SYNTHETIC_SELF_V1.profile.name);
    failing = true;
    await act(async () => {
      fireEvent(window, new Event('focus'));
    });
    expect(await screen.findByRole('button', { name: 'Tentar novamente' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Acessar minhas notas' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Entrar' })).toBeNull();
    failing = false;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    });
    expect(await screen.findByText(SYNTHETIC_SELF_V1.profile.name)).toBeTruthy();
  },
);
