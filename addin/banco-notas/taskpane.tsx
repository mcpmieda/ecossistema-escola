import {
  BrowserCacheLocation,
  createNestablePublicClientApplication,
  type IPublicClientApplication,
} from '@azure/msal-browser';
import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createBancoNotasNaaConfig, type BancoNotasNaaConfig } from './config';
import { runBancoNotasRuntimeHomologation } from './runtime-homologation';
import { TaskpaneView, type TaskpaneFailureKind, type TaskpaneScreen } from './taskpane-view';
import {
  AddinContextApiError,
  AddinWorkbookError,
  detectWorkbookChanges,
  fetchAddinContext,
  inspectActiveWorkbook,
  buildSyncPreflight,
  preflightSync,
  commitSync,
  querySyncOutcome,
} from './workbook';
import type { AddinContextQuery } from '../../shared/banco-notas-addin-context';
import type { SyncReasonCode } from '../../shared/banco-notas-sync';
import './style.css';

const diagnostic = {
  schemaVersion: 2,
  rawAccessTokenIncluded: false,
  claimsIncluded: false,
  tenantIdIncluded: false,
  oidIncluded: false,
  tokenChecksPassed: false,
};

type TokenChecks = {
  allPassed: boolean;
};

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

function validateTokenContract(token: string, expected: BancoNotasNaaConfig): TokenChecks {
  const claims = decodeJwtPayload(token);
  const scopes = typeof claims.scp === 'string' ? claims.scp.split(/\s+/u) : [];
  const now = Math.floor(Date.now() / 1000);
  const checks = [
    claims.ver === '2.0',
    claims.aud === expected.clientId,
    scopes.includes(expected.delegatedScope),
    claims.tid === expected.tenantId,
    claims.iss === expected.expectedIssuer,
    claims.azp === expected.clientId,
    isGuid(claims.oid),
    typeof claims.exp === 'number' && claims.exp > now,
    typeof claims.nbf !== 'number' || claims.nbf <= now,
    claims.azpacr == null || String(claims.azpacr) === '0',
  ];
  return { allPassed: checks.every(Boolean) };
}

function failure(error: unknown): { kind: TaskpaneFailureKind; message: string } {
  if (error instanceof AddinWorkbookError) {
    const messages: Record<string, string> = {
      workbook_metadata_missing: 'A planilha não contém a metadata interna do Banco de Notas.',
      workbook_metadata_invalid: 'A metadata interna da planilha é inválida ou incompleta.',
      workbook_sheet_not_mapped: 'A guia ativa não possui mapping conhecido neste modelo.',
      workbook_formula_change:
        'Uma célula mapeada contém fórmula alterada. Fórmulas não podem ser sincronizadas como lançamento manual.',
    };
    return { kind: 'workbook-invalid', message: messages[error.code] ?? 'Workbook inválido.' };
  }
  if (error instanceof AddinContextApiError) {
    if (error.status === 403) {
      return {
        kind: 'ownership-denied',
        message: 'Sua identidade institucional não possui ownership deste modelo.',
      };
    }
    if (error.status === 404) {
      return {
        kind: 'model-missing',
        message: 'Este modelo ou sua versão não foi reconhecido pelo Banco de Notas.',
      };
    }
    if (error.status === 0) {
      return {
        kind: 'offline',
        message: 'Não foi possível alcançar o Banco. Confira a conexão e tente novamente.',
      };
    }
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { kind: 'offline', message: 'O Office está sem conexão de rede.' };
  }
  return {
    kind: 'error',
    message: 'A análise não pôde ser concluída. Nenhuma alteração foi enviada ou persistida.',
  };
}

function syncFailureReason(error: unknown): SyncReasonCode {
  if (!(error instanceof AddinContextApiError)) return 'CONFLICT';
  if (error.status === 0) return 'NETWORK_UNKNOWN';
  if (error.status === 403) return 'OWNERSHIP_DENIED';
  if (error.status === 413) return 'PAYLOAD_TOO_LARGE';
  if (error.status === 422) return 'INVALID_CHANGE';
  return 'CONFLICT';
}

function TaskpaneApp() {
  const [screen, setScreen] = useState<TaskpaneScreen>({
    phase: 'loading',
    message: 'Inicializando o Office com segurança…',
  });
  const pca = useRef<IPublicClientApplication | null>(null);
  const config = useRef<BancoNotasNaaConfig | null>(null);
  const loginHint = useRef<string | undefined>(undefined);
  const accessToken = useRef<string | null>(null);
  const workbookQuery = useRef<AddinContextQuery | null>(null);

  useEffect(() => {
    let active = true;
    void Office.onReady(async (info) => {
      const naaSupported = Office.context.requirements.isSetSupported('NestedAppAuth', '1.1');
      if (!naaSupported) {
        if (active) {
          setScreen({
            phase: 'auth',
            officeLabel: `${String(info.host)} / ${String(info.platform)}`,
            accountDetected: false,
            naaSupported: false,
            message: 'Este contexto do Office não oferece a autenticação NAA 1.1.',
          });
        }
        return;
      }
      try {
        const authContext = await Office.auth.getAuthContext();
        loginHint.current = authContext?.userPrincipalName || undefined;
        config.current = createBancoNotasNaaConfig({
          clientId: import.meta.env.VITE_BANCO_NOTAS_ADDIN_CLIENT_ID,
          tenantId: import.meta.env.VITE_TENANT_ID,
          origin: window.location.origin,
        });
        pca.current = await createNestablePublicClientApplication({
          auth: {
            clientId: config.current.clientId,
            authority: config.current.authority,
            redirectUri: config.current.redirectUri,
            postLogoutRedirectUri: config.current.redirectUri,
          },
          cache: { cacheLocation: BrowserCacheLocation.MemoryStorage },
        });
        if (active) {
          setScreen({
            phase: 'auth',
            officeLabel: `${String(info.host)} / ${String(info.platform)}`,
            accountDetected: Boolean(loginHint.current),
            naaSupported: true,
            message: 'Conecte sua conta institucional para reconhecer este modelo.',
          });
        }
      } catch {
        if (active) {
          setScreen({
            phase: 'failure',
            kind: 'auth',
            message: 'A configuração institucional de autenticação não está disponível.',
          });
        }
      }
    });
    return () => {
      active = false;
      accessToken.current = null;
    };
  }, []);

  const analyze = useCallback(async (token: string) => {
    setScreen({ phase: 'loading', message: 'Validando contexto e analisando a planilha…' });
    try {
      const inspection = await inspectActiveWorkbook();
      const contextResult = await fetchAddinContext({
        accessToken: token,
        query: inspection.query,
        origin: window.location.origin,
      });
      workbookQuery.current = inspection.query;
      const changes = await detectWorkbookChanges(contextResult);
      setScreen({
        phase: 'authenticated',
        context: contextResult,
        changes,
        analyzedAt: new Intl.DateTimeFormat('pt-BR', {
          dateStyle: 'short',
          timeStyle: 'short',
        }).format(new Date()),
      });
    } catch (error) {
      setScreen({ phase: 'failure', ...failure(error) });
    }
  }, []);

  const connect = useCallback(async () => {
    if (!pca.current || !config.current) {
      setScreen({
        phase: 'failure',
        kind: 'auth',
        message: 'A autenticação ainda não foi inicializada pelo Office.',
      });
      return;
    }
    setScreen({ phase: 'loading', message: 'Autenticando sua conta institucional…' });
    try {
      const request = {
        scopes: [config.current.requestedScope],
        ...(loginHint.current ? { loginHint: loginHint.current } : {}),
      };
      let response;
      try {
        response = await pca.current.ssoSilent(request);
      } catch {
        response = await pca.current.acquireTokenPopup(request);
      }
      const proof = validateTokenContract(response.accessToken, config.current);
      diagnostic.tokenChecksPassed = proof.allPassed;
      if (!proof.allPassed) throw new Error('NAA_TOKEN_RECEIVED_CLAIMS_FAILED');
      accessToken.current = response.accessToken;
      if (import.meta.env.VITE_BANCO_NOTAS_RUNTIME_HOMOLOGATION === '1') {
        await runBancoNotasRuntimeHomologation({
          accessToken: response.accessToken,
          origin: window.location.origin,
        });
      }
      await analyze(response.accessToken);
    } catch (error) {
      accessToken.current = null;
      const safe = failure(error);
      setScreen({
        phase: 'failure',
        kind: safe.kind === 'error' ? 'auth' : safe.kind,
        message:
          safe.kind === 'error'
            ? 'Não foi possível autenticar sua conta institucional. Tente novamente.'
            : safe.message,
      });
    }
  }, [analyze]);

  const analyzeAgain = useCallback(() => {
    if (!accessToken.current) {
      void connect();
      return;
    }
    void analyze(accessToken.current);
  }, [analyze, connect]);

  const syncNow = useCallback(async () => {
    const token = accessToken.current;
    const query = workbookQuery.current;
    if (!token || !query || screen.phase !== 'authenticated') return;
    const request = buildSyncPreflight(query, screen.changes);
    setScreen({ ...screen, syncing: true, syncResult: undefined });
    try {
      const preflight = await preflightSync({
        accessToken: token,
        origin: window.location.origin,
        request,
      });
      if (preflight.status !== 'ready' || !preflight.preflightFingerprint) {
        setScreen({ ...screen, syncing: false, syncResult: preflight });
        return;
      }
      try {
        const result = await commitSync({
          accessToken: token,
          origin: window.location.origin,
          request,
          preflightFingerprint: preflight.preflightFingerprint,
        });
        setScreen({ ...screen, syncing: false, syncResult: result });
      } catch (error) {
        if (error instanceof AddinContextApiError && error.status === 0) {
          try {
            const result = await querySyncOutcome({
              accessToken: token,
              origin: window.location.origin,
              requestId: request.requestId,
            });
            setScreen({ ...screen, syncing: false, syncResult: result });
            return;
          } catch {
            setScreen({
              ...screen,
              syncing: false,
              syncResult: {
                schemaVersion: 1,
                requestId: request.requestId,
                status: 'failed',
                reasonCode: 'NETWORK_UNKNOWN',
                changeCount: request.changes.length,
                conflictCount: 0,
              },
            });
            return;
          }
        }
        throw error;
      }
    } catch (error) {
      setScreen({
        ...screen,
        syncing: false,
        syncResult: {
          schemaVersion: 1,
          requestId: request.requestId,
          status: 'failed',
          reasonCode: syncFailureReason(error),
          changeCount: request.changes.length,
          conflictCount: 0,
        },
      });
    }
  }, [screen]);

  return (
    <TaskpaneView
      screen={screen}
      onConnect={() => void connect()}
      onAnalyze={analyzeAgain}
      onSync={() => void syncNow()}
    />
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('ADDIN_ROOT_MISSING');
createRoot(root).render(<TaskpaneApp />);
