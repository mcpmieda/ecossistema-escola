import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Button, Spinner } from '@heroui/react';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import { useOperationalReadV1 } from '../overview/operations-values-v1';

type CursorPage = { items: unknown[]; nextCursor: string | null };
const INITIAL_ROWS = 100;
/** Keep the first interaction to one bounded response. Additional rows are appended only when
 * the end sentinel approaches the viewport; already loaded rows are preserved on revalidation. */
export async function collectCursorPagesV1<P extends CursorPage>(
  loadPage: (cursor: string | undefined, signal: AbortSignal) => Promise<P>,
  signal: AbortSignal,
  key: string,
  seed: P | null = null,
  desired = INITIAL_ROWS,
): Promise<P> {
  let cursor = seed?.nextCursor ?? undefined;
  let result: P | null = seed;
  const items = new Map<string, P['items'][number]>();
  for (const item of seed?.items ?? [])
    items.set(String((item as Record<string, unknown>)[key]), item);
  const seen = new Set<string>();
  let added = 0;
  for (let page = 0; page < Math.max(20, Math.ceil(desired / 100) + 10); page++) {
    signal.throwIfAborted();
    if (cursor && seen.has(cursor)) throw new PortalClientErrorV1('invalid-response');
    if (cursor) seen.add(cursor);
    const value = await loadPage(cursor, signal);
    signal.throwIfAborted();
    for (const item of value.items) {
      const id = (item as Record<string, unknown>)[key];
      if (typeof id !== 'string' && typeof id !== 'number')
        throw new PortalClientErrorV1('invalid-response');
      if (!items.has(String(id))) added++;
      items.set(String(id), item);
    }
    result = { ...value, items: [...items.values()] };
    if (!value.nextCursor || added >= desired) return result;
    cursor = value.nextCursor;
  }
  // Empty filtered pages may still have a continuation. Never call that a complete empty list.
  if (!result) throw new PortalClientErrorV1('invalid-response');
  return result;
}

export function useContinuousReadV1<P extends CursorPage>(
  loadPage: (cursor: string | undefined, signal: AbortSignal) => Promise<P>,
  key: string,
  onAuthorizationLost?: (error: PortalClientErrorV1) => void,
) {
  const cache = useMemo(
    () => ({ data: null as P | null, append: false, fetchedAt: 0 }),
    [loadPage],
  );
  const load = useCallback(
    async (signal: AbortSignal) => {
      const seed = cache.append && Date.now() - cache.fetchedAt < 240_000 ? cache.data : null;
      const desired =
        cache.append && !seed
          ? (cache.data?.items.length ?? 0) + INITIAL_ROWS
          : seed
            ? INITIAL_ROWS
            : Math.max(INITIAL_ROWS, cache.data?.items.length ?? 0);
      cache.append = false;
      try {
        const data = await collectCursorPagesV1(loadPage, signal, key, seed, desired);
        signal.throwIfAborted();
        cache.data = data;
        cache.fetchedAt = Date.now();
        return data;
      } catch (error) {
        if (
          error instanceof PortalClientErrorV1 &&
          ['unauthenticated', 'forbidden'].includes(error.state)
        )
          cache.data = null;
        throw error;
      }
    },
    [cache, loadPage, key],
  );
  const read = useOperationalReadV1(load, onAuthorizationLost);
  useEffect(() => {
    const clear = () => {
      cache.data = null;
      cache.append = false;
    };
    window.addEventListener('pagehide', clear);
    return () => {
      clear();
      window.removeEventListener('pagehide', clear);
    };
  }, [cache]);
  return {
    ...read,
    more: read.state.state === 'ready' && Boolean(read.state.data.nextCursor),
    loadMore: () => {
      if (
        read.state.state !== 'ready' ||
        read.refreshing ||
        !read.canReload ||
        !read.state.data.nextCursor
      )
        return;
      cache.append = true;
      read.reload();
    },
  };
}

export function ContinuousEndV1({
  more,
  busy,
  failed,
  loadMore,
  retry,
}: {
  more: boolean;
  busy: boolean;
  failed?: boolean;
  loadMore: () => void;
  retry?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(loadMore);
  latest.current = loadMore;
  useEffect(() => {
    if (!more || busy || failed || !ref.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      latest.current();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) latest.current();
      },
      { rootMargin: '500px' },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [more, busy, failed]);
  return (
    <div ref={ref} className="pa-continuous-end" role="status">
      {failed && more ? (
        <Button size="sm" variant="ghost" onPress={retry}>
          Tentar carregar novamente
        </Button>
      ) : more ? (
        <>
          <Spinner size="sm" />
          <span>Carregando mais registros…</span>
        </>
      ) : null}
    </div>
  );
}
