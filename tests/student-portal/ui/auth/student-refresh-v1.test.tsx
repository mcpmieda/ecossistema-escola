import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { STUDENT_REFRESH_INTERVAL_V1, useStudentSessionV1 } from '../../../../src/features/student-portal/auth/student-session-v1';
import { PortalClientErrorV1 } from '../../../../src/features/student-portal/shared/transport-v1';
import { SYNTHETIC_SELF_V1 } from '../../../../shared/student-portal-contracts/fixtures-v1';
import { setupOperationsDomV1 } from '../overview/dom-v1';
import { clientFixtureV1, NOW, SESSION } from './fixtures-v1';

beforeEach(() => {
  setupOperationsDomV1();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const settle = () => act(async () => { await Promise.resolve(); });
const advance = (milliseconds: number) => act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });

it('replaces no-publication with the newly authorized projection without focus or reload', async () => {
  const client = clientFixtureV1();
  client.me.mockResolvedValueOnce({ ...SYNTHETIC_SELF_V1, state: 'no-publication', subjects: [] });
  const { result } = renderHook(() => useStudentSessionV1(client));
  await settle();
  expect(result.current.load).toMatchObject({ state: 'ready', data: { state: 'no-publication' } });
  await advance(STUDENT_REFRESH_INTERVAL_V1);
  expect(client.session).toHaveBeenCalledTimes(2);
  expect(client.me).toHaveBeenCalledTimes(2);
  expect(result.current.load).toEqual({ state: 'ready', data: SYNTHETIC_SELF_V1 });
});

it('keeps the ready view while polling and never overlaps pending refreshes', async () => {
  const client = clientFixtureV1();
  const { result } = renderHook(() => useStudentSessionV1(client));
  await settle();
  const ready = result.current.load;
  let resolve!: (value: typeof SESSION) => void;
  client.session.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  await advance(STUDENT_REFRESH_INTERVAL_V1 * 2);
  expect(result.current.load).toBe(ready);
  expect(client.session).toHaveBeenCalledTimes(2);
  expect(client.me).toHaveBeenCalledTimes(1);
  await act(async () => { resolve(SESSION); });
  expect(client.me).toHaveBeenCalledTimes(2);
});

it('does not poll hidden tabs and releases the interval on unmount', async () => {
  const client = clientFixtureV1();
  const { unmount } = renderHook(() => useStudentSessionV1(client));
  await settle();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  await advance(STUDENT_REFRESH_INTERVAL_V1 * 2);
  expect(client.session).toHaveBeenCalledTimes(1);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  await advance(STUDENT_REFRESH_INTERVAL_V1);
  expect(client.session).toHaveBeenCalledTimes(2);
  unmount();
  await advance(STUDENT_REFRESH_INTERVAL_V1 * 2);
  expect(client.session).toHaveBeenCalledTimes(2);
});

it.each([
  ['unauthenticated', 401], ['forbidden', 403], ['rate-limited', 429],
] as const)('does not turn %s into an automatic login or request loop', async (state, status) => {
  const client = clientFixtureV1();
  client.session.mockRejectedValueOnce(new PortalClientErrorV1(state, status));
  const { result } = renderHook(() => useStudentSessionV1(client));
  await settle();
  await advance(STUDENT_REFRESH_INTERVAL_V1 * 3);
  expect(result.current.load).toMatchObject({ state: 'error', error: { state } });
  expect(client.session).toHaveBeenCalledTimes(1);
  expect(client.me).not.toHaveBeenCalled();
});

it('honors Retry-After after a transient background failure and recovers through a fresh session', async () => {
  const client = clientFixtureV1();
  const { result } = renderHook(() => useStudentSessionV1(client));
  await settle();
  client.session.mockRejectedValueOnce(new PortalClientErrorV1('unavailable', 503, 90));
  await advance(STUDENT_REFRESH_INTERVAL_V1);
  expect(result.current.load).toMatchObject({ state: 'ready', data: SYNTHETIC_SELF_V1, refreshError: { state: 'unavailable' } });
  await advance(STUDENT_REFRESH_INTERVAL_V1 * 2);
  expect(client.session).toHaveBeenCalledTimes(2);
  await advance(STUDENT_REFRESH_INTERVAL_V1);
  expect(client.session).toHaveBeenCalledTimes(3);
  expect(result.current.load).toEqual({ state: 'ready', data: SYNTHETIC_SELF_V1 });
});

it('never brings protected data back after logout', async () => {
  const client = clientFixtureV1();
  const { result } = renderHook(() => useStudentSessionV1(client));
  await settle();
  await act(async () => { await result.current.logout(); });
  await advance(STUDENT_REFRESH_INTERVAL_V1 * 3);
  expect(result.current.load).toMatchObject({ state: 'error', error: { state: 'unauthenticated' } });
  expect(client.session).toHaveBeenCalledTimes(1);
  expect(client.me).toHaveBeenCalledTimes(1);
});
