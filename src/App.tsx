import { useEffect, useMemo, useState } from 'react';

type Identity = { authenticated: boolean; name?: string; roles?: string[] };
type PlatformHealth = { status: 'ok'; listCount: number; correlationId: string };

type ModuleCard = {
  title: string;
  description: string;
  status: 'validation' | 'planned';
};

const modules: ModuleCard[] = [
  {
    title: 'Visão geral',
    description: 'Resumo operacional, estado da fundação e atalhos administrativos.',
    status: 'validation',
  },
  {
    title: 'Publicações',
    description: 'Conteúdo institucional, programação, revisão, histórico e rollback.',
    status: 'planned',
  },
  {
    title: 'Páginas',
    description: 'Edição controlada e versionada das páginas institucionais.',
    status: 'planned',
  },
  {
    title: 'Sistemas',
    description: 'Catálogo de módulos internos e portais externos autorizados.',
    status: 'planned',
  },
  {
    title: 'Auditoria',
    description: 'Rastreabilidade de operações administrativas e eventos relevantes.',
    status: 'planned',
  },
  {
    title: 'Configurações',
    description: 'Parâmetros globais, capacidades, integrações e rollout controlado.',
    status: 'planned',
  },
];

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
              Ambiente institucional único para operação, gestão e integração dos sistemas da escola.
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
              Use sua conta institucional. A autenticação é realizada com a identidade Microsoft já
              utilizada pela escola.
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
            <p className="security-note">
              O Centro não solicita nem armazena sua senha institucional.
            </p>
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
        <p className="brand-kicker">CENTRO DE ADMINISTRAÇÃO</p>
        <h1 id="restricted-title">Validação restrita em andamento</h1>
        <p>
          {name ? `${name}, sua conta está autenticada,` : 'Sua conta está autenticada,'} mas a nova
          experiência administrativa ainda está disponível somente para validadores autorizados.
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

function AdminShell({ identity }: { identity: Identity }) {
  const [health, setHealth] = useState<PlatformHealth | null>(null);
  const [healthError, setHealthError] = useState(false);

  useEffect(() => {
    fetch('/api/sharepoint/health', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('health check failed');
        return (await response.json()) as PlatformHealth;
      })
      .then((result) => {
        setHealth(result);
        setHealthError(false);
      })
      .catch(() => setHealthError(true));
  }, []);

  const firstName = useMemo(() => identity.name?.trim().split(/\s+/)[0] || 'Administrador', [identity]);

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
          <a className="nav-item active" href="#visao-geral" aria-current="page">
            <span className="nav-dot" aria-hidden="true" />
            Visão geral
          </a>
          {modules.slice(1).map((module) => (
            <span className="nav-item disabled" key={module.title} aria-disabled="true">
              <span className="nav-dot" aria-hidden="true" />
              {module.title}
              <small>Em construção</small>
            </span>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="validation-chip">VALIDAÇÃO</span>
          <p>Acesso restrito a administradores autorizados.</p>
        </div>
      </aside>

      <main className="workspace" id="visao-geral">
        <header className="workspace-header">
          <div>
            <p className="section-label">VISÃO GERAL</p>
            <h1>Olá, {firstName}</h1>
            <p className="muted">Primeira candidata integrada do novo Centro de Administração.</p>
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

        <section className="validation-banner" aria-label="Estado de validação">
          <div>
            <span className="status-pulse" aria-hidden="true" />
            <strong>Candidata em validação controlada</strong>
          </div>
          <p>
            Esta versão está implantada no domínio oficial apenas para teste administrativo. Ainda
            não representa liberação oficial aos usuários.
          </p>
        </section>

        <section className="dashboard-grid" aria-label="Resumo operacional">
          <article className="metric-card primary-metric">
            <p>Fundação</p>
            <strong>Operacional</strong>
            <span>Cloudflare, BFF, Entra e sessão institucional preservados.</span>
          </article>
          <article className="metric-card">
            <p>Persistência</p>
            <strong>{health ? 'Disponível' : healthError ? 'Atenção' : 'Verificando…'}</strong>
            <span>
              {health
                ? `${health.listCount} listas detectadas no ambiente administrativo.`
                : healthError
                  ? 'Não foi possível confirmar o SharePoint nesta tentativa.'
                  : 'Consultando a integração existente com o SharePoint.'}
            </span>
          </article>
          <article className="metric-card">
            <p>Identidade</p>
            <strong>Protegida</strong>
            <span>Sessão BFF e autorização administrativa ativas.</span>
          </article>
        </section>

        <section className="module-section" aria-labelledby="module-title">
          <div className="section-heading">
            <div>
              <p className="section-label">ESTRUTURA FUNCIONAL</p>
              <h2 id="module-title">Núcleo inicial do Centro</h2>
            </div>
            <p>
              Os módulos entram progressivamente e permanecem independentes por domínio, sem duplicar
              autenticação, navegação ou auditoria.
            </p>
          </div>

          <div className="module-grid">
            {modules.map((module) => (
              <article className="module-card" key={module.title}>
                <div className="module-card-top">
                  <span className={`module-status ${module.status}`}>
                    {module.status === 'validation' ? 'Em validação' : 'Planejado'}
                  </span>
                  <span className="module-arrow" aria-hidden="true">
                    ↗
                  </span>
                </div>
                <h3>{module.title}</h3>
                <p>{module.description}</p>
              </article>
            ))}
          </div>
        </section>
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
