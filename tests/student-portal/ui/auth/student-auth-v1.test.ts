import { createElement } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentAuthenticationV1 } from '../../../../src/features/student-portal/auth/student-auth-v1';
import {
  StudentRiskWidgetV1,
  type RiskMountV1,
} from '../../../../src/features/student-portal/auth/turnstile-widget-v1';
import { useStudentSessionV1 } from '../../../../src/features/student-portal/auth/student-session-v1';
import { StudentQrReaderV1 } from '../../../../src/features/student-portal/auth/qr-reader-v1';
import { SYNTHETIC_QR_V1 } from '../../../../shared/student-portal-contracts/fixtures-v1';
import { clientFixtureV1, NOW, PROOF, REQUIRED, SESSION } from './fixtures-v1';
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
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
function view(client = clientFixtureV1()) {
  const success = vi.fn();
  render(
    createElement(StudentAuthenticationV1, {
      client,
      onAuthenticated: success,
      initialQr: SYNTHETIC_QR_V1,
      sitekey: 'synthetic-sitekey',
    }),
  );
  return { client, success, user: userEvent.setup() };
}
describe('student authentication forms', () => {
  it.each([
    ['NotAllowedError', 'não foi autorizada'],
    ['NotFoundError', 'Nenhuma câmera disponível'],
    ['NotReadableError', 'Não foi possível usar a câmera'],
  ])('offers local-image fallback when camera returns %s', async (name, message) => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException('synthetic-camera-error', name)),
      },
    });
    try {
      render(createElement(StudentQrReaderV1, { onQr: vi.fn() }));
      await userEvent.setup().click(screen.getByRole('button', { name: 'Ler QR com câmera' }));
      expect((await screen.findByRole('alert')).textContent).toContain(message);
      expect(
        (screen.getByRole('button', { name: 'Escolher imagem' }) as HTMLButtonElement).disabled,
      ).toBe(false);
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'mediaDevices', descriptor);
      else Reflect.deleteProperty(navigator, 'mediaDevices');
    }
  });
  it('accepts paste/leading zero, defaults keep connected and sends its explicit false choice', async () => {
    const client = clientFixtureV1();
    client.challenge.mockResolvedValueOnce(REQUIRED('password'));
    const s = view(client);
    const password = await screen.findByLabelText('Senha');
    await s.user.click(password);
    await s.user.paste('001234');
    expect((password as HTMLInputElement).value).toBe('001234');
    const keep = screen.getByRole('checkbox', { name: 'Manter conectado' });
    expect((keep as HTMLInputElement).checked).toBe(true);
    await s.user.click(keep);
    await s.user.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(s.success).toHaveBeenCalledOnce());
    expect(client.login.mock.calls[0]?.[0]).toMatchObject({
      password: '001234',
      keepConnected: false,
    });
    expect(screen.queryByLabelText('Senha')).toBeNull();
  });
  it('renders PIN4 and password6 in two groups, blocks mismatched confirmation', async () => {
    const s = view();
    const pin = await screen.findByLabelText('PIN de 4 dígitos');
    expect(document.querySelectorAll('[data-slot="input-otp-slot"]')).toHaveLength(4);
    await s.user.type(pin, '0001');
    s.client.challenge.mockResolvedValueOnce(PROOF);
    await s.user.click(screen.getByRole('button', { name: 'Continuar' }));
    const password = await screen.findByLabelText('Nova senha'),
      confirmation = screen.getByLabelText('Confirmar senha');
    expect(document.querySelectorAll('[data-slot="input-otp-separator"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-slot="input-otp-slot"]')).toHaveLength(12);
    await s.user.type(password, '001234');
    await s.user.type(confirmation, '001235');
    await s.user.click(screen.getByRole('button', { name: 'Criar senha e entrar' }));
    expect(screen.getByRole('alert').textContent).toContain('As senhas precisam ser iguais');
    expect(s.client.activate).not.toHaveBeenCalled();
    await s.user.clear(confirmation);
    await s.user.type(confirmation, '001234');
    await s.user.click(screen.getByRole('button', { name: 'Criar senha e entrar' }));
    await waitFor(() => expect(s.success).toHaveBeenCalledOnce());
  });
  it('rejects non-ASCII and clears sensitive fields when cancelled or hidden', async () => {
    const s = view();
    const pin = await screen.findByLabelText('PIN de 4 dígitos');
    await s.user.click(pin);
    await s.user.paste('１２３４');
    expect((pin as HTMLInputElement).value).toBe('');
    await s.user.type(pin, '0001');
    await s.user.click(screen.getByRole('button', { name: 'Cancelar e ler outro QR' }));
    expect(screen.queryByLabelText('PIN de 4 dígitos')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ler QR com câmera' })).toBeTruthy();
  });
  it('handles risk expiry/failure and disposes every widget on retry or unmount', async () => {
    const token = vi.fn(),
      dispose = vi.fn();
    let callbacks!: Parameters<RiskMountV1>[2];
    const mount = vi.fn<RiskMountV1>((_container, _key, next) => {
      callbacks = next;
      return dispose;
    });
    const component = render(
      createElement(StudentRiskWidgetV1, { sitekey: 'synthetic', onToken: token, mount }),
    );
    act(() => callbacks.token('synthetic-token'));
    expect(token).toHaveBeenLastCalledWith('synthetic-token');
    act(() => callbacks.expired());
    expect(token).toHaveBeenLastCalledWith(null);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Verificar novamente' }));
    expect(dispose).toHaveBeenCalledOnce();
    expect(mount).toHaveBeenCalledTimes(2);
    act(() => callbacks.unavailable());
    expect(screen.getByRole('alert').textContent).toContain('indisponível');
    component.unmount();
    expect(dispose).toHaveBeenCalledTimes(2);
  });
  it('clears the DOM synchronously on pagehide and revalidates on pageshow', async () => {
    const client = clientFixtureV1();
    function SessionView() {
      const { load } = useStudentSessionV1(client);
      return createElement(
        'div',
        null,
        load.state === 'ready' ? load.data.profile.name : load.state,
      );
    }
    render(createElement(SessionView));
    await screen.findByText('Estudante de exemplo');
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(screen.queryByText('Estudante de exemplo')).toBeNull();
    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });
    expect(screen.queryByText('Estudante de exemplo')).toBeNull();
    await screen.findByText('Estudante de exemplo');
    expect(client.session).toHaveBeenCalledTimes(2);
  });
});

it('keeps the password form mounted while the first submission is pending and sends every digit once', async () => {
  const client = clientFixtureV1();
  client.challenge.mockResolvedValueOnce(REQUIRED('password'));
  let finish!: (result: Awaited<ReturnType<typeof client.login>>) => void;
  const result = SESSION;
  client.login.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const s = view(client);
  const password = await screen.findByLabelText('Senha');
  await s.user.type(password, '001234');
  await s.user.click(screen.getByRole('button', { name: 'Entrar' }));
  expect(screen.getByLabelText('Senha')).toBe(password);
  expect(screen.queryByText('Verificando acesso')).toBeNull();
  expect(screen.getByRole('button', { name: 'Entrando…' }).hasAttribute('disabled')).toBe(true);
  expect(client.login).toHaveBeenCalledOnce();
  expect(client.login.mock.calls[0]?.[0]).toMatchObject({ password: '001234' });
  await act(async () => finish(result));
  expect(s.success).toHaveBeenCalledOnce();
});

it('reveals only the trailing two password digits while focused and masks all on blur', async () => {
  const client = clientFixtureV1();
  client.challenge.mockResolvedValueOnce(REQUIRED('password'));
  const s = view(client);
  const password = await screen.findByLabelText('Senha');
  await s.user.type(password, '001234');
  const slots = () => Array.from(document.querySelectorAll('[data-slot="input-otp-slot"]'));
  expect(slots().map((slot) => slot.hasAttribute('data-masked'))).toEqual([
    true,
    true,
    true,
    true,
    false,
    false,
  ]);
  expect(password.getAttribute('type')).toBe('password');
  await s.user.tab();
  expect(slots().every((slot) => slot.hasAttribute('data-masked'))).toBe(true);
  await s.user.click(password);
  await s.user.keyboard('{Backspace}');
  expect(
    slots()
      .slice(0, 5)
      .map((slot) => slot.hasAttribute('data-masked')),
  ).toEqual([true, true, true, false, false]);
});

it('keeps QR discovery on the entry card and uses Cancelar for password creation', async () => {
  const client = clientFixtureV1();
  let finish!: (result: typeof PROOF) => void;
  client.challenge.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const s = view(client);
  expect(screen.getByRole('heading', { name: 'Acessar minhas notas' })).toBeTruthy();
  expect(screen.queryByText('Verificando acesso')).toBeNull();
  await act(async () => finish(PROOF));
  expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy();
  await s.user.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByLabelText('Nova senha')).toBeNull();
  expect(screen.getByRole('button', { name: 'Escolher imagem' })).toBeTruthy();
});
