import {
  BrowserCacheLocation,
  createNestablePublicClientApplication,
  type EventMessage,
  type IPublicClientApplication,
} from '@azure/msal-browser';
import { createBancoNotasNaaConfig, type BancoNotasNaaConfig } from './config';
import {
  runBancoNotasRuntimeHomologation,
  type RuntimeHomologationResult,
} from './runtime-homologation';

type SafeError = {
  name: string | null;
  errorCode: string | null;
  subError: string | null;
  correlationIdPresent: boolean;
  message: string;
};

type TokenProof = {
  claims: Record<string, string | number | boolean | null>;
  checks: Record<string, boolean>;
  allChecksPassed: boolean;
};

const diagnostic: {
  schemaVersion: 1;
  status: string;
  rawAccessTokenIncluded: false;
  upnIncluded: false;
  emailIncluded: false;
  oidIncluded: false;
  office: Record<string, string | boolean | null>;
  initialization: Record<string, string | number | boolean | null>;
  events: Array<Record<string, string | number | boolean | null | SafeError>>;
  tokenProof: TokenProof | null;
  runtimeProof: RuntimeHomologationResult | null;
  error: SafeError | null;
} = {
  schemaVersion: 1,
  status: 'INITIALIZING',
  rawAccessTokenIncluded: false,
  upnIncluded: false,
  emailIncluded: false,
  oidIncluded: false,
  office: {},
  initialization: {},
  events: [],
  tokenProof: null,
  runtimeProof: null,
  error: null,
};

const officeState = document.querySelector<HTMLElement>('#office-state');
const naaState = document.querySelector<HTMLElement>('#naa-state');
const accountState = document.querySelector<HTMLElement>('#account-state');
const status = document.querySelector<HTMLElement>('#status');
const connect = document.querySelector<HTMLButtonElement>('#connect');
const diagnosticElement = document.querySelector<HTMLElement>('#diagnostic');

let pca: IPublicClientApplication | null = null;
let config: BancoNotasNaaConfig | null = null;
let loginHint: string | undefined;

function render(): void {
  if (diagnosticElement) diagnosticElement.textContent = JSON.stringify(diagnostic, null, 2);
}

function setStatus(value: string): void {
  if (status) status.textContent = value;
}

function safeError(error: unknown): SafeError {
  const candidate = error as {
    name?: unknown;
    errorCode?: unknown;
    subError?: unknown;
    correlationId?: unknown;
    message?: unknown;
  };
  const message = String(candidate?.message ?? 'Authentication failed')
    .replace(/[\w.+-]+@[\w.-]+/gu, '<redacted-email>')
    .replace(
      /([?&#](?:login_hint|code|client_info|id_token|access_token)=)[^&#\s]+/giu,
      '$1<redacted>',
    )
    .slice(0, 500);
  return {
    name: typeof candidate?.name === 'string' ? candidate.name : null,
    errorCode: typeof candidate?.errorCode === 'string' ? candidate.errorCode : null,
    subError: typeof candidate?.subError === 'string' ? candidate.subError : null,
    correlationIdPresent: Boolean(candidate?.correlationId),
    message,
  };
}

function recordEvent(message: EventMessage): void {
  diagnostic.events.push({
    atUtc: new Date().toISOString(),
    eventType: message.eventType,
    interactionType: message.interactionType ?? null,
    correlationIdPresent: Boolean(message.correlationId),
    error: message.error ? safeError(message.error) : null,
  });
  if (diagnostic.events.length > 50) diagnostic.events.shift();
  render();
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('NAA_TOKEN_FORMAT_INVALID');
  const normalized = payload.replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

function isGuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  );
}

function tokenProof(claims: Record<string, unknown>, expected: BancoNotasNaaConfig): TokenProof {
  const scopes = typeof claims.scp === 'string' ? claims.scp.split(/\s+/u) : [];
  const now = Math.floor(Date.now() / 1000);
  const checks = {
    tokenVersionV2: claims.ver === '2.0',
    audienceIsClientIdGuid: claims.aud === expected.clientId,
    delegatedScopePresent: scopes.includes(expected.delegatedScope),
    tenantMatches: claims.tid === expected.tenantId,
    issuerMatches: claims.iss === expected.expectedIssuer,
    authorizedPartyMatches: claims.azp === expected.clientId,
    oidPresent: isGuid(claims.oid),
    tokenNotExpired: typeof claims.exp === 'number' && claims.exp > now,
    tokenActive: typeof claims.nbf !== 'number' || claims.nbf <= now,
    publicClientIfClaimPresent: claims.azpacr == null || String(claims.azpacr) === '0',
  };
  return {
    claims: {
      ver: typeof claims.ver === 'string' ? claims.ver : null,
      aud: typeof claims.aud === 'string' ? claims.aud : null,
      scp: typeof claims.scp === 'string' ? claims.scp : null,
      tid: typeof claims.tid === 'string' ? claims.tid : null,
      iss: typeof claims.iss === 'string' ? claims.iss : null,
      azp: typeof claims.azp === 'string' ? claims.azp : null,
      azpacr: claims.azpacr == null ? null : String(claims.azpacr),
      oidPresent: isGuid(claims.oid),
      iat: typeof claims.iat === 'number' ? claims.iat : null,
      nbf: typeof claims.nbf === 'number' ? claims.nbf : null,
      exp: typeof claims.exp === 'number' ? claims.exp : null,
    },
    checks,
    allChecksPassed: Object.values(checks).every(Boolean),
  };
}

async function acquireToken(): Promise<void> {
  if (!pca || !config || !connect) return;
  connect.disabled = true;
  diagnostic.error = null;
  diagnostic.status = 'NAA_TOKEN_REQUEST_STARTED';
  setStatus('Conectando com sua conta institucional…');
  render();
  try {
    const request = { scopes: [config.requestedScope], ...(loginHint ? { loginHint } : {}) };
    let response;
    try {
      response = await pca.ssoSilent(request);
    } catch {
      response = await pca.acquireTokenPopup(request);
    }
    diagnostic.tokenProof = tokenProof(decodeJwtPayload(response.accessToken), config);
    diagnostic.status = diagnostic.tokenProof.allChecksPassed
      ? 'NAA_TOKEN_PROOF_PASSED'
      : 'NAA_TOKEN_RECEIVED_CLAIMS_FAILED';
    if (
      diagnostic.tokenProof.allChecksPassed &&
      import.meta.env.VITE_BANCO_NOTAS_RUNTIME_HOMOLOGATION === '1'
    ) {
      diagnostic.status = 'RUNTIME_HOMOLOGATION_STARTED';
      setStatus('Validando autorização e atomicidade no runtime de homologação…');
      render();
      diagnostic.runtimeProof = await runBancoNotasRuntimeHomologation({
        accessToken: response.accessToken,
        origin: window.location.origin,
      });
      diagnostic.status = diagnostic.runtimeProof.status;
      setStatus(
        diagnostic.runtimeProof.status === 'BANCO_NOTAS_RUNTIME_HOMOLOGATION_PASSED'
          ? 'Bearer, ownership e atomicidade D1 comprovados.'
          : 'A homologação do runtime não passou.',
      );
    } else {
      setStatus(
        diagnostic.tokenProof.allChecksPassed
          ? 'Conta conectada com segurança.'
          : 'Token rejeitado pelo contrato do Banco.',
      );
    }
  } catch (error) {
    diagnostic.error = safeError(error);
    diagnostic.status = 'NAA_TOKEN_REQUEST_FAILED';
    setStatus('Não foi possível conectar. Tente novamente.');
  } finally {
    connect.disabled = false;
    render();
  }
}

void Office.onReady(async (info) => {
  diagnostic.office = {
    onReady: true,
    host: info.host ? String(info.host) : null,
    platform: info.platform ? String(info.platform) : null,
    nestedAppAuthSupported: Office.context.requirements.isSetSupported('NestedAppAuth', '1.1'),
    authContextAvailable: typeof Office.auth?.getAuthContext === 'function',
    loginHintPresent: false,
  };
  if (officeState) officeState.textContent = `${String(info.host)} / ${String(info.platform)}`;
  if (naaState)
    naaState.textContent = diagnostic.office.nestedAppAuthSupported ? 'Suportado' : 'Indisponível';

  if (!diagnostic.office.nestedAppAuthSupported) {
    diagnostic.status = 'NAA_REQUIREMENT_NOT_SUPPORTED';
    setStatus('Este contexto do Office não oferece NAA 1.1.');
    render();
    return;
  }

  try {
    const authContext = await Office.auth.getAuthContext();
    loginHint = authContext?.userPrincipalName || undefined;
    diagnostic.office.loginHintPresent = Boolean(loginHint);
    if (accountState)
      accountState.textContent = loginHint ? 'Institucional detectada' : 'Seleção necessária';

    config = createBancoNotasNaaConfig({
      clientId: import.meta.env.VITE_BANCO_NOTAS_ADDIN_CLIENT_ID,
      tenantId: import.meta.env.VITE_TENANT_ID,
      origin: window.location.origin,
    });
    pca = await createNestablePublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: config.authority,
        redirectUri: config.redirectUri,
        postLogoutRedirectUri: config.redirectUri,
      },
      cache: { cacheLocation: BrowserCacheLocation.MemoryStorage },
    });
    pca.addEventCallback(recordEvent);
    diagnostic.initialization = {
      msalInitialized: true,
      redirectUriIsDedicated: config.redirectUri.endsWith('/auth.html'),
      cachedAccountCount: pca.getAllAccounts().length,
    };
    diagnostic.status = 'READY';
    setStatus('Pronto para conectar.');
    if (connect) connect.disabled = false;
  } catch (error) {
    diagnostic.error = safeError(error);
    diagnostic.status = 'NAA_INITIALIZATION_FAILED';
    setStatus('Configuração NAA indisponível.');
  }
  render();
});

connect?.addEventListener('click', () => void acquireToken());
