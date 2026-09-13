import { createElement, StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentBirthYearsV1 } from '../../../../src/features/student-portal-admin/birth-year/student-birth-years-v1';
import { BIRTH_META_V1, birthIdV1, birthJsonV1, birthMockV1 } from './fixtures-v1';

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
const input = (n = 1) =>
  screen.findByRole('textbox', {
    name: 'Ano de nascimento de SYNTHETIC BIRTH ' + String(n).padStart(3, '0'),
  });
const enter = (target: HTMLElement, value: string) => {
  fireEvent.change(target, { target: { value } });
  fireEvent.keyDown(target, { key: 'Enter' });
};

describe('birth access data UI', () => {
  it('shows readonly names and saves complete input on Enter with a server-confirmed status', async () => {
    const mock = birthMockV1();
    render(createElement(StudentBirthYearsV1, mock.props));
    const field = await input();
    expect((field as HTMLInputElement).value).toBe('2000');
    expect(screen.getByText('SYNTHETIC BIRTH 001')).toBeTruthy();
    fireEvent.change(field, { target: { value: '20' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(screen.getByText('Edição incompleta — não salva')).toBeTruthy();
    expect(mock.writes).toHaveLength(0);
    enter(field, '2001');
    await screen.findByText('Salvo');
    expect(mock.writes[0]).toMatchObject({
      item: { year: '2001', confirmation: 'unconfirmed-test' },
    });
    expect(((await input()) as HTMLInputElement).value).toBe('2001');
  });
  it('requires a dedicated legitimate-provenance acknowledgment and does not infer it from a test value', async () => {
    const mock = birthMockV1();
    render(createElement(StudentBirthYearsV1, mock.props));
    await input();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Conferir procedência de SYNTHETIC BIRTH 001' }),
    );
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Confirmar procedência' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(mock.writes).toHaveLength(0);
    await user.click(
      within(dialog).getByRole('checkbox', {
        name: 'Conferi este ano em uma fonte institucional legítima.',
      }),
    );
    await user.click(confirm);
    await screen.findByText('Salvo');
    expect(mock.writes[0]).toMatchObject({ item: { year: '2000', confirmation: 'confirmed' } });
    expect(screen.getByText('Na última consulta: confirmado')).toBeTruthy();
  });
  it('keeps empty input transient and requires explicit confirmation before clearing', async () => {
    const mock = birthMockV1();
    render(createElement(StudentBirthYearsV1, mock.props));
    const field = await input();
    enter(field, '');
    expect(mock.writes).toHaveLength(0);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Limpar ano de SYNTHETIC BIRTH 001' }));
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('aria-label')).toBe(
        'Limpar ano de SYNTHETIC BIRTH 001',
      ),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Limpar ano de SYNTHETIC BIRTH 001' }),
    );
    const dialog = await screen.findByRole('alertdialog');
    await user.click(
      within(dialog).getByRole('checkbox', {
        name: 'Conferi as contas, os valores e o efeito desta ação.',
      }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Limpar 1 ano(s)' }));
    await screen.findByText('Salvo');
    expect(mock.writes).toHaveLength(1);
    expect(mock.writes[0]).toMatchObject({ item: { action: 'clear' } });
    expect(mock.births.get(birthIdV1(1))?.year).toBeNull();
  });
  it('prepares per-row values without autosave, confirms the selection and resumes one immutable batch', async () => {
    const mock = birthMockV1({ count: 2 });
    render(createElement(StudentBirthYearsV1, mock.props));
    await input();
    fireEvent.click(screen.getByRole('button', { name: 'Preparar lote' }));
    fireEvent.change(await input(), { target: { value: '2001' } });
    fireEvent.change(await input(2), { target: { value: '2002' } });
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar esta página' }));
    expect(screen.getByText('2 de 2 selecionadas nesta página')).toBeTruthy();
    expect(mock.writes).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Revisar lote de anos' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/2001/)).toBeTruthy();
    expect(within(dialog).getByText(/2002/)).toBeTruthy();
    await user.click(
      within(dialog).getByRole('checkbox', {
        name: 'Conferi as contas, os valores e o efeito desta ação.',
      }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Salvar 2 ano(s)' }));
    await screen.findByText(
      'Processamento encerrado. Consulte os resultados atuais antes de editar novamente.',
    );
    expect(mock.writes).toHaveLength(2);
    expect(mock.bodies[0]).toBe(mock.bodies[1]);
    expect(screen.getAllByText('Salvo pelo lote')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Recarregar dados' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() =>
      expect(
        (
          screen.getByRole('textbox', {
            name: 'Ano de nascimento de SYNTHETIC BIRTH 001',
          }) as HTMLInputElement
        ).disabled,
      ).toBe(false),
    );
  });
  it('clears names and drafts on identity/capability change and cancels pending debounce', async () => {
    const mock = birthMockV1();
    const view = render(createElement(StudentBirthYearsV1, mock.props));
    fireEvent.change(await input(), { target: { value: '2001' } });
    view.rerender(
      createElement(StudentBirthYearsV1, {
        ...mock.props,
        identityKey: 'another-synthetic-operator',
        canWrite: false,
      }),
    );
    const field = await input();
    expect((field as HTMLInputElement).value).toBe('2000');
    expect((field as HTMLInputElement).disabled).toBe(true);
    expect(mock.writes).toHaveLength(0);
    expect(
      screen.getByText('Somente consulta: esta identidade não pode alterar dados.'),
    ).toBeTruthy();
  });
  it('removes protected rows on401 during a write', async () => {
    const mock = birthMockV1({
      write: async () => birthJsonV1({ ...BIRTH_META_V1, state: 'unauthenticated' }, 401),
    });
    const lost = vi.fn();
    render(createElement(StudentBirthYearsV1, { ...mock.props, onAuthorizationLost: lost }));
    enter(await input(), '2001');
    await screen.findByText('A sessão expirou. Entre novamente para consultar os dados.');
    expect(screen.queryByText('SYNTHETIC BIRTH 001')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(lost).toHaveBeenCalledOnce();
  });
  it('shows conflict without automatically adopting a new CAS or resending a write', async () => {
    const mock = birthMockV1({
      write: async () => birthJsonV1({ ...BIRTH_META_V1, state: 'conflict' }, 409),
    });
    render(createElement(StudentBirthYearsV1, mock.props));
    enter(await input(), '2001');
    await screen.findByText('Conflito — recarregue e revise');
    expect(mock.writes).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Repetir mesma gravação' })).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Recarregar dados' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Descartar e continuar' }));
    await waitFor(() =>
      expect(
        (
          screen.getByRole('textbox', {
            name: 'Ano de nascimento de SYNTHETIC BIRTH 001',
          }) as HTMLInputElement
        ).value,
      ).toBe('2000'),
    );
    expect(mock.writes).toHaveLength(1);
  });
  it('pages with separate cursors and asks before discarding an incomplete draft', async () => {
    const mock = birthMockV1({
      query: async (query) => mock.defaultQuery({ ...query, page: { ...query.page, limit: 2 } }),
    });
    render(createElement(StudentBirthYearsV1, mock.props));
    enter(await input(), '20');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Próxima página' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Descartar e continuar' }));
    await input(3);
    expect(screen.queryByText('SYNTHETIC BIRTH 001')).toBeNull();
    expect(screen.getByText('Página 2 · até 100 contas')).toBeTruthy();
    expect(mock.writes).toHaveLength(0);
    const cursors = mock.queries.slice(-2).map((query) => query.page.cursor);
    expect(cursors[0]).not.toBe(cursors[1]);
  });
  it('supports StrictMode cleanup and a later save without duplicating writes', async () => {
    const mock = birthMockV1();
    render(createElement(StrictMode, null, createElement(StudentBirthYearsV1, mock.props)));
    enter(await input(), '2001');
    await screen.findByText('Salvo');
    enter(await input(), '2002');
    await waitFor(() => expect(mock.births.get(birthIdV1(1))?.year).toBe('2002'));
    expect(mock.writes).toHaveLength(2);
  });
});
