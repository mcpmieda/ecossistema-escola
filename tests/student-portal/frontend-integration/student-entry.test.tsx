import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StudentPortalApp, type StudentEntryV1 } from '../../../src/student-portal/app';
import { createPortalSelfClientV1 } from '../../../src/features/student-portal/shared/self-client-v1';
import {
  SYNTHETIC_ID_V1,
  SYNTHETIC_QR_V1,
  SYNTHETIC_SELF_V1,
} from '../../../shared/student-portal-contracts/fixtures-v1';
import { setupOperationsDomV1 } from '../ui/overview/dom-v1';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
const meta = { contractVersion: 1, requestId: SYNTHETIC_ID_V1 };
function transport(initiallyAuthenticated = false) {
  let authenticated = initiallyAuthenticated;
  const calls: { path: string; init: RequestInit }[] = [];
  let failLogout = false;
  const fetcher = vi.fn(async (path: string, init: RequestInit) => {
    calls.push({ path, init });
    const session = {
      ...meta,
      state: 'authenticated',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      persistent: true,
    };
    if (path === '/api/student/session')
      return json(
        authenticated ? session : { ...meta, state: 'unauthenticated' },
        authenticated ? 200 : 401,
      );
    if (path === '/api/student/me') return json(SYNTHETIC_SELF_V1);
    if (path === '/api/student/auth/challenge')
      return json({ ...meta, state: 'credential-required', next: 'password' });
    if (path === '/api/student/auth/login') {
      authenticated = true;
      return json(session);
    }
    if (path === '/api/student/auth/logout') {
      if (failLogout) throw new TypeError('synthetic lost response');
      authenticated = false;
      return json({ ...meta, state: 'logged-out' });
    }
    throw new Error('Unexpected synthetic path');
  });
  return {
    client: createPortalSelfClientV1({ fetch: fetcher }),
    calls,
    setLogoutFailure: (value: boolean) => {
      failLogout = value;
    },
    expire: () => {
      authenticated = false;
    },
  };
}
beforeEach(() => {
  setupOperationsDomV1();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('mounts the real scanner on an anonymous root without disclosing a profile', async () => {
  const api = transport();
  render(<StudentPortalApp client={api.client} />);
  expect(await screen.findByRole('button', { name: 'Ler QR com câmera' })).toBeTruthy();
  expect(screen.queryByText(SYNTHETIC_SELF_V1.profile.name)).toBeNull();
  expect(api.calls.map((call) => call.path)).toEqual(['/api/student/session']);
});
it('composes QR, password, session, profile and real grades under StrictMode with no persistent credential', async () => {
  const api = transport();
  const entry: StudentEntryV1 = { qr: SYNTHETIC_QR_V1, invalidQr: false, route: 'access' };
  window.history.replaceState(null, '', '/access');
  const user = userEvent.setup();
  render(
    <StrictMode>
      <StudentPortalApp client={api.client} entry={entry} />
    </StrictMode>,
  );
  await user.type(await screen.findByLabelText('Senha'), '012345');
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
  expect(await screen.findByText(SYNTHETIC_SELF_V1.profile.name)).toBeTruthy();
  expect(await screen.findByText('Disciplina de exemplo')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Perfil do aluno' })).toBeTruthy();
  expect(entry.qr).toBeNull();
  expect(window.location.pathname).toBe('/');
  expect(document.body.innerHTML).not.toContain(SYNTHETIC_QR_V1);
  expect(document.body.innerHTML).not.toContain('012345');
  const login = api.calls.find((call) => call.path.endsWith('/login'))!;
  expect(JSON.parse(String(login.init.body))).toMatchObject({
    keepConnected: true,
    password: '012345',
    qr: SYNTHETIC_QR_V1,
  });
  for (const call of api.calls) {
    expect(call.init.cache).toBe('no-store');
    expect(call.init.credentials).toBe('same-origin');
    expect(call.init.referrerPolicy).toBe('no-referrer');
  }
  await user.click(screen.getByRole('button', { name: 'Sair' }));
  expect(await screen.findByRole('button', { name: 'Ler QR com câmera' })).toBeTruthy();
  expect(screen.queryByText('Você saiu do Portal.')).toBeNull();
  expect(screen.queryByText(SYNTHETIC_SELF_V1.profile.name)).toBeNull();
});
it('discards the parent QR when the internal authentication is cancelled or hidden', async () => {
  const api = transport();
  const entry: StudentEntryV1 = { qr: SYNTHETIC_QR_V1, invalidQr: false, route: 'access' };
  render(<StudentPortalApp client={api.client} entry={entry} />);
  await screen.findByLabelText('Senha');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(entry.qr).toBeNull();
  expect(await screen.findByRole('button', { name: 'Ler QR com câmera' })).toBeTruthy();
  const count = api.calls.filter((call) => call.path.endsWith('/challenge')).length;
  await act(async () => {
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pageshow'));
  });
  expect(api.calls.filter((call) => call.path.endsWith('/challenge'))).toHaveLength(count);
});
it('clears profile immediately on logout failure and retries logout instead of refreshing a blocked session', async () => {
  const api = transport(true);
  render(<StudentPortalApp client={api.client} />);
  await screen.findByText(SYNTHETIC_SELF_V1.profile.name);
  api.setLogoutFailure(true);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Sair' }));
  expect(await screen.findByText('Não foi possível confirmar a saída')).toBeTruthy();
  expect(screen.queryByText(SYNTHETIC_SELF_V1.profile.name)).toBeNull();
  const count = api.calls.length;
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  expect(api.calls).toHaveLength(count);
  api.setLogoutFailure(false);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar sair novamente' }));
  expect(await screen.findByRole('button', { name: 'Ler QR com câmera' })).toBeTruthy();
  expect(screen.queryByText('Você saiu do Portal.')).toBeNull();
  expect(api.calls.filter((call) => call.path.endsWith('/logout'))).toHaveLength(2);
});
it('removes protected DOM before history restoration and requires a fresh session after revocation', async () => {
  const api = transport(true);
  render(<StudentPortalApp client={api.client} />);
  await screen.findByText(SYNTHETIC_SELF_V1.profile.name);
  void act(() => window.dispatchEvent(new Event('pagehide')));
  expect(screen.queryByText(SYNTHETIC_SELF_V1.profile.name)).toBeNull();
  api.expire();
  await act(async () => {
    window.dispatchEvent(new Event('pageshow'));
  });
  expect(await screen.findByRole('heading', { name: 'Acessar minhas notas' })).toBeTruthy();
  expect(screen.queryByText('Sessão expirada')).toBeNull();
  expect(screen.queryByText('Disciplina de exemplo')).toBeNull();
  expect(api.calls.filter((call) => call.path === '/api/student/me')).toHaveLength(1);
});
it('keeps an invalid QR local and does not submit it to the authentication service', async () => {
  const api = transport();
  render(
    <StudentPortalApp client={api.client} entry={{ qr: null, invalidQr: true, route: 'access' }} />,
  );
  expect(screen.getByText('Este QR não é um acesso válido ao Portal.')).toBeTruthy();
  await waitFor(() => expect(api.calls.length).toBeGreaterThan(0));
  expect(api.calls.every((call) => call.path === '/api/student/session')).toBe(true);
});
