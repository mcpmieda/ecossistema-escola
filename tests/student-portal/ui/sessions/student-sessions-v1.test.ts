import { createElement, StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentSessionsV1 } from '../../../../src/features/student-portal-admin/sessions/student-sessions-v1';
import {
  operationsMockV1,
  opJsonV1,
  OP_META_V1,
  OP_CLASS_V1,
  OP_ACCOUNT_V1,
} from '../overview/fixtures-v1';
import { setupOperationsDomV1 } from '../overview/dom-v1';
beforeEach(setupOperationsDomV1);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function confirm() {
  fireEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: 'Encerrar sessões',
    }),
  );
}
describe('administrative sessions interface', () => {
  it.each(['individual', 'account', 'class'] as const)(
    'reviews and commits %s with the correct fresh scope CAS',
    async (mode) => {
      const mock = operationsMockV1();
      render(
        createElement(StudentSessionsV1, {
          ...mock.props,
          scope: mode === 'class' ? OP_CLASS_V1 : OP_ACCOUNT_V1,
        }),
      );
      await screen.findByRole('grid', { name: 'Sessões do Portal' });
      for (const label of ['Válida', 'Expirada', 'Revogada', 'Acesso indisponível'])
        expect(await screen.findByText(label)).toBeTruthy();
      const button =
        mode === 'individual'
          ? screen.getAllByRole('button', { name: 'Encerrar esta sessão' })[0]!
          : screen.getByRole('button', {
              name: mode === 'class' ? 'Encerrar sessões da turma' : 'Encerrar sessões da conta',
            });
      fireEvent.click(button);
      const dialog = await screen.findByRole('alertdialog');
      expect(mock.writes).toHaveLength(0);
      expect(within(dialog).getByText(/Senha e QR permanecem/)).toBeTruthy();
      await confirm();
      await screen.findByText(/Encerramento confirmado pelo servidor/);
      await screen.findByRole('grid', { name: 'Sessões do Portal' });
      expect(mock.writes[0]).toMatchObject({
        operation: 'sessions-revoke',
        scope: mode === 'class' ? OP_CLASS_V1 : OP_ACCOUNT_V1,
        expectedVersion: mode === 'class' ? 756 : 11,
        confirmed: true,
      });
      expect(mock.writes[0] && 'sessionId' in mock.writes[0]).toBe(mode === 'individual');
      expect(mock.sessions.filter((s) => !s.revokedAt)).toHaveLength(mode === 'individual' ? 2 : 0);
    },
  );
  it('Escape cancels without mutation and restores focus', async () => {
    const user = userEvent.setup(),
      mock = operationsMockV1();
    render(createElement(StudentSessionsV1, mock.props));
    const button = await screen.findByRole('button', { name: 'Encerrar sessões da conta' });
    await user.click(button);
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(button));
    expect(mock.writes).toHaveLength(0);
  });
  it('uses account CAS from a class row and removes protected content after 401', async () => {
    let denied = false;
    const mock = operationsMockV1({
      write: () => Promise.resolve(opJsonV1({ ...OP_META_V1, state: 'unauthenticated' }, 401)),
      query: () =>
        denied
          ? Promise.resolve(opJsonV1({ ...OP_META_V1, state: 'unauthenticated' }, 401))
          : undefined,
    });
    render(createElement(StudentSessionsV1, { ...mock.props, scope: OP_CLASS_V1 }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Encerrar esta sessão' }))[0]!);
    await screen.findByRole('alertdialog');
    denied = true;
    await confirm();
    await screen.findByText('Sessão administrativa expirada. Entre novamente.');
    expect(mock.writes[0]).toMatchObject({ scope: OP_ACCOUNT_V1, expectedVersion: 11 });
    expect(screen.queryByRole('grid')).toBeNull();
    expect(document.body.textContent).not.toContain('SYNTHETIC OP STUDENT');
  });
  it('does not offer school-wide revocation, disables writes for read-only and pages beyond 100', async () => {
    const mock = operationsMockV1({ count: 105 });
    render(
      createElement(
        StrictMode,
        null,
        createElement(StudentSessionsV1, {
          ...mock.props,
          scope: { kind: 'school', academicYear: 2026 },
          canWrite: false,
        }),
      ),
    );
    await screen.findByRole('grid');
    expect(screen.queryByRole('button', { name: 'Encerrar sessões da turma' })).toBeNull();
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Encerrar esta sessão' })).toHaveLength(100),
    );
    expect(
      screen
        .getAllByRole('button', { name: 'Encerrar esta sessão' })
        .every((b) => (b as HTMLButtonElement).disabled),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Encerrar esta sessão' })).toHaveLength(5),
    );
    expect(mock.writes).toHaveLength(0);
  }, 20_000);
  it('clears on pagehide and requires a fresh read to resume', async () => {
    const mock = operationsMockV1();
    render(createElement(StudentSessionsV1, mock.props));
    await screen.findByRole('grid');
    fireEvent(window, new Event('pagehide'));
    expect(screen.queryByRole('grid')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retomar consulta' }));
    await screen.findByRole('grid');
  });
});
