// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PerformanceAnalyticsWorkspaceV6 } from '../../../src/features/gradebook/performance/performance-analytics-workspace-v6';
import { learningFixtureV1 } from './learning-fixture-v1';
import { setupOperationsDomV1 } from '../../student-portal/ui/overview/dom-v1';

beforeEach(setupOperationsDomV1);
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function props(tab: 'students' | 'components' | 'teachers' = 'students') {
  return {
    value: learningFixtureV1().value,
    tab,
    selection: { studentId: 1, offerId: 10, teacherId: 1 },
    onSelection: vi.fn(),
    onNavigate: vi.fn(),
    onPeriod: vi.fn(),
    onCell: vi.fn(),
    onNotes: vi.fn(),
  };
}

it('replaces the old statistical student cards with learning and follow-up indicators', () => {
  render(<PerformanceAnalyticsWorkspaceV6 {...props()} />);
  expect(screen.getByTestId('performance-student-learning-v1')).toBeTruthy();
  for (const label of ['Desempenho atual', 'Evolução trimestral', 'Atenção recorrente', 'Participação avaliada'])
    expect(screen.getByText(label)).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Onde olhar primeiro' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Dificuldades que se repetem' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Componentes do aluno' })).toBeTruthy();
  expect(screen.queryByText('Mediana')).toBeNull();
  expect(screen.queryByText(/Dispersão/)).toBeNull();
  expect(screen.getByRole('button', { name: /Recuperação · detalhes/ }).getAttribute('aria-expanded')).toBe('false');
  expect(screen.getByRole('button', { name: /Base dos indicadores/ }).getAttribute('aria-expanded')).toBe('false');
});

it('opens highlighted components through the existing student detail entry point', async () => {
  const model = props();
  render(<PerformanceAnalyticsWorkspaceV6 {...model} />);
  const panel = screen.getByRole('heading', { name: 'Onde olhar primeiro' }).closest('[data-slot="card"]');
  expect(panel).toBeTruthy();
  const button = within(panel as HTMLElement).getAllByRole('button').find((item) => item.textContent?.includes('Melhor resultado atual'));
  expect(button).toBeTruthy();
  await userEvent.setup().click(button!);
  expect(model.onCell).toHaveBeenCalledWith(1, expect.any(Number));
});

it('closes the student select on an outside touch, on Escape, and after choosing another student', async () => {
  const model = props();
  render(<PerformanceAnalyticsWorkspaceV6 {...model} />);
  const user = userEvent.setup();
  const trigger = screen.getByRole('button', { name: /Aluno.*Aluno exemplo 01/i });

  await user.click(trigger);
  expect(screen.getByRole('listbox')).toBeTruthy();
  fireEvent.pointerDown(document.body, { pointerType: 'touch' });
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());

  await user.click(trigger);
  expect(screen.getByRole('listbox')).toBeTruthy();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());

  await user.click(trigger);
  await user.click(screen.getByRole('option', { name: /2\. Aluno exemplo 02/i }));
  expect(model.onSelection).toHaveBeenCalledWith({ studentId: 2 });
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
});

it.each([
  ['components', 'Componente', /Matemática/i],
  ['teachers', 'Professor', /Docente sintético 1/i],
] as const)('uses the same dismissible entity select for %s', async (tab, label, value) => {
  render(<PerformanceAnalyticsWorkspaceV6 {...props(tab)} />);
  const user = userEvent.setup();
  const trigger = screen.getByRole('button', { name: new RegExp(`${label}.*${value.source}`, 'i') });
  await user.click(trigger);
  expect(screen.getByRole('listbox')).toBeTruthy();
  fireEvent.pointerDown(document.body, { pointerType: 'touch' });
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
});
