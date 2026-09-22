// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    />,
  );
  return data;
}

describe('student portal grade workspace', () => {
  it('keeps only Boletim and Disciplina in the main navigation', () => {
    renderWorkspace();
    const navigation = screen.getByRole('tablist', { name: 'Áreas do Portal do Aluno' });

    expect(within(navigation).getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Boletim',
      'Disciplina',
    ]);
    expect(within(navigation).queryByRole('tab', { name: 'Resumo' })).toBeNull();
    expect(within(navigation).queryByRole('tab', { name: 'Evolução' })).toBeNull();
  });

  it('opens a discipline from Boletim without repeating the trimester after its title', async () => {
    const data = renderWorkspace();
    const user = userEvent.setup();
    const navigation = screen.getByRole('tablist', { name: 'Áreas do Portal do Aluno' });
    const first = [...data.subjects].sort((a, b) => a.order - b.order)[0]!;
    const option = screen.getByRole('option', { name: new RegExp(first.label, 'u') });

    expect(within(option).queryByText('1º Tri')).toBeNull();
    await user.click(option);

    expect(
      within(navigation).getByRole('tab', { name: 'Disciplina' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(screen.getByRole('heading', { name: first.label })).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText('Abaixo do mínimo')).toBeTruthy();
  });
});
