import { useEffect, useState } from 'react';

type Identity = { authenticated: boolean; name?: string; roles?: string[] };

export function App() {
  const [identity, setIdentity] = useState<Identity | null>(null);

  useEffect(() => {
    fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) =>
        response.ok ? ((await response.json()) as Identity) : { authenticated: false },
      )
      .then(setIdentity)
      .catch(() => setIdentity({ authenticated: false }));
  }, []);

  return (
    <main>
      <section className="status-card" aria-labelledby="title">
        <p className="eyebrow">ESCOLA IÊDA ALVES DE OLIVEIRA MCPM</p>
        <h1 id="title">Base do Ecossistema Escolar</h1>
        <p className="summary">Fundação técnica institucional em operação.</p>
        <dl>
          <div>
            <dt>Plataforma</dt>
            <dd>Disponível</dd>
          </div>
          <div>
            <dt>Identidade</dt>
            <dd>
              {identity === null
                ? 'Verificando…'
                : identity.authenticated
                  ? identity.name
                  : 'Não autenticado'}
            </dd>
          </div>
          {identity?.authenticated && (
            <div>
              <dt>Perfis</dt>
              <dd>{identity.roles?.join(', ') || 'Sem perfil reconhecido'}</dd>
            </div>
          )}
        </dl>
        {identity && !identity.authenticated && (
          <a className="primary" href="/auth/login">
            Entrar com conta institucional
          </a>
        )}
        {identity?.authenticated && (
          <form method="post" action="/auth/logout">
            <button className="secondary" type="submit">
              Sair
            </button>
          </form>
        )}
        <p className="note">
          Nenhum módulo acadêmico ou administrativo foi ativado nesta fundação.
        </p>
      </section>
    </main>
  );
}
