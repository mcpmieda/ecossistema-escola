// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act, cleanup, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PerformanceAnalyticsWorkspaceV6 } from '../../../src/features/gradebook/performance/performance-analytics-workspace-v6';
import { learningFixtureV1 } from './learning-fixture-v1';
import { setupOperationsDomV1 } from '../../student-portal/ui/overview/dom-v1';

beforeEach(setupOperationsDomV1);
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function props() {
  return { value: learningFixtureV1().value, tab: 'overview' as const,
    selection: { studentId: null, offerId: null, teacherId: null },
    onSelection: vi.fn(), onNavigate: vi.fn(), onPeriod: vi.fn(), onCell: vi.fn(), onNotes: vi.fn() };
}
// React Aria combines the explicit aria-label with its associated visible Label.
// Match the visible label, not an assumed exact aria-label-only accessible name.
const qualityMeter = { name: /Notas lançadas/ };
it('mounts the actual overview with pedagogical KPIs, participation and collapsed technical information', () => {
  render(<PerformanceAnalyticsWorkspaceV6 {...props()} />);
  expect(screen.getByTestId('performance-learning-overview-v1')).toBeTruthy();
  expect(screen.getByTestId('performance-analytics-v6')).toBeTruthy();
  for (const name of ['Desempenho médio', 'Evolução trimestral', 'Alunos em evolução', 'Atenção recorrente'])
    expect(screen.getByRole('button', { name: `Ver alunos: ${name}` })).toBeTruthy();
  expect(screen.getByText('Participação avaliada')).toBeTruthy();
  expect(screen.getByText('Já incluída no qualitativo.')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Base dos indicadores/ }).getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('meter', qualityMeter)).toBeNull();
  expect(screen.queryByText('Mediana')).toBeNull();
  expect(screen.queryByText(/pares comparáveis/)).toBeNull();
});
it('filters from the KPI, searches and opens the existing student detail without an extra request', async () => {
  const model = props();
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  render(<PerformanceAnalyticsWorkspaceV6 {...model} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Ver alunos: Alunos em evolução' }));
  expect(screen.getByRole('heading', { name: 'Maiores evoluções' })).toBeTruthy();
  const table = screen.getByRole('grid', { name: 'Maiores evoluções' });
  await user.click(within(table).getByRole('button', { name: 'Ver notas de Aluno exemplo 02' }));
  expect(model.onCell).toHaveBeenCalledWith(2, undefined);
  await user.type(screen.getByRole('searchbox'), 'não existe');
  expect(screen.getByText('Nenhum aluno encontrado nesta busca.')).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
});
it('shows all participation students and their existing granular-detail entry point', async () => {
  const model = props(); render(<PerformanceAnalyticsWorkspaceV6 {...model} />);
  await userEvent.setup().click(screen.getByRole('button', { name: /Ver participação por aluno/ }));
  const table = screen.getByRole('grid', { name: 'Participação por aluno' });
  expect(within(table).getAllByRole('button', { name: /Ver notas de/ })).toHaveLength(3);
  await userEvent.setup().click(within(table).getByRole('button', { name: 'Ver notas de Aluno exemplo 01' }));
  expect(model.onCell).toHaveBeenCalledWith(1, undefined);
});
it('reuses period and component navigation and opens activity notes', async () => {
  const model = props(); render(<PerformanceAnalyticsWorkspaceV6 {...model} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /Consultar 1º trimestre/ }));
  expect(model.onPeriod).toHaveBeenCalledWith(1);
  await user.click(screen.getByRole('button', { name: 'Matemática' }));
  expect(model.onSelection).toHaveBeenCalledWith({ offerId: 10 });
  expect(model.onNavigate).toHaveBeenCalledWith('components');
  await user.click(screen.getAllByRole('button', { name: /Trabalho livre/ })[0]!);
  expect(model.onNotes).toHaveBeenCalled();
});
it('opens and closes quality on demand and exposes a focused information explanation', async () => {
  const model = props();
  render(<PerformanceAnalyticsWorkspaceV6 {...model} />);
  const user = userEvent.setup();
  const trigger = screen.getByRole('button', { name: /Base dos indicadores/ });
  await user.click(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  const meter = await screen.findByRole('meter', qualityMeter);
  expect(meter.getAttribute('aria-label')).toBe('Cobertura dos instrumentos');
  expect(Number(meter.getAttribute('aria-valuenow'))).toBeCloseTo(model.value.summary.coverage.percent!);
  await user.click(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  await waitFor(() => expect(screen.queryByRole('meter', qualityMeter)).toBeNull());
  const hint = screen.getByLabelText('Sobre Participação avaliada');
  act(() => hint.focus());
  await waitFor(() => expect(screen.getByRole('tooltip').textContent).toContain('Não mede presença'));
});
it('preserves DOM, search, focus and filter when the same scope revalidates', async () => {
  const model = props(); const view = render(<PerformanceAnalyticsWorkspaceV6 {...model} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Todos' }));
  const input = screen.getByRole('searchbox');
  await user.type(input, '01');
  const overview = screen.getByTestId('performance-learning-overview-v1');
  const student = screen.getByRole('button', { name: 'Ver notas de Aluno exemplo 01' });
  view.rerender(<PerformanceAnalyticsWorkspaceV6 {...model} value={{ ...model.value, readAt: '2026-09-15T21:01:00Z' }} />);
  expect(screen.getByTestId('performance-learning-overview-v1')).toBe(overview);
  expect(screen.getByRole('searchbox')).toBe(input);
  expect((input as HTMLInputElement).value).toBe('01');
  expect(document.activeElement).toBe(input);
  expect(screen.getByRole('button', { name: 'Ver notas de Aluno exemplo 01' })).toBe(student);
  expect(screen.getByRole('heading', { name: 'Todos os alunos' })).toBeTruthy();
});
it('clears the previous filter and search when the selected period changes', async () => {
  const model = props();
  const view = render(<PerformanceAnalyticsWorkspaceV6 {...model} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Todos' }));
  await user.type(screen.getByRole('searchbox'), '01');
  const previous = screen.getByTestId('performance-learning-overview-v1');
  view.rerender(<PerformanceAnalyticsWorkspaceV6 {...model} value={learningFixtureV1({ period: 1 }).value} />);
  expect(screen.getByTestId('performance-learning-overview-v1')).not.toBe(previous);
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  expect(screen.getByRole('heading', { name: 'Atenção recorrente' })).toBeTruthy();
});
it('shows insufficient evidence instead of a zero performance or recurrence for an empty period', async () => {
  render(<PerformanceAnalyticsWorkspaceV6 {...props()} value={learningFixtureV1({ period: 3 }).value} />);
  expect(screen.getByRole('button', { name: 'Ver alunos: Desempenho médio' }).textContent).toBe('—');
  expect(screen.getByRole('button', { name: 'Ver alunos: Atenção recorrente' }).textContent).toBe('—');
  expect(screen.getByText('Ainda não há notas suficientes para avaliar a recorrência.')).toBeTruthy();
  await userEvent.setup().click(screen.getByRole('button', { name: /Ver participação por aluno/ }));
  expect(within(screen.getByRole('grid', { name: 'Participação por aluno' })).queryAllByRole('button', { name: /Ver notas de/ })).toHaveLength(0);
});
it('keeps responsive width guards and removes entrance motion when reduced motion is requested', () => {
  const css = readFileSync('src/features/gradebook/performance/performance-learning-v1.css', 'utf8');
  expect(css).toContain('container-type: inline-size');
  expect(css).toContain('@container (max-width: 1080px)');
  expect(css).toContain('@container (max-width: 620px)');
  expect(css).toContain('prefers-reduced-motion: reduce');
  expect(css).toContain('animation: none');
  expect(css).toContain('140ms');
  const source = readFileSync('src/features/gradebook/performance/performance-analytics-workspace-v6.tsx', 'utf8');
  expect(source).not.toMatch(/key=\{[^}]*readAt/);
});
