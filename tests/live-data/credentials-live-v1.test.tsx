// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mockSecureJitterV1 } from './secure-jitter-fixture';
import { StudentCredentialsV1 } from '../../src/features/student-portal-admin/credentials/student-credentials-v1';
import { notifyLiveChangeV1 } from '../../src/shared/live-data/live-refresh-v1';
import { qrMockV1 } from '../student-portal/ui/credentials/fixtures-v1';

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function generate() {
  fireEvent.click(screen.getByRole('button', { name: 'Preparar PDF' }));
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Gerar arquivo' }));
  await screen.findByRole('button', { name: 'Baixar PDF' });
}
it('expires only the artifact and permits another PDF without querying manually or losing selection', async () => {
  const timers = vi.spyOn(globalThis, 'setTimeout');
  const mock = qrMockV1();
  render(createElement(StudentCredentialsV1, mock.props));
  const selected = await screen.findByRole('checkbox', { name: 'Selecionar SYNTHETIC PRINT 001' });
  fireEvent.click(selected);
  fireEvent.click(screen.getByRole('radio', { name: 'QR + nome' }));
  await generate();
  const expire = timers.mock.calls.find((call) => call[1] === 5 * 60_000)?.[0];
  expect(typeof expire).toBe('function');
  act(() => { if (typeof expire === 'function') expire(); });
  expect(screen.queryByRole('button', { name: 'Baixar PDF' })).toBeNull();
  expect(screen.getByText('Arquivo temporário expirado. Prepare outra cópia quando precisar.')).toBeTruthy();
  expect((selected as HTMLInputElement).checked).toBe(true);
  expect((selected as HTMLInputElement).disabled).toBe(false);
  expect((screen.getByRole('radio', { name: 'QR + nome' }) as HTMLInputElement).checked).toBe(true);
  expect(screen.queryByRole('button', { name: 'Consultar novamente' })).toBeNull();
  expect(mock.writes).toHaveLength(1);
  await generate(); expect(mock.writes).toHaveLength(2);
});
it.each([0, 0.999])('updates readiness at jitter %s without generating a QR or selecting another account', async (random) => {
  const mock = qrMockV1();
  mock.accounts[0]!.firstAccess = { state: 'birth-unconfirmed', qrIssued: true, recoveryReady: false };
  render(createElement(StudentCredentialsV1, mock.props));
  const checkbox = await screen.findByRole('checkbox', { name: 'Selecionar SYNTHETIC PRINT 001' });
  expect((checkbox as HTMLInputElement).disabled).toBe(true);
  // The production delay can exceed Testing Library's 1s waitFor default.
  // Control time instead of extending that timeout or removing the real scheduler.
  vi.useFakeTimers();
  const jitter = Math.floor(random * 1_000);
  mockSecureJitterV1(jitter);
  const delay = 250 + jitter;
  mock.accounts[0]!.firstAccess = { state: 'ready', qrIssued: true, recoveryReady: true };
  act(() => notifyLiveChangeV1('portal'));
  await act(async () => { await vi.advanceTimersByTimeAsync(delay - 1); });
  expect((checkbox as HTMLInputElement).disabled).toBe(true);
  expect(mock.writes).toHaveLength(0);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(screen.getByRole('checkbox', { name: 'Selecionar SYNTHETIC PRINT 001' })).toBe(checkbox);
  expect((checkbox as HTMLInputElement).disabled).toBe(false);
  expect((checkbox as HTMLInputElement).checked).toBe(false);
  expect(mock.writes).toHaveLength(0);
});
