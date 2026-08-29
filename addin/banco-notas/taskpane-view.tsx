import { Alert, Button, Card, Chip, Skeleton, Surface } from '@heroui/react';
import {
  AlertTriangle,
  Check,
  CircleAlert,
  CloudOff,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import type { AddinContextResponse } from '../../shared/banco-notas-addin-context';
import type { GradeValue } from '../../shared/banco-notas-grade-events';
import type { ChangeSummary } from './workbook';

export type TaskpaneFailureKind =
  'auth' | 'workbook-invalid' | 'ownership-denied' | 'model-missing' | 'offline' | 'error';

export type TaskpaneScreen =
  | { phase: 'loading'; message: string }
  | {
      phase: 'auth';
      officeLabel: string;
      accountDetected: boolean;
      naaSupported: boolean;
      message: string;
    }
  | {
      phase: 'authenticated';
      context: AddinContextResponse;
      changes: ChangeSummary;
      analyzedAt: string;
    }
  | { phase: 'failure'; kind: TaskpaneFailureKind; message: string };

function grade(value: GradeValue, absent: boolean): string {
  if (absent) return 'Ausente';
  if (typeof value === 'number') return new Intl.NumberFormat('pt-BR').format(value);
  return value ?? 'Ausente';
}

function StatusLine({ ok, children }: React.PropsWithChildren<{ ok: boolean }>) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? (
        <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      )}
      <span>{children}</span>
    </li>
  );
}

function Loading({ message }: { message: string }) {
  return (
    <div className="grid gap-3" aria-label={message}>
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-52 rounded-2xl" />
      <Skeleton className="h-36 rounded-2xl" />
    </div>
  );
}

function Failure({
  kind,
  message,
  retry,
}: {
  kind: TaskpaneFailureKind;
  message: string;
  retry: () => void;
}) {
  const titles: Record<TaskpaneFailureKind, string> = {
    auth: 'Autenticação necessária',
    'workbook-invalid': 'Workbook incompatível',
    'ownership-denied': 'Acesso ao modelo negado',
    'model-missing': 'Modelo não reconhecido',
    offline: 'Sem conexão',
    error: 'Não foi possível carregar',
  };
  return (
    <Alert status="danger">
      <Alert.Indicator>{kind === 'offline' ? <CloudOff /> : <CircleAlert />}</Alert.Indicator>
      <Alert.Content>
        <Alert.Title>{titles[kind]}</Alert.Title>
        <Alert.Description>{message}</Alert.Description>
      </Alert.Content>
      <Button size="sm" variant="outline" onPress={retry}>
        Tentar novamente
      </Button>
    </Alert>
  );
}

function AuthCard({
  screen,
  connect,
}: {
  screen: Extract<TaskpaneScreen, { phase: 'auth' }>;
  connect: () => void;
}) {
  return (
    <Card>
      <Card.Header>
        <Card.Title className="flex items-center gap-2">
          <LockKeyhole className="size-5" /> Autenticação
        </Card.Title>
        <Card.Description>{screen.message}</Card.Description>
      </Card.Header>
      <Card.Content>
        <ul className="grid gap-2">
          <StatusLine ok={screen.naaSupported}>NAA 1.1 disponível no Office</StatusLine>
          <StatusLine ok={screen.accountDetected}>Conta institucional detectada</StatusLine>
          <StatusLine ok={true}>Token mantido somente em memória</StatusLine>
        </ul>
        <p className="mt-3 text-xs text-muted">Host: {screen.officeLabel}</p>
      </Card.Content>
      <Card.Footer>
        <Button className="w-full" onPress={connect} isDisabled={!screen.naaSupported}>
          Conectar ao Banco
        </Button>
      </Card.Footer>
    </Card>
  );
}

function ContextCard({ context }: { context: AddinContextResponse }) {
  const rows = [
    ['Professor', context.teacher.label],
    ['Turma', context.assignment?.classGroupLabel ?? 'Sem atribuição'],
    ['Componente', context.assignment?.componentLabel ?? 'Sem componente'],
    ['Modelo', `${context.model.state} · versão ${context.model.version}`],
  ];
  return (
    <Card>
      <Card.Header className="flex-row items-center justify-between gap-2">
        <div>
          <Card.Title>Contexto</Card.Title>
          <Card.Description>{context.schoolYear.label}</Card.Description>
        </div>
        <Chip size="sm" variant="soft" color="success">
          <ShieldCheck className="size-3.5" /> Autenticado
        </Chip>
      </Card.Header>
      <Card.Content>
        <dl className="grid gap-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-start justify-between gap-3">
              <dt className="text-muted">{label}</dt>
              <dd className="m-0 text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </Card.Content>
    </Card>
  );
}

function PreflightCard({ context }: { context: AddinContextResponse }) {
  return (
    <Card>
      <Card.Header className="flex-row items-center justify-between gap-2">
        <div>
          <Card.Title>Status da planilha</Card.Title>
          <Card.Description>Preflight read-only</Card.Description>
        </div>
        <Chip
          size="sm"
          variant="soft"
          color={
            context.preflight.status === 'blocked'
              ? 'danger'
              : context.preflight.status === 'warning'
                ? 'warning'
                : 'success'
          }
        >
          {context.preflight.status === 'blocked'
            ? 'Bloqueada'
            : context.preflight.status === 'warning'
              ? 'Atenção'
              : 'Pronta'}
        </Chip>
      </Card.Header>
      <Card.Content>
        <ul className="grid gap-2">
          <StatusLine ok>Estrutura válida</StatusLine>
          <StatusLine ok>Modelo reconhecido</StatusLine>
          <StatusLine ok>Professor autorizado</StatusLine>
          <StatusLine ok>Arquivo compatível</StatusLine>
          <StatusLine ok={context.syncEnabled}>
            {context.syncEnabled
              ? 'Sincronização habilitada'
              : 'Sincronização desligada pela administração'}
          </StatusLine>
        </ul>
      </Card.Content>
    </Card>
  );
}

function ChangesCard({ changes, analyzedAt }: { changes: ChangeSummary; analyzedAt: string }) {
  return (
    <Card>
      <Card.Header>
        <Card.Title>Alterações detectadas</Card.Title>
        <Card.Description>
          {changes.changedFields} campo(s) · {changes.affectedStudents} estudante(s)
        </Card.Description>
      </Card.Header>
      <Card.Content>
        {changes.changes.length === 0 ? (
          <Surface className="rounded-xl bg-surface-secondary p-3 text-sm">
            Nenhuma alteração em relação ao estado conhecido.
          </Surface>
        ) : (
          <details>
            <summary className="cursor-pointer text-sm font-medium">Ver preview factual</summary>
            <ul className="mt-3 grid gap-2">
              {changes.changes.map((change, index) => (
                <li
                  key={`${change.studentLabel}:${change.field}:${index}`}
                  className="rounded-xl bg-surface-secondary p-3 text-sm"
                >
                  <p className="font-medium">{change.studentLabel}</p>
                  <p className="mt-1 text-muted">
                    {change.field}: {grade(change.before, change.beforeAbsent)} →{' '}
                    {grade(change.after, change.afterAbsent)}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        )}
        {changes.unknownBaselineFields > 0 && (
          <p className="mt-3 text-xs text-warning">
            {changes.unknownBaselineFields} campo(s) sem baseline foram preservados fora da
            comparação.
          </p>
        )}
        <p className="mt-3 text-xs text-muted">Analisado em {analyzedAt}</p>
      </Card.Content>
    </Card>
  );
}

function Authenticated({
  screen,
  analyze,
}: {
  screen: Extract<TaskpaneScreen, { phase: 'authenticated' }>;
  analyze: () => void;
}) {
  return (
    <div className="grid gap-3">
      <ContextCard context={screen.context} />
      <PreflightCard context={screen.context} />
      {screen.context.pending.length > 0 && (
        <Alert status={screen.context.preflight.status === 'blocked' ? 'danger' : 'warning'}>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Prontidão e pendências</Alert.Title>
            <Alert.Description>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {screen.context.pending.map((item) => (
                  <li key={item.code}>{item.message}</li>
                ))}
              </ul>
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <ChangesCard changes={screen.changes} analyzedAt={screen.analyzedAt} />
      <Button variant="outline" className="w-full" onPress={analyze}>
        <RefreshCw className="size-4" /> Analisar novamente
      </Button>
      <Surface className="rounded-2xl border border-border p-4">
        <p className="text-sm font-medium">Sincronização</p>
        <p className="mt-1 text-sm text-muted">
          {screen.context.syncEnabled
            ? 'O estado administrativo permite sync, mas esta V1 não envia alterações.'
            : 'Indisponível enquanto o piloto não estiver ativo.'}
        </p>
      </Surface>
    </div>
  );
}

export function TaskpaneView({
  screen,
  onConnect,
  onAnalyze,
}: {
  screen: TaskpaneScreen;
  onConnect: () => void;
  onAnalyze: () => void;
}) {
  return (
    <main className="addin-main">
      <header className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Ecossistema Escola
        </p>
        <div className="mt-1 flex items-center gap-2">
          <UserRound className="size-5" />
          <h1 className="text-xl font-semibold">Banco de Notas</h1>
        </div>
        <p className="mt-1 text-sm text-muted">Experiência cotidiana do modelo vinculado.</p>
      </header>
      {screen.phase === 'loading' && <Loading message={screen.message} />}
      {screen.phase === 'auth' && <AuthCard screen={screen} connect={onConnect} />}
      {screen.phase === 'failure' && (
        <Failure kind={screen.kind} message={screen.message} retry={onConnect} />
      )}
      {screen.phase === 'authenticated' && <Authenticated screen={screen} analyze={onAnalyze} />}
      <p className="mt-4 text-xs text-muted">
        Tokens, claims, identificadores de identidade e credenciais não são exibidos nem gravados.
      </p>
    </main>
  );
}
