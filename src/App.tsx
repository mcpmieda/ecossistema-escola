import { useEffect, useMemo, useState } from 'react';
import {
  normalizePlatformRoute,
  type CoreModuleContract,
  type PlatformRoute,
  type PlatformSnapshotContract,
} from '../shared/platform-contract';

type Identity = { authenticated: boolean; name?: string; roles?: string[] };

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; snapshot: PlatformSnapshotContract }
  | { status: 'error'; message: string; correlationId?: string };

const routeLabels: Record<PlatformRoute, string> = {
  'visao-geral': 'Visão geral',
  publicacoes: 'Publicações',
  paginas: 'Páginas',
  sistemas: 'Sistemas',
  auditoria: 'Auditoria',
  configuracoes: 'Configurações',
};

function routeFromHash(): PlatformRoute {
  return normalizePlatformRoute(window.location.hash.replace(/^#\/?/u, ''));
}

function usePlatformRoute(): PlatformRoute {
  const [route, setRoute] = useState<PlatformRoute>(() => routeFromHash());

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHashChange);
    if (!window.location.hash) window.history.replaceState(null, '', '#/visao-geral');
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}

function LoginExperience({ loading }: { loading: boolean }) {
  return (
    <main className="login-page">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <section className="login-shell" aria-labelledby="login-title">
        <div className="login-intro">
          <div>
            <p className="brand-kicker">ESCOLA IÊDA ALVES DE OLIVEIRA MCPM</p>
            <h1 id="login-title">Centro de Administração</h1>
            <p className="login-lead">
              Um ambiente institucional para operar, acompanhar e integrar os sistemas da escola.
            </p>
          </div>
          <div className="login-principles" aria-label="Características da plataforma">
            <span>Identidade institucional</span>
            <span>Acesso por permissão</span>
            <span>Operações auditáveis</span>
          </div>
        </div>

        <div className="login-panel">
          <div className="login-panel-inner">
            <div className="school-mark" aria-hidden="true">
              IA
            </div>
            <p className="section-label">ACESSO INSTITUCIONAL</p>
            <h2>{loading ? 'Verificando sua sessão' : 'Entrar no Centro'}</h2>
            <p className="muted">
              Use sua conta institucional. A autenticação continua sendo realizada pelo Microsoft Entra ID.
            </p>
            {loading ? (
              <div className="session-check" role="status">
                <span className="spinner" aria-hidden="true" />
                Verificando acesso…
              </div>
            ) : (
              <a className="sign-in-button" href="/auth/login">
                <span className="microsoft-mark" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                Entrar com conta institucional
              </a>
            )}
            <p className="security-note">O Centro não solicita nem armazena sua senha institucional.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

function RestrictedExperience({ name }: { name?: string }) {
  return (
    <main className="restricted-page">
      <section className="restricted-card" aria-labelledby="restricted-title">
        <span className="validation-chip">VALIDAÇÃO RESTRITA</span>
        <p className="brand-kicker">CENTRO DE ADMINISTRAÇÃO</p>
        <h1 id="restricted-title">Esta candidata ainda não foi liberada para seu perfil</h1>
        <p>
          {name ? `${name}, sua conta está autenticada.` : 'Sua conta está autenticada.'} Nesta fase,
          somente administradores autorizados podem testar a nova plataforma.
        </p>
        <form method="post" action="/auth/logout">
          <button className="secondary-button" type="submit">
            Sair
          </button>
        </form>
      </section>
    </main>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function OverviewPage({ snapshot }: { snapshot: PlatformSnapshotContract }) {
  const activeConfigurations = snapshot.configurations.filter((configuration) => configuration.active).length;
  const validationModules = snapshot.coreModules.filter((module) => module.state === 'validation').length;

  return (
    <>
      <section className="validation-banner" aria-label="Estado de validação">
        <div>
          <span className="status-pulse" aria-hidden="true" />
          <strong>Candidata v0.2 em validação controlada</strong>
        </div>
        <p>
          Implantação para teste administrativo. A liberação oficial continua bloqueada até o comando
          explícito de aprovação.
        </p>
      </section>

      <section className="dashboard-grid" aria-label="Resumo operacional">
        <article className="metric-card primary-metric">
          <p>Fundação</p>
          <strong>{snapshot.foundation.status === 'ok' ? 'Operacional' : 'Atenção'}</strong>
          <span>Cloudflare, BFF, Entra, Graph e sessão existentes foram preservados.</span>
        </article>
        <article className="metric-card">
          <p>Persistência institucional</p>
          <strong>{snapshot.foundation.sharePointListCount} listas</strong>
          <span>
            {snapshot.foundation.expectedPlatformListsPresent
              ? 'As listas essenciais da plataforma foram localizadas.'
              : 'Uma ou mais listas essenciais precisam de atenção.'}
          </span>
        </article>
        <article className="metric-card">
          <p>Núcleo em validação</p>
          <strong>{validationModules} áreas</strong>
          <span>Visão geral, catálogo, auditoria e configurações já possuem leitura integrada.</span>
        </article>
        <article className="metric-card">
          <p>Configurações ativas</p>
          <strong>{activeConfigurations}</strong>
          <span>Somente metadados são exibidos nesta candidata; valores permanecem protegidos.</span>
        </article>
      </section>

      <section className="content-section" aria-labelledby="overview-modules-title">
        <div className="section-heading">
          <div>
            <p className="section-label">PLATAFORMA</p>
            <h2 id="overview-modules-title">Estrutura funcional</h2>
          </div>
          <p>Áreas entram progressivamente sem duplicar identidade, sessão ou persistência compartilhada.</p>
        </div>
        <div className="module-grid">
          {snapshot.coreModules.map((module) => (
            <ModuleCard key={module.id} module={module} />
          ))}
        </div>
      </section>
    </>
  );
}

function ModuleCard({ module }: { module: CoreModuleContract }) {
  return (
    <article className="module-card">
      <div className="module-card-top">
        <span className={`module-status ${module.state}`}>
          {module.state === 'validation' ? 'Em validação' : 'Planejado'}
        </span>
        <span className="module-capability">{module.capabilities[0]}</span>
      </div>
      <h3>{module.name}</h3>
      <p>{module.description}</p>
      <a href={`#/${module.route}`}>Abrir área</a>
    </article>
  );
}

function SystemsPage({ snapshot }: { snapshot: PlatformSnapshotContract }) {
  return (
    <section className="content-section" aria-labelledby="systems-title">
      <div className="section-heading">
        <div>
          <p className="section-label">CATÁLOGO</p>
          <h2 id="systems-title">Sistemas e módulos</h2>
        </div>
        <p>O núcleo é definido por contrato; módulos integrados são lidos do registro institucional.</p>
      </div>

      <div className="subsection">
        <h3>Módulos do núcleo</h3>
        <div className="module-grid compact-grid">
          {snapshot.coreModules.map((module) => (
            <ModuleCard key={module.id} module={module} />
          ))}
        </div>
      </div>

      <div className="subsection">
        <div className="subsection-heading">
          <h3>Registro institucional</h3>
          <span>{snapshot.registeredModules.length} registrado(s)</span>
        </div>
        {snapshot.registeredModules.length === 0 ? (
          <EmptyState
            title="Nenhum módulo independente registrado"
            description="O catálogo está funcional e pronto para receber módulos quando seus contratos de integração forem aprovados."
          />
        ) : (
          <div className="data-list">
            {snapshot.registeredModules.map((module) => (
              <article className="data-row" key={module.id}>
                <div>
                  <strong>{module.name}</strong>
                  <span>{module.key}</span>
                </div>
                <div className="row-meta">
                  <span>{module.version || 'sem versão'}</span>
                  <span className="status-tag">{module.status}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AuditPage({ snapshot }: { snapshot: PlatformSnapshotContract }) {
  return (
    <section className="content-section" aria-labelledby="audit-title">
      <div className="section-heading">
        <div>
          <p className="section-label">RASTREABILIDADE</p>
          <h2 id="audit-title">Auditoria</h2>
        </div>
        <p>Leitura restrita dos eventos administrativos disponíveis, sem expor detalhes sensíveis.</p>
      </div>
      {snapshot.recentAudit.length === 0 ? (
        <EmptyState
          title="Nenhum evento administrativo registrado"
          description="A estrutura de auditoria existe; novos eventos aparecerão aqui quando operações auditáveis forem ativadas."
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Módulo</th>
                <th>Ação</th>
                <th>Resultado</th>
                <th>Correlação</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.recentAudit.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDate(entry.occurredAt)}</td>
                  <td>{entry.module}</td>
                  <td>{entry.action}</td>
                  <td>{entry.result || '—'}</td>
                  <td className="mono">{shortCorrelation(entry.correlationId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SettingsPage({ snapshot }: { snapshot: PlatformSnapshotContract }) {
  return (
    <section className="content-section" aria-labelledby="settings-title">
      <div className="section-heading">
        <div>
          <p className="section-label">GOVERNANÇA</p>
          <h2 id="settings-title">Configurações</h2>
        </div>
        <p>Esta candidata mostra somente chave, escopo, versão e vigência. Valores não são enviados ao navegador.</p>
      </div>
      {snapshot.configurations.length === 0 ? (
        <EmptyState
          title="Nenhuma configuração cadastrada"
          description="A lista institucional está disponível e pode receber parâmetros versionados quando as regras de produto forem definidas."
        />
      ) : (
        <div className="data-list">
          {snapshot.configurations.map((configuration) => (
            <article className="data-row" key={configuration.id}>
              <div>
                <strong>{configuration.key}</strong>
                <span>{configuration.scope}</span>
              </div>
              <div className="row-meta">
                <span>{configuration.version || 'sem versão'}</span>
                <span className={`status-tag ${configuration.active ? 'positive' : ''}`}>
                  {configuration.active ? 'ativa' : 'inativa'}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="subsection">
        <div className="subsection-heading">
          <h3>Migrações registradas</h3>
          <span>{snapshot.migrations.length}</span>
        </div>
        {snapshot.migrations.length === 0 ? (
          <EmptyState
            title="Sem migrations registradas"
            description="Nenhuma migration de módulo foi necessária para esta candidata somente leitura."
          />
        ) : (
          <div className="data-list">
            {snapshot.migrations.map((migration) => (
              <article className="data-row" key={migration.id}>
                <div>
                  <strong>{migration.version || 'versão não informada'}</strong>
                  <span>{migration.module}</span>
                </div>
                <div className="row-meta">
                  <span>{formatDate(migration.appliedAt)}</span>
                  <span className="status-tag">{migration.result || '—'}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PlannedPage({ route }: { route: 'publicacoes' | 'paginas' }) {
  const copy =
    route === 'publicacoes'
      ? {
          title: 'Publicações',
          description:
            'Gestão editorial versionada será construída como próxima fatia de domínio, com revisão, programação, publicação e rollback.',
        }
      : {
          title: 'Páginas',
          description:
            'A edição controlada de páginas será incorporada depois do núcleo, sem transportar overrides ou código legado desnecessário.',
        };

  return (
    <section className="content-section planned-page" aria-labelledby="planned-title">
      <span className="module-status planned">Planejado</span>
      <p className="section-label">PRÓXIMA FASE</p>
      <h2 id="planned-title">{copy.title}</h2>
      <p>{copy.description}</p>
      <div className="planned-guardrail">
        <strong>Nenhuma escrita foi ativada nesta candidata.</strong>
        <span>O objetivo do teste atual é validar o núcleo, acesso, navegação e leitura institucional.</span>
      </div>
    </section>
  );
}

function PageContent({ route, snapshot }: { route: PlatformRoute; snapshot: PlatformSnapshotContract }) {
  switch (route) {
    case 'sistemas':
      return <SystemsPage snapshot={snapshot} />;
    case 'auditoria':
      return <AuditPage snapshot={snapshot} />;
    case 'configuracoes':
      return <SettingsPage snapshot={snapshot} />;
    case 'publicacoes':
    case 'paginas':
      return <PlannedPage route={route} />;
    default:
      return <OverviewPage snapshot={snapshot} />;
  }
}

function formatDate(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function shortCorrelation(value: string): string {
  return value ? `${value.slice(0, 8)}…` : '—';
}

function AdminShell({ identity }: { identity: Identity }) {
  const route = usePlatformRoute();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/platform/snapshot', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
            correlationId?: string;
          };
          throw Object.assign(new Error(payload.error || 'Não foi possível carregar a plataforma.'), {
            correlationId: payload.correlationId,
          });
        }
        return (await response.json()) as PlatformSnapshotContract;
      })
      .then((snapshot) => setLoadState({ status: 'ready', snapshot }))
      .catch((error: Error & { correlationId?: string }) => {
        if (error.name === 'AbortError') return;
        setLoadState({
          status: 'error',
          message: error.message || 'Não foi possível carregar a plataforma.',
          correlationId: error.correlationId,
        });
      });
    return () => controller.abort();
  }, []);

  const firstName = useMemo(() => identity.name?.trim().split(/\s+/u)[0] || 'Administrador', [identity]);

  return (
    <div className="admin-app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-symbol" aria-hidden="true">
            IA
          </div>
          <div>
            <strong>Centro de Administração</strong>
            <span>Escola Iêda Alves de Oliveira</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Navegação principal">
          {(loadState.status === 'ready' ? loadState.snapshot.coreModules : []).map((module) => (
            <a
              className={`nav-item ${route === module.route ? 'active' : ''}`}
              href={`#/${module.route}`}
              key={module.id}
              aria-current={route === module.route ? 'page' : undefined}
            >
              <span className="nav-dot" aria-hidden="true" />
              <span>{module.name}</span>
              {module.state === 'planned' && <small>Próxima fase</small>}
            </a>
          ))}
          {loadState.status !== 'ready' && <span className="nav-loading">Carregando navegação…</span>}
        </nav>

        <div className="sidebar-footer">
          <span className="validation-chip">VALIDAÇÃO</span>
          <p>Acesso restrito a administradores autorizados. Sem liberação oficial.</p>
        </div>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <p className="section-label">{routeLabels[route].toUpperCase()}</p>
            <h1>{route === 'visao-geral' ? `Olá, ${firstName}` : routeLabels[route]}</h1>
            <p className="muted">
              {route === 'visao-geral'
                ? 'Núcleo integrado do novo Centro de Administração.'
                : 'Candidata de validação do ambiente administrativo.'}
            </p>
          </div>
          <div className="account-area">
            <div className="account-copy">
              <strong>{identity.name || 'Administrador'}</strong>
              <span>Administrador</span>
            </div>
            <form method="post" action="/auth/logout">
              <button className="secondary-button compact" type="submit">
                Sair
              </button>
            </form>
          </div>
        </header>

        {loadState.status === 'loading' && (
          <section className="loading-panel" role="status">
            <span className="spinner" aria-hidden="true" />
            <div>
              <strong>Carregando dados institucionais</strong>
              <p>Consultando a fundação existente de forma protegida.</p>
            </div>
          </section>
        )}

        {loadState.status === 'error' && (
          <section className="error-panel" role="alert">
            <strong>Não foi possível carregar o núcleo administrativo.</strong>
            <p>{loadState.message}</p>
            {loadState.correlationId && (
              <span className="mono">Correlação: {loadState.correlationId}</span>
            )}
            <button className="secondary-button" type="button" onClick={() => window.location.reload()}>
              Tentar novamente
            </button>
          </section>
        )}

        {loadState.status === 'ready' && (
          <>
            <PageContent route={route} snapshot={loadState.snapshot} />
            <footer className="workspace-footer">
              <span>Centro v{loadState.snapshot.version}</span>
              <span>Dados consultados em {formatDate(loadState.snapshot.generatedAt)}</span>
              <span className="mono">{shortCorrelation(loadState.snapshot.correlationId)}</span>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

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

  if (identity === null) return <LoginExperience loading />;
  if (!identity.authenticated) return <LoginExperience loading={false} />;
  if (!identity.roles?.includes('ADMINISTRADOR')) return <RestrictedExperience name={identity.name} />;
  return <AdminShell identity={identity} />;
}
