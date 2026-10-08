import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../App';
import '../styles.css';
import { PLATFORM_CAPABILITIES } from '../../shared/platform-contract';
import { previewFetch } from '../student-portal-admin-preview/preview-fetch-v1';

/*
 * Local preview of the whole Centro de Administração: the real App over an offline, synthetic
 * API. Nothing here reaches a server. An endpoint without synthetic data answers 503, so its
 * page shows the same unavailable state it would show in production.
 */
const nativeFetch = window.fetch.bind(window);
const expiresAt = new Date(Date.now() + 8 * 3_600_000).toISOString();
const identity = {
  authenticated: true,
  identityKey: 'preview-local',
  name: 'Preview Local',
  email: 'preview@example.invalid',
  expiresAt,
  capabilities: [...PLATFORM_CAPABILITIES],
};
const unanswered = new Set<string>();
// The Portal client refuses an administrative answer that a cache could keep.
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(
    typeof input === 'string' || input instanceof URL ? String(input) : input.url,
    window.location.origin,
  );
  const path = url.pathname;
  // Vite modules, styles and images are real local files.
  if (url.origin !== window.location.origin || !path.startsWith('/api/')) {
    return nativeFetch(input, init);
  }
  if (path === '/api/me') return json(identity);
  // The platform summary and the Banco are answered by the local development backend.
  if (path === '/api/platform/bootstrap' || path === '/api/platform/snapshot-v2')
    return nativeFetch(input, init);
  if (path.startsWith('/api/student-portal/') || path.startsWith('/api/student-photos/'))
    return previewFetch(path + url.search, init ?? {});
  if (path.startsWith('/api/gradebook/')) {
    // The Painel lists its own synthetic classes; every other Banco read goes to the local
    // development backend, which runs the real handlers over an in-memory database.
    if (
      window.location.hash.startsWith('#/painel-do-aluno') &&
      path === '/api/gradebook/operational-workspace' &&
      typeof init?.body === 'string'
    )
      return previewFetch(path, init);
    return nativeFetch(input, init);
  }
  if (!unanswered.has(path)) {
    unanswered.add(path);
    console.info('[preview] sem dados sintéticos para', path);
  }
  return json({ state: 'unavailable' }, 503);
}) as typeof window.fetch;

/** The live channel has no server here; a socket that never opens keeps the page on its reads. */
class SilentSocket extends EventTarget {
  readyState = 0;
  constructor(readonly url: string | URL) {
    super();
  }
  send() {}
  close() {
    this.readyState = 3;
  }
}
window.WebSocket = SilentSocket as unknown as typeof WebSocket;

const root = document.getElementById('root');
if (!root) throw new Error('Preview root missing');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
