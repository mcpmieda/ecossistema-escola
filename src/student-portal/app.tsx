import { LiveReadNoticeV1 } from '../shared/live-data/live-read-notice-v1';
import { RemoteLiveNoticeV1, useRemoteLiveV1 } from '../shared/live-data/use-remote-live-v1';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Alert, Button, Spinner } from '@heroui/react';
import { useStudentSessionV1 } from '../features/student-portal/auth/student-session-v1';
import {
  StudentPortalPageV1,
  StudentPortalShellV1,
} from '../features/student-portal/shell/student-shell-v1';
import {
  createPortalSelfClientV1,
  type PortalSelfClientV1,
} from '../features/student-portal/shared/self-client-v1';

const StudentAuthenticationV1 = lazy(() => import('../features/student-portal/auth/student-auth-v1').then(
  (module) => ({ default: module.StudentAuthenticationV1 }),
));
const StudentGradesV1 = lazy(() => import('../features/student-portal/grades/student-grades-v1').then(
  (module) => ({ default: module.StudentGradesV1 }),
));

export interface StudentEntryV1 {
  qr: string | null;
  invalidQr: boolean;
  route: 'root' | 'access' | 'unknown';
}
const PUBLIC_SITEKEY = '0x4AAAAAAExp0Fw2x5lR3luX';
const defaultClient = createPortalSelfClientV1({ respectRetryAfter: true });
const defaultEntry: StudentEntryV1 = { qr: null, invalidQr: false, route: 'root' };

/** Entry is a private, disposable holder. It never becomes a URL, DOM attribute or storage item. */
export function StudentPortalApp({
  entry = defaultEntry,
  client = defaultClient,
}: {
  entry?: StudentEntryV1;
  client?: PortalSelfClientV1;
}) {
  const [initialQr, setInitialQr] = useState(entry.qr);
  const [invalidQr, setInvalidQr] = useState(entry.invalidQr);
  const [access, setAccess] = useState(entry.route === 'access');
  const session = useStudentSessionV1(client);
  const liveState = useRemoteLiveV1({
    path: '/api/student/live',
    enabled: session.load.state === 'ready',
    onAuthorizationLost: () => { void session.refresh(); },
  });
  const discardQr = () => {
    entry.qr = null;
    entry.invalidQr = false;
    setInitialQr(null);
    setInvalidQr(false);
  };
  useEffect(
    () => () => {
      entry.qr = null;
    },
    [entry],
  );
  if (entry.route === 'unknown')
    return (
      <StudentPortalShellV1>
        <Alert status="warning">
          <Alert.Content>
            <Alert.Title>Página não encontrada</Alert.Title>
            <Button onPress={() => window.location.assign('/')}>Abrir Portal do Aluno</Button>
          </Alert.Content>
        </Alert>
      </StudentPortalShellV1>
    );
  if (session.logoutState === 'pending' || session.logoutState === 'failed')
    return (
      <StudentPortalShellV1>
        <Alert status={session.logoutState === 'failed' ? 'warning' : 'default'}>
          <Alert.Content>
            <Alert.Title>
              {session.logoutState === 'pending'
                ? 'Encerrando sua sessão…'
                : 'Não foi possível confirmar a saída'}
            </Alert.Title>
            <Alert.Description>Seus dados foram retirados desta tela.</Alert.Description>
            {session.logoutState === 'failed' && (
              <Button
                onPress={() => {
                  void session.logout();
                }}
              >
                Tentar sair novamente
              </Button>
            )}
          </Alert.Content>
        </Alert>
      </StudentPortalShellV1>
    );
  const anonymous =
    session.load.state === 'error' && session.load.error.state === 'unauthenticated';
  if (access || session.logoutState === 'done' || anonymous)
    return (
      <StudentPortalShellV1>
        {invalidQr && (
          <Alert status="warning">
            <Alert.Content>
              <Alert.Title>Este QR não é um acesso válido ao Portal.</Alert.Title>
              <Alert.Description>Leia novamente seu cartão de acesso.</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        <Suspense fallback={<p role="status">Preparando entrada segura…</p>}>
          <StudentAuthenticationV1
            client={client}
            initialQr={initialQr}
            sitekey={PUBLIC_SITEKEY}
            onQrDiscarded={discardQr}
            onAuthenticated={() => {
              discardQr();
              setAccess(false);
              window.history.replaceState(null, '', '/');
              void session.authenticated();
            }}
          />
        </Suspense>
      </StudentPortalShellV1>
    );
  if (session.load.state === 'idle' || session.load.state === 'loading')
    return (
      <main className="pa-access-check" aria-busy="true" aria-label="Verificando acesso ao Portal">
        <Spinner size="sm" aria-label="Aguarde" />
        <p role="status">Verificando acesso…</p>
      </main>
    );
  return (
    <StudentPortalPageV1
      load={session.load}
      status={<><RemoteLiveNoticeV1 state={liveState} /><LiveReadNoticeV1 failed={session.load.state === 'ready' && Boolean(session.load.refreshError)} />
        {session.load.state === 'ready' && session.load.refreshError ? <Button variant="secondary" onPress={() => { void session.refresh(); }}>Tentar novamente</Button> : null}</>}
      grades={(data) => <Suspense fallback={<p role="status">Carregando notas…</p>}><StudentGradesV1 data={data} /></Suspense>}
      onRetry={() => {
        void session.refresh();
      }}
      onLogin={() => {
        discardQr();
        setAccess(true);
      }}
      onLogout={
        session.load.state === 'ready'
          ? () => {
              discardQr();
              void session.logout();
            }
          : undefined
      }
    />
  );
}
