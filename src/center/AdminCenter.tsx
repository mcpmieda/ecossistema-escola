import type { ReactNode } from 'react';
import type { AdministrationCenterBootstrap } from './types';

type AdminCenterProps = {
  data: AdministrationCenterBootstrap;
  signingOut: boolean;
  onSignOut: () => void;
};

type IconName = 'overview' | 'systems' | 'activity' | 'shield' | 'logout';

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    overview: <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z" />,
    systems: <path d="M5 5.5h14v4H5v-4Zm0 9h14v4H5v-4Zm2-7h2m-2 9h2" />,
    activity: <path d="M4 12h3l2-5 4 10 2-5h5" />,
    shield: <path d="M12 3 5.5 5.6v5.8c0 4.2 2.7 7.9 6.5 9.6 3.8-1.7 6.5-5.4 6.5-9.6V5.6L12 3Z" />,
    logout: <path d="M10 5H6v14h4m3-4 4-3-4-3m4 3H9" />,
  };
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function moduleStatusLabel(status: 'installed' | 'disabled' | 'deprecated'): string {
  if (status === 'disabled') return 'Desabilitado';
  if (status === 'deprecated') return 'Descontinuado';
  return 'Disponível';
}

function activityResultLabel(result: 'success' | 'failure' | 'denied' | 'unknown'): string {
  if (result === 'success') return 'Sucesso';
  if (result === 'failure') return 'Falha';
  if (result === 'denied') return 'Negado';
  return 'Registrado';
}

export function AdminCenter({ data, signingOut, onSignOut }: AdminCenterProps) {
  const initial = data.identity.name.trim().charAt(0).toUpperCase() || 'A';
  const platformHealthy = data.platform.status === 'ok';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <div>
            <strong>Centro de Administração</strong>
            <span>Escola Iêda</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Navegação principal">
          <a className="nav-item active" href="#overview">
            <Icon name="overview" />
            <span>Visão geral</span>
          </a>
          <a className="nav-item" href="#systems">
            <Icon name="systems" />
            <span>Sistemas</span>
          </a>
          <a className="nav-item" href="#activity">
            <Icon name="activity" />
            <span>Atividade</span>
          </a>
        </nav>

        <div className="sidebar-validation">
          <span className="status-dot" />
          <div>
            <strong>Versão de validação</strong>
            <span>v{data.candidate.version}</span>
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-context">
            <span className="validation-badge">Em validação</span>
            <span className="topbar-school">Escola Iêda Alves de Oliveira MCPM</span>
          </div>
          <div className="account-area">
            <div className="account-avatar" aria-hidden="true">
              {initial}
            </div>
            <div className="account-copy">
              <strong>{data.identity.name}</strong>
              <span>Administrador</span>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={onSignOut}
              disabled={signingOut}
              aria-label="Sair da conta"
              title="Sair da conta"
            >
              <Icon name="logout" />
            </button>
          </div>
        </header>

        <main className="content" id="overview">
          <section className="page-heading">
            <div>
              <p className="section-kicker">Visão geral</p>
              <h1>Centro de Administração</h1>
              <p>
                Acompanhe a fundação da plataforma e os sistemas já registrados no ecossistema.
              </p>
            </div>
            <div className={`health-pill ${platformHealthy ? 'healthy' : 'degraded'}`}>
              <span className="status-dot" />
              {platformHealthy ? 'Fundação operacional' : 'Operação parcial'}
            </div>
          </section>

          <section className="summary-strip" aria-label="Resumo operacional">
            <div className="summary-item">
              <span>Sistemas registrados</span>
              <strong>{data.summary.registeredModules}</strong>
              <small>visíveis para seu perfil</small>
            </div>
            <div className="summary-item">
              <span>Configurações ativas</span>
              <strong>{data.summary.activeConfigurations}</strong>
              <small>na plataforma</small>
            </div>
            <div className="summary-item">
              <span>Atividade recente</span>
              <strong>{data.summary.recentEvents}</strong>
              <small>eventos carregados</small>
            </div>
            <div className="summary-item summary-health">
              <span>Fonte institucional</span>
              <strong>{platformHealthy ? 'Conectada' : 'Parcial'}</strong>
              <small>{data.platform.dataSource}</small>
            </div>
          </section>

          {!platformHealthy && (
            <div className="inline-warning" role="status">
              <Icon name="shield" />
              <div>
                <strong>Alguns dados não puderam ser carregados.</strong>
                <span>O restante do Centro continua disponível sem ocultar o estado real.</span>
              </div>
            </div>
          )}

          <div className="dashboard-grid">
            <section className="panel systems-panel" id="systems" aria-labelledby="systems-title">
              <div className="panel-heading">
                <div>
                  <p className="section-kicker">Ecossistema</p>
                  <h2 id="systems-title">Sistemas registrados</h2>
                </div>
                <span className="panel-count">{data.modules.length}</span>
              </div>

              {data.modules.length === 0 ? (
                <div className="empty-state">
                  <strong>Nenhum sistema disponível para este perfil.</strong>
                  <span>Novos módulos aparecerão aqui após registro e autorização.</span>
                </div>
              ) : (
                <div className="module-list">
                  {data.modules.map((module) => (
                    <article className="module-row" key={module.key}>
                      <div className="module-symbol" aria-hidden="true">
                        {module.name.trim().charAt(0).toUpperCase()}
                      </div>
                      <div className="module-main">
                        <div className="module-title-line">
                          <strong>{module.name}</strong>
                          <span className={`module-status ${module.status}`}>
                            {moduleStatusLabel(module.status)}
                          </span>
                        </div>
                        <span className="module-meta">
                          {module.route} · versão {module.version}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="panel foundation-panel" aria-labelledby="foundation-title">
              <div className="panel-heading">
                <div>
                  <p className="section-kicker">Fundação</p>
                  <h2 id="foundation-title">Estado da plataforma</h2>
                </div>
                <Icon name="shield" />
              </div>
              <div className="foundation-status">
                <span className={`foundation-indicator ${platformHealthy ? 'healthy' : 'degraded'}`}>
                  <span className="status-dot" />
                </span>
                <div>
                  <strong>
                    {platformHealthy
                      ? 'Serviços essenciais disponíveis'
                      : 'Dados parcialmente disponíveis'}
                  </strong>
                  <span>
                    Identidade, sessão e acesso a dados permanecem protegidos pela fundação existente.
                  </span>
                </div>
              </div>
              <dl className="foundation-details">
                <div>
                  <dt>Listas reconhecidas</dt>
                  <dd>{data.platform.listCount}</dd>
                </div>
                <div>
                  <dt>Autorização do Centro</dt>
                  <dd>ADMINISTRADOR</dd>
                </div>
                <div>
                  <dt>Atualizado</dt>
                  <dd>{formatTimestamp(data.platform.generatedAt)}</dd>
                </div>
              </dl>
            </section>

            <section className="panel activity-panel" id="activity" aria-labelledby="activity-title">
              <div className="panel-heading">
                <div>
                  <p className="section-kicker">Auditoria</p>
                  <h2 id="activity-title">Atividade recente</h2>
                </div>
                <span className="panel-count">{data.activity.length}</span>
              </div>

              {data.activity.length === 0 ? (
                <div className="empty-state compact">
                  <strong>Nenhum evento recente disponível.</strong>
                  <span>A trilha aparecerá aqui quando houver registros operacionais.</span>
                </div>
              ) : (
                <ol className="activity-list">
                  {data.activity.map((event, index) => (
                    <li key={`${event.timestamp}-${event.module}-${event.action}-${index}`}>
                      <span className={`activity-dot ${event.result}`} aria-hidden="true" />
                      <div className="activity-copy">
                        <strong>{event.action}</strong>
                        <span>{event.module}</span>
                      </div>
                      <div className="activity-meta">
                        <span>{activityResultLabel(event.result)}</span>
                        <time dateTime={event.timestamp}>{formatTimestamp(event.timestamp)}</time>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <p className="validation-note">
            Esta é uma candidata de validação restrita. A liberação definitiva aos demais usuários
            não foi realizada.
          </p>
        </main>
      </div>
    </div>
  );
}
