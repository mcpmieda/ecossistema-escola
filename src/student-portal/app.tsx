import { useEffect, useRef, useState } from 'react';
import { Alert, Button } from '@heroui/react';
import { StudentAuthenticationV1 } from '../features/student-portal/auth/student-auth-v1';
import { useStudentSessionV1 } from '../features/student-portal/auth/student-session-v1';
import { StudentGradesV1 } from '../features/student-portal/grades/student-grades-v1';
import {
  StudentPortalPageV1,
  StudentPortalShellV1,
} from '../features/student-portal/shell/student-shell-v1';
import {
  createPortalSelfClientV1,
  type PortalSelfClientV1,
} from '../features/student-portal/shared/self-client-v1';

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
  const seenSession = useRef(false);
  const session = useStudentSessionV1(client);
  const discardQr = () => {
    entry.qr = null;
    entry.invalidQr = false;
    setInitialQr(null);
    setInvalidQr(false);
  };
  useEffect(() => {
    if (session.load.state === 'ready') seenSession.current = true;
  }, [session.load]);
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
  if (access || session.logoutState === 'done' || (anonymous && !seenSession.current))
    return (
      <StudentPortalShellV1>
        {session.logoutState === 'done' && <p role="status">Você saiu do Portal.</p>}
        {invalidQr && (
          <Alert status="warning">
            <Alert.Content>
              <Alert.Title>Este QR não é um acesso válido ao Portal.</Alert.Title>
              <Alert.Description>Leia novamente seu cartão de acesso.</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
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
      </StudentPortalShellV1>
    );
  return (
    <StudentPortalPageV1
      load={session.load}
      grades={(data) => <StudentGradesV1 data={data} />}
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
