import { StrictMode, useMemo, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { StudentAuthenticationV1 } from '../features/student-portal/auth/student-auth-v1';
import type { RiskMountV1 } from '../features/student-portal/auth/turnstile-widget-v1';
import {
  StudentEntryLayoutV1,
  StudentSplashV1,
} from '../features/student-portal/auth/student-entry-layout-v1';
import { createPortalSelfClientV1 } from '../features/student-portal/shared/self-client-v1';
import { PORTAL_ORIGIN_V1 } from '../../shared/student-portal-contracts/core-v1';
import '../features/student-portal/shared/styles.css';

/*
 * Login preview only. The real auth screen and flow run against an invented in-browser server
 * (no network, no real account, no Turnstile), so each step can be seen and changed:
 * QR → PIN (first access) → create password, QR → password, security check, and failures.
 */
type ScenarioV1 = 'first' | 'returning' | 'risk' | 'rate-limited' | 'unavailable';
const SCENARIOS_V1: readonly [ScenarioV1, string][] = [
  ['first', 'Primeiro acesso (PIN → criar senha)'],
  ['returning', 'Já tem senha'],
  ['risk', 'Verificação de segurança antes da senha'],
  ['rate-limited', 'Muitas tentativas (aguardar)'],
  ['unavailable', 'Serviço fora do ar'],
];
const PREVIEW_PIN_V1 = '2012';
const PREVIEW_PASSWORD_V1 = '123456';
const PREVIEW_QR_V1 = `${PORTAL_ORIGIN_V1}/access#v1.${'A'.repeat(32)}.1.${'B'.repeat(43)}`;
const requestId = '11111111-1111-4111-8111-111111111111';

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify({ contractVersion: 1, requestId, ...body }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
const failure = (state: string, retryAfterSeconds?: number) =>
  reply(
    { unauthenticated: 401, 'rate-limited': 429, unavailable: 503 }[state] ?? 400,
    { state, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) },
  );
const session = () =>
  reply(200, {
    state: 'authenticated',
    expiresAt: new Date(Date.now() + 8 * 3600_000).toISOString(),
    persistent: true,
  });

/** Invented server: the same responses the Worker sends, decided by the chosen scenario. */
function previewFetchV1(scenario: ScenarioV1): typeof fetch {
  return async (input, init) => {
    await new Promise((resolve) => setTimeout(resolve, 650));
    const path = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    if (scenario === 'unavailable') return failure('unavailable');
    if (scenario === 'rate-limited') return failure('rate-limited', 30);
    if (path === '/api/student/auth/challenge') {
      if (scenario === 'risk' && !body.riskToken) return reply(200, { state: 'credential-required', next: 'risk' });
      if (scenario === 'first') {
        if (body.pin === undefined) return reply(200, { state: 'credential-required', next: 'pin' });
        if (body.pin !== PREVIEW_PIN_V1) return failure('unauthenticated');
        return reply(200, {
          state: 'password-creation',
          challenge: 'C'.repeat(43),
          expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        });
      }
      return reply(200, { state: 'credential-required', next: 'password' });
    }
    if (path === '/api/student/auth/login')
      return body.password === PREVIEW_PASSWORD_V1 ? session() : failure('unauthenticated');
    if (path === '/api/student/auth/activate') return session();
    return failure('unauthenticated');
  };
}

/** Stands in for Cloudflare Turnstile: one button that yields a token. */
const previewRiskMountV1: RiskMountV1 = (container, _sitekey, callbacks) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Simular verificação (Turnstile)';
  button.style.cssText =
    'padding:10px 14px;border:1px dashed #64748b;border-radius:10px;background:#f8fafc;cursor:pointer;font:inherit';
  button.onclick = () => {
    button.textContent = '✓ Verificado';
    button.disabled = true;
    callbacks.token('preview-risk-token');
  };
  container.append(button);
  return () => button.remove();
};

const panelStyle: CSSProperties = {
  position: 'fixed',
  bottom: 8,
  left: 8,
  zIndex: 200,
  maxWidth: 'calc(100vw - 16px)',
  padding: '8px 12px',
  borderRadius: 14,
  background: 'rgb(15 23 42 / 0.92)',
  color: 'white',
  font: '12px/1.4 system-ui, sans-serif',
  boxShadow: '0 10px 30px rgb(0 0 0 / 0.3)',
};
const rowStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '4px 10px', margin: '6px 0' };

function LoginPreviewV1() {
  const [scenario, setScenario] = useState<ScenarioV1>('first');
  const [run, setRun] = useState(0);
  const [qr, setQr] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const client = useMemo(
    () => createPortalSelfClientV1({ respectRetryAfter: true, fetch: previewFetchV1(scenario) }),
    // A new client per run also clears the transport's rate-limit cooldown.
    [scenario, run],
  );
  const restart = (withQr: boolean) => {
    setAuthenticated(false);
    setQr(withQr ? PREVIEW_QR_V1 : null);
    setRun((value) => value + 1);
  };
  return (
    <>
      <details open style={panelStyle}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Simular login</summary>
        <div style={rowStyle}>
          <span style={{ opacity: 0.7 }}>Situação:</span>
          <select
            value={scenario}
            onChange={(event) => {
              setScenario(event.target.value as ScenarioV1);
              restart(false);
            }}
          >
            {SCENARIOS_V1.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div style={rowStyle}>
          <button type="button" onClick={() => restart(true)}>
            Ler QR do cartão (simulado)
          </button>
          <button type="button" onClick={() => restart(false)}>
            Recomeçar
          </button>
        </div>
        <div style={{ opacity: 0.75 }}>
          PIN (ano de nascimento): {PREVIEW_PIN_V1} · Senha: {PREVIEW_PASSWORD_V1}
        </div>
      </details>
      {authenticated ? (
        // What the portal shows while the marks load right after a sign-in.
        <StudentSplashV1 entered />
      ) : (
        <StudentEntryLayoutV1>
          <StudentAuthenticationV1
            key={run}
            client={client}
            initialQr={qr}
            onQrDiscarded={() => setQr(null)}
            onAuthenticated={() => setAuthenticated(true)}
            sitekey="preview"
            riskMount={previewRiskMountV1}
          />
        </StudentEntryLayoutV1>
      )}
    </>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Preview root missing');
createRoot(root).render(
  <StrictMode>
    <LoginPreviewV1 />
  </StrictMode>,
);
