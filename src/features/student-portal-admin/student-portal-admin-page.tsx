import { PanelScopeContextV1 } from './shared/panel-scope-v1';
import { ClassTabsV1 } from '../../shared/ui/class-tabs-v1';
import { readClassOptionsV1 } from './accounts/class-filter-v1';
import { useAccountsReadV1 } from './accounts/accounts-read-v1';
import { AccountsErrorV1 } from './accounts/accounts-presentation-v1';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Tabs } from '@heroui/react';
import { allowDraftNavigationV1 } from '../../shared/forms/draft-navigation-v1';
import type { ScopeV1 } from '../../../shared/student-portal-contracts/core-v1';
import type { CustomizationRowV1 } from '../../../shared/student-portal-contracts/customizations-v1';
import { notifyLiveChangeV1 } from '../../shared/live-data/live-refresh-v1';
import type { CustomizationAreaV1 } from './settings/customization-values-v1';
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
import type { AccountSlotContextV1, AccountSlotsV1 } from './accounts/account-detail-v1';
import { OperationsScopeV1 } from './overview/operations-scope-v1';
import { PortalClientErrorV1, type PortalFetchV1 } from '../student-portal/shared/transport-v1';
import './shared/admin-page-v1.css';
import { RemoteLiveNoticeV1 } from '../../shared/live-data/use-remote-live-v1';
import { useAdministrativeLiveV1 } from '../../shared/live-data/administrative-live-v1';

const StudentAccountsV1 = lazy(() => import('./accounts/student-accounts-v1').then((module) => ({ default: module.StudentAccountsV1 })));
const StudentBirthYearsV1 = lazy(() => import('./birth-year/student-birth-years-v1').then((module) => ({ default: module.StudentBirthYearsV1 })));
const StudentCredentialsV1 = lazy(() => import('./credentials/student-credentials-v1').then((module) => ({ default: module.StudentCredentialsV1 })));
const PersonalizedPublicationV1 = lazy(() => import('./publication/personalized-publication-v1').then((module) => ({ default: module.PersonalizedPublicationV1 })));
const StudentSettingsV1 = lazy(() => import('./settings/student-settings-v1').then((module) => ({ default: module.StudentSettingsV1 })));
const StudentSessionsV1 = lazy(() => import('./sessions/student-sessions-v1').then((module) => ({ default: module.StudentSessionsV1 })));
const StudentAuditV1 = lazy(() => import('./audit/student-audit-v1').then((module) => ({ default: module.StudentAuditV1 })));
const StudentOverviewV1 = lazy(() => import('./overview/student-overview-v1').then((module) => ({ default: module.StudentOverviewV1 })));
const CustomizationTargetV1 = lazy(() => import('./settings/customization-target-v1').then((module) => ({ default: module.CustomizationTargetV1 })));
const sectionFallback = <output className="block py-6 text-sm text-muted">Carregando área do Painel…</output>;
const SCHOOL: ScopeV1 = { kind: 'school', academicYear: 2026 };
type SectionScope = { section: StudentPortalSection; scope: ScopeV1; label: string };
const enterInstitutionalLogin = () => window.location.replace('/auth/login');
const customizationChanged = () => notifyLiveChangeV1('portal');
/** Administrative Portal entry; heavyweight sections load only when the selected route needs them. */
export function StudentPortalAdminPage({
  fetcher,
  onLogin = enterInstitutionalLogin,
}: {
  fetcher?: PortalFetchV1;
  onLogin?: () => void;
}) {
  const auth = usePortalAdminIdentityV1(fetcher);
  const unauthenticated = auth.state.state === 'error' && auth.state.error.state === 'unauthenticated';
  useEffect(() => { if (unauthenticated) onLogin(); }, [unauthenticated, onLogin]);
  if (unauthenticated) return <output>Abrindo entrada institucional…</output>;
  if (auth.state.state !== 'ready') return (
    <section className="pa-admin-page">
      <h1>Painel do Aluno</h1>
      {auth.state.state === 'checking' ? <output>Verificando sessão administrativa…</output> : (
        <Alert status="warning"><Alert.Content>
          <Alert.Title>{auth.state.state === 'paused' ? 'Consulta pausada' : 'Acesso administrativo indisponível'}</Alert.Title>
          <Alert.Description>Confirme sua sessão para consultar o Portal de 2026.</Alert.Description>
          <Button onPress={() => { void auth.refresh(); }}>Tentar novamente</Button>
        </Alert.Content></Alert>
      )}
    </section>
  );
  return <PortalWorkspace key={auth.state.identity.identityKey + ':' + auth.state.identity.capabilities.join(',')}
    identity={auth.state.identity} onLost={auth.lost} fetcher={fetcher} />;
}
/** Keeps identity, scope and drafts mounted while section bundles are loaded on demand. */
function PortalWorkspace({ identity, onLost, fetcher }: {
  identity: PortalAdminIdentityV1;
  onLost: (error: PortalClientErrorV1) => void;
  fetcher?: PortalFetchV1;
}) {
  const [section, setSection] = useState(() => portalSectionFromHash(window.location.hash));
  const liveState = useAdministrativeLiveV1({ identityKey: identity.identityKey,
    onAuthorizationLost: () => onLost(new PortalClientErrorV1('unauthenticated', 401)) });
  const [selectedClass, setSelectedClass] = useState<{ id: number; label: string } | null>(null);
  const [target, setTarget] = useState<AccountSlotContextV1 | null>(null);
  const [customizationTarget, setCustomizationTarget] = useState<{ row: CustomizationRowV1; area: CustomizationAreaV1 } | null>(null);
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
      setCustomizationTarget(null);
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
        try { return await catalog(...args); }
        catch (error) {
          if (!args[2]?.aborted && error instanceof PortalClientErrorV1 && error.state === 'forbidden') onLost(error);
          throw error;
        }
      }) as typeof catalog,
    };
  }, [fetcher, onLost]);
  const loadClasses = useCallback((signal: AbortSignal) => readClassOptionsV1(clients.catalog, signal), [clients.catalog]);
  const classRead = useAccountsReadV1(loadClasses);
  const classItems = classRead.state.state === 'ready' ? classRead.state.data : [];
  const panelScope = useMemo(() => ({
    scope: selectedClass ? { kind: 'class' as const, academicYear: 2026 as const, classId: selectedClass.id } : SCHOOL,
    label: selectedClass?.label ?? 'Escola',
  }), [selectedClass]);
  const common = useMemo(() => ({ ...clients, scope: panelScope.scope, scopeLabel: panelScope.label,
    identityKey: identity.identityKey, canWrite: identity.capabilities.includes('platform.settings.write'), onAuthorizationLost: onLost,
  }), [clients, identity, onLost, panelScope]);
  const openSection = (next: StudentPortalSection, scope: ScopeV1, label: string) => {
    pendingScope.current = { section: next, scope, label };
    window.location.hash = studentPortalHref(next);
  };
  const openCustomization = useCallback((row: CustomizationRowV1, area: CustomizationAreaV1) => {
    if (allowDraftNavigationV1()) setCustomizationTarget({ row, area });
  }, []);
  const closeCustomization = () => { setCustomizationTarget(null); customizationChanged(); };
  const slots = useMemo<AccountSlotsV1>(() => ({
    birth: (context) => <StudentBirthYearsV1 {...common} scope={context.scope} scopeLabel={context.account.name} canWrite={context.canWrite} />,
    credentials: (context) => <StudentCredentialsV1 {...common} scope={context.scope} scopeLabel={context.account.name} canWrite={context.canWrite} />,
    sessions: (context) => <StudentSessionsV1 {...common} scope={context.scope} scopeLabel={context.account.name} canWrite={context.canWrite} />,
    publication: (context) => <PersonalizedPublicationV1 client={common.client} reader={common.reader}
      scope={context.scope} scopeLabel={context.account.name} canWrite={context.canWrite} />,
    audit: (context) => <StudentAuditV1 {...common} scope={context.scope} scopeLabel={context.account.name} canWrite={context.canWrite} />,
    settings: (context) => <StudentSettingsV1 client={common.client} scope={context.scope}
      scopeLabel={context.account.name} canWrite={context.canWrite} />,
  }), [common]);
  const reprint = useCallback((context: AccountSlotContextV1) => { setCustomizationTarget(null); setTarget(context); }, []);
  let content: ReactNode;
  if (target) content = (
    <><Button variant="secondary" onPress={() => setTarget(null)}>Voltar às contas</Button>
      <StudentCredentialsV1 {...common} scope={target.scope} scopeLabel={target.account.name} canWrite={target.canWrite} /></>
  );
  else switch (section) {
    case 'accounts': content = <StudentAccountsV1 {...common} slots={slots} onQr={qr.accept} onReprint={reprint} />; break;
    case 'birth': content = <StudentBirthYearsV1 {...common} />; break;
    case 'credentials': content = <StudentCredentialsV1 {...common} />; break;
    case 'sessions': content = <StudentSessionsV1 {...common} />; break;
    case 'audit': content = <StudentAuditV1 {...common} />; break;
    case 'publication':
    case 'settings':
      content = (
        <OperationsScopeV1 {...common} scope={sectionScope?.scope ?? common.scope} scopeLabel={sectionScope?.label ?? common.scopeLabel}>
          {(scope, label) => section === 'settings' ? (
            <StudentSettingsV1 client={common.client} reader={common.reader} scope={scope} scopeLabel={label}
              canWrite={common.canWrite} onOpenCustomization={openCustomization} />
          ) : (
            <PersonalizedPublicationV1 client={common.client} reader={common.reader} scope={scope} scopeLabel={label}
              canWrite={common.canWrite} onOpenSettings={() => openSection('settings', scope, label)}
              onOpenHealth={() => openSection('overview', scope, label)} />
          )}
        </OperationsScopeV1>
      );
      break;
    default:
      content = <StudentOverviewV1 {...common} scope={sectionScope?.scope ?? common.scope} scopeLabel={sectionScope?.label ?? common.scopeLabel} />;
  }
  return (
    <PanelScopeContextV1.Provider value={panelScope}>
      <section className="pa-admin-page">
        <header><h1>Painel do Aluno</h1><RemoteLiveNoticeV1 state={liveState} /></header>
        <Tabs selectedKey={section} onSelectionChange={(key) => {
          const next = studentPortalSections.find((item) => item.id === key);
          if (!next || !allowDraftNavigationV1()) return;
          pendingScope.current = null;
          setCustomizationTarget(null);
          if (section === next.id) { setTarget(null); setSectionScope(null); qr.clear(); }
          else window.location.hash = studentPortalHref(next.id);
        }}>
          <Tabs.ListContainer className="max-w-full overflow-x-auto">
            <Tabs.List aria-label="Áreas do Painel do Aluno">
              {studentPortalSections.map((item) => <Tabs.Tab key={item.id} id={item.id}>{item.label}<Tabs.Indicator /></Tabs.Tab>)}
            </Tabs.List>
          </Tabs.ListContainer>
          <Tabs.Panel id={section} className="pa-admin-content">
            <ClassTabsV1 items={classItems} selectedId={selectedClass?.id ?? null} allLabel="Todas as turmas"
              onChange={(id) => {
                if (!allowDraftNavigationV1()) return;
                setSelectedClass(classItems.find((item) => item.id === id) ?? null);
                setSectionScope(null); setTarget(null); setCustomizationTarget(null); qr.clear();
              }}>
              {classRead.state.state === 'error' ? <AccountsErrorV1 error={classRead.state.error}
                canReload={classRead.canReload} onReload={classRead.reload} /> : null}
              {!common.canWrite && <output className="block text-xs text-muted">Somente leitura</output>}
              {sectionScope && <Button size="sm" variant="secondary"
                onPress={() => { if (allowDraftNavigationV1()) setSectionScope(null); }}>
                {selectedClass ? `Voltar à turma ${selectedClass.label}` : 'Toda a escola'}
              </Button>}
              <Suspense fallback={sectionFallback}><div key={section}>{content}</div></Suspense>
            </ClassTabsV1>
          </Tabs.Panel>
        </Tabs>
        {customizationTarget ? <Suspense fallback={sectionFallback}><CustomizationTargetV1 key={customizationTarget.row.id + ':' + customizationTarget.area}
          row={customizationTarget.row} area={customizationTarget.area} client={clients.client} reader={clients.reader}
          canWrite={common.canWrite} slots={slots} onClose={closeCustomization} onChanged={customizationChanged}
          onAuthorizationLost={onLost} onQr={qr.accept} onReprint={reprint} /></Suspense> : null}
        {qr.dialog}
      </section>
    </PanelScopeContextV1.Provider>
  );
}
