type LoginExperienceProps = {
  checking?: boolean;
};

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export function LoginExperience({ checking = false }: LoginExperienceProps) {
  return (
    <main className="login-stage">
      <div className="login-ambient login-ambient-one" aria-hidden="true" />
      <div className="login-ambient login-ambient-two" aria-hidden="true" />

      <header className="login-brand">
        <BrandMark />
        <div>
          <strong>Escola Iêda Alves de Oliveira MCPM</strong>
          <span>Ambiente institucional</span>
        </div>
      </header>

      <section className="login-layout" aria-labelledby="login-title">
        <div className="login-intro">
          <p className="section-kicker">Centro de Administração</p>
          <h1 id="login-title">Gestão escolar em um único ambiente.</h1>
          <p>
            Acesso institucional aos sistemas, rotinas e informações administrativas da escola.
          </p>
          <div className="login-trust" aria-label="Características do acesso">
            <span>Conta institucional</span>
            <span>Sessão protegida</span>
            <span>Acesso por permissão</span>
          </div>
        </div>

        <div className="login-panel">
          <div className="login-panel-heading">
            <span className="login-panel-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="img">
                <path d="M12 3 5.5 5.6v5.8c0 4.2 2.7 7.9 6.5 9.6 3.8-1.7 6.5-5.4 6.5-9.6V5.6L12 3Zm0 2.2 4.5 1.8v4.4c0 3.1-1.8 5.9-4.5 7.4-2.7-1.5-4.5-4.3-4.5-7.4V7L12 5.2Z" />
              </svg>
            </span>
            <div>
              <p>Acesso seguro</p>
              <h2>Entre com sua conta da escola</h2>
            </div>
          </div>

          <p className="login-panel-copy">
            A autenticação é feita pelo ambiente Microsoft institucional. Suas permissões são
            aplicadas automaticamente após a entrada.
          </p>

          {checking ? (
            <div className="login-checking" role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              Verificando sua sessão…
            </div>
          ) : (
            <a className="login-primary" href="/auth/login">
              <span>Entrar com conta institucional</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h12m-4.5-4.5L17 12l-4.5 4.5" />
              </svg>
            </a>
          )}

          <div className="login-divider" />
          <p className="login-help">
            O Centro está em fase de validação e disponível somente para perfis autorizados.
          </p>
        </div>
      </section>

      <footer className="login-footer">
        <span>Centro de Administração</span>
        <span aria-hidden="true">·</span>
        <span>Escola Iêda Alves de Oliveira MCPM</span>
      </footer>
    </main>
  );
}
