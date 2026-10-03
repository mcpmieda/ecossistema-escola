import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { STUDENT_PHOTO_MAX_BYTES_V1 } from '../../../shared/student-photos/portrait-v1';
import { PHOTO_CHANGED_EVENT_V1 } from './catalog-client-v1';

/**
 * Session memory for the small approved images shown beside names. One authenticated download per
 * image and document, shared by every list that shows the same student; nothing reaches persistent
 * browser storage and leaving the page releases it.
 */
interface PhotoMemoryEntryV1 {
  state: 'idle' | 'queued' | 'loading' | 'ready' | 'absent';
  src?: string;
  loadedAt: number;
  retryAt: number;
  interest: number;
  listeners: Set<() => void>;
  controller?: AbortController;
}
const MAX_PARALLEL_V1 = 6;
const FRESH_MS_V1 = 600_000;
const RETRY_MS_V1 = 30_000;
const entries = new Map<string, PhotoMemoryEntryV1>();
const queue: string[] = [];
let running = 0;
let listening = false;

function entryV1(url: string) {
  let entry = entries.get(url);
  if (!entry) {
    entry = { state: 'idle', loadedAt: 0, retryAt: 0, interest: 0, listeners: new Set() };
    entries.set(url, entry);
  }
  return entry;
}
function notifyV1(entry: PhotoMemoryEntryV1) {
  for (const listener of [...entry.listeners]) listener();
}
function releaseSrcV1(entry: PhotoMemoryEntryV1) {
  if (entry.src) URL.revokeObjectURL(entry.src);
  entry.src = undefined;
}
async function downloadV1(url: string, signal: AbortSignal): Promise<Blob | null> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    signal,
  });
  // The server answers a student without photo with a plain colored shape, not a WebP.
  if (response.status === 404 || (response.ok && !isWebpV1(response))) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('student-photo-unavailable');
  }
  const bytes = await response.arrayBuffer();
  signal.throwIfAborted();
  if (bytes.byteLength < 20 || bytes.byteLength > STUDENT_PHOTO_MAX_BYTES_V1)
    throw new Error('student-photo-response-size');
  return new Blob([bytes], { type: 'image/webp' });
}
const isWebpV1 = (response: Response) =>
  response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() === 'image/webp';

async function loadV1(url: string, entry: PhotoMemoryEntryV1) {
  const controller = new AbortController();
  entry.controller = controller;
  entry.state = 'loading';
  running += 1;
  try {
    const blob = await downloadV1(url, controller.signal);
    if (controller.signal.aborted) return;
    releaseSrcV1(entry);
    entry.src = blob ? URL.createObjectURL(blob) : undefined;
    entry.state = blob ? 'ready' : 'absent';
    entry.loadedAt = Date.now();
    notifyV1(entry);
  } catch {
    if (controller.signal.aborted) return;
    // Photos are optional: keep what is already shown and do not retry in a tight loop.
    entry.state = entry.src ? 'ready' : 'idle';
    entry.retryAt = Date.now() + RETRY_MS_V1;
  } finally {
    if (entry.controller === controller) entry.controller = undefined;
    running -= 1;
    pumpV1();
  }
}
function pumpV1() {
  while (running < MAX_PARALLEL_V1 && queue.length) {
    // The end of the queue is what the person is looking at now.
    const url = queue.pop()!;
    const entry = entries.get(url);
    if (entry?.state === 'queued') void loadV1(url, entry);
  }
}
/** `urgent` is a photo near the screen; the others wait their turn behind it, in list order. */
function enqueueV1(url: string, entry: PhotoMemoryEntryV1, urgent: boolean) {
  const now = Date.now();
  if (entry.state === 'queued') {
    if (!urgent) return;
    const index = queue.lastIndexOf(url);
    if (index >= 0) queue.splice(index, 1);
    queue.push(url);
    return;
  }
  if (entry.state === 'loading' || now < entry.retryAt) return;
  if ((entry.state === 'ready' || entry.state === 'absent') && now - entry.loadedAt < FRESH_MS_V1)
    return;
  entry.state = 'queued';
  if (urgent) queue.push(url);
  else queue.unshift(url);
  pumpV1();
}
/** Forgets every image. Mounted avatars ask again only when `reload` is set. */
export function clearPhotoMemoryV1(reload = false) {
  queue.length = 0;
  for (const [url, entry] of entries) {
    entry.controller?.abort();
    entry.controller = undefined;
    const shown = Boolean(entry.src);
    releaseSrcV1(entry);
    entry.state = 'idle';
    entry.loadedAt = 0;
    entry.retryAt = 0;
    if (shown) notifyV1(entry);
    if (!entry.interest && !entry.listeners.size) entries.delete(url);
  }
  if (reload)
    for (const [url, entry] of entries) if (entry.interest > 0) enqueueV1(url, entry, false);
}
/** A saved photo may be shown under another reference: revalidate what is on screen, keep it meanwhile. */
function refreshV1() {
  for (const [url, entry] of entries) {
    entry.loadedAt = 0;
    entry.retryAt = 0;
    if (entry.interest > 0) enqueueV1(url, entry, false);
  }
}
function startV1() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('pagehide', () => clearPhotoMemoryV1());
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) clearPhotoMemoryV1(true);
  });
  window.addEventListener(PHOTO_CHANGED_EVENT_V1, refreshV1);
}
function retainV1(url: string, urgent: boolean) {
  startV1();
  const entry = entryV1(url);
  entry.interest += 1;
  enqueueV1(url, entry, urgent);
  return () => {
    entry.interest -= 1;
    if (entry.interest > 0 || entry.state !== 'queued') return;
    // Left the list before its turn: an image nobody will see is not downloaded.
    const index = queue.lastIndexOf(url);
    if (index >= 0) queue.splice(index, 1);
    entry.state = entry.src ? 'ready' : 'idle';
  };
}

/** The in-memory image for an authenticated same-origin URL. Every mounted avatar asks for its
 * photo; the ones near the screen go first. */
export function usePhotoMemoryV1(url: string | undefined, near: boolean): string | undefined {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!url) return () => undefined;
      const entry = entryV1(url);
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    },
    [url],
  );
  const src = useSyncExternalStore(subscribe, () => (url ? entries.get(url)?.src : undefined));
  useEffect(() => (url ? retainV1(url, near) : undefined), [url, near]);
  return src;
}
