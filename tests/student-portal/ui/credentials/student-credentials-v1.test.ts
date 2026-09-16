import { createElement, StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentCredentialsV1 } from '../../../../src/features/student-portal-admin/credentials/student-credentials-v1';
import { QR_META_V1, qrJsonV1, qrMockV1 } from './fixtures-v1';
import { qrPrintIdV1 } from '../../qr-print/fixtures-v1';

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const selectFirst = async () =>
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Selecionar SYNTHETIC PRINT 001' }));
async function confirm() {
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Gerar arquivo' }));
}

describe('credential preparation UI', () => {
  it('shows backend readiness and blocks cards whose first access cannot succeed', async () => {
    const mock = qrMockV1();
    mock.accounts[0]!.firstAccess = {
      state: 'birth-unconfirmed',
      qrIssued: true,
      recoveryReady: false,
    };
    render(createElement(StudentCredentialsV1, mock.props));
    const checkbox = await screen.findByRole('checkbox', {
      name: 'Selecionar SYNTHETIC PRINT 001',
    });
    expect((checkbox as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('Confirme o ano de nascimento')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Preparar PDF' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it('allows issuing a missing QR but does not offer an impossible reprint', async () => {
    const mock = qrMockV1();
    mock.accounts[0]!.firstAccess = {
      state: 'qr-missing',
      qrIssued: false,
      recoveryReady: true,
    };
    render(createElement(StudentCredentialsV1, mock.props));
    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Selecionar SYNTHETIC PRINT 001' }),
    );
    expect(
      (screen.getByRole('button', { name: 'Gerar QR individual' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      (screen.getByRole('button', { name: 'Reimprimir QR' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it('allows restoring a missing QR for an active account without offering reprint', async () => {
    const mock = qrMockV1();
    mock.accounts[0]!.state = 'active';
    mock.accounts[0]!.firstAccess = {
      state: 'not-required',
      qrIssued: false,
      recoveryReady: true,
    };
    render(createElement(StudentCredentialsV1, mock.props));
    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Selecionar SYNTHETIC PRINT 001' }),
    );
    expect(
      (screen.getByRole('button', { name: 'Gerar QR individual' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      (screen.getByRole('button', { name: 'Reimprimir QR' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it('defaults to QR/name/class, captures scope CAS and selected IDs only after review', async () => {
    const mock = qrMockV1();
    render(createElement(StudentCredentialsV1, mock.props));
    await selectFirst();
    expect(
      (screen.getByRole('radio', { name: 'QR + nome + turma' }) as HTMLInputElement).checked,
    ).toBe(true);
    const radioIds = [
      ...screen.getByRole('radiogroup', { name: 'Conteúdo do PDF' }).querySelectorAll('[id]'),
    ].map((element) => element.id);
    expect(new Set(radioIds).size).toBe(radioIds.length);
    fireEvent.click(screen.getByRole('button', { name: 'Preparar PDF' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('SYNTHETIC PRINT 001')).toBeTruthy();
    expect(mock.writes).toHaveLength(0);
    await confirm();
    await screen.findByRole('button', { name: 'Baixar PDF' });
    expect(mock.writes[0]).toMatchObject({
      operation: 'qr-batch',
      mode: 'qr-name-class',
      expectedVersion: 755,
      accountIds: [qrPrintIdV1(1)],
      classId: 755001,
      confirmed: true,
    });
    expect(screen.queryByRole('button', { name: 'Copiar imagem' })).toBeNull();
    expect(document.body.textContent).not.toContain('/access#');
  });
  it('cancels review with Escape, restores focus and does not issue a credential', async () => {
    const user = userEvent.setup(),
      mock = qrMockV1();
    render(createElement(StudentCredentialsV1, mock.props));
    await selectFirst();
    const button = screen.getByRole('button', { name: 'Preparar PDF' });
    await user.click(button);
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(button));
    expect(mock.writes).toHaveLength(0);
  });
  it.each([
    ['qr-only', 'Somente QR'],
    ['qr-name', 'QR + nome'],
  ] as const)('captures the selected %s PDF mode', async (mode, label) => {
    const mock = qrMockV1();
    render(createElement(StudentCredentialsV1, mock.props));
    await selectFirst();
    fireEvent.click(screen.getByRole('radio', { name: label }));
    fireEvent.click(screen.getByRole('button', { name: 'Preparar PDF' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(label)).toBeTruthy();
    await confirm();
    await screen.findByRole('button', { name: 'Baixar PDF' });
    expect(mock.writes[0]).toMatchObject({ mode });
  });
  it('reprints one QR as image only and offers local download when clipboard is unavailable', async () => {
    const mock = qrMockV1();
    render(
      createElement(StudentCredentialsV1, {
        ...mock.props,
        scope: { kind: 'account', academicYear: 2026, accountId: qrPrintIdV1(1) },
      }),
    );
    await screen.findByRole('checkbox', { name: 'Selecionar SYNTHETIC PRINT 001' });
    fireEvent.click(screen.getByRole('button', { name: 'Reimprimir QR' }));
    await confirm();
    fireEvent.click(await screen.findByRole('button', { name: 'Copiar imagem' }));
    await screen.findByText(/A cópia de imagem não está disponível/);
    expect(screen.getByRole('button', { name: 'Baixar imagem QR' })).toBeTruthy();
    expect(mock.writes[0]).toMatchObject({
      operation: 'qr-reprint',
      expectedVersion: 7,
      accountId: qrPrintIdV1(1),
    });
    expect(mock.writes).toHaveLength(1);
  });
  it('shows all105 students and keeps the100-student PDF limit independent of table loading', async () => {
    const mock = qrMockV1({ count: 105 });
    render(createElement(StudentCredentialsV1, mock.props));
    await screen.findByText('SYNTHETIC PRINT 105');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar alunos disponíveis' }));
    expect(screen.getByText(/105 selecionados/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Preparar PDF' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.queryByRole('button', { name: 'Próxima página' })).toBeNull();
    expect(mock.writes).toHaveLength(0);
    for (let i = 101; i <= 105; i++)
      fireEvent.click(screen.getByRole('checkbox', { name: `Selecionar SYNTHETIC PRINT ${i}` }));
    expect(screen.getByText(/100 selecionados/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Preparar PDF' }));
    await confirm();
    await screen.findByRole('button', { name: 'Baixar PDF' });
    expect(mock.writes[0]?.operation === 'qr-batch' && mock.writes[0].accountIds.length).toBe(100);
    expect(screen.getByText('SYNTHETIC PRINT 105')).toBeTruthy();
    expect(screen.getByText(/100 selecionados/)).toBeTruthy();
  }, 30_000);
  it('drops artifacts and selection when identity or capability changes', async () => {
    const mock = qrMockV1(),
      view = render(createElement(StudentCredentialsV1, mock.props));
    await selectFirst();
    fireEvent.click(screen.getByRole('button', { name: 'Preparar PDF' }));
    await confirm();
    await screen.findByRole('button', { name: 'Baixar PDF' });
    view.rerender(
      createElement(StudentCredentialsV1, {
        ...mock.props,
        identityKey: 'another-synthetic-operator',
        canWrite: false,
      }),
    );
    await screen.findByText('Somente leitura');
    expect(screen.queryByRole('button', { name: 'Baixar PDF' })).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Preparar PDF' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it('clears names and selection on 401 without resubmitting the operation', async () => {
    const mock = qrMockV1({
      write: () => Promise.resolve(qrJsonV1({ ...QR_META_V1, state: 'unauthenticated' }, 401)),
    });
    render(createElement(StudentCredentialsV1, mock.props));
    await selectFirst();
    fireEvent.click(screen.getByRole('button', { name: 'Preparar PDF' }));
    await confirm();
    await waitFor(() => expect(screen.queryByText('SYNTHETIC PRINT 001')).toBeNull());
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(mock.writes).toHaveLength(1);
  });
  it('keeps read-only empty classes accurate and remains usable after StrictMode effects', async () => {
    const empty = qrMockV1({ count: 0 });
    const view = render(createElement(StudentCredentialsV1, empty.props));
    await screen.findByText('Nenhuma conta nesta turma.');
    expect(empty.writes).toHaveLength(0);
    view.unmount();
    const mock = qrMockV1();
    render(createElement(StrictMode, null, createElement(StudentCredentialsV1, mock.props)));
    await selectFirst();
    fireEvent.click(screen.getByRole('button', { name: 'Preparar PDF' }));
    await confirm();
    await screen.findByRole('button', { name: 'Baixar PDF' });
    expect(mock.writes).toHaveLength(1);
  });
});
