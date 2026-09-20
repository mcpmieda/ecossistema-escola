// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentGradesV1 } from '../../../../src/features/student-portal/grades/student-grades-v1';
import { StudentPortalWorkspaceV1 } from '../../../../src/features/student-portal/workspace/student-workspace-v1';
import { gradesFixtureV1 } from '../grades/fixtures-v1';
import { setupOperationsDomV1 } from '../overview/dom-v1';

beforeEach(() => {
  setupOperationsDomV1();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderWorkspace() {
  const data = gradesFixtureV1(false);
  render(
    <StudentPortalWorkspaceV1
      data={data}
      profile={<div data-testid="synthetic-profile">Perfil sintético</div>}
      grades={(value) => <StudentGradesV1 data={value} />}
    />,
  );
  return data;
}

describe('student portal grade workspace', () => {
  it('uses the four HeroUI navigation tabs and opens a discipline from the summary ListBox', async () => {
    const data = renderWorkspace();
    const user = userEvent.setup();
    const navigation = screen.getByRole('tablist', { name: 'Áreas do Portal do Aluno' });

    expect(within(navigation).getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Resumo',
      'Boletim',
      'Disciplina',
      'Evolução',
    ]);
    expect(screen.getByTestId('synthetic-profile')).toBeTruthy();

    const first = [...data.subjects].sort((a, b) => a.order - b.order)[0]!;
    await user.click(screen.getByRole('option', { name: new RegExp(first.label, 'u') }));

    expect(
      within(navigation).getByRole('tab', { name: 'Disciplina' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(screen.getByRole('heading', { name: first.label })).toBeTruthy();
  });

  it('filters the HeroUI annual table with the native SearchField', async () => {
    renderWorkspace();
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Boletim' }));

    const search = screen.getByRole('searchbox', { name: 'Buscar disciplina' });
    await user.type(search, 'Disciplina sintética 2');

    expect(screen.getAllByRole('rowheader')).toHaveLength(1);
    expect(screen.getByRole('rowheader').textContent).toBe('Disciplina sintética 2');
  });

  it('shows published evolution only with native HeroUI ProgressBar values', async () => {
    const data = renderWorkspace();
    const user = userEvent.setup();
    const first = [...data.subjects].sort((a, b) => a.order - b.order)[0]!;
    const numericTerms = first.periods.filter(
      (period) =>
        ['T1', 'T2', 'T3'].includes(period.period) && period.final.kind === 'score',
    ).length;

    await user.click(screen.getByRole('tab', { name: 'Evolução' }));

    expect(screen.getByRole('heading', { name: 'Evolução' })).toBeTruthy();
    expect(screen.getAllByRole('progressbar')).toHaveLength(numericTerms);
    expect(screen.queryByText(/ranking/iu)).toBeNull();
    expect(screen.queryByText(/média da turma/iu)).toBeNull();
    expect(screen.queryByText(/peso/iu)).toBeNull();
  });
});
