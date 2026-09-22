import { createElement } from 'react';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  StudentGradesV1,
  StudentMarkV1,
} from '../../../../src/features/student-portal/grades/student-grades-v1';
import { PRESENTATION_CASES_V1 } from '../../bn-contract/presentation-cases-v1';
import { selfResponseV1 } from '../../../../shared/student-portal-contracts/self-v1';
import { gradesFixtureV1, score } from './fixtures-v1';

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
});
const table = (data = gradesFixtureV1()) => createElement(StudentGradesV1, { data });

describe('annual published grades', () => {
  it('resets a wide sticky column when the viewport becomes compact', async () => {
    let compact = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(max-width: 640px), (pointer: coarse)' && compact,
      addEventListener: (_event: string, callback: () => void) => {
        listeners.add(callback);
      },
      removeEventListener: (_event: string, callback: () => void) => {
        listeners.delete(callback);
      },
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    const user = userEvent.setup();
    render(table(gradesFixtureV1(false)));
    await user.click(screen.getByRole('button', { name: 'Ajustar largura de Disciplina' }));
    const old = screen.getByRole('slider', {
      name: /Redimensionar Disciplina/u,
    }) as HTMLInputElement;
    await vi.waitFor(() => expect(document.activeElement).toBe(old));
    await user.keyboard('{ArrowRight}{ArrowRight}{Enter}');
    expect(Number(old.value)).toBeGreaterThan(136);
    act(() => {
      compact = true;
      listeners.forEach((callback) => callback());
    });
    const current = screen.getByRole('slider', {
      name: /Redimensionar Disciplina/u,
    }) as HTMLInputElement;
    expect(current).not.toBe(old);
    expect(Number(current.value)).toBe(136);
    expect(document.querySelector('.pa-grades-resizable')?.getAttribute('style')).toContain(
      '662px',
    );
  });
  it('enters resize from the grid with keyboard navigation and changes the width within its minimum', async () => {
    const user = userEvent.setup();
    render(table(gradesFixtureV1(false)));
    await user.click(screen.getAllByRole('rowheader')[0]!);
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Ajustar largura de Disciplina' }),
    );
    await user.keyboard('{Enter}');
    const slider = screen.getByRole('slider', {
      name: /Redimensionar Disciplina/u,
    }) as HTMLInputElement;
    await vi.waitFor(() => expect(document.activeElement).toBe(slider));
    const before = Number(slider.value);
    await user.keyboard('{ArrowRight}');
    expect(Number(slider.value)).toBe(before + 10);
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(Number(slider.value)).toBeGreaterThanOrEqual(Number(slider.min));
    await user.keyboard('{Enter}');
  });
  it('uses only the union of delivered periods and preserves institutional subject order without mutating the DTO', () => {
    const data = gradesFixtureV1(false);
    const original = JSON.stringify(data);
    render(table(data));
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Disciplina',
      'T1',
      'T3',
      'REC T1',
      'Resultado',
    ]);
    expect(screen.getAllByRole('rowheader').map((header) => header.textContent)).toEqual(
      [...data.subjects].sort((a, b) => a.order - b.order).map((subject) => subject.label),
    );
    expect(screen.getAllByRole('rowheader')).toHaveLength(13);
    expect(JSON.stringify(data)).toBe(original);
    expect(screen.queryByText('REC T2')).toBeNull();
  });
  it('keeps I/II and all ten activities inside the trimester cell with official descriptions and a separate final', () => {
    render(table());
    const first = screen.getAllByRole('row')[1]!;
    const detail = within(first).getAllByRole('gridcell')[0]!;
    expect(detail.querySelectorAll('dt')).toHaveLength(12);
    expect([...detail.querySelectorAll('dt')].slice(0, 2).map((node) => node.textContent)).toEqual([
      'I AVALIAÇÃO',
      'II AVALIAÇÃO',
    ]);
    expect(within(detail).getByText(/Atividade com descrição oficial extensa/u)).toBeTruthy();
    expect(within(detail).getByText('Tirou zero')).toBeTruthy();
    expect(within(detail).getByLabelText('1,5. Classificação indisponível').textContent).toBe(
      '1,5',
    );
    expect(within(detail).getByText('Nota do trimestre')).toBeTruthy();
    expect(detail.querySelector('.pa-period-total')?.textContent).toBe('Nota do trimestre22,499');
    expect(within(detail).queryByRole('button')).toBeNull();
  });
  it('distinguishes pending, scored and inapplicable recovery, zero, absent, N/C and R/R', () => {
    render(table());
    expect(screen.getAllByLabelText('Recuperação pendente de nota')).toHaveLength(1);
    expect(screen.getAllByLabelText('Recuperação não aplicável')).toHaveLength(11);
    const second = screen.getAllByRole('row')[2]!;
    expect(within(second).getByLabelText('20. Atinge o mínimo institucional')).toBeTruthy();
    const first = screen.getAllByRole('row')[1]!;
    expect(within(first).getByText('N/C')).toBeTruthy();
    expect(within(first).getByText('R/R')).toBeTruthy();
    expect(within(first).getAllByLabelText('Ainda não lançado')).toHaveLength(2);
    expect(within(first).getByText('Tirou zero')).toBeTruthy();
  });
  it('shows only official per-subject outcomes; regular stays Em curso and assisted has no inferred outcome', () => {
    const data = gradesFixtureV1(false);
    const first = data.subjects[0]!;
    first.officialOutcome = 'failed-attendance';
    data.subjects[1]!.officialOutcome = 'failed';
    const view = render(table(data));
    expect(screen.getByText('Reprovado por falta')).toBeTruthy();
    expect(screen.getByText('Reprovado')).toBeTruthy();
    expect(screen.getByText('Aprovado')).toBeTruthy();
    expect(screen.getAllByText('Em curso')).toHaveLength(10);
    view.rerender(
      table(
        selfResponseV1.parse({
          ...data,
          profile: { ...data.profile, academicState: 'assisted', result: 'not-applicable' },
          subjects: data.subjects.map(({ officialOutcome: _unused, ...subject }) => subject),
        }),
      ),
    );
    expect(screen.queryByText('Em curso')).toBeNull();
    expect(screen.queryByText('Aprovado')).toBeNull();
    expect(screen.getAllByLabelText('Sem resultado global para estudante assistido')).toHaveLength(
      13,
    );
  });
  it('removes old periods, partials and recovery when a coherent new payload is received', () => {
    const data = gradesFixtureV1(false);
    const view = render(table());
    data.subjects.forEach((subject) => {
      subject.periods = subject.periods.filter((period) => period.period === 'T3');
    });
    data.revisions.publicationVersion = 'publication:2';
    view.rerender(table(data));
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Disciplina',
      'T3',
      'Resultado',
    ]);
    expect(screen.queryByText('I AVALIAÇÃO')).toBeNull();
    expect(screen.queryByText('REC')).toBeNull();
  });
  it('has no grade table or invented zeros without publication', () => {
    const data = gradesFixtureV1(false);
    const view = render(table(data));
    view.rerender(table(selfResponseV1.parse({ ...data, state: 'no-publication', subjects: [] })));
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Notas ainda não publicadas');
  });
  it('exposes the local scroll region and named column resize controls for keyboard users', () => {
    render(table(gradesFixtureV1(false)));
    expect(screen.getByRole('region', { name: /Tabela anual de notas/u }).tabIndex).toBe(0);
    expect(screen.getByRole('slider', { name: /Redimensionar Disciplina/u })).toBeTruthy();
  });
});

describe('BN presentation classification is consumed, never recalculated', () => {
  for (const vector of PRESENTATION_CASES_V1.filter(
    (item) =>
      item.input.valueMilli !== null &&
      item.input.valueMilli >= 0 &&
      (item.input.maximumMilli === null || item.input.maximumMilli >= 0),
  )) {
    it(vector.name, () => {
      render(
        createElement(StudentMarkV1, {
          mark: score(
            vector.input.valueMilli! / 1000,
            vector.input.maximumMilli === null ? null : vector.input.maximumMilli / 1000,
            vector.expected,
          ),
          showMaximum: true,
        }),
      );
      const mark = document.querySelector('.pa-mark')!;
      expect(mark.getAttribute('data-minimum')).toBe(
        vector.expected === null ? 'unknown' : vector.expected ? 'met' : 'below',
      );
      if (vector.input.maximumMilli === null) expect(mark.textContent).not.toContain('/');
    });
  }
  it('trusts the received flag even if a local fixed percentage would disagree', () => {
    render(createElement(StudentMarkV1, { mark: score(0, 100, true) }));
    expect(
      screen.getByLabelText('0. Atinge o mínimo institucional').getAttribute('data-minimum'),
    ).toBe('met');
  });
});

it('shows observed blank and real zero in published partials without changing the trimester total', () => {
  const data = gradesFixtureV1();
  const first = data.subjects.find((subject) => subject.order === 1)!;
  const term = first.periods.find((p) => p.period === 'T1')!;
  term.partials![1] = {
    assessmentId: 900002,
    label: 'AV2 SYNTHETIC',
    notDone: true,
    mark: { kind: 'absent' },
  };
  const original = JSON.stringify(data);
  render(table(data));
  const detail = within(screen.getAllByRole('row')[1]!).getAllByRole('gridcell')[0]!;
  expect(within(detail).getByText('Não fez')).toBeTruthy();
  expect(within(detail).getByText('Tirou zero')).toBeTruthy();
  expect(detail.querySelector('.pa-period-total')?.textContent).toBe('Nota do trimestre22,499');
  expect(JSON.stringify(data)).toBe(original);
});
