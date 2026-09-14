import { createElement, StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentAccountsV1 } from '../../../../src/features/student-portal-admin/accounts/student-accounts-v1';
import { SYNTHETIC_QR_V1 } from '../../../../shared/student-portal-contracts/fixtures-v1';
import {
  accountsMockV1,
  accountJsonV1,
  accountPageV1,
  accountFixtureV1,
  ACCOUNT_META_V1,
  ACCOUNT_CLASS_V1,
} from './fixtures-v1';
beforeEach(() => {
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
    expect(screen.getByText('Vínculo Portal encerrado')).toBeTruthy();
    expect(screen.getAllByText('Desconhecido nos últimos 12 meses')).toHaveLength(3);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Todas as turmas Turma' }));
    await user.click(screen.getByRole('option', { name: 'SYNTHETIC EMPTY CLASS' }));
    expect(await screen.findByText('Nenhuma conta encontrada neste filtro.')).toBeTruthy();
    expect(mock.queries.at(-1)?.scope).toEqual({ ...ACCOUNT_CLASS_V1, classId: 753002 });
    expect(mock.writes).toHaveLength(0);
  });
  it('paginates105 accounts by cursor without truncating the final five', async () => {
    const mock = accountsMockV1({ count: 105 });
    render(createElement(StudentAccountsV1, { ...mock.props, scope: ACCOUNT_CLASS_V1 }));
    await screen.findByText('SYNTHETIC ACCOUNT 001');
    fireEvent.click(screen.getByText('Próxima página'));
    await screen.findByText('SYNTHETIC ACCOUNT 101');
    expect(screen.queryByText('SYNTHETIC ACCOUNT 001')).toBeNull();
    expect(screen.getByText('SYNTHETIC ACCOUNT 105')).toBeTruthy();
    expect(mock.queries.some((query) => query.page.cursor)).toBe(true);
  });
  it('retains selection by account ID across pages and returns with the same filters', async () => {
    const mock = accountsMockV1({
      query: (input) =>
        input.scope.kind !== 'account'
          ? Promise.resolve(
              accountJsonV1(
                accountPageV1(
                  [accountFixtureV1(input.page.cursor ? 2 : 1)],
                  input.page.cursor ? null : 'c'.repeat(80),
                ),
              ),
            )
          : undefined,
    });
    render(createElement(StudentAccountsV1, { ...mock.props, scope: ACCOUNT_CLASS_V1 }));
    const user = userEvent.setup();
    await user.click(await ready());
    await detail();
    expect(document.activeElement?.textContent).toBe('Ficha da conta · 2026');
    await user.click(screen.getByRole('button', { name: 'Próxima página' }));
    await screen.findByRole('button', { name: 'Abrir ficha de SYNTHETIC ACCOUNT 002' });
    expect(screen.getByRole('button', { name: 'Bloquear acesso' })).toBeTruthy();
    expect(
      within(screen.getByLabelText('Ficha da conta')).getByText('SYNTHETIC ACCOUNT 001'),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Página anterior' }));
    await ready();
    expect(mock.queries.at(-1)?.scope).toEqual(ACCOUNT_CLASS_V1);
    expect(mock.queries.at(-1)?.page.cursor).toBeUndefined();
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
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(mock.writes).toHaveLength(0);
    await user.click(await screen.findByRole('button', { name: 'Redefinir senha' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar ação' }));
    await screen.findByText(/Ação concluída pelo servidor/);
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
    expect(screen.queryByText(/Ação concluída pelo servidor/)).toBeNull();
    await user.click(await screen.findByRole('button', { name: 'Recarregar ficha' }));
    await user.click(await screen.findByRole('button', { name: 'Bloquear acesso' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar ação' }));
    await screen.findByText(/Ação concluída pelo servidor/);
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
    await user.click(await screen.findByRole('button', { name: 'Regenerar QR' }));
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
    expect(screen.getAllByText('Vínculo Portal encerrado')).toHaveLength(2);
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
    await user.click(screen.getByRole('button', { name: 'Todos os estados Estado da conta' }));
    await user.click(screen.getByRole('option', { name: 'Primeiro acesso' }));
    await screen.findByRole('button', { name: 'Abrir ficha de SYNTHETIC ACCOUNT 002' });
    await user.click(
      screen.getByRole('button', { name: 'Com ou sem bloqueio Bloqueio administrativo' }),
    );
    await user.click(screen.getByRole('option', { name: 'Bloqueadas' }));
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
    fireEvent.change(screen.getByLabelText('Buscar conta por nome'), { target: { value: 'old' } });
    await waitFor(() => expect(resolve).toBeTypeOf('function'));
    fireEvent.change(screen.getByLabelText('Buscar conta por nome'), { target: { value: '003' } });
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
    await screen.findByText(/Ação concluída pelo servidor/);
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
