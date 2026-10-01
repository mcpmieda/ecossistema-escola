// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useDebouncedSearchV1 } from '../../../src/features/student-portal-admin/shared/debounced-search-v1';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('publishes only the settled trimmed search and cancels pending work when unmounted', async () => {
  vi.useFakeTimers();
  const view = renderHook(({ value }) => useDebouncedSearchV1(value), {
    initialProps: { value: '' },
  });
  view.rerender({ value: 'A' });
  await act(() => vi.advanceTimersByTime(150));
  view.rerender({ value: 'An' });
  await act(() => vi.advanceTimersByTime(150));
  view.rerender({ value: ' Ana ' });
  await act(() => vi.advanceTimersByTime(249));
  expect(view.result.current).toBe('');
  await act(() => vi.advanceTimersByTime(1));
  expect(view.result.current).toBe('Ana');
  view.rerender({ value: 'Outro aluno' });
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
