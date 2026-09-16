import { enterDateV1 } from '../settings/date-input-v1';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentAuditV1 } from '../../../../src/features/student-portal-admin/audit/student-audit-v1';
import { operationsMockV1, opJsonV1, OP_META_V1, OP_CLASS_V1 } from '../overview/fixtures-v1';
import { setupOperationsDomV1 } from '../overview/dom-v1';
beforeEach(setupOperationsDomV1);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('audit filters and restricted detail interface', () => {
  it('keeps raw IP out of list; detail needs write capability and disappears when it changes', async () => {
    const mock = operationsMockV1();
    const view = render(createElement(StudentAuditV1, mock.props));
    await screen.findByRole('grid');
    expect(document.body.textContent).not.toContain('192.0.2.*');
    expect(document.body.textContent).not.toContain('192.0.2.42');
    fireEvent.click(screen.getAllByRole('button', { name: 'Detalhes' })[0]!);
    await screen.findByText('192.0.2.42');
    view.rerender(createElement(StudentAuditV1, { ...mock.props, canWrite: false }));
    await screen.findByRole('grid');
    expect(document.body.textContent).not.toContain('192.0.2.42');
    expect(
      screen
        .getAllByRole('button', { name: 'Detalhes' })
        .every((b) => (b as HTMLButtonElement).disabled),
    ).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('applies São Paulo interval only after validation and preserves event/result filters in cursor pages', async () => {
    const user = userEvent.setup(),
      mock = operationsMockV1({ count: 105 });
    render(createElement(StudentAuditV1, { ...mock.props, scope: OP_CLASS_V1 }));
    await screen.findByRole('grid');
    await enterDateV1(user, 'Desde', '2026-09-14T10:00:00');
    await enterDateV1(user, 'Até', '2026-09-13T10:00:00');
    const before = mock.queries.filter((q) => q.operation === 'audit').length;
    expect(screen.queryByRole('button', { name: 'Aplicar filtros' })).toBeNull();
    expect(await screen.findByText(/Confira a ordem das datas/)).toBeTruthy();
    expect(mock.queries.filter((q) => q.operation === 'audit')).toHaveLength(before);
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    await user.click(screen.getByRole('button', { name: 'Todos os eventos Evento' }));
    await user.click(await screen.findByRole('option', { name: 'Sessão encerrada' }));
    await user.click(screen.getByRole('button', { name: 'Todos os resultados Resultado' }));
    await user.click(await screen.findByRole('option', { name: 'Concluído' }));
    await enterDateV1(user, 'Desde', '2026-01-01T00:00:00');
    expect(screen.queryByRole('button', { name: 'Aplicar filtros' })).toBeNull();
    await waitFor(() =>
      expect(mock.queries.at(-1)).toMatchObject({
        operation: 'audit',
        scope: OP_CLASS_V1,
        from: '2026-01-01T03:00:00Z',
        event: 'session-revoked',
        result: 'success',
      }),
    );
    await screen.findByRole('grid');
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Detalhes' })).toHaveLength(5),
    );
    expect(mock.queries.at(-1)).toMatchObject({
      from: '2026-01-01T03:00:00Z',
      event: 'session-revoked',
      result: 'success',
      page: { limit: 100 },
    });
    expect(mock.queries.at(-1)!.page.cursor).toBeTruthy();
  }, 60_000);
  it('shows empty results without fake events and clears all detail on authorization loss', async () => {
    let denied = false;
    const mock = operationsMockV1({
      query: (q) =>
        denied && q.operation === 'audit-detail'
          ? Promise.resolve(opJsonV1({ ...OP_META_V1, state: 'forbidden' }, 403))
          : undefined,
    });
    render(createElement(StudentAuditV1, mock.props));
    await screen.findByRole('grid');
    denied = true;
    fireEvent.click(screen.getAllByRole('button', { name: 'Detalhes' })[0]!);
    await screen.findByText('Sem permissão para esta consulta.');
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.textContent).not.toContain('192.0.2.');
  });
});
