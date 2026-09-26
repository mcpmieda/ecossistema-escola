import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminCommandV1 } from '../../../../shared/student-portal-contracts/admin-v1';
import type { EffectiveSettingsV1 } from '../../../../shared/student-portal-contracts/policy-v1';
import { SYNTHETIC_ID_V1 } from '../../../../shared/student-portal-contracts/fixtures-v1';
import { StudentSettingsV1 } from '../../../../src/features/student-portal-admin/settings/student-settings-v1';
import { createPortalAdminClientV1 } from '../../../../src/features/student-portal-admin/shared/admin-client-v1';
import { SETTINGS_CLASS_V1, SETTINGS_SCHOOL_V1, settingsFixtureV1 } from './fixtures-v1';

beforeEach(() => {
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  });
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

function setup(
  initial: EffectiveSettingsV1 = settingsFixtureV1(SETTINGS_CLASS_V1),
  failFirstWrite = false,
) {
  let current = structuredClone(initial);
  const inherited = settingsFixtureV1();
  inherited.value.allowedPeriods = ['T1', 'T2', 'T3'];
  const writes: AdminCommandV1[] = [];
  const json = (data: unknown) =>
    new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  const base = { contractVersion: 1, requestId: SYNTHETIC_ID_V1 } as const;
  const client = createPortalAdminClientV1({
    fetch: async (path, init) => {
      if (path.endsWith('/query')) return json({ ...base, state: 'settings', settings: current });
      const command: AdminCommandV1 = JSON.parse(String(init.body));
      writes.push(command);
      // The client automatically replays one ambiguous response before exposing manual retry.
      if (failFirstWrite && writes.length <= 2) throw new TypeError('Synthetic connection failure');
      if (command.operation === 'settings-inherit') {
        current = {
          ...current,
          value: {
            ...current.value,
            ...Object.fromEntries(command.keys.map((key) => [key, inherited.value[key]])),
          },
          sources: {
            ...current.sources,
            ...Object.fromEntries(command.keys.map((key) => [key, SETTINGS_SCHOOL_V1])),
          },
        };
      } else if (command.operation === 'settings-set') {
        current = {
          ...current,
          value: { ...current.value, ...command.value },
          sources: {
            ...current.sources,
            ...Object.fromEntries(Object.keys(command.value).map((key) => [key, initial.scope])),
          },
        };
      } else throw new Error('Unexpected mutation in policy category test');
      current = { ...current, version: current.version + 1 };
      return json({
        ...base,
        state: 'committed',
        operationId: SYNTHETIC_ID_V1,
        version: current.version,
      });
    },
  });
  render(
    <StudentSettingsV1
      client={client}
      scope={initial.scope}
      canWrite
      area="policies"
      scopeLabel="Turma sintética"
    />,
  );
  return { writes };
}

describe('policy categories preserve editing and inheritance', () => {
  it('keeps an unsaved period selection when visiting another category', async () => {
    const user = userEvent.setup();
    const mock = setup();
    await user.click(await screen.findByRole('tab', { name: 'Notas' }));
    const group = screen.getByRole('group', { name: 'Notas disponíveis' });
    await user.click(within(group).getByRole('checkbox', { name: '2º trimestre' }));
    await user.click(screen.getByRole('tab', { name: 'Segurança' }));
    expect(group.closest('.pa-policy-panel')?.hasAttribute('data-inert')).toBe(true);
    expect(screen.getByRole('tab', { name: 'Segurança' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    await user.click(screen.getByRole('tab', { name: 'Notas' }));
    const returned = screen.getByRole('group', { name: 'Notas disponíveis' });
    expect(
      (
        within(returned).getByRole('checkbox', {
          name: '2º trimestre',
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
    expect(
      (
        within(returned).getByRole('checkbox', {
          name: '1º trimestre',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'Desfazer edições' })).toBeTruthy();
    expect(mock.writes).toHaveLength(0);
  });

  it('pins an inherited enabled value with one confirmed command and no temporary inversion', async () => {
    const initial = settingsFixtureV1(SETTINGS_CLASS_V1);
    initial.value.accessEnabled = true;
    const user = userEvent.setup();
    const mock = setup(initial);
    await user.click(await screen.findByRole('button', { name: /Acesso ao Portal/ }));
    await user.click(screen.getByRole('option', { name: 'Ativado' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Ativado')).toBeTruthy();
    expect(mock.writes).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar alteração' }));
    await vi.waitFor(() => expect(mock.writes).toHaveLength(1));
    expect(mock.writes[0]).toMatchObject({
      operation: 'settings-set',
      value: { accessEnabled: true },
      scope: SETTINGS_CLASS_V1,
      expectedVersion: 7,
      acknowledgeImmediateEffect: true,
    });
    await screen.findByText('Definido aqui');
    expect(mock.writes).toHaveLength(1);
  });

  it.each([false, true])(
    'restores the inherited value of a dirty field while retaining another draft (transient retry: %s)',
    async (failFirstWrite) => {
      const initial = settingsFixtureV1(SETTINGS_CLASS_V1);
      initial.sources.allowedPeriods = SETTINGS_CLASS_V1;
      initial.value.allowedPeriods = ['T1'];
      const user = userEvent.setup();
      const mock = setup(initial, failFirstWrite);
      await user.click(await screen.findByRole('tab', { name: 'Notas' }));
      await user.click(
        within(screen.getByRole('group', { name: 'Notas disponíveis' })).getByRole('checkbox', {
          name: '2º trimestre',
        }),
      );
      await user.click(screen.getByRole('tab', { name: 'Segurança' }));
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Pedir verificação após' }), {
        target: { value: '4' },
      });
      await user.click(screen.getByRole('tab', { name: 'Notas' }));
      await user.click(screen.getByRole('button', { name: 'Usar padrão de Períodos permitidos' }));
      expect(mock.writes).toHaveLength(0);
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Usar padrão' }),
      );
      if (failFirstWrite) {
        const retry = await screen.findByRole('button', { name: 'Tentar novamente' });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(mock.writes).toHaveLength(2);
        await user.click(retry);
        await vi.waitFor(() => expect(mock.writes).toHaveLength(3));
        expect(mock.writes[1]).toEqual(mock.writes[0]);
        expect(mock.writes[2]).toEqual(mock.writes[0]);
      }
      await vi.waitFor(() => {
        const group = screen.getByRole('group', { name: 'Notas disponíveis' });
        for (const period of ['1º trimestre', '2º trimestre', '3º trimestre'])
          expect(
            (within(group).getByRole('checkbox', { name: period }) as HTMLInputElement).checked,
          ).toBe(true);
        expect(
          (
            within(group).getByRole('checkbox', {
              name: 'Recuperação 1',
            }) as HTMLInputElement
          ).checked,
        ).toBe(false);
      });
      expect(mock.writes).toHaveLength(failFirstWrite ? 3 : 1);
      expect(mock.writes[0]).toMatchObject({
        operation: 'settings-inherit',
        keys: ['allowedPeriods'],
        expectedVersion: 7,
      });
      await user.click(screen.getByRole('tab', { name: 'Segurança' }));
      expect(
        (screen.getByRole('spinbutton', { name: 'Pedir verificação após' }) as HTMLInputElement)
          .value,
      ).toBe('4');
      expect(screen.getByRole('button', { name: 'Desfazer edições' })).toBeTruthy();
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Pedir verificação após' }), {
        target: { value: '3' },
      });
      await vi.waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Desfazer edições' })).toBeNull(),
      );
      expect(mock.writes).toHaveLength(failFirstWrite ? 3 : 1);
    },
  );
});
