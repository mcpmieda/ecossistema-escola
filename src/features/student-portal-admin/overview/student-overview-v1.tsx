import { useCallback } from 'react';
import { Button, Card, Chip } from '@heroui/react';
import { OperationsScopeV1 } from './operations-scope-v1';
import {
  operationDateV1,
  authorizationLostV1,
  useOperationalReadV1,
  type OperationsPropsV1,
} from './operations-values-v1';
import { settingsScopeKeyV1 } from '../settings/settings-values-v1';
import { AccountsErrorV1 } from '../accounts/accounts-presentation-v1';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
const healthLabels = {
  normal: 'Operando normalmente',
  attention: 'Atenção',
  intervention: 'Intervenção necessária',
} as const;
const countsLabels = {
  accounts: 'Contas',
  active: 'Ativas',
  pendingActivation: 'Aguardando ativação',
  resetRequired: 'Senha a redefinir',
  blocked: 'Bloqueadas',
  unresolved: 'Vínculo não resolvido',
  unlinked: 'Sem vínculo',
  accessEnabled: 'Acesso habilitado',
  accessPermitted: 'Acesso permitido agora',
  validSessions: 'Sessões válidas',
} as const;
export function StudentOverviewV1(props: OperationsPropsV1) {
  return (
    <OperationsScopeV1 {...props}>
      {(scope, label, onAuthorizationLost) => (
        <OverviewBodyV1
          key={props.identityKey + settingsScopeKeyV1(scope) + props.canWrite}
          {...props}
          scope={scope}
          scopeLabel={label}
          onAuthorizationLost={onAuthorizationLost}
        />
      )}
    </OperationsScopeV1>
  );
}
function OverviewBodyV1(props: OperationsPropsV1) {
  const scopeKey = settingsScopeKeyV1(props.scope);
  const load = useCallback(
    async (signal: AbortSignal) => {
      // Health remains separately observable when a business read is unavailable.
      const [overview, health] = await Promise.allSettled([
        props.reader.query(
          { contractVersion: 2, operation: 'overview', scope: props.scope, page: { limit: 100 } },
          signal,
        ),
        props.client.query(
          { contractVersion: 1, operation: 'health', scope: props.scope, page: { limit: 1 } },
          signal,
        ),
      ]);
      signal.throwIfAborted();
      for (const result of [overview, health])
        if (
          result.status === 'rejected' &&
          result.reason instanceof PortalClientErrorV1 &&
          (authorizationLostV1(result.reason) || result.reason.state === 'rate-limited')
        )
          throw result.reason;
      return {
        overview:
          overview.status === 'fulfilled' && overview.value.state === 'overview'
            ? overview.value
            : null,
        health:
          health.status === 'fulfilled' && health.value.state === 'health'
            ? health.value.status
            : null,
      };
    },
    [props.reader, props.client, scopeKey],
  );
  const read = useOperationalReadV1(load, props.onAuthorizationLost);
  const data = read.state.state === 'ready' ? read.state.data : null;
  return (
    <Card className="pa-operations-card">
      <Card.Header>
        <div className="pa-operations-header">
          <div>
            <h2>Visão geral do Portal</h2>
            <p>{props.scopeLabel} · 2026</p>
          </div>
          <Button variant="secondary" isDisabled={!read.canReload} onPress={read.reload}>
            Atualizar visão geral
          </Button>
        </div>
      </Card.Header>
      <Card.Content>
        {read.state.state === 'loading' && <p role="status">Consultando operação…</p>}
        {read.state.state === 'error' && (
          <AccountsErrorV1
            error={read.state.error}
            canReload={read.canReload}
            onReload={read.reload}
          />
        )}
        {data && (
          <>
            <h3>Saúde operacional</h3>
            {data.health ? (
              <Chip
                variant="soft"
                color={
                  data.health === 'normal'
                    ? 'success'
                    : data.health === 'attention'
                      ? 'warning'
                      : 'danger'
                }
              >
                {healthLabels[data.health]}
              </Chip>
            ) : (
              <p role="alert">Saúde indisponível para consulta. Nenhum estado foi presumido.</p>
            )}
            {data.health === 'attention' && (
              <p>
                Há trabalho pendente além da janela esperada. Confira novamente após o
                processamento.
              </p>
            )}
            {data.health === 'intervention' && (
              <p>
                A operação requer investigação administrativa. A liberação de acesso depende das
                verificações próprias.
              </p>
            )}
            {data.overview ? (
              <>
                <p className="pa-operations-muted">
                  Resumo consultado em {operationDateV1(data.overview.observedAt)}.
                </p>
                <dl className="pa-operations-counts">
                  {Object.entries(countsLabels).map(([key, label]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>{data.overview!.counts[key as keyof typeof countsLabels]}</dd>
                    </div>
                  ))}
                </dl>
                {data.overview.counts.accounts === 0 && (
                  <p>Nenhuma conta encontrada neste escopo.</p>
                )}
                <p>
                  As categorias se sobrepõem. Acesso habilitado não garante login; elegibilidade,
                  credencial e calendário continuam sendo verificados.
                </p>
              </>
            ) : (
              <p role="alert">
                Resumo indisponível para este escopo. Os totais não foram substituídos por zero.
                Tente uma turma ou uma conta.
              </p>
            )}
          </>
        )}
      </Card.Content>
    </Card>
  );
}
