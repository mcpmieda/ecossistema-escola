import { createElement, StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentAccountsV1 } from '../../../../src/features/student-portal-admin/accounts/student-accounts-v1';
import { SYNTHETIC_QR_V1 } from '../../../../shared/student-portal-contracts/fixtures-v1';
import { controlledContinuousObserverV1 } from '../continuous-observer-v1';
import {
  accountsMockV1,
  accountJsonV1,
  accountPageV1,
  accountFixtureV1,
  ACCOUNT_META_V1,
  ACCOUNT_CLASS_V1,
} from './fixtures-v1';
function setupAccountsDomV1() {
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  });
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
}
beforeEach(setupAccountsDomV1);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const ready = () => screen.findByRole('button', { name: 'Abrir ficha de SYNTHETIC ACCOUNT 001' });
const detail = () => screen.findByRole('button', { name: 'Bloquear acesso' });
describe('account list and detail', () => {
  it('shows official names and distinct states with a complete empty-class catalog', async () => {
    const mock = accountsMockV1();
    mock.accounts[1]!.state = 'pending-activation';
    mock.accounts[2]!.linkClosed = true;
    render(createElement(StudentAccountsV1, mock.props));
    await ready();
    expect(
      within(screen.getByRole('region', { name: /Tabela de contas/ })).getByText('Primeiro acesso'),
    ).toBeTruthy();
    expect(screen.getByText('Encerrada')).toBeTruthy();
    expect(screen.getAllByText('Desconhecido nos últimos 12 meses')).toHaveLength(3);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'SYNTHETIC EMPTY CLASS' }));
    expect(await screen.findByText('Nenhuma conta encontrada neste filtro.')).toBeTruthy();
    expect(mock.queries.at(-1)?.scope).toEqual({ ...ACCOUNT_CLASS_V1, classId: 753002 });
    expect(mock.writes).toHaveLength(0);
  });
  it('renders the first 100 accounts, then appends the last five only when the end approaches', async () => {
    const observer = controlledContinuousObserverV1();
    const mock = accountsMockV1({ count: 105 });
    render(createElement(StudentAccountsV1, { ...mock.props, scope: ACCOUNT_CLASS_V1 }));
    const first = await screen.findByText('SYNTHETIC ACCOUNT 001');
    await waitFor(() => expect(observer.isObserving()).toBe(true));
    expect(screen.queryByText('SYNTHETIC ACCOUNT 105')).toBeNull();
    expect(mock.queries.some((query) => query.page.cursor)).toBe(false);
    expect(screen.queryByText('Próxima página')).toBeNull();
    const scroll = screen.getByRole('region', { name: /Tabela de contas/ });
    scroll.scrollTop = 137;
    act(() => observer.intersect(false));
    expect(mock.queries.some((query) => query.page.cursor)).toBe(false);
    await act(async () => observer.intersect());
    await screen.findByText('SYNTHETIC ACCOUNT 105');
    expect(screen.getByText('SYNTHETIC ACCOUNT 001')).toBe(first);
    expect(scroll.scrollTop).toBe(137);
    expect(mock.queries.some((query) => query.page.cursor)).toBe(true);
    expect(mock.writes).toHaveLength(0);
  });
  describe('with an accumulated 105-account list', () => {
    let mock: ReturnType<typeof accountsMockV1>;
    let user: ReturnType<typeof userEvent.setup>;
    let firstName: HTMLElement;
    let lastName: HTMLElement;
    // Fixture preparation and interaction have independent bounded phases. This suite
    // verifies continuity and accessibility, not a combined production latency SLA.
    beforeAll(async () => {
      setupAccountsDomV1();
      const observer = controlledContinuousObserverV1();
      mock = accountsMockV1({ count: 105 });
      render(createElement(StudentAccountsV1, { ...mock.props, scope: ACCOUNT_CLASS_V1 }));
      user = userEvent.setup();
      const button = (name: string) =>
        document.querySelector<HTMLButtonElement>(`button[aria-label="Abrir ficha de ${name}"]`);
      await waitFor(() => expect(button('SYNTHETIC ACCOUNT 001')).not.toBeNull());
      firstName = within(button('SYNTHETIC ACCOUNT 001')!).getByText('SYNTHETIC ACCOUNT 001');
      await waitFor(() => expect(observer.isObserving()).toBe(true));
      await act(async () => observer.intersect());
      await waitFor(() => expect(button('SYNTHETIC ACCOUNT 105')).not.toBeNull());
      lastName = within(button('SYNTHETIC ACCOUNT 105')!).getByText('SYNTHETIC ACCOUNT 105');
    }, 30_000);
    it('opens a right-side student drawer by name and preserves the accumulated list when closing', async () => {
      const trigger = firstName.closest('button')!;
      expect(trigger.getAttribute('aria-label')).toBe('Abrir ficha de SYNTHETIC ACCOUNT 001');
      await user.click(trigger);
      const drawer = await screen.findByLabelText('Ficha do aluno');
      expect(drawer.getAttribute('role')).toBe('dialog');
      await within(drawer).findByRole('button', { name: 'Bloquear acesso' });
      expect(drawer.closest('[data-placement="right"]')).toBeTruthy();
      expect(within(drawer).getByText('SYNTHETIC ACCOUNT 001')).toBeTruthy();
      expect(document.activeElement?.textContent).toBe('Ficha do aluno');
      expect(screen.queryByText('Próxima página')).toBeNull();
      await user.click(within(drawer).getByRole('button', { name: 'Fechar ficha' }));
      await waitFor(() => expect(drawer.isConnected).toBe(false));
      expect(lastName.isConnected).toBe(true);
      expect(lastName.closest('button')!.getAttribute('aria-label')).toBe(
        'Abrir ficha de SYNTHETIC ACCOUNT 105',
      );
      expect(screen.getByText('SYNTHETIC ACCOUNT 001').closest('button')).toBe(trigger);
      expect(mock.queries.some((q) => q.page.cursor && q.scope.kind === 'class')).toBe(true);
      expect(mock.writes).toHaveLength(0);
    });
  });
  it('cancels a review and uses fresh detail CAS rather than the stale list row', async () => {
    const mock = accountsMockV1();
    render(createElement(StudentAccountsV1, mock.props));
    await ready();
    mock.accounts[0]!.version = 12;
    const user = userEvent.setup();
    await user.click(await ready());
    await detail();
    await user.click(screen.getByRole('button', { name: 'Redefinir senha' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/mesmo QR e o ano de nascimento/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(mock.writes).toHaveLength(0);
    await user.click(await screen.findByRole('button', { name: 'Redefinir senha' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar ação' }));
    await screen.findByText(/Alteração salva/);
    expect(mock.writes[0]).toMatchObject({ operation: 'password-reset', expectedVersion: 12 });
    await waitFor(() =>
      expect(
        within(screen.getByLabelText('Ficha da conta')).getByText('Redefinição pendente'),
      ).toBeTruthy(),
    );
  });
  it('requires a new review after conflict and does not infer success from optimism', async () => {
    const mock = accountsMockV1();
    render(createElement(StudentAccountsV1, mock.props));
    const user = userEvent.setup();
    await user.click(await ready());
    await detail();
    await user.click(screen.getByRole('button', { name: 'Bloquear acesso' }));
    mock.accounts[0]!.version = 14;
    await user.click(screen.getByRole('button', { name: 'Confirmar ação' }));
    await screen.findByText('A conta mudou. Recarregue e revise uma nova ação.');
    expect(screen.queryByText(/Alteração salva/)).toBeNull();
    await user.click(await screen.findByRole('button', { name: 'Recarregar ficha' }));
    await user.click(await screen.findByRole('button', { name: 'Bloquear acesso' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar ação' }));
    await screen.findByText(/Alteração salva/);
    expect(mock.writes.map((item) => item.expectedVersion)).toEqual([9, 14]);
    expect(mock.writes[0]!.idempotencyKey).not.toBe(mock.writes[1]!.idempotencyKey);
  });
  it('keeps account reset distinct from QR regeneration and never renders the credential', async () => {
    const mock = accountsMockV1(),
      onQr = vi.fn();
    render(createElement(StudentAccountsV1, { ...mock.props, onQr }));
    const user = userEvent.setup();
    await user.click(await ready());
    await detail();
    await user.click(screen.getByRole('button', { name: 'Redefinir conta' }));
    expect(
      within(screen.getByRole('alertdialog')).getByText(
        /não encerra o vínculo nem libera o reset anual/,
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(await screen.findByRole('button', { name: 'Mudar QR' }));
    expect(within(screen.getByRole('alertdialog')).getByText(/Preserva a senha/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Confirmar ação' }));
    await waitFor(() => expect(onQr).toHaveBeenCalledOnce());
    expect(document.body.innerHTML).not.toContain(SYNTHETIC_QR_V1);
    expect(mock.writes[0]?.operation).toBe('qr-regenerate');
  });
  it('disables actions for a closed Portal account despite an existing eligible academic link', async () => {
    const mock = accountsMockV1();
    mock.accounts[0]!.linkClosed = true;
    render(createElement(StudentAccountsV1, mock.props));
    await userEvent.setup().click(await ready());
    expect((await detail()).hasAttribute('disabled')).toBe(true);
    expect(screen.getAllByText('Encerrada')).toHaveLength(2);
    expect(mock.writes).toHaveLength(0);
  });
  it('blocks destructive recovery actions when the backend says recovery is not ready', async () => {
    const mock = accountsMockV1();
    mock.accounts[0]!.firstAccess.recoveryReady = false;
    render(createElement(StudentAccountsV1, mock.props));
    const user = userEvent.setup();
    await user.click(await ready());
    await detail();
    expect(
      (screen.getByRole('button', { name: 'Redefinir senha' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Redefinir conta' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole('button', { name: 'Mudar QR' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect(mock.writes).toHaveLength(0);
  });
  it('clears selected data and open confirmation when identity or capability changes', async () => {
    const mock = accountsMockV1();
    const view = render(createElement(StudentAccountsV1, mock.props));
    const user = userEvent.setup();
    await user.click(await ready());
    await detail();
    await user.click(screen.getByRole('button', { name: 'Redefinir conta' }));
    view.rerender(
      createElement(StudentAccountsV1, {
        ...mock.props,
        identityKey: 'another-synthetic-admin',
        canWrite: false,
      }),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bloquear acesso' })).toBeNull();
    await user.click(await ready());
    expect((await detail()).hasAttribute('disabled')).toBe(true);
    expect(mock.writes).toHaveLength(0);
  });
  it('clears the list and the detail when a command loses administrative authorization', async () => {
    const mock = accountsMockV1({
      write: async () => accountJsonV1({ ...ACCOUNT_META_V1, state: 'unauthenticated' }, 401),
    });
    render(createElement(StudentAccountsV1, mock.props));
    const user = userEvent.setup();
    await user.click(await ready());
    await detail();
    await user.click(screen.getByRole('button', { name: 'Bloquear acesso' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar ação' }));
    await screen.findByText('Sessão administrativa expirada. Entre novamente.');
    expect(screen.queryByText('SYNTHETIC ACCOUNT 001')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bloquear acesso' })).toBeNull();
    expect(mock.writes).toHaveLength(1);
  });
  it('applies state and manual-block filters without selecting rows by their position', async () => {
    const mock = accountsMockV1();
    mock.accounts[1]!.state = 'pending-activation';
    mock.accounts[1]!.blocked = true;
    render(createElement(StudentAccountsV1, mock.props));
    await ready();
    const user = userEvent.setup();
    await user.click(
      within(screen.getByRole('grid', { name: 'Situação' })).getByRole('row', {
        name: 'Primeiro acesso',
      }),
    );
    await screen.findByRole('button', { name: 'Abrir ficha de SYNTHETIC ACCOUNT 002' });
    await user.click(
      within(screen.getByRole('grid', { name: 'Bloqueio' })).getByRole('row', {
        name: 'Bloqueadas',
      }),
    );
    await screen.findByRole('button', { name: 'Abrir ficha de SYNTHETIC ACCOUNT 002' });
    expect(mock.queries.at(-1)).toMatchObject({
      accountState: 'pending-activation',
      blocked: true,
    });
    expect(
      screen.queryByRole('button', { name: 'Abrir ficha de SYNTHETIC ACCOUNT 001' }),
    ).toBeNull();
  });
  it('discards a late name-search result after filter changes', async () => {
    let resolve!: (response: Response) => void;
    const mock = accountsMockV1({
      query: (input) =>
        input.nameSearch === 'old'
          ? new Promise((done) => {
              resolve = done;
            })
          : undefined,
    });
    render(createElement(StudentAccountsV1, mock.props));
    await ready();
    fireEvent.change(screen.getByLabelText('Buscar aluno'), { target: { value: 'old' } });
    await waitFor(() => expect(resolve).toBeTypeOf('function'));
    fireEvent.change(screen.getByLabelText('Buscar aluno'), { target: { value: '003' } });
    await screen.findByRole('button', { name: 'Abrir ficha de SYNTHETIC ACCOUNT 003' });
    await act(async () => resolve(accountJsonV1(accountPageV1([accountFixtureV1(1)]))));
    expect(
      screen.queryByRole('button', { name: 'Abrir ficha de SYNTHETIC ACCOUNT 001' }),
    ).toBeNull();
  });
  it('recovers an uncertain response under StrictMode with identical bytes', async () => {
    let attempt = 0;
    const mock = accountsMockV1({
      write: async () => {
        if (attempt++ < 2) throw new Error('Synthetic lost response');
        return accountJsonV1({
          ...ACCOUNT_META_V1,
          state: 'committed',
          operationId: ACCOUNT_META_V1.requestId,
          version: 10,
        });
      },
    });
    render(createElement(StrictMode, null, createElement(StudentAccountsV1, mock.props)));
    const user = userEvent.setup();
    await user.click(await ready());
    await detail();
    await user.click(screen.getByRole('button', { name: 'Bloquear acesso' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar ação' }));
    await user.click(await screen.findByRole('button', { name: 'Repetir mesma solicitação' }));
    await screen.findByText(/Alteração salva/);
    expect(mock.bodies).toHaveLength(3);
    expect(new Set(mock.bodies).size).toBe(1);
  });
});
it('confirms a complete reset and tells the operator to reprint the current QR', async () => {
  const mock = accountsMockV1();
  render(createElement(StudentAccountsV1, mock.props));
  const user = userEvent.setup();
  await user.click(await ready());
  await detail();
  await user.click(screen.getByRole('button', { name: 'Redefinir conta' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar ação' }));
  await screen.findByText(/Conta redefinida: o QR anterior/);
  expect(mock.writes[0]?.operation).toBe('account-reset');
  expect(screen.getByText(/Reimprima o QR atual/)).toBeTruthy();
});
