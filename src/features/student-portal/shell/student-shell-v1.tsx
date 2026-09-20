import { useId, useRef, type ReactNode } from 'react';
import { Alert } from '@heroui/react/alert';
import { Avatar } from '@heroui/react/avatar';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Chip } from '@heroui/react/chip';
import { Skeleton } from '@heroui/react/skeleton';
import { BrandMark } from '../../../lib/brand-mark';
import type { SelfResponseV1 } from '../../../../shared/student-portal-contracts/self-v1';
import type { PortalLoadStateV1 } from '../shared/latest-request-v1';
import { StudentPortalWorkspaceV1 } from '../workspace/student-workspace-v1';
import './student-shell-v1.css';

export const STUDENT_SCHOOL_NAME_V1 = 'Escola Iêda Alves de Oliveira MCPM';
const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'short',
});
const outcome = {
  'in-progress': { label: 'Em curso', color: 'default' },
  approved: { label: 'Aprovado', color: 'success' },
  failed: { label: 'Reprovado', color: 'danger' },
  'failed-attendance': { label: 'Reprovado por frequência', color: 'danger' },
  'not-applicable': { label: 'Não se aplica', color: 'default' },
} as const;

function studentInitials(name: string) {
  const words = name.trim().split(/\s+/u);
  return [words[0], words.length > 1 ? words.at(-1) : undefined]
    .map((word) => Array.from(word ?? '')[0] ?? '')
    .join('')
    .toLocaleUpperCase('pt-BR');
}

export interface StudentShellPropsV1 {
  children: ReactNode;
  schoolName?: string;
  logo?: ReactNode;
  onLogout?: () => void;
  loggingOut?: boolean;
  busy?: boolean;
}

/** Presentational shell: no routing, identity provider, requests or persistent student data. */
export function StudentPortalShellV1({
  children,
  schoolName = STUDENT_SCHOOL_NAME_V1,
  logo,
  onLogout,
  loggingOut = false,
  busy = false,
}: StudentShellPropsV1) {
  const contentId = useId();
  const content = useRef<HTMLElement>(null);
  return (
    <div className="pa-shell">
      <a
        className="pa-skip-link"
        href={'#' + contentId}
        onClick={(event) => {
          // Fragment navigation triggers popstate and the session's security revalidation.
          event.preventDefault();
          content.current?.focus();
        }}
      >
        Ir para o conteúdo
      </a>
      <header className="pa-shell-header">
        <div className="pa-header-inner">
          <div className="pa-school-mark" role="img" aria-label={schoolName}>
            {logo ?? <BrandMark compact />}
          </div>
          <div className="pa-header-title">
            <h1>PORTAL DO ALUNO</h1>
            <p>{schoolName}</p>
          </div>
          <div className="pa-header-action">
            {onLogout ? (
              <Button
                size="sm"
                variant="tertiary"
                onPress={onLogout}
                isDisabled={loggingOut}
                aria-busy={loggingOut}
              >
                Sair
              </Button>
            ) : null}
          </div>
        </div>
      </header>
      <main
        ref={content}
        id={contentId}
        className="pa-shell-content"
        tabIndex={-1}
        aria-busy={busy}
      >
        {children}
      </main>
    </div>
  );
}

export function StudentProfileV1({
  profile,
  updatedAt,
}: {
  profile: SelfResponseV1['profile'];
  /** Optional projection timestamp; never an invented date or the last BN import. */
  updatedAt?: string;
}) {
  const heading = useId();
  const status =
    profile.academicState === 'assisted'
      ? { label: 'ASSISTIDO', color: 'accent' as const }
      : outcome[profile.result];
  const date = updatedAt ? new Date(updatedAt) : null;
  return (
    <section className="pa-profile-section" aria-labelledby={heading}>
      <h2 id={heading} className="pa-section-title">
        Perfil do aluno
      </h2>
      <Card variant="secondary" className="pa-profile-card">
        <Card.Content className="pa-profile-content">
          <Avatar
            className="pa-student-avatar"
            color="accent"
            variant="soft"
            size="lg"
            aria-hidden="true"
          >
            <Avatar.Fallback color="accent">{studentInitials(profile.name)}</Avatar.Fallback>
          </Avatar>
          <div className="pa-profile-identity">
            <h3 className="pa-student-name">{profile.name}</h3>
            <p className="pa-student-class">
              {profile.classLabel}
              <span aria-hidden="true"> · </span>
              {profile.link.academicYear}
            </p>
            <div className="pa-profile-meta">
              <Chip size="sm" variant="soft" color={status.color}>
                {status.label}
              </Chip>
              {date && Number.isFinite(date.getTime()) ? (
                <time className="pa-profile-time" dateTime={date.toISOString()}>
                  Atualizado em {dateFormatter.format(date)}
                </time>
              ) : null}
            </div>
          </div>
        </Card.Content>
      </Card>
    </section>
  );
}

export type StudentMessageKindV1 = 'empty' | 'error' | 'expired' | 'maintenance' | 'unavailable';
const messages = {
  empty: { title: 'Notas ainda não publicadas', description: '', status: 'default', action: '' },
  error: {
    title: 'Não foi possível carregar seus dados',
    description: '',
    status: 'danger',
    action: 'Tentar novamente',
  },
  expired: {
    title: 'Sessão expirada',
    description: 'Entre novamente para continuar.',
    status: 'warning',
    action: 'Entrar',
  },
  maintenance: {
    title: 'Portal em manutenção',
    description: 'Tente novamente mais tarde.',
    status: 'warning',
    action: 'Tentar novamente',
  },
  unavailable: {
    title: 'Portal temporariamente indisponível',
    description: '',
    status: 'warning',
    action: 'Tentar novamente',
  },
} as const;

export function StudentPortalMessageV1({
  kind,
  onAction,
}: {
  kind: StudentMessageKindV1;
  onAction?: () => void;
}) {
  const message = messages[kind];
  if (kind === 'empty')
    return (
      <Card className="pa-empty-card">
        <Card.Content>
          <p role="status">{message.title}</p>
        </Card.Content>
      </Card>
    );
  return (
    <Alert status={message.status} className="pa-shell-alert" role="alert">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{message.title}</Alert.Title>
        {message.description ? <Alert.Description>{message.description}</Alert.Description> : null}
        {onAction ? (
          <Button size="sm" variant="secondary" className="pa-state-action" onPress={onAction}>
            {message.action}
          </Button>
        ) : null}
      </Alert.Content>
    </Alert>
  );
}

function StudentPageSkeletonV1() {
  return (
    <div className="pa-page-skeleton" role="status" aria-label="Carregando perfil e notas">
      <h2 className="pa-section-title">Perfil do aluno</h2>
      <Card className="pa-profile-card">
        <Card.Content className="pa-profile-content" aria-hidden="true">
          <Skeleton className="pa-skeleton-avatar" />
          <div className="pa-profile-identity pa-skeleton-lines">
            <Skeleton className="pa-skeleton-name" />
            <Skeleton className="pa-skeleton-class" />
            <Skeleton className="pa-skeleton-chip" />
          </div>
        </Card.Content>
      </Card>
      <h2 className="pa-section-title pa-grades-title">Minhas notas</h2>
      <Card className="pa-skeleton-grades" aria-hidden="true">
        <Card.Content>
          {[0, 1, 2, 3].map((row) => (
            <div className="pa-skeleton-row" key={row}>
              <Skeleton />
              <Skeleton />
              <Skeleton />
            </div>
          ))}
        </Card.Content>
      </Card>
    </div>
  );
}

export type StudentPageStateV1 = PortalLoadStateV1<SelfResponseV1> | { state: 'maintenance' };
export interface StudentPagePropsV1 extends Omit<StudentShellPropsV1, 'children' | 'busy'> {
  load: StudentPageStateV1;
  grades: (data: SelfResponseV1) => ReactNode;
  status?: ReactNode;
  onRetry?: () => void;
  onLogin?: () => void;
  showUpdatedAt?: boolean;
}

/** Consumes the foundation's load state. Error/loading transitions cannot retain old profile/grades. */
export function StudentPortalPageV1({
  load,
  grades,
  status,
  onRetry,
  onLogin,
  showUpdatedAt = false,
  ...shell
}: StudentPagePropsV1) {
  const gradesHeading = useId();
  let content: ReactNode = <StudentPageSkeletonV1 />;
  if (load.state === 'maintenance')
    content = <StudentPortalMessageV1 kind="maintenance" onAction={onRetry} />;
  else if (load.state === 'error') {
    const kind =
      load.error.state === 'unauthenticated'
        ? 'expired'
        : load.error.state === 'unavailable' || load.error.state === 'forbidden'
          ? 'unavailable'
          : 'error';
    content = (
      <StudentPortalMessageV1 kind={kind} onAction={kind === 'expired' ? onLogin : onRetry} />
    );
  } else if (load.state === 'ready')
    content = (
      <>
        {status}
        {load.data.state === 'no-publication' || load.data.subjects.length === 0 ? (
          <>
            <StudentProfileV1
              profile={load.data.profile}
              updatedAt={showUpdatedAt ? load.data.generatedAt : undefined}
            />
            <section className="pa-grades-section" aria-labelledby={gradesHeading}>
              <h2 id={gradesHeading} className="pa-section-title">
                Minhas notas
              </h2>
              <StudentPortalMessageV1 kind="empty" />
            </section>
          </>
        ) : (
          <StudentPortalWorkspaceV1
            data={load.data}
            profile={
              <StudentProfileV1
                profile={load.data.profile}
                updatedAt={showUpdatedAt ? load.data.generatedAt : undefined}
              />
            }
            grades={grades}
          />
        )}
      </>
    );
  return (
    <StudentPortalShellV1 {...shell} busy={load.state === 'idle' || load.state === 'loading'}>
      {content}
    </StudentPortalShellV1>
  );
}
