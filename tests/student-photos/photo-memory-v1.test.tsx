import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LinkedStudentPhotoAvatarV1 } from '../../src/features/student-photos/linked-student-photo-avatar-v1';
import { clearPhotoMemoryV1 } from '../../src/features/student-photos/photo-memory-v1';
import { PHOTO_CHANGED_EVENT_V1 } from '../../src/features/student-photos/catalog-client-v1';

const subject = (n: number) => ({
  source: 'portal' as const,
  academicYear: 2026,
  accountIds: ['10000000-0000-4000-8000-' + String(n).padStart(12, '0')],
});
const webp = () => new Response(new Uint8Array(64), { headers: { 'Content-Type': 'image/webp' } });
const images = (view: { container: HTMLElement }) =>
  [...view.container.querySelectorAll('img')].map((image) => image.getAttribute('src'));
let created: ReturnType<typeof vi.fn<(blob: Blob) => string>>;
let revoked: ReturnType<typeof vi.fn<(src: string) => void>>;
beforeEach(() => {
  let next = 0;
  created = vi.fn(() => 'blob:synthetic-' + ++next);
  revoked = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: created });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoked });
});
afterEach(() => {
  cleanup();
  clearPhotoMemoryV1();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
});

it('downloads each student once and shows a remounted list from memory without a new request', async () => {
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => webp());
  vi.stubGlobal('fetch', fetcher);
  const list = () => (
    <>
      <LinkedStudentPhotoAvatarV1 subject={subject(1)} />
      <LinkedStudentPhotoAvatarV1 subject={subject(1)} />
      <LinkedStudentPhotoAvatarV1 subject={subject(2)} />
    </>
  );
  const first = render(list());
  await waitFor(() => expect(images(first)).toHaveLength(3));
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls.map(([url]) => String(url)).every((url) => url.startsWith('/api/student-photos/admin/image?'))).toBe(true);
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store', credentials: 'same-origin', redirect: 'error' });
  expect(images(first)[0]).toBe(images(first)[1]);
  first.unmount();
  // A filter, a sort or another area mounts the same people again: the photo is already there.
  const second = render(list());
  expect(images(second)).toHaveLength(3);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(created).toHaveBeenCalledTimes(2);
});

it('keeps the fallback for a student without photo and for a failed download, without a request loop', async () => {
  const fetcher = vi.fn(async (url: string) =>
    url.includes('000000000003')
      ? new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', { headers: { 'Content-Type': 'image/svg+xml' } })
      : new Response(null, { status: 503 }),
  );
  vi.stubGlobal('fetch', fetcher);
  const list = () => (
    <>
      <LinkedStudentPhotoAvatarV1 subject={subject(3)} />
      <LinkedStudentPhotoAvatarV1 subject={subject(4)} />
    </>
  );
  const first = render(list());
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  await act(async () => { await Promise.resolve(); });
  expect(images(first)).toHaveLength(0);
  expect(first.container.querySelectorAll('[data-slot="avatar-fallback"]')).toHaveLength(2);
  first.unmount();
  const second = render(list());
  await act(async () => { await Promise.resolve(); });
  expect(images(second)).toHaveLength(0);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(created).not.toHaveBeenCalled();
});

it('limits simultaneous downloads and serves the row near the screen before the others in the list', async () => {
  const callbacks: IntersectionObserverCallback[] = [];
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { callbacks.push(callback); }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  });
  const pending: ((response: Response) => void)[] = [];
  const fetcher = vi.fn((_url: string) => new Promise<Response>((resolve) => pending.push(resolve)));
  vi.stubGlobal('fetch', fetcher);
  const requested = () => fetcher.mock.calls.map(([url]) => Number(String(url).match(/0000000000(\d\d)&/u)?.[1]));
  const view = render(<>{Array.from({ length: 10 }, (_, index) => <LinkedStudentPhotoAvatarV1 key={index} subject={subject(20 + index)} />)}</>);
  // Every mounted row asks for its photo, six at a time and in list order.
  expect(requested()).toEqual([20, 21, 22, 23, 24, 25]);
  // The last row comes near the screen while four are still waiting: it goes next.
  await act(async () => {
    callbacks.at(-1)!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
  await act(async () => { pending.shift()!(webp()); });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(7));
  expect(requested().at(-1)).toBe(29);
  await act(async () => { for (const resolve of pending.splice(0)) resolve(webp()); });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(10));
  expect(requested().slice(7)).toEqual([26, 27, 28]);
  await act(async () => { for (const resolve of pending.splice(0)) resolve(webp()); });
  await waitFor(() => expect(images(view)).toHaveLength(10));
});

it('does not download the photo of a row that left the list before its turn', async () => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  });
  const pending: ((response: Response) => void)[] = [];
  const fetcher = vi.fn((_url: string) => new Promise<Response>((resolve) => pending.push(resolve)));
  vi.stubGlobal('fetch', fetcher);
  const row = (index: number) => <LinkedStudentPhotoAvatarV1 key={index} subject={subject(40 + index)} />;
  const view = render(<>{Array.from({ length: 8 }, (_, index) => row(index))}</>);
  expect(fetcher).toHaveBeenCalledTimes(6);
  // A filter removes the two rows still waiting.
  view.rerender(<>{Array.from({ length: 6 }, (_, index) => row(index))}</>);
  await act(async () => { for (const resolve of pending.splice(0)) resolve(webp()); });
  await waitFor(() => expect(images(view)).toHaveLength(6));
  expect(fetcher).toHaveBeenCalledTimes(6);
});

it('releases every image when the page is left and revalidates what is on screen after a saved photo', async () => {
  const fetcher = vi.fn(async () => webp());
  vi.stubGlobal('fetch', fetcher);
  const view = render(<LinkedStudentPhotoAvatarV1 subject={subject(5)} />);
  await waitFor(() => expect(images(view)).toEqual(['blob:synthetic-1']));
  act(() => { window.dispatchEvent(new CustomEvent(PHOTO_CHANGED_EVENT_V1, { detail: { subjectKey: 'other', studentUid: 'other', revision: null } })); });
  // The current image stays until its replacement arrives.
  expect(images(view)).toEqual(['blob:synthetic-1']);
  await waitFor(() => expect(images(view)).toEqual(['blob:synthetic-2']));
  expect(revoked).toHaveBeenCalledWith('blob:synthetic-1');
  expect(fetcher).toHaveBeenCalledTimes(2);
  act(() => { window.dispatchEvent(new Event('pagehide')); });
  expect(images(view)).toHaveLength(0);
  expect(revoked).toHaveBeenCalledWith('blob:synthetic-2');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
