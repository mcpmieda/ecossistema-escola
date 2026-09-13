import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Chip, Modal, Spinner } from '@heroui/react';
import type { ScopeV1 } from '../../../../shared/student-portal-contracts/core-v1';
import type { PortalAdminClientV1 } from '../shared/admin-client-v1';
import { settingsScopeKeyV1, settingsScopeLabelV1 } from '../settings/settings-values-v1';
import {
  PUBLICATION_CHECKS_V1,
  createPublicationControllerV1,
  initialPublicationViewV1,
  type PublicationMutationV1,
} from './publication-controller-v1';
import {
  PUBLICATION_LABELS_V1,
  disclosureAtV1,
  publicationCommandV1,
  type PublicationCommandV1,
  type PublicationItemV1,
  type PublicationSnapshotV1,
} from './publication-values-v1';
import './student-publication-v1.css';

export interface StudentPublicationPropsV1 {
  client: PortalAdminClientV1;
  scope: ScopeV1;
  canWrite: boolean;
  scopeLabel?: string;
  onOpenSettings?: () => void;
  onOpenHealth?: () => void;
}
const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'medium',
});
const dateLabel = (date: string | null) =>
  date === null ? 'Não definida' : dateFormatter.format(new Date(date));
const revisionLabel = (revision: string | null) =>
  revision === null
    ? 'Nenhuma'
    : revision.startsWith('mixed:')
      ? 'Múltiplas revisões neste escopo'
      : revision;
const operationLabel = (command: PublicationCommandV1) =>
  command.operation === 'unpublish'
    ? 'Retirar publicação'
    : command.operation === 'publish-update'
      ? 'Publicar atualização'
      : 'Publicar período';
function PublicationPeriodV1({
  item,
  data,
  scope,
  canWrite,
  disabled,
  review,
}: {
  item: PublicationItemV1;
  data: PublicationSnapshotV1;
  scope: ScopeV1;
  canWrite: boolean;
  disabled: boolean;
  review: (item: PublicationItemV1, operation: PublicationCommandV1['operation']) => void;
}) {
  const hasData = item.state !== 'no-data' && item.availableRevision !== null;
  const published = item.publishedRevision !== null;
  return (
    <Card className="pa-publication-card">
      <Card.Header>
        <div className="pa-publication-heading">
          <h3>{item.period}</h3>
          <Chip
            size="sm"
            variant="soft"
            color={
              item.state === 'update-pending'
                ? 'warning'
                : item.state === 'published'
                  ? 'success'
                  : 'default'
            }
          >
            {PUBLICATION_LABELS_V1[item.state]}
          </Chip>
        </div>
      </Card.Header>
      <Card.Content>
        <dl className="pa-publication-details">
          <div>
            <dt>Revisão disponível</dt>
            <dd>{revisionLabel(item.availableRevision)}</dd>
          </div>
          <div>
            <dt>Revisão publicada</dt>
            <dd>{revisionLabel(item.publishedRevision)}</dd>
          </div>
          <div>
            <dt>Divulgação configurada (São Paulo)</dt>
            <dd>{dateLabel(disclosureAtV1(data.settings, item.period))}</dd>
          </div>
          <div>
            <dt>Permitido na configuração deste escopo</dt>
            <dd>{data.settings.value.allowedPeriods.includes(item.period) ? 'Sim' : 'Não'}</dd>
          </div>
        </dl>
        {item.state === 'no-data' ? (
          <p>A consulta não informa dados disponíveis para publicar neste período.</p>
        ) : null}
        {item.state === 'update-pending' ? (
          <p>
            A consulta informa uma atualização pendente; isso não confirma a conclusão de um
            processamento.
          </p>
        ) : null}
      </Card.Content>
      {canWrite ? (
        <Card.Footer className="pa-publication-actions">
          {hasData && (!published || scope.kind !== 'account') ? (
            <Button
              size="sm"
              variant={published ? 'secondary' : 'primary'}
              isDisabled={disabled}
              aria-label={`Publicar ${item.period}`}
              onPress={() => review(item, 'publish')}
            >
              {published ? 'Publicar no escopo' : 'Publicar'}
            </Button>
          ) : null}
          {hasData && published && item.state === 'update-pending' ? (
            <Button
              size="sm"
              isDisabled={disabled}
              aria-label={`Publicar atualização de ${item.period}`}
              onPress={() => review(item, 'publish-update')}
            >
              Publicar atualização
            </Button>
          ) : null}
          {published ? (
            <Button
              size="sm"
              variant="danger-soft"
              isDisabled={disabled}
              aria-label={`Retirar publicação de ${item.period}`}
              onPress={() => review(item, 'unpublish')}
            >
              Retirar publicação
            </Button>
          ) : null}
        </Card.Footer>
      ) : null}
    </Card>
  );
}
function PublicationFeedbackV1({
  mutation,
  scope,
  onCancel,
  onRetry,
  reload,
  onOpenHealth,
  clock,
  reloadDisabled,
}: {
  mutation: PublicationMutationV1;
  scope: ScopeV1;
  onCancel: () => void;
  onRetry: () => void;
  reload: () => void;
  onOpenHealth?: () => void;
  clock: number;
  reloadDisabled: boolean;
}) {
  if (mutation.state === 'idle') return null;
  if (mutation.state === 'sending')
    return (
      <p role="status">
        Enviando decisão de {mutation.command.period}. Aguarde a confirmação do servidor.
      </p>
    );
  if (mutation.state === 'error')
    return (
      <div role="alert" className="pa-publication-error">
        <p>
          {mutation.error.state === 'conflict'
            ? 'A fonte, o escopo ou a configuração mudou. Recarregue e revise uma nova decisão; a revisão não será substituída automaticamente.'
            : mutation.error.state === 'unauthenticated'
              ? 'Sessão expirada. Entre novamente no ADM.'
              : mutation.error.state === 'forbidden'
                ? 'A operação não foi autorizada neste escopo. Recarregue para conferir o estado atual.'
                : mutation.retryable
                  ? 'O resultado da decisão não foi confirmado. Repetir mantém a mesma revisão e a mesma operação.'
                  : 'Não foi possível validar a decisão. Recarregue o estado e revise antes de tentar novamente.'}
        </p>
        <div className="pa-publication-actions">
          {mutation.retryable ? (
            <Button
              size="sm"
              variant="secondary"
              isDisabled={clock < mutation.retryAt}
              onPress={onRetry}
            >
              Repetir a mesma decisão
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" isDisabled={reloadDisabled} onPress={reload}>
            Recarregar estado
          </Button>
        </div>
      </div>
    );
  const removed = mutation.command.operation === 'unpublish';
  return (
    <div role="status" className="pa-publication-feedback">
      <p>
        <strong>Decisão de {mutation.command.period} aceita pelo servidor.</strong>
      </p>
      {mutation.observation === 'observing' ? (
        <>
          <p>
            {removed
              ? 'Conferindo a retirada na leitura atual.'
              : 'A publicação é processada em segundo plano. O aceite ainda não comprova a materialização.'}
          </p>
          <p>
            Consultas de acompanhamento: {mutation.checks} de até {PUBLICATION_CHECKS_V1}.
          </p>
          <Button size="sm" variant="outline" onPress={onCancel}>
            Parar acompanhamento
          </Button>
        </>
      ) : mutation.observation === 'confirmed' ? (
        <p>
          {removed
            ? 'A consulta atual confirma que este aluno não tem revisão publicada nesse período.'
            : 'A consulta atual deste aluno confirma a revisão aprovada como publicada.'}
        </p>
      ) : mutation.observation === 'reported' ? (
        <>
          <p>
            {removed
              ? 'A consulta agregada não apresenta revisão publicada nesse período.'
              : 'A revisão aprovada já aparece na consulta agregada.'}
          </p>
          {!removed ? (
            <p>
              A consulta de {scope.kind === 'school' ? 'escola' : 'turma'} não informa quantos
              alunos concluíram. Confira a ficha de cada aluno quando precisar dessa confirmação.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p>
            {mutation.observation === 'stopped'
              ? 'Acompanhamento parado. Isso não cancela a decisão aceita nem o processamento no servidor.'
              : 'O acompanhamento terminou sem comprovar o resultado. Não é possível distinguir espera, mudança de configuração ou falha da fila por esta consulta.'}
          </p>
          <div className="pa-publication-actions">
            <Button size="sm" variant="secondary" isDisabled={reloadDisabled} onPress={reload}>
              Consultar estado atual
            </Button>
            {onOpenHealth ? (
              <Button size="sm" variant="ghost" onPress={onOpenHealth}>
                Ver saúde operacional
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
function PublicationReviewV1({
  command,
  label,
  busy,
  onClose,
  onConfirm,
}: {
  command: PublicationCommandV1;
  label: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal.Backdrop
      isOpen
      isDismissable={!busy}
      isKeyboardDismissDisabled={busy}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Modal.Container size="lg" scroll="inside">
        <Modal.Dialog>
          <Modal.Header>
            <Modal.Heading>{operationLabel(command)}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="pa-publication-review">
            <p>
              <strong>{command.period}</strong> em {label}.
            </p>
            {'targetDataVersion' in command ? (
              <p>
                Revisão dos dados aprovada: <strong>{command.targetDataVersion}</strong>.
              </p>
            ) : null}
            {command.operation === 'unpublish' ? (
              <p>
                A retirada remove imediatamente os dados publicados deste período. Ela pode retirar
                também o resultado final da projeção. O histórico acadêmico e os demais períodos são
                preservados.
              </p>
            ) : (
              <>
                <p>
                  A decisão autoriza somente a revisão exibida. Se a fonte mudar, será necessário
                  recarregar e revisar novamente.
                </p>
                {command.operation === 'publish' && command.scope.kind !== 'account' ? (
                  <p>
                    Publicar neste escopo abrange seus vínculos elegíveis, incluindo os ainda não
                    publicados. A consulta agregada não informa uma contagem de conclusão.
                  </p>
                ) : null}
                <p>
                  O processamento depende do calendário e das configurações vigentes em cada aluno.
                  Uma data futura ou ausente pode manter a materialização pendente. Aceite não
                  significa que os dados já estejam disponíveis ao aluno.
                </p>
              </>
            )}
          </Modal.Body>
          <Modal.Footer className="pa-publication-actions">
            <Button variant="ghost" isDisabled={busy} onPress={onClose}>
              Voltar
            </Button>
            <Button
              variant={command.operation === 'unpublish' ? 'danger' : 'primary'}
              isPending={busy}
              isDisabled={busy}
              onPress={onConfirm}
            >
              {command.operation === 'unpublish' ? 'Confirmar retirada' : 'Confirmar publicação'}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
function PublicationScopeV1({
  client,
  scope,
  canWrite,
  scopeLabel,
  onOpenSettings,
  onOpenHealth,
}: StudentPublicationPropsV1) {
  const [fixedScope] = useState(() => structuredClone(scope));
  const [view, setView] = useState(initialPublicationViewV1);
  const [review, setReview] = useState<PublicationCommandV1 | null>(null);
  const [notice, setNotice] = useState<string | null>(null),
    [clock, setClock] = useState(Date.now);
  const controller = useMemo(
    () => createPublicationControllerV1(client, fixedScope, setView),
    [client, fixedScope],
  );
  const label = scopeLabel ?? settingsScopeLabelV1(fixedScope);
  const data = view.load.state === 'ready' ? view.load.data : null;
  const retryAt = Math.max(
    view.readRetryAt,
    view.mutation.state === 'error' ? view.mutation.retryAt : 0,
  );
  useEffect(() => {
    void controller.load();
    return () => controller.reset();
  }, [controller]);
  useEffect(() => {
    if (view.mutation.state === 'error' || view.mutation.state === 'accepted') setReview(null);
  }, [view.mutation.state]);
  useEffect(() => {
    if (view.mutation.state !== 'error' && view.load.state !== 'error') return;
    setClock(Date.now());
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [view.mutation, view.load.state, retryAt]);
  const busy =
    view.mutation.state === 'sending' ||
    (view.mutation.state === 'accepted' && view.mutation.observation === 'observing');
  const reload = () => {
    setReview(null);
    setNotice(null);
    void controller.load();
  };
  function prepare(item: PublicationItemV1, operation: PublicationCommandV1['operation']) {
    if (!canWrite || busy || view.refreshing) return;
    try {
      setNotice(null);
      setReview(publicationCommandV1(fixedScope, item, operation, crypto.randomUUID()));
    } catch {
      setNotice('Não foi possível preparar a decisão com os dados atuais. Recarregue o estado.');
    }
  }
  async function confirm() {
    if (!canWrite || !review || busy) return;
    try {
      await controller.submit(review);
    } catch {
      setReview(null);
      setNotice('Não foi possível preparar a decisão. Recarregue o estado e revise novamente.');
    }
  }
  return (
    <section className="pa-publication" aria-label="Publicação de períodos do Portal do Aluno">
      <header className="pa-publication-heading">
        <div>
          <h2>Publicação de períodos</h2>
          <p>{label}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          isDisabled={busy || review !== null || view.refreshing || clock < retryAt}
          onPress={reload}
        >
          Recarregar publicação
        </Button>
      </header>
      <p>
        Importar notas e publicar são operações separadas. Cada período mantém sua própria decisão;
        as revisões abaixo vêm da consulta do servidor.
      </p>
      {fixedScope.kind !== 'account' ? (
        <p className="pa-publication-hint">
          Os estados deste escopo são agregados. “Publicado” pode representar parte dos alunos; não
          é uma contagem de conclusão.
        </p>
      ) : null}
      {notice ? (
        <p role="alert" className="pa-publication-error">
          {notice}
        </p>
      ) : null}
      <PublicationFeedbackV1
        mutation={view.mutation}
        scope={fixedScope}
        onCancel={() => controller.cancelObservation()}
        onRetry={() => void controller.retry()}
        reload={reload}
        onOpenHealth={onOpenHealth}
        clock={clock}
        reloadDisabled={clock < retryAt}
      />
      {view.load.state === 'loading' ? (
        <p role="status" className="pa-publication-loading">
          <Spinner size="sm" />
          Carregando publicação e configurações
        </p>
      ) : null}
      {view.load.state === 'error' ? (
        <div role="alert" className="pa-publication-error">
          <p>
            {view.load.error.state === 'unauthenticated'
              ? 'Sessão expirada. Entre novamente no ADM.'
              : view.load.error.state === 'forbidden'
                ? 'Sem permissão para consultar este escopo.'
                : 'Consulta indisponível. Nenhum estado de publicação será inferido.'}
          </p>
          <Button
            size="sm"
            variant="secondary"
            isDisabled={busy || clock < retryAt}
            onPress={reload}
          >
            Tentar carregar novamente
          </Button>
        </div>
      ) : null}
      {data ? (
        <>
          <Card className="pa-publication-policy">
            <Card.Header>
              <h3>Configuração efetiva do escopo</h3>
            </Card.Header>
            <Card.Content>
              <dl className="pa-publication-details">
                <div>
                  <dt>Atualização automática</dt>
                  <dd>
                    {data.settings.value.autoUpdate
                      ? 'Ligada: afeta somente períodos já publicados.'
                      : 'Desligada: mantém a revisão anterior até uma nova decisão.'}
                  </dd>
                </div>
                <div>
                  <dt>Notas exibidas</dt>
                  <dd>
                    {data.settings.value.showPartials ? 'Finais e parciais' : 'Somente finais'}
                  </dd>
                </div>
                <div>
                  <dt>Divulgação de resultado final</dt>
                  <dd>
                    {data.settings.value.showFinalResult
                      ? 'Ligada, sujeita à data e à fonte oficial.'
                      : 'Desligada'}
                  </dd>
                </div>
                <div>
                  <dt>Data do resultado final (São Paulo)</dt>
                  <dd>{dateLabel(data.settings.value.calendar.finalDisclosureAt)}</dd>
                </div>
              </dl>
              <p>
                Configurações próprias dos alunos podem prevalecer. Datas e permissão de período não
                comprovam publicação nem substituem a autorização de acesso.
              </p>
            </Card.Content>
            {onOpenSettings ? (
              <Card.Footer>
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={busy || review !== null}
                  onPress={onOpenSettings}
                >
                  Ver configurações
                </Button>
              </Card.Footer>
            ) : null}
          </Card>
          {view.refreshing ? <p role="status">Atualizando consulta do servidor</p> : null}
          <div className="pa-publication-periods">
            {data.items.map((item) => (
              <PublicationPeriodV1
                key={item.period}
                item={item}
                data={data}
                scope={fixedScope}
                canWrite={canWrite}
                disabled={
                  busy || view.refreshing || review !== null || view.mutation.state === 'error'
                }
                review={prepare}
              />
            ))}
          </div>
        </>
      ) : null}
      {review && canWrite ? (
        <PublicationReviewV1
          command={review}
          label={label}
          busy={view.mutation.state === 'sending'}
          onClose={() => setReview(null)}
          onConfirm={() => void confirm()}
        />
      ) : null}
    </section>
  );
}
/** Scope or authorization changes discard the preceding identity's drafts before paint. */
export function StudentPublicationV1(props: StudentPublicationPropsV1) {
  return (
    <PublicationScopeV1
      key={settingsScopeKeyV1(props.scope) + ':' + String(props.canWrite)}
      {...props}
    />
  );
}
