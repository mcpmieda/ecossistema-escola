import { lazy, Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Button, Card, Chip, Surface, Table } from '@heroui/react';
import { Activity, Database, Globe, HeartPulse, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { PlatformSnapshotV2 } from '../../shared/platform-snapshot-v2';
import { cappedHealthCountV1, sampleIsFreshV1, systemHealthStateV1, type HealthStateV1,
  type SystemHealthSnapshotV1 } from '../../shared/system-health-v1';
import { createHealthMonitorV1 } from './system-health-controller-v1';
import { usePlatformIdentityV1 } from './platform-identity-v1';
import { PageHeader } from './presentation';

const PlatformEvidence = lazy(() => import('./operations-page').then((module) => ({ default: module.OperationsPage })));
const labels: Record<HealthStateV1, string> = { normal: 'Normal', attention: 'Atenção', critical: 'Crítico', unknown: 'Sem dados' };
const colors = { normal: 'success', attention: 'warning', critical: 'danger', unknown: 'default' } as const;
const date = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Bahia' });
const duration = (ms: number) => ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`;
const wait = (ms: number) => ms < 60_000 ? duration(ms) : `${Math.floor(ms / 60_000).toLocaleString('pt-BR')} min`;
function Status({ state }: Readonly<{ state: HealthStateV1 }>) {
  return <Chip size="sm" variant="soft" color={colors[state]}>{labels[state]}</Chip>;
}
function Metric({ title, value, detail, state, icon: Icon }: Readonly<{
  title: string; value: string; detail: string; state: HealthStateV1; icon: typeof Activity;
}>) {
  return <Card variant="default" className="min-w-0">
    <Card.Header>
      <div className="flex items-start justify-between gap-3"><Icon className="size-5 shrink-0 text-muted" aria-hidden="true" /><Status state={state} /></div>
      <Card.Description className="mt-3">{title}</Card.Description>
      <Card.Title className="break-words text-2xl">{value}</Card.Title>
    </Card.Header>
    <Card.Content className="text-sm text-muted">{detail}</Card.Content>
  </Card>;
}
function useMonitor(onDenied: () => void) {
  const monitor = useMemo(() => createHealthMonitorV1({ onDenied }), [onDenied]);
  const [now, setNow] = useState(Date.now);
  const subscribe = useCallback((listener: () => void) => monitor.subscribe(() => {
    setNow(Date.now()); listener();
  }), [monitor]);
  const state = useSyncExternalStore(subscribe, monitor.getState, monitor.getState);
  useEffect(() => {
    const available = () => document.visibilityState !== 'hidden' && navigator.onLine !== false;
    const change = () => { monitor.setAvailable(available()); setNow(Date.now()); };
    const hide = () => monitor.stop();
    const show = () => { change(); monitor.start(); };
    monitor.setAvailable(available()); monitor.start();
    window.addEventListener('online', change); window.addEventListener('offline', change);
    window.addEventListener('pagehide', hide); window.addEventListener('pageshow', show);
    document.addEventListener('visibilitychange', change);
    const clock = setInterval(() => { if (available()) setNow(Date.now()); }, 15_000);
    return () => {
      monitor.stop(); clearInterval(clock);
      window.removeEventListener('online', change); window.removeEventListener('offline', change);
      window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show);
      document.removeEventListener('visibilitychange', change);
    };
  }, [monitor]);
  return { ...state, now, refresh: monitor.refresh };
}
function usable(snapshot: SystemHealthSnapshotV1 | null, now: number): boolean {
  return snapshot !== null && sampleIsFreshV1(snapshot.generatedAt, now)
    && (!snapshot.portal || sampleIsFreshV1(snapshot.portal.observedAt, now))
    && (!snapshot.publicEntry.observedAt || sampleIsFreshV1(snapshot.publicEntry.observedAt, now));
}
const COVERAGE = [
  { id: 'public-entry', name: 'Entrada pública', source: 'Verificação HTTP da página inicial', limit: 'Uma verificação; não é porcentagem de disponibilidade.' },
  { id: 'database', name: 'Banco e filas do Portal', source: 'Leitura privada do próprio Portal', limit: 'Amostra atual; filas de até 1.000 itens e indicador de excedente.' },
  { id: 'providers', name: 'Cloudflare e Supabase', source: 'Métricas dos fornecedores: não integradas', limit: 'CPU, tráfego, armazenamento e capacidade total ainda sem medição.' },
  { id: 'functional', name: 'Login e telas do aluno', source: 'Teste funcional: não configurado', limit: 'Requer conta sintética; nenhum aluno real é usado como monitor.' },
  { id: 'browser', name: 'Erros no navegador', source: 'Recepção e agregação: pendentes', limit: 'Não há taxa de sucesso por tela ou navegador nesta versão.' },
  { id: 'alerting', name: 'Alertas e histórico', source: 'Envio externo: não configurado', limit: 'Sem vigilância contínua quando esta tela está fechada.' },
] as const;
function Workspace({ snapshot: platform, onDenied }: Readonly<{ snapshot: PlatformSnapshotV2; onDenied: () => void }>) {
  const monitor = useMonitor(onDenied);
  const [evidence, setEvidence] = useState(false);
  const snapshot = monitor.snapshot;
  const current = usable(snapshot, monitor.now) && !monitor.error && !monitor.paused;
  const portal = current ? snapshot?.portal : null;
  const maintenance = portal?.maintenance;
  const overall = current && snapshot ? systemHealthStateV1(snapshot, monitor.now) : 'unknown';
  const publicState: HealthStateV1 = !current || !snapshot || ['unavailable', 'not-probed'].includes(snapshot.publicEntry.outcome)
    ? 'unknown' : snapshot.publicEntry.outcome === 'ok' ? 'normal' : 'critical';
  const databaseState: HealthStateV1 = !portal || portal.database === 'unconfigured' ? 'unknown'
    : portal.database === 'ok' ? 'normal' : 'critical';
  const publicationState: HealthStateV1 = !maintenance ? 'unknown' : maintenance.exhausted ? 'critical'
    : maintenance.backlog ? 'attention' : 'normal';
  const liveState: HealthStateV1 = !maintenance?.liveOutboxAvailable ? 'unknown' : maintenance.liveBacklog ? 'attention' : 'normal';
  const evidenceAvailable = platform.operational !== null
    && !platform.unavailableSections?.some((section) => ['lists', 'modules', 'audit'].includes(section));
  const lockState: HealthStateV1 = !maintenance ? 'unknown' : maintenance.oldestWaitingQueryMs >= 1000 ? 'attention' : 'normal';
  const title = { normal: 'Verificações básicas normais', attention: 'Há pontos de atenção',
    critical: 'Uma verificação exige intervenção', unknown: 'Não há confirmação suficiente' }[overall];
  const queueRows = [
    { id: 'publication', name: 'Publicações prontas para processamento', value: maintenance ? cappedHealthCountV1(maintenance.publicationDue) : '—',
      age: maintenance ? wait(maintenance.oldestPublicationDueMs) : '—', detail: 'Itens já vencidos e sem execução protegida por outra operação.' },
    { id: 'live', name: 'Avisos de atualização pendentes', value: maintenance?.liveOutboxAvailable ? cappedHealthCountV1(maintenance.livePending) : '—',
      age: maintenance?.liveOutboxAvailable ? wait(maintenance.oldestLiveDueMs) : '—', detail: 'Espera calculada apenas sobre avisos vencidos e livres para envio.' },
    { id: 'retry', name: 'Avisos em nova tentativa', value: maintenance?.liveOutboxAvailable ? cappedHealthCountV1(maintenance.liveRetrying) : '—',
      age: '—', detail: 'Parte dos avisos pendentes; não deve ser somada ao total.' },
    { id: 'locks', name: 'Conexões esperando liberação', value: maintenance ? maintenance.waitingConnections.toLocaleString('pt-BR') : '—',
      age: maintenance ? wait(maintenance.oldestWaitingQueryMs) : '—', detail: 'Tempo desde o início da consulta em espera. Não representa todas as conexões do banco.' },
  ];
  return <section className="min-w-0" aria-label="Monitoramento do Portal do Aluno">
    <PageHeader eyebrow="Operação" title="Saúde do Sistema" description="Portal do Aluno" />
    <Surface variant="default" className="platform-card-surface rounded-3xl p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3"><HeartPulse className="size-5" aria-hidden="true" /><Status state={overall} /><Chip size="sm" variant="soft">Cobertura parcial</Chip></div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 text-sm text-muted">Login completo, telas no navegador e alertas externos ainda não verificados.</p>
          <p className="mt-3 text-xs text-muted">{snapshot ? `Última coleta: ${date(snapshot.generatedAt)} (Bahia)` : 'Nenhuma coleta disponível.'}</p>
        </div>
        <Button variant="secondary" onPress={() => { void monitor.refresh(); }} isDisabled={monitor.loading || monitor.paused || monitor.error === 'denied'}>
          <RefreshCw className="size-4" aria-hidden="true" />{monitor.loading ? 'Verificando…' : 'Atualizar'}
        </Button>
      </div>
      <p className="mt-4 text-xs text-muted">Atualização a cada 60 segundos enquanto esta área estiver aberta e visível. Dados com mais de 2 minutos deixam de confirmar o estado atual.</p>
    </Surface>
    {monitor.error === 'denied' ? <p role="alert" className="mt-4 text-danger">Acesso ao monitoramento não autorizado. Os dados foram removidos; reabra a área após verificar sua sessão.</p> : null}
    {monitor.error === 'unavailable' ? <p role="alert" className="mt-4 text-warning">Não foi possível atualizar. A última coleta não está sendo usada como confirmação de normalidade.</p> : null}
    {monitor.paused ? <p role="status" className="mt-4 text-muted">Atualização pausada.</p> : null}
    <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Metric icon={Globe} title="Entrada pública" value={publicState === 'normal' ? 'Respondeu' : publicState === 'critical' ? 'Resposta inesperada' : 'Sem confirmação'}
        state={publicState} detail="Página inicial via HTTP. Não confirma a execução das telas ou um login completo." />
      <Metric icon={ShieldCheck} title="Acesso do Portal" value={portal ? portal.servingEnabled ? 'Habilitado' : 'Desabilitado' : 'Sem dados'}
        state={!portal ? 'unknown' : portal.servingEnabled && portal.credentialsConfigured ? 'normal' : 'attention'}
        detail={portal && !portal.credentialsConfigured ? 'A configuração de credenciais está incompleta.' : 'Estado da configuração; não equivale a um teste de entrada do aluno.'} />
      <Metric icon={Database} title="Leitura técnica do banco" value={portal?.database === 'ok' ? duration(portal.readDurationMs) : databaseState === 'critical' ? 'Não concluída' : 'Sem dados'}
        state={databaseState} detail="Caminho Portal → Hyperdrive → PostgreSQL. Uma falha aqui não identifica sozinha o fornecedor responsável." />
      <Metric icon={Activity} title="Publicações aguardando" value={maintenance ? cappedHealthCountV1(maintenance.publicationDue) : '—'}
        state={publicationState} detail={maintenance?.exhausted ? 'Há publicação que esgotou as tentativas e exige verificação.' : 'Itens disponíveis para processamento, sem contar tarefas futuras ou ocupadas.'} />
      <Metric icon={RefreshCw} title="Avisos de atualização" value={maintenance?.liveOutboxAvailable ? cappedHealthCountV1(maintenance.livePending) : '—'}
        state={liveState} detail="Avisos que atualizam as telas após mudanças. Ausência da estrutura não é tratada como zero." />
      <Metric icon={TriangleAlert} title="Conexões em espera" value={maintenance ? maintenance.waitingConnections.toLocaleString('pt-BR') : '—'}
        state={lockState} detail="Conexões do Portal aguardando liberação de bloqueios. Capacidade total ainda não medida." />
    </div>
    <Card variant="default" className="mt-5 min-w-0 overflow-hidden">
      <Card.Header><Card.Title>Filas e banco</Card.Title><Card.Description>Última amostra agregada. “1.000+” indica que a leitura atingiu seu limite, não a capacidade do sistema.</Card.Description></Card.Header>
      <Card.Content className="p-0"><Table variant="secondary"><Table.ScrollContainer><Table.Content aria-label="Filas e espera do Portal">
        <Table.Header><Table.Column id="metric" isRowHeader>Sinal</Table.Column><Table.Column id="value">Quantidade</Table.Column><Table.Column id="age">Maior espera observada</Table.Column></Table.Header>
        <Table.Body>{queueRows.map((row) => <Table.Row id={row.id} key={row.id}>
          <Table.Cell><p className="min-w-48 font-medium">{row.name}</p><p className="mt-1 max-w-xl text-xs text-muted">{row.detail}</p></Table.Cell>
          <Table.Cell className="whitespace-nowrap">{row.value}</Table.Cell><Table.Cell className="whitespace-nowrap">{row.age}</Table.Cell>
        </Table.Row>)}</Table.Body>
      </Table.Content></Table.ScrollContainer></Table></Card.Content>
    </Card>
    {maintenance && (maintenance.expiredIp > 0 || maintenance.expiredAudit > 0) ? <Card variant="default" className="mt-5">
      <Card.Header><Card.Title>Limpeza de registros técnicos</Card.Title></Card.Header>
      <Card.Content className="text-sm">Há registros técnicos vencidos aguardando limpeza. Verifique a manutenção agendada; esta tela não executa exclusões.</Card.Content>
    </Card> : null}
    <Card variant="default" className="mt-5">
      <Card.Header><Card.Title>Cobertura e preparação para a abertura</Card.Title><Card.Description>Sem informação não significa ausência de falhas.</Card.Description></Card.Header>
      <Card.Content><dl className="grid gap-5 md:grid-cols-2">{COVERAGE.map((item) => <div key={item.id} className="min-w-0">
        <dt className="font-medium">{item.name}</dt><dd className="mt-1 text-sm text-muted">{item.source}<br />{item.limit}</dd>
      </div>)}</dl></Card.Content>
    </Card>
    <details className="mt-5" onToggle={(event) => setEvidence(event.currentTarget.open)}>
      <summary className="cursor-pointer rounded-xl p-3 font-medium focus-visible:outline focus-visible:outline-2">Evidências do Centro ADM</summary>
      {evidence && evidenceAvailable ? <div className="mt-3"><Suspense fallback={<p role="status">Carregando evidências…</p>}><PlatformEvidence snapshot={platform} /></Suspense></div> : evidence ? <p className="p-3 text-sm text-muted">Evidências administrativas indisponíveis. O monitoramento do Portal usa uma consulta independente.</p> : null}
    </details>
  </section>;
}
export function SystemHealthPageV1({ snapshot }: Readonly<{ snapshot: PlatformSnapshotV2 }>) {
  const { identity, accessError, retry, recheck } = usePlatformIdentityV1();
  if (!identity?.authenticated || !identity.identityKey
    || !identity.capabilities?.includes('platform.health.read') || !identity.capabilities.includes('platform.settings.read')) return <section>
    <PageHeader eyebrow="Operação" title="Saúde do Sistema" description="Portal do Aluno" />
    <Card><Card.Content><p role="status">{accessError || identity ? 'Acesso ao monitoramento não autorizado.' : 'Verificando acesso…'}</p>
      {accessError ? <Button className="mt-3" variant="secondary" onPress={retry}>Verificar acesso</Button> : null}
    </Card.Content></Card>
  </section>;
  return <Workspace key={identity.identityKey} snapshot={snapshot} onDenied={recheck} />;
}
