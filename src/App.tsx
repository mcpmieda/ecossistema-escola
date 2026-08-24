import { useCallback, useEffect, useState } from 'react';
import { AdminCenter } from './center/AdminCenter';
import { LoginExperience } from './center/LoginExperience';
import type { AdministrationCenterBootstrap, ApiFailure, Identity } from './center/types';

type AppState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'ready'; data: AdministrationCenterBootstrap }
  | { kind: 'forbidden'; identity: Identity | null }
  | { kind: 'error'; correlationId?: string };

async function responseFailure(response: Response): Promise<ApiFailure> {
  try {
    return (await response.json()) as ApiFailure;
  } catch {
    return {};
  }
}

export function App() {
  const [state, setState] = useState<AppState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch('/api/admin/bootstrap', {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
        });

        if (response.ok) {
          setState({ kind: 'ready', data: (await response.json()) as AdministrationCenterBootstrap });
          return;
        }
        if (response.status === 401) {
          setState({ kind: 'signed-out' });
          return;
        }
        if (response.status === 403) {
          const identityResponse = await fetch('/api/me', {
            credentials: 'same-origin',
            cache: 'no-store',
            signal: controller.signal,
          });
          const identity = identityResponse.ok ? ((await identityResponse.json()) as Identity) : null;
          setState({ kind: 'forbidden', identity });
          return;
        }
        const failure = await responseFailure(response);
        setState({ kind: 'error', correlationId: failure.correlationId });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ kind: 'error' });
      }
    }

    void load();
    return () => controller.abort();
  }, [reloadKey]);

  const signOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const response = await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Logout failed');
      window.location.replace('/');
    } catch {
      setSigningOut(false);
      setState({ kind: 'error' });
    }
  }, [signingOut]);

  if (state.kind === 'loading') return <LoginExperience checking />;
  if (state.kind === 'signed-out') return <LoginExperience />;

  if (state.kind === 'forbidden') {
    return (
      <main className="message-stage">
        <section className="message-panel" aria-labelledby="access-title">
          <span className="message-symbol" aria-hidden="true">
            !
          </span>
          <p className="section-kicker">Acesso restrito</p>
          <h1 id="access-title">Centro em fase de validação</h1>
          <p>
            {state.identity?.name ? `${state.identity.name}, sua` : 'Sua'} conta está autenticada,
            mas este ambiente está liberado somente para os validadores autorizados nesta etapa.
          </p>
          <div className="message-actions">
            <button className="secondary-action" type="button" onClick={() => void signOut()}>
              {signingOut ? 'Saindo…' : 'Sair da conta'}
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (state.kind === 'error') {
    return (
      <main className="message-stage">
        <section className="message-panel" aria-labelledby="error-title">
          <span className="message-symbol error" aria-hidden="true">
            ×
          </span>
          <p className="section-kicker">Indisponibilidade temporária</p>
          <h1 id="error-title">Não foi possível carregar o Centro.</h1>
          <p>O acesso permaneceu protegido. Tente carregar novamente.</p>
          {state.correlationId && (
            <p className="correlation">Referência técnica: {state.correlationId}</p>
          )}
          <div className="message-actions">
            <button
              className="primary-action"
              type="button"
              onClick={() => {
                setState({ kind: 'loading' });
                setReloadKey((value) => value + 1);
              }}
            >
              Tentar novamente
            </button>
          </div>
        </section>
      </main>
    );
  }

  return <AdminCenter data={state.data} signingOut={signingOut} onSignOut={() => void signOut()} />;
}
