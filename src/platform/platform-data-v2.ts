import { useEffect, useRef, useState } from 'react';
import type { PlatformSnapshotContract } from '../../shared/platform-contract';

export type PlatformLoadStateV2 =
  | { status: 'loading' }
  | { status: 'error'; message: string; correlationId?: string }
  | { status: 'ready'; snapshot: PlatformSnapshotContract; auxiliary: 'loading' | 'ready' | 'error'; auxiliaryMessage?: string };
class ReadError extends Error {
  constructor(readonly status: number, readonly retryAt = 0) { super('Platform data unavailable'); }
}
function snapshot(value: unknown): PlatformSnapshotContract {
  if (!value || typeof value !== 'object' || !('releaseState' in value) || value.releaseState !== 'production'
    || !('coreModules' in value) || !Array.isArray(value.coreModules) || !('foundation' in value)
    || !('registeredModules' in value) || !Array.isArray(value.registeredModules))
    throw new ReadError(502);
  return value as PlatformSnapshotContract;
}
/** Two independent requests, no shared rejection gate and no persisted permission/data cache. */
export function createPlatformDataV2(publish: (state: PlatformLoadStateV2) => void,
  fetcher: typeof fetch = fetch, now = Date.now) {
  let generation = 0, stopped = false, retryAt = 0, pending = false;
  let core: PlatformSnapshotContract | undefined;
  let complete: PlatformSnapshotContract | undefined;
  let auxiliary: 'loading' | 'ready' | 'error' = 'loading';
  let coreAbort: AbortController | undefined, auxiliaryAbort: AbortController | undefined;
  const emit = () => {
    if (stopped || !core) return;
    publish({ status: 'ready', snapshot: complete ?? core, auxiliary,
      ...(auxiliary === 'error' ? { auxiliaryMessage: 'As informações Microsoft estão indisponíveis. Banco de Notas e Painel do Aluno continuam independentes.' } : {}) });
  };
  async function read(path: string, signal: AbortSignal) {
    const response = await fetcher(path, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal });
    signal.throwIfAborted();
    if (!response.ok) {
      const header = response.headers.get('Retry-After');
      const deadline = header && /^\d+$/u.test(header) ? now() + Number(header) * 1000 : header ? Date.parse(header) : 0;
      throw new ReadError(response.status, Number.isFinite(deadline) ? deadline : 0);
    }
    return snapshot(await response.json());
  }
  function failAuthorization(error: unknown) {
    if (!(error instanceof ReadError) || ![401, 403].includes(error.status)) return false;
    stopped = true; core = undefined; complete = undefined;
    coreAbort?.abort(); auxiliaryAbort?.abort();
    publish({ status: 'error', message: 'Sua autorização precisa ser verificada novamente. Entre novamente no Centro.' });
    return true;
  }
  async function refreshAuxiliary() {
    if (stopped || pending || now() < retryAt) return;
    const own = generation, controller = new AbortController();
    auxiliaryAbort = controller; pending = true;
    try {
      const value = await read('/api/platform/snapshot', controller.signal);
      if (controller.signal.aborted || own !== generation || stopped) return;
      complete = value; auxiliary = 'ready'; retryAt = 0; emit();
    } catch (error) {
      if (controller.signal.aborted || own !== generation || stopped) return;
      if (failAuthorization(error)) return;
      retryAt = Math.max(now() + 30_000, error instanceof ReadError ? error.retryAt : 0);
      auxiliary = 'error'; emit();
    } finally { if (own === generation) pending = false; }
  }
  async function start() {
    generation++; stopped = false; core = undefined; complete = undefined; pending = false; retryAt = 0; auxiliary = 'loading';
    coreAbort?.abort(); auxiliaryAbort?.abort(); publish({ status: 'loading' });
    const own = generation, controller = new AbortController(); coreAbort = controller;
    void refreshAuxiliary();
    try {
      const value = await read('/api/platform/bootstrap', controller.signal);
      if (controller.signal.aborted || own !== generation || stopped) return;
      core = value; emit();
    } catch (error) {
      if (controller.signal.aborted || own !== generation || stopped) return;
      if (failAuthorization(error)) return;
      publish({ status: 'error', message: 'Não foi possível carregar os módulos autorizados. Tente novamente.' });
    }
  }
  return { start, refresh: refreshAuxiliary, dispose() {
    generation++; stopped = true; core = undefined; complete = undefined;
    coreAbort?.abort(); auxiliaryAbort?.abort();
  } };
}
export function usePlatformDataV2() {
  const [loadState, setLoadState] = useState<PlatformLoadStateV2>({ status: 'loading' });
  const current = useRef<ReturnType<typeof createPlatformDataV2> | null>(null);
  useEffect(() => {
    const controller = createPlatformDataV2(setLoadState); current.current = controller;
    const refresh = () => { if (document.visibilityState !== 'hidden') void controller.refresh(); };
    const timer = setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    void controller.start();
    return () => {
      clearInterval(timer); controller.dispose(); current.current = null;
      window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return { loadState, reload: () => loadState.status === 'error' ? current.current?.start() : current.current?.refresh() };
}
