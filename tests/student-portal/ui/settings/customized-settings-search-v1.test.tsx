// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CustomizedSettingsV1 } from '../../../../src/features/student-portal-admin/settings/customized-settings-v1';
import { createPortalAdminClientV1 } from '../../../../src/features/student-portal-admin/shared/admin-client-v1';
import { createPortalAdminReadClientV2 } from '../../../../src/features/student-portal-admin/accounts/accounts-client-v2';
import { ACCOUNT_SCHOOL_V1 } from '../accounts/fixtures-v1';
import { setupOperationsDomV1 } from '../overview/dom-v1';
import { customizationsUiFixture827 } from './customizations-ui-fixture-827';

beforeEach(setupOperationsDomV1);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('keeps search input immediate and sends one query after consecutive keystrokes', async () => {
  const mock = customizationsUiFixture827();
  render(
    <CustomizedSettingsV1
      reader={createPortalAdminReadClientV2({ fetch: mock.fetcher })}
      client={createPortalAdminClientV1({ fetch: mock.fetcher })}
      scope={ACCOUNT_SCHOOL_V1}
      canWrite
      onOpen={() => {}}
    />,
  );
  await screen.findByRole('button', { name: 'Editar personalizações de SYNTHETIC ACCOUNT 001' });
  const queries = () => mock.queries.filter((q) => q.operation === 'customizations-read');
  expect(queries()).toHaveLength(1);
  vi.useFakeTimers();
  const input = screen.getByRole('textbox', { name: 'Buscar personalizações por aluno ou turma' });
  fireEvent.change(input, { target: { value: 'S' } });
  fireEvent.change(input, { target: { value: 'SY' } });
  fireEvent.change(input, { target: { value: 'SYN' } });
  expect((input as HTMLInputElement).value).toBe('SYN');
  expect(queries()).toHaveLength(1);
  await act(async () => vi.advanceTimersByTime(249));
  expect(queries()).toHaveLength(1);
  await act(async () => vi.advanceTimersByTime(1));
  expect(queries()).toHaveLength(2);
  expect(queries()[1]).toMatchObject({ nameSearch: 'SYN' });
});
