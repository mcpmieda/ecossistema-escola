import { Card, Chip, Surface, Table } from '@heroui/react';
import {
  Activity,
  CheckCircle2,
  Database,
  HeartPulse,
  PlugZap,
  RotateCcw,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { AmbientConstellation } from '@/components/ambient-constellation';
import type { PlatformSnapshotContract } from '../../shared/platform-contract';
import { EmptyState, formatDate, PageHeader } from './presentation';

type SignalStatus = 'ok' | 'attention' | 'unknown';

function SignalChip({ status }: { status: SignalStatus }) {
  if (status === 'attention') {
    return <Chip color="danger" variant="soft" size="sm">Atenção</Chip>;
  }
  if (status === 'unknown') {
    return <Chip variant="soft" size="sm">Não verificado</Chip>;
  }
  return <Chip color="success" variant="soft" size="sm">Sem sinal de falha</Chip>;
}

function SignalRow({
  icon: Icon,
  title,
  description,
  status,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  status: SignalStatus;
}) {
  return (
    <div className="stagger-item flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-surface-secondary sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Surface
          variant="secondary"
          className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-2xl border border-border/60"
        >
          <Icon className="size-4 text-muted" />
        </Surface>
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
        </div>
      </div>
      <SignalChip status={status} />
    </div>
  );
}

export function OperationsPage({ snapshot }: { snapshot: PlatformSnapshotContract }) {
  const operational = snapshot.operational;

  if (!operational) {
    return (
      <>
        <PageHeader
          eyebrow="Confiabilidade"
          title="Operação"
          description="Sinais observáveis do núcleo, degradações detectáveis e lacunas que ainda não possuem evidência operacional."
        />
        <Card variant="default">
          <Card.Content className="p-0">
            <EmptyState
              icon={HeartPulse}
              title="Sinais operacionais não disponíveis"
              description="A sessão atual não recebeu a capability necessária para consultar os sinais operacionais desta área."
            />
          </Card.Content>
        </Card>
      </>
    );
  }

  const attention = operational.status === 'attention';
  const registeredCount = snapshot.registeredModules.length;
  const healthCoverageDescription =
    registeredCount === 0
      ? 'Nenhum sistema independente está registrado; não há contrato de health check para avaliar.'
      : `${operational.healthContractsConfigured} de ${registeredCount} sistema(s) registrado(s) possuem HealthEndpoint configurado. A presença do endpoint não comprova disponibilidade.`;

  return (
    <>
      <PageHeader
        eyebrow="Confiabilidade"
        title="Operação"
        description="Sinais observáveis do núcleo, degradações detectáveis e lacunas que ainda não possuem evidência operacional."
      />

      <Surface
        variant="secondary"
        className="living-surface rounded-[2rem] p-6 sm:p-7"
      >
        <AmbientConstellation intensity={attention ? 'medium' : 'strong'} placement="right" />
        <div className="living-aura living-aura--right" />
        <div className="relative z-10 flex flex-col gap-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                {attention ? (
                  <TriangleAlert className="size-4 text-danger" />
                ) : (
                  <HeartPulse className="size-4 text-success" />
                )}
                Estado observado
              </div>
              <h3 className="mt-4 max-w-3xl text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
                {attention ? 'Há sinais que exigem atenção' : 'Sem degradação observada no snapshot'}
              </h3>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
                Este estado deriva somente das evidências disponíveis no read model autorizado. Ele não
                substitui monitoramento ativo de serviços externos nem prova recuperação testada.
              </p>
            </div>
            <Chip color={attention ? 'danger' : 'success'} variant="soft" size="sm">
              {attention ? 'Atenção' : 'Nominal'}
            </Chip>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card variant="default" className="stagger-item">
              <Card.Header>
                <Card.Description>Estrutura obrigatória</Card.Description>
                <Card.Title className="text-xl">
                  {snapshot.foundation.expectedPlatformListsPresent ? 'Completa' : 'Incompleta'}
                </Card.Title>
              </Card.Header>
              <Card.Content className="text-xs leading-5 text-muted">
                {snapshot.foundation.expectedPlatformListsPresent
                  ? 'Todas as listas estruturais foram encontradas.'
                  : `${snapshot.foundation.missingPlatformLists.length} lista(s) obrigatória(s) ausente(s).`}
              </Card.Content>
            </Card>
            <Card variant="default" className="stagger-item">
              <Card.Header>
                <Card.Description>Falhas na auditoria recente</Card.Description>
                <Card.Title className="text-xl">{operational.recentAuditFailureCount}</Card.Title>
              </Card.Header>
              <Card.Content className="text-xs leading-5 text-muted">
                Entre os {snapshot.recentAudit.length} eventos recentes carregados.
              </Card.Content>
            </Card>
            <Card variant="default" className="stagger-item">
              <Card.Header>
                <Card.Description>Contratos de health check</Card.Description>
                <Card.Title className="text-xl">{operational.healthContractsConfigured}</Card.Title>
              </Card.Header>
              <Card.Content className="text-xs leading-5 text-muted">
                {registeredCount === 0
                  ? 'Nenhum sistema independente registrado.'
                  : `${operational.healthContractsMissing} sistema(s) sem contrato configurado.`}
              </Card.Content>
            </Card>
          </div>
        </div>
      </Surface>

      <Card variant="default" className="mt-5 overflow-hidden">
        <Card.Header className="border-b border-border/60">
          <Card.Title>Sinais observados</Card.Title>
          <Card.Description>
            O painel separa falha detectada, cobertura configurada e evidência ainda ausente.
          </Card.Description>
        </Card.Header>
        <Card.Content className="p-0">
          <div className="divide-y divide-border/60">
            <SignalRow
              icon={Database}
              title="Estrutura da plataforma"
              description={
                snapshot.foundation.expectedPlatformListsPresent
                  ? 'As quatro listas estruturais esperadas pelo núcleo foram localizadas no site institucional.'
                  : `Ausentes: ${snapshot.foundation.missingPlatformLists.join(', ')}.`
              }
              status={snapshot.foundation.status === 'ok' ? 'ok' : 'attention'}
            />
            <SignalRow
              icon={Activity}
              title="Auditoria recente"
              description={
                operational.recentAuditFailureCount === 0
                  ? operational.lastAuditAt
                    ? `Nenhum resultado explicitamente classificado como erro/falha nos eventos carregados. Último evento: ${formatDate(operational.lastAuditAt)}.`
                    : 'Nenhum evento recente foi carregado; não há evidência suficiente para inferir atividade.'
                  : `${operational.recentAuditFailureCount} evento(s) recente(s) possuem resultado explicitamente iniciado por erro ou falha.`
              }
              status={
                operational.lastAuditAt === ''
                  ? 'unknown'
                  : operational.recentAuditFailureCount > 0
                    ? 'attention'
                    : 'ok'
              }
            />
            <SignalRow
              icon={PlugZap}
              title="Contratos de saúde dos sistemas"
              description={healthCoverageDescription}
              status={registeredCount === 0 || operational.healthContractsMissing > 0 ? 'unknown' : 'ok'}
            />
            <SignalRow
              icon={RotateCcw}
              title="Recuperação e restore"
              description="O snapshot atual não contém evidência de teste de restauração. A ausência dessa evidência não é tratada como falha ativa, mas permanece uma lacuna explícita de governança."
              status="unknown"
            />
          </div>
        </Card.Content>
      </Card>

      <Card variant="default" className="mt-5 overflow-hidden">
        <Card.Header className="border-b border-border/60">
          <Card.Title>Cobertura dos sistemas registrados</Card.Title>
          <Card.Description>
            Metadados de integração; nenhum HealthEndpoint é executado pelo navegador ou pelo BFF nesta candidata.
          </Card.Description>
        </Card.Header>
        <Card.Content className="p-0">
          {snapshot.registeredModules.length === 0 ? (
            <EmptyState
              icon={PlugZap}
              title="Nenhum sistema independente registrado"
              description="Quando sistemas forem incorporados ao Centro, a cobertura dos contratos de saúde aparecerá aqui sem transformar configuração em falsa prova de disponibilidade."
            />
          ) : (
            <Table variant="secondary">
              <Table.ScrollContainer>
                <Table.Content aria-label="Cobertura operacional dos sistemas registrados">
                  <Table.Header>
                    <Table.Column id="system">Sistema</Table.Column>
                    <Table.Column id="state">Estado declarado</Table.Column>
                    <Table.Column id="health">HealthEndpoint</Table.Column>
                    <Table.Column id="updated">Atualização</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {snapshot.registeredModules.map((module) => (
                      <Table.Row id={module.id} key={module.id}>
                        <Table.Cell className="font-medium">{module.name}</Table.Cell>
                        <Table.Cell>
                          <Chip variant="soft" size="sm">{module.status || 'sem estado'}</Chip>
                        </Table.Cell>
                        <Table.Cell>
                          {module.healthEndpoint.trim() ? (
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="size-4 text-success" />
                              Configurado
                            </div>
                          ) : (
                            <span className="text-sm text-muted">Não configurado</span>
                          )}
                        </Table.Cell>
                        <Table.Cell className="whitespace-nowrap text-muted">
                          {formatDate(module.updatedAt)}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          )}
        </Card.Content>
      </Card>
    </>
  );
}
