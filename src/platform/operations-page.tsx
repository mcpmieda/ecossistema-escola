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
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { PlatformSnapshotContract } from '../../shared/platform-contract';
import { EmptyState, formatDate, PageHeader } from './presentation';

type SignalStatus = 'ok' | 'attention' | 'unknown';

function SignalBadge({ status }: { status: SignalStatus }) {
  if (status === 'attention') return <Badge variant="destructive">Atenção</Badge>;
  if (status === 'unknown') return <Badge variant="secondary">Não verificado</Badge>;
  return <Badge variant="outline">Sem sinal de falha</Badge>;
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
    <div className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-surface-secondary sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-2xl border border-border bg-surface-secondary">
          <Icon className="size-4 text-muted" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
        </div>
      </div>
      <SignalBadge status={status} />
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
        <Card>
          <EmptyState
            icon={HeartPulse}
            title="Sinais operacionais não disponíveis"
            description="A sessão atual não recebeu a capability necessária para consultar os sinais operacionais desta área."
          />
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

      <Card className={attention ? 'border-danger/30' : ''}>
        <CardHeader>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            {attention ? (
              <TriangleAlert className="size-4 text-danger" />
            ) : (
              <HeartPulse className="size-4 text-success" />
            )}
            Estado observado
          </div>
          <CardTitle className="text-2xl tracking-tight">
            {attention ? 'Há sinais que exigem atenção' : 'Sem degradação observada no snapshot'}
          </CardTitle>
          <CardDescription className="max-w-3xl leading-6">
            Este estado é derivado somente de evidências disponíveis no read model autorizado. Ele
            não substitui monitoramento ativo de serviços externos nem prova recuperação testada.
          </CardDescription>
          <CardAction>
            <Badge variant={attention ? 'destructive' : 'outline'}>
              {attention ? 'Atenção' : 'Nominal'}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface-secondary p-4">
            <p className="text-xs text-muted">Estrutura obrigatória</p>
            <p className="mt-2 text-lg font-semibold">
              {snapshot.foundation.expectedPlatformListsPresent ? 'Completa' : 'Incompleta'}
            </p>
            <p className="mt-1 text-xs text-muted">
              {snapshot.foundation.expectedPlatformListsPresent
                ? 'Todas as listas estruturais foram encontradas.'
                : `${snapshot.foundation.missingPlatformLists.length} lista(s) obrigatória(s) ausente(s).`}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-secondary p-4">
            <p className="text-xs text-muted">Falhas na auditoria recente</p>
            <p className="mt-2 text-lg font-semibold">{operational.recentAuditFailureCount}</p>
            <p className="mt-1 text-xs text-muted">
              Entre os {snapshot.recentAudit.length} eventos recentes carregados.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-secondary p-4">
            <p className="text-xs text-muted">Contratos de health check</p>
            <p className="mt-2 text-lg font-semibold">{operational.healthContractsConfigured}</p>
            <p className="mt-1 text-xs text-muted">
              {registeredCount === 0
                ? 'Nenhum sistema independente registrado.'
                : `${operational.healthContractsMissing} sistema(s) sem contrato configurado.`}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-5 gap-0 overflow-hidden py-0">
        <CardHeader className="border-b border-border/70 py-4">
          <CardTitle>Sinais observados</CardTitle>
          <CardDescription>
            O painel separa falha detectada, cobertura configurada e evidência ainda ausente.
          </CardDescription>
        </CardHeader>
        <div className="divide-y divide-border/70">
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
            status={
              registeredCount === 0 || operational.healthContractsMissing > 0 ? 'unknown' : 'ok'
            }
          />
          <SignalRow
            icon={RotateCcw}
            title="Recuperação e restore"
            description="O snapshot atual não contém evidência de teste de restauração. A ausência dessa evidência não é tratada como falha ativa, mas permanece uma lacuna explícita de governança."
            status="unknown"
          />
        </div>
      </Card>

      <Card className="mt-5 gap-0 overflow-hidden py-0">
        <CardHeader className="border-b border-border/70 py-4">
          <CardTitle>Cobertura dos sistemas registrados</CardTitle>
          <CardDescription>
            Metadados de integração; nenhum HealthEndpoint é executado pelo navegador ou pelo BFF
            nesta candidata.
          </CardDescription>
        </CardHeader>
        {snapshot.registeredModules.length === 0 ? (
          <EmptyState
            icon={PlugZap}
            title="Nenhum sistema independente registrado"
            description="Quando sistemas forem incorporados ao Centro, a cobertura dos contratos de saúde aparecerá aqui sem transformar configuração em falsa prova de disponibilidade."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sistema</TableHead>
                  <TableHead>Estado declarado</TableHead>
                  <TableHead>HealthEndpoint</TableHead>
                  <TableHead>Atualização</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshot.registeredModules.map((module) => (
                  <TableRow key={module.id}>
                    <TableCell className="font-medium">{module.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{module.status || 'sem estado'}</Badge>
                    </TableCell>
                    <TableCell>
                      {module.healthEndpoint.trim() ? (
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="size-4 text-success" />
                          Configurado
                        </div>
                      ) : (
                        <span className="text-sm text-muted">Não configurado</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted">
                      {formatDate(module.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </>
  );
}
