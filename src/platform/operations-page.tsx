import { Card, Chip } from '@heroui/react';
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
import type { PlatformSnapshotContract } from '../../shared/platform-contract';
import { LivingSurface } from './ambient';
import { EmptyState, formatDate, PageHeader } from './presentation';

type SignalStatus = 'ok' | 'attention' | 'unknown';

function SignalChip({ status }: { status: SignalStatus }) {
  if (status === 'attention') return <Chip color="danger" variant="soft" size="sm">Atenção</Chip>;
  if (status === 'unknown') return <Chip color="default" variant="tertiary" size="sm">Não verificado</Chip>;
  return <Chip color="success" variant="soft" size="sm">Verificado</Chip>;
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
    <div className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        <div className="hero-glass--quiet mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl">
          <Icon className="size-4 text-accent" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-[-0.015em]">{title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
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
          description="Sinais observáveis do núcleo, degradações detectáveis e evidências disponíveis para a sessão atual."
        />
        <Card variant="secondary" className="hero-data-island rounded-[1.6rem]">
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
  const recoveryVerified = operational.recoveryStatus === 'verified';
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
        description="Sinais observáveis do núcleo e evidências de recuperação aparecem aqui sem transformar configuração em falsa garantia de disponibilidade."
      />

      <LivingSurface className="rounded-[1.8rem] p-7 sm:p-9" parallax>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="hero-kicker">
              {attention ? <TriangleAlert className="size-3.5 text-warning" /> : <HeartPulse className="size-3.5" />}
              Estado observado
            </div>
            <h3 className="hero-gradient-text mt-4 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
              {attention ? 'Há sinais que exigem atenção' : 'Núcleo sem degradação observada'}
            </h3>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              O estado deriva exclusivamente do read model autorizado. Health endpoints configurados e
              recovery testado são evidências distintas e permanecem identificados separadamente.
            </p>
          </div>
          <Chip color={attention ? 'warning' : 'success'} variant="soft" size="sm">
            {attention ? 'Atenção operacional' : 'Estado nominal'}
          </Chip>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Estrutura obrigatória',
              value: snapshot.foundation.expectedPlatformListsPresent ? 'Completa' : 'Incompleta',
              detail: snapshot.foundation.expectedPlatformListsPresent
                ? 'Listas estruturais presentes.'
                : `${snapshot.foundation.missingPlatformLists.length} lista(s) ausente(s).`,
            },
            {
              label: 'Falhas recentes',
              value: operational.recentAuditFailureCount,
              detail: `em ${snapshot.recentAudit.length} evento(s) carregados`,
            },
            {
              label: 'Health contracts',
              value: operational.healthContractsConfigured,
              detail: `${operational.healthContractsMissing} ausente(s)`,
            },
            {
              label: 'Recovery',
              value: recoveryVerified ? 'Verificado' : 'Pendente',
              detail: recoveryVerified ? formatDate(operational.recoveryVerifiedAt) : 'sem evidência registrada',
            },
          ].map((metric) => (
            <div key={metric.label} className="hero-glass--quiet living-card rounded-2xl p-4">
              <p className="text-[0.68rem] font-medium text-muted-foreground">{metric.label}</p>
              <p className="mt-2 text-xl font-semibold tracking-[-0.035em]">{metric.value}</p>
              <p className="mt-1 text-[0.68rem] leading-5 text-muted-foreground">{metric.detail}</p>
            </div>
          ))}
        </div>
      </LivingSurface>

      <Card variant="secondary" className="hero-data-island mt-5 rounded-[1.6rem]">
        <Card.Header className="border-b border-border/70 px-6 py-5">
          <Card.Title className="text-base">Sinais observados</Card.Title>
          <Card.Description>Falha detectada, cobertura configurada e evidência são tratadas separadamente.</Card.Description>
        </Card.Header>
        <Card.Content className="divide-y divide-border/60 p-0">
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
            description={
              recoveryVerified
                ? `Round-trip descartável verificado em ${formatDate(operational.recoveryVerifiedAt)}. Escopo: ${operational.recoveryScope}.`
                : 'O snapshot atual não contém evidência registrada de teste de restauração.'
            }
            status={recoveryVerified ? 'ok' : 'unknown'}
          />
        </Card.Content>
      </Card>

      <Card variant="secondary" className="hero-data-island mt-5 rounded-[1.6rem]">
        <Card.Header className="border-b border-border/70 px-6 py-5">
          <Card.Title className="text-base">Cobertura dos sistemas registrados</Card.Title>
          <Card.Description>
            Metadados de integração; um HealthEndpoint configurado não é apresentado como disponibilidade comprovada.
          </Card.Description>
        </Card.Header>
        <Card.Content className="p-0">
          {snapshot.registeredModules.length === 0 ? (
            <EmptyState
              icon={PlugZap}
              title="Nenhum sistema independente registrado"
              description="Quando sistemas forem incorporados ao Centro, a cobertura dos contratos de saúde aparecerá aqui."
            />
          ) : (
            <div className="hero-table-wrap">
              <table className="hero-table">
                <thead>
                  <tr>
                    <th>Sistema</th>
                    <th>Estado declarado</th>
                    <th>HealthEndpoint</th>
                    <th>Atualização</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.registeredModules.map((module) => (
                    <tr key={module.id}>
                      <td className="font-semibold">{module.name}</td>
                      <td><Chip size="sm" variant="tertiary">{module.status || 'sem estado'}</Chip></td>
                      <td>
                        {module.healthEndpoint.trim() ? (
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="size-4 text-success" />
                            Configurado
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Não configurado</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-muted-foreground">{formatDate(module.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card.Content>
      </Card>
    </>
  );
}
