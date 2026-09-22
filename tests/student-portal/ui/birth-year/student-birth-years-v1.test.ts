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
    expect(screen.getByText('Ano inválido ou incompleto')).toBeTruthy();
    expect(mock.writes).toHaveLength(0);
    enter(field, '2001');
    await screen.findByText('Salvo');
    expect(mock.writes[0]).toMatchObject({
      item: { year: '2001', confirmation: 'confirmed' },
    });
    expect(((await input()) as HTMLInputElement).value).toBe('2001');
  });
  it('does not confirm an imported test value on load; Enter is an explicit operator confirmation', async () => {
    const mock = birthMockV1();
    render(createElement(StudentBirthYearsV1, mock.props));
    const field = await input();
    expect(screen.getByText('Confirme o ano')).toBeTruthy();
    expect(mock.writes).toHaveLength(0);
    fireEvent.keyDown(field, { key: 'Enter' });
    await screen.findByText('Salvo');
    expect(mock.writes[0]).toMatchObject({
      item: { year: '2000', confirmation: 'confirmed' },
      expectedVersion: 19,
    });
  });
  it('keeps empty input transient and Escape restores without clearing persisted birth data', async () => {
    const mock = birthMockV1();
    render(createElement(StudentBirthYearsV1, mock.props));
    const field = await input();
    enter(field, '');
    fireEvent.blur(field);
    expect(mock.writes).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Limpar ano/ })).toBeNull();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect((field as HTMLInputElement).value).toBe('2000');
    expect(mock.births.get(birthIdV1(1))?.year).toBe('2000');
    expect(mock.writes).toHaveLength(0);
  });
  it('autosaves independently edited rows without a batch-review or actions tab', async () => {
    const mock = birthMockV1({ count: 2 });
    render(createElement(StudentBirthYearsV1, mock.props));
    fireEvent.change(await input(), { target: { value: '2001' } });
    fireEvent.change(await input(2), { target: { value: '2002' } });
    await waitFor(() => expect(mock.births.get(birthIdV1(2))?.year).toBe('2002'), {
      timeout: 3000,
    });
    expect(mock.births.get(birthIdV1(1))?.year).toBe('2001');
    expect(mock.writes).toHaveLength(2);
    expect(
      mock.writes.every(
        (c) =>
          c.operation === 'birth-write' &&
          c.item.action === 'set' &&
          c.item.confirmation === 'confirmed',
      ),
    ).toBe(true);
    expect(screen.queryByRole('button', { name: 'Preparar lote' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Ações' })).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
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
    expect(screen.getByText('Somente leitura')).toBeTruthy();
  });
  it('removes protected rows on401 during a write', async () => {
    const mock = birthMockV1({
      write: async () => birthJsonV1({ ...BIRTH_META_V1, state: 'unauthenticated' }, 401),
    });
    const lost = vi.fn();
    render(createElement(StudentBirthYearsV1, { ...mock.props, onAuthorizationLost: lost }));
    enter(await input(), '2001');
    await screen.findByText('Sessão expirada. Entre novamente.');
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
    await screen.findByText('Este cadastro mudou em outra sessão. Recarregue antes de editar.');
    expect(mock.writes).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Repetir mesma gravação' })).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Recarregar' }));
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
  it('collects all birth rows automatically with distinct cursors and preserves an incomplete draft', async () => {
    const mock = birthMockV1({
      query: async (q) => mock.defaultQuery({ ...q, page: { ...q.page, limit: 2 } }),
    });
    render(createElement(StudentBirthYearsV1, mock.props));
    const field = await input();
    await input(3);
    expect(screen.queryByRole('button', { name: 'Próxima' })).toBeNull();
    const cursorQueries = mock.queries.filter((q) => q.page.cursor);
    expect(cursorQueries.length).toBeGreaterThanOrEqual(2);
    expect(cursorQueries[0]!.page.cursor).not.toBe(cursorQueries[1]!.page.cursor);
    enter(field, '20');
    expect((field as HTMLInputElement).value).toBe('20');
    expect(screen.getByText('SYNTHETIC BIRTH 003')).toBeTruthy();
    fireEvent.keyDown(field, { key: 'Escape' });
    await waitFor(() => expect((field as HTMLInputElement).value).toBe('2000'));
    expect(mock.writes).toHaveLength(0);
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
