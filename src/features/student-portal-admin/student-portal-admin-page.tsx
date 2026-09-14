import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Button } from '@heroui/react';
import type { ScopeV1 } from '../../../shared/student-portal-contracts/core-v1';
import {
  portalSectionFromHash,
  studentPortalHref,
  studentPortalSections,
  type StudentPortalSection,
} from '../../platform/student-portal-module';
import { createPortalAdminClientV1 } from './shared/admin-client-v1';
import {
  authorizationAwareFetchV1,
  usePortalAdminIdentityV1,
  type PortalAdminIdentityV1,
} from './shared/admin-identity-v1';
import { useAccountQrHandoffV1 } from './shared/qr-handoff-v1';
import {
  createPortalAdminReadClientV2,
  createPortalClassCatalogV2,
} from './accounts/accounts-client-v2';
import { StudentAccountsV1 } from './accounts/student-accounts-v1';
import type { AccountSlotContextV1, AccountSlotsV1 } from './accounts/account-detail-v1';
import { StudentBirthYearsV1 } from './birth-year/student-birth-years-v1';
import { StudentCredentialsV1 } from './credentials/student-credentials-v1';
import { StudentPublicationV1 } from './publication/student-publication-v1';
import { StudentSettingsV1 } from './settings/student-settings-v1';
import { StudentSessionsV1 } from './sessions/student-sessions-v1';
import { StudentAuditV1 } from './audit/student-audit-v1';
import { StudentOverviewV1 } from './overview/student-overview-v1';
import { OperationsScopeV1 } from './overview/operations-scope-v1';
import { PortalClientErrorV1, type PortalFetchV1 } from '../student-portal/shared/transport-v1';
import './shared/admin-page-v1.css';

const SCHOOL: ScopeV1 = { kind: 'school', academicYear: 2026 };
type SectionScope = { section: StudentPortalSection; scope: ScopeV1; label: string };
function AccountSlot({ title, children }: { title: string; children: () => ReactNode }) {
  const [opened, setOpened] = useState(false);
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
      className="pa-integrated-slot"
    >
      <summary>{title}</summary>
      {opened && children()}
    </details>
  );
}
export function StudentPortalAdminPage({ fetcher }: { fetcher?: PortalFetchV1 }) {
  const auth = usePortalAdminIdentityV1(fetcher);
  if (auth.state.state !== 'ready')
    return (
      <section className="pa-admin-page">
        <h1>Painel do Aluno</h1>
        {auth.state.state === 'checking' ? (
          <p role="status">Verificando sessão administrativa…</p>
        ) : (
          <Alert status="warning">
            <Alert.Content>
              <Alert.Title>
                {auth.state.state === 'paused'
                  ? 'Consulta pausada'
                  : 'Acesso administrativo indisponível'}
              </Alert.Title>
              <Alert.Description>
                Confirme sua sessão para consultar o Portal de 2026.
              </Alert.Description>
              <Button
                onPress={() => {
                  void auth.refresh();
                }}
              >
                Consultar sessão novamente
              </Button>
              {auth.state.state === 'error' && auth.state.error.state === 'unauthenticated' && (
                <Button variant="secondary" onPress={() => window.location.assign('/auth/login')}>
                  Entrar com conta institucional
                </Button>
              )}
            </Alert.Content>
          </Alert>
        )}
      </section>
    );
  return (
    <PortalWorkspace
      key={auth.state.identity.identityKey + ':' + auth.state.identity.capabilities.join(',')}
      identity={auth.state.identity}
      onLost={auth.lost}
      fetcher={fetcher}
    />
  );
}
function PortalWorkspace({
  identity,
  onLost,
  fetcher,
}: {
  identity: PortalAdminIdentityV1;
  onLost: (error: PortalClientErrorV1) => void;
  fetcher?: PortalFetchV1;
}) {
  const [section, setSection] = useState(() => portalSectionFromHash(window.location.hash));
  const [target, setTarget] = useState<AccountSlotContextV1 | null>(null);
  const [sectionScope, setSectionScope] = useState<SectionScope | null>(null);
  const pendingScope = useRef<SectionScope | null>(null);
  const qr = useAccountQrHandoffV1();
  useEffect(() => {
    const change = () => {
      const next = portalSectionFromHash(window.location.hash);
      setSection(next);
      setSectionScope(pendingScope.current?.section === next ? pendingScope.current : null);
      pendingScope.current = null;
      setTarget(null);
      qr.clear();
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, [qr.clear]);
  const clients = useMemo(() => {
    const send = authorizationAwareFetchV1(onLost, fetcher);
    const catalog = createPortalClassCatalogV2();
    return {
      client: createPortalAdminClientV1({ fetch: send, respectRetryAfter: true }),
      reader: createPortalAdminReadClientV2({ fetch: send, respectRetryAfter: true }),
      catalog: (async (...args: Parameters<typeof catalog>) => {
        try {
          return await catalog(...args);
        } catch (error) {
          if (
            !args[2]?.aborted &&
            error instanceof PortalClientErrorV1 &&
            error.state === 'forbidden'
          )
            onLost(error);
          throw error;
        }
      }) as typeof catalog,
    };
  }, [fetcher, onLost]);
  const common = useMemo(
    () => ({
      ...clients,
      scope: SCHOOL,
      scopeLabel: 'Escola',
      identityKey: identity.identityKey,
      canWrite: identity.capabilities.includes('platform.settings.write'),
      onAuthorizationLost: onLost,
    }),
    [clients, identity, onLost],
  );
  const openSection = (next: StudentPortalSection, scope: ScopeV1, label: string) => {
    pendingScope.current = { section: next, scope, label };
    window.location.hash = studentPortalHref(next);
  };
  const slots = useMemo<AccountSlotsV1>(
    () => ({
      birth: (context) => (
        <AccountSlot title="Ano de nascimento">
          {() => (
            <StudentBirthYearsV1
              {...common}
              scope={context.scope}
              scopeLabel={context.account.name}
              canWrite={context.canWrite}
            />
          )}
        </AccountSlot>
      ),
      credentials: (context) => (
        <AccountSlot title="QR e cartões">
          {() => (
            <StudentCredentialsV1
              {...common}
              scope={context.scope}
              scopeLabel={context.account.name}
              canWrite={context.canWrite}
            />
          )}
        </AccountSlot>
      ),
      sessions: (context) => (
        <AccountSlot title="Sessões da conta">
          {() => (
            <StudentSessionsV1
              {...common}
              scope={context.scope}
              scopeLabel={context.account.name}
              canWrite={context.canWrite}
            />
          )}
        </AccountSlot>
      ),
      publication: (context) => (
        <AccountSlot title="Períodos da conta">
          {() => (
            <StudentPublicationV1
              client={common.client}
              scope={context.scope}
              scopeLabel={context.account.name}
              canWrite={context.canWrite}
            />
          )}
        </AccountSlot>
      ),
      audit: (context) => (
        <AccountSlot title="Eventos da conta">
          {() => (
            <StudentAuditV1
              {...common}
              scope={context.scope}
              scopeLabel={context.account.name}
              canWrite={context.canWrite}
            />
          )}
        </AccountSlot>
      ),
      settings: (context) => (
        <AccountSlot title="Configurações da conta">
          {() => (
            <StudentSettingsV1
              client={common.client}
              scope={context.scope}
              scopeLabel={context.account.name}
              canWrite={context.canWrite}
            />
          )}
        </AccountSlot>
      ),
    }),
    [common],
  );
  const reprint = useCallback((context: AccountSlotContextV1) => setTarget(context), []);
  let content: ReactNode;
  if (target)
    content = (
      <>
        <Button variant="secondary" onPress={() => setTarget(null)}>
          Voltar às contas
        </Button>
        <StudentCredentialsV1
          {...common}
          scope={target.scope}
          scopeLabel={target.account.name}
          canWrite={target.canWrite}
        />
      </>
    );
  else
    switch (section) {
      case 'accounts':
        content = (
          <StudentAccountsV1 {...common} slots={slots} onQr={qr.accept} onReprint={reprint} />
        );
        break;
      case 'birth':
        content = <StudentBirthYearsV1 {...common} />;
        break;
      case 'credentials':
        content = <StudentCredentialsV1 {...common} />;
        break;
      case 'sessions':
        content = <StudentSessionsV1 {...common} />;
        break;
      case 'audit':
        content = <StudentAuditV1 {...common} />;
        break;
      case 'publication':
      case 'settings':
        content = (
          <OperationsScopeV1
            {...common}
            scope={sectionScope?.scope ?? SCHOOL}
            scopeLabel={sectionScope?.label ?? common.scopeLabel}
          >
            {(scope, label) =>
              section === 'settings' ? (
                <StudentSettingsV1
                  client={common.client}
                  scope={scope}
                  scopeLabel={label}
                  canWrite={common.canWrite}
                />
              ) : (
                <StudentPublicationV1
                  client={common.client}
                  scope={scope}
                  scopeLabel={label}
                  canWrite={common.canWrite}
                  onOpenSettings={() => openSection('settings', scope, label)}
                  onOpenHealth={() => openSection('overview', scope, label)}
                />
              )
            }
          </OperationsScopeV1>
        );
        break;
      default:
        content = (
          <StudentOverviewV1
            {...common}
            scope={sectionScope?.scope ?? SCHOOL}
            scopeLabel={sectionScope?.label ?? common.scopeLabel}
          />
        );
    }
  return (
    <section className="pa-admin-page">
      <header>
        <h1>Painel do Aluno</h1>
        <p>Portal de 2026 · Contas, acesso e notas publicadas</p>
      </header>
      <nav aria-label="Áreas do Painel do Aluno">
        {studentPortalSections.map((item) => (
          <a
            key={item.id}
            href={studentPortalHref(item.id)}
            onClick={() => {
              pendingScope.current = null;
              if (section === item.id) {
                setTarget(null);
                setSectionScope(null);
                qr.clear();
              }
            }}
            aria-current={section === item.id ? 'page' : undefined}
          >
            {item.label}
          </a>
        ))}
      </nav>
      {!common.canWrite && <p role="status">Sua sessão permite somente consulta.</p>}
      <div key={section} className="pa-admin-content">
        {sectionScope && (
          <Button variant="secondary" onPress={() => setSectionScope(null)}>
            Usar toda a escola
          </Button>
        )}
        {content}
      </div>
      {qr.dialog}
    </section>
  );
}
