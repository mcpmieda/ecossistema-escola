import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  StudentPortalPageV1,
  StudentProfileV1,
  type StudentPagePropsV1,
} from '../../../../src/features/student-portal/shell/student-shell-v1';
import { SYNTHETIC_SELF_V1 } from '../../../../shared/student-portal-contracts/fixtures-v1';
import { PortalClientErrorV1 } from '../../../../src/features/student-portal/shared/transport-v1';
import { setupOperationsDomV1 } from '../overview/dom-v1';
import {
  selfResponseV1,
  type SelfResponseV1,
} from '../../../../shared/student-portal-contracts/self-v1';

const ready = { state: 'ready', data: SYNTHETIC_SELF_V1 } as const;
const grades = (_data: SelfResponseV1) =>
  createElement('div', { role: 'table', 'aria-label': 'Notas sintéticas' }, 'Tabela sintética');
const page = (props: Partial<StudentPagePropsV1> = {}) =>
  createElement(StudentPortalPageV1, { load: ready, grades, ...props });
beforeEach(() => {
  setupOperationsDomV1();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('student shell and canonical profile', () => {
  it('renders profile before grades from the same self object and retains the existing brand', () => {
    const slot = vi.fn(grades);
    render(page({ grades: slot }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('PORTAL DO ALUNO');
    expect(
      screen.getByRole('img', { name: 'Escola Iêda Alves de Oliveira MCPM' }).textContent,
    ).toBe('IA');
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(['Perfil do aluno', 'Minhas notas']);
    expect(screen.getByText('Estudante de exemplo')).toBeTruthy();
    expect(screen.getByText(/Turma de exemplo.*2026/u)).toBeTruthy();
    expect(screen.getByText('Em curso')).toBeTruthy();
    expect(slot.mock.calls[0]?.[0]).toBe(SYNTHETIC_SELF_V1);
    expect(document.querySelector('aside')).toBeNull();
    expect(document.querySelector('time')).toBeNull();
  });
  it('clears protected profile and grade content in loading, errors and expiration', () => {
    const view = render(page());
    view.rerender(page({ load: { state: 'loading' } }));
    expect(screen.getByRole('status', { name: 'Carregando perfil e notas' })).toBeTruthy();
    expect(screen.queryByText('Estudante de exemplo')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('main').getAttribute('aria-busy')).toBe('true');
    view.rerender(
      page({ load: { state: 'error', error: new PortalClientErrorV1('network-error') } }),
    );
    expect(screen.getByRole('alert').textContent).toContain('Não foi possível carregar seus dados');
    expect(screen.queryByText('Estudante de exemplo')).toBeNull();
    view.rerender(
      page({ load: { state: 'error', error: new PortalClientErrorV1('unauthenticated') } }),
    );
    expect(screen.getByRole('alert').textContent).toContain('Sessão expirada');
    expect(screen.queryByRole('table')).toBeNull();
  });
  it('keeps no publication, maintenance and generic unavailability distinct', () => {
    const slot = vi.fn(grades);
    const empty = selfResponseV1.parse({
      ...SYNTHETIC_SELF_V1,
      state: 'no-publication',
      subjects: [],
    });
    const view = render(page({ load: { state: 'ready', data: empty }, grades: slot }));
    expect(screen.getByRole('status').textContent).toBe('Notas ainda não publicadas');
    expect(screen.getByText('Estudante de exemplo')).toBeTruthy();
    expect(slot).not.toHaveBeenCalled();
    view.rerender(page({ load: { state: 'maintenance' } }));
    expect(screen.getByRole('alert').textContent).toContain('Portal em manutenção');
    view.rerender(
      page({ load: { state: 'error', error: new PortalClientErrorV1('unavailable') } }),
    );
    expect(screen.getByRole('alert').textContent).toContain('Portal temporariamente indisponível');
    expect(screen.queryByText('Estudante de exemplo')).toBeNull();
  });
  it('uses initials, preserves long names and suppresses a global result for ASSISTIDO', () => {
    const profile = {
      ...SYNTHETIC_SELF_V1.profile,
      name: 'Élisa de Exemplo Sintético',
      academicState: 'assisted' as const,
      result: 'not-applicable' as const,
    };
    render(createElement(StudentProfileV1, { profile, updatedAt: 'not-a-date' }));
    expect(screen.getByText(profile.name)).toBeTruthy();
    expect(screen.getByText('ÉS')).toBeTruthy();
    expect(screen.getByText('ASSISTIDO')).toBeTruthy();
    expect(screen.queryByText('Não se aplica')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('time')).toBeNull();
  });
  it('exposes an optional real projection timestamp with an explicit school timezone', () => {
    render(page({ showUpdatedAt: true }));
    expect(document.querySelector('time')?.dateTime).toBe('2026-09-01T12:00:00.000Z');
    expect(document.querySelector('time')?.textContent).toContain('09:00');
  });
  it('supports skip link, keyboard logout and explicit retry/login callbacks', async () => {
    const user = userEvent.setup();
    const logout = vi.fn(),
      retry = vi.fn(),
      login = vi.fn();
    const view = render(page({ onLogout: logout }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Ir para o conteúdo' }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Sair' }));
    await user.keyboard('{Enter}');
    expect(logout).toHaveBeenCalledOnce();
    view.rerender(page({ onLogout: logout, loggingOut: true }));
    expect((screen.getByRole('button', { name: 'Sair' }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(
      page({
        load: { state: 'error', error: new PortalClientErrorV1('network-error') },
        onRetry: retry,
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(retry).toHaveBeenCalledOnce();
    view.rerender(
      page({
        load: { state: 'error', error: new PortalClientErrorV1('unauthenticated') },
        onLogin: login,
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(login).toHaveBeenCalledOnce();
  });
});
