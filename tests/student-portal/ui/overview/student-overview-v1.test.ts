import { createElement, StrictMode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentOverviewV1 } from '../../../../src/features/student-portal-admin/overview/student-overview-v1';
import { operationsMockV1, opIdV1, opJsonV1, OP_META_V1, OP_CLASS_V1 } from './fixtures-v1';
import { setupOperationsDomV1 } from './dom-v1';
beforeEach(setupOperationsDomV1);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('actual operational summary and health', () => {
  it('selects an account by ID within a class and discards selection when identity changes', async () => {
    const user = userEvent.setup(),
      mock = operationsMockV1();
    const props = { ...mock.props, scope: OP_CLASS_V1 };
    const view = render(createElement(StudentOverviewV1, props));
    await screen.findByText('Operando normalmente');
    await user.click(screen.getByRole('button', { name: 'Todos da turma Aluno' }));
    await user.click(await screen.findByRole('option', { name: 'SYNTHETIC OP STUDENT 2' }));
    await waitFor(() =>
      expect(mock.queries.at(-1)).toMatchObject({
        scope: { kind: 'account', accountId: opIdV1(2) },
      }),
    );
    view.rerender(
      createElement(StudentOverviewV1, { ...props, identityKey: 'synthetic-other-operator' }),
    );
    await screen.findByRole('button', { name: 'Todos da turma Aluno' });
    await waitFor(() => expect(mock.queries.at(-1)).toMatchObject({ scope: OP_CLASS_V1 }));
  });
  it('honors rate limiting instead of reporting a successful partial read', async () => {
    const mock = operationsMockV1({
      query: (q) =>
        q.operation === 'overview'
          ? Promise.resolve(
              opJsonV1({ ...OP_META_V1, state: 'rate-limited' }, 429, { 'Retry-After': '30' }),
            )
          : undefined,
    });
    render(createElement(StudentOverviewV1, mock.props));
    await screen.findByText('Limite temporário. Aguarde para consultar novamente.');
    expect(
      (screen.getByRole('button', { name: 'Recarregar consulta' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(document.querySelector('dl')).toBeNull();
  });
  it.each([
    ['normal', 'Operando normalmente'],
    ['attention', 'Atenção'],
    ['intervention', 'Intervenção necessária'],
  ] as const)('translates %s without decorative metrics', async (status, label) => {
    const mock = operationsMockV1({
      query: (q) =>
        q.operation === 'health'
          ? Promise.resolve(opJsonV1({ ...OP_META_V1, state: 'health', status }))
          : undefined,
    });
    render(createElement(StrictMode, null, createElement(StudentOverviewV1, mock.props)));
    await screen.findByText(label);
    expect(screen.getByText('Sessões válidas')).toBeTruthy();
    expect(screen.getByText(/As categorias se sobrepõem/)).toBeTruthy();
    expect(document.querySelector('svg[role="img"],canvas')).toBeNull();
  });
  it('keeps actual health observable when counts fail and never substitutes zero totals', async () => {
    const mock = operationsMockV1({
      query: (q) =>
        q.operation === 'overview'
          ? Promise.resolve(opJsonV1({ ...OP_META_V1, state: 'unavailable' }, 503))
          : undefined,
    });
    render(createElement(StudentOverviewV1, mock.props));
    await screen.findByText('Operando normalmente');
    expect(screen.getByText(/Os totais não foram substituídos por zero/)).toBeTruthy();
    expect(document.querySelector('dl')).toBeNull();
  });
  it('does not invent normal health on failure and clears counts if either request loses authorization', async () => {
    const mock = operationsMockV1({
      query: (q) =>
        q.operation === 'health'
          ? Promise.resolve(opJsonV1({ ...OP_META_V1, state: 'unauthenticated' }, 401))
          : undefined,
    });
    render(createElement(StudentOverviewV1, mock.props));
    await screen.findByText('Sessão administrativa expirada. Entre novamente.');
    expect(screen.queryByText('Operando normalmente')).toBeNull();
    expect(document.querySelector('dl')).toBeNull();
    expect(document.body.textContent).not.toContain('SYNTHETIC OP STUDENT');
  });
});
