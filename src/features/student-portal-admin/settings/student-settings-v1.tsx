import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Chip, Modal, Spinner } from '@heroui/react';
import type { EffectiveSettingsV1 } from '../../../../shared/student-portal-contracts/policy-v1';
import type { ScopeV1 } from '../../../../shared/student-portal-contracts/core-v1';
import type { PortalAdminClientV1 } from '../shared/admin-client-v1';
import {
  createLatestPortalRequestV1,
  type PortalLoadStateV1,
} from '../../student-portal/shared/latest-request-v1';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import { SettingsEditorV1, SettingsValueSummaryV1 } from './settings-editors-v1';
import { parseSettingsDraftV1, settingsDraftV1 } from './settings-draft-v1';
import { createSettingsMutationV1, type SettingsMutationStateV1 } from './settings-mutation-v1';
import {
  CALENDAR_LABELS_V1,
  SETTINGS_LABELS_V1,
  changedPastDatesV1,
  ownsSettingV1,
  settingsScopeKeyV1,
  settingsScopeLabelV1,
  type SettingsFieldV1,
} from './settings-values-v1';
import { LinkClosureV1 } from './link-closure-v1';
import './student-settings-v1.css';

type ReviewIntentV1 =
  | { field: SettingsFieldV1; inherit: true }
  | { field: SettingsFieldV1; inherit: false; value: ReturnType<typeof parseSettingsDraftV1> };
type ReviewV1 = ReviewIntentV1 & { expectedVersion: number };
export interface StudentSettingsPropsV1 {
  client: PortalAdminClientV1;
  scope: ScopeV1;
  canWrite: boolean;
  scopeLabel?: string;
  describeScope?: (scope: ScopeV1) => string;
  onCommitted?: () => void;
}
const fieldHelp: Record<SettingsFieldV1, string> = {
  accessEnabled:
    'Permite acesso apenas a contas elegíveis, com credencial e calendário válidos. População de perfis, vínculos e manutenção têm controles próprios.',
  showPartials: 'Exibe as avaliações e atividades já publicadas, além da nota final do trimestre.',
  autoUpdate: 'Permite atualizar projeções de períodos já publicados quando a fonte oficial muda.',
  showFinalResult:
    'O padrão é desligado. A divulgação também depende da data própria e de resultado autorizado pela fonte oficial.',
  allowedPeriods:
    'Uma lista vazia impede todos os períodos neste escopo; ela não significa herdar.',
  risk: 'Os limites de sessão e proteção são uma configuração única. A sessão curta não pode exceder a persistente; a verificação deve começar antes do bloqueio.',
  calendar:
    'O calendário é herdado ou definido como um objeto completo. Datas vazias limitam somente a operação que depende delas.',
};
function FieldCardV1({
  field,
  settings,
  disabled,
  canWrite,
  sourceLabel,
  review,
}: {
  field: SettingsFieldV1;
  settings: EffectiveSettingsV1;
  disabled: boolean;
  canWrite: boolean;
  sourceLabel: string;
  review: (review: ReviewIntentV1) => void;
}) {
  const [draft, setDraft] = useState(() => settingsDraftV1(field, settings.value));
  const [error, setError] = useState<string | null>(null);
  const owns = ownsSettingV1(settings, field);
  function prepare() {
    try {
      const value = parseSettingsDraftV1(field, draft);
      setError(null);
      review({ field, inherit: false, value });
    } catch {
      setError('Confira os valores, os limites e a ordem das datas antes de salvar.');
    }
  }
  return (
    <Card className="pa-settings-card">
      <Card.Header>
        <div className="pa-settings-card-heading">
          <h3>{SETTINGS_LABELS_V1[field]}</h3>
          <Chip size="sm" variant="soft">
            {owns
              ? settings.scope.kind === 'school'
                ? 'Padrão da escola'
                : 'Definido aqui'
              : 'Herdado'}
          </Chip>
        </div>
        <p className="pa-settings-origin">Origem: {sourceLabel}</p>
        <p>{fieldHelp[field]}</p>
      </Card.Header>
      <Card.Content>
        {canWrite ? (
          <SettingsEditorV1
            field={field}
            value={draft}
            disabled={disabled}
            onChange={(value) => {
              setDraft(value);
              setError(null);
            }}
          />
        ) : (
          <SettingsValueSummaryV1 field={field} value={settings.value[field]} />
        )}
        {error ? (
          <p className="pa-settings-error" role="alert">
            {error}
          </p>
        ) : null}
      </Card.Content>
      {canWrite ? (
        <Card.Footer className="pa-settings-actions">
          <Button
            size="sm"
            variant="secondary"
            isDisabled={disabled}
            onPress={prepare}
            aria-label={`Revisar ${SETTINGS_LABELS_V1[field]}`}
          >
            {owns ? 'Revisar alteração' : 'Definir neste escopo'}
          </Button>
          {settings.scope.kind !== 'school' && owns ? (
            <Button
              size="sm"
              variant="ghost"
              isDisabled={disabled}
              onPress={() => review({ field, inherit: true })}
              aria-label={`Restaurar herança de ${SETTINGS_LABELS_V1[field]}`}
            >
              Restaurar herança
            </Button>
          ) : null}
        </Card.Footer>
      ) : null}
    </Card>
  );
}
function ReviewDialogV1({
  review,
  settings,
  scopeLabel,
  disabled,
  close,
  confirm,
}: {
  review: ReviewV1;
  settings: EffectiveSettingsV1;
  scopeLabel: string;
  disabled: boolean;
  close: () => void;
  confirm: () => void;
}) {
  const next = review.inherit ? null : review.value[review.field];
  const past =
    !review.inherit && review.field === 'calendar' && review.value.calendar
      ? changedPastDatesV1(settings.value.calendar, review.value.calendar, Date.now())
      : [];
  return (
    <Modal.Backdrop
      isOpen
      isDismissable={!disabled}
      isKeyboardDismissDisabled={disabled}
      onOpenChange={(open) => {
        if (!open && !disabled) close();
      }}
    >
      <Modal.Container size="lg" scroll="inside">
        <Modal.Dialog>
          <Modal.Header>
            <Modal.Heading>
              {review.inherit ? 'Restaurar herança' : 'Confirmar alteração'}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="pa-settings-review">
            <p>
              <strong>{SETTINGS_LABELS_V1[review.field]}</strong> em {scopeLabel}.
            </p>
            {review.inherit ? (
              <p>
                O valor próprio será removido. Este campo passará a usar a configuração vigente do
                escopo superior, inclusive futuros ajustes dele.
              </p>
            ) : (
              <>
                <p>Será salvo um valor próprio neste escopo:</p>
                <SettingsValueSummaryV1 field={review.field} value={next!} />
              </>
            )}
            <p>
              A mudança pode ter efeito imediato no acesso ou na visibilidade das notas. As
              permissões e datas vigentes continuam sendo verificadas pelo servidor.
            </p>
            {past.length ? (
              <div className="pa-settings-warning">
                <p>Há mudança ou remoção de datas que já chegaram:</p>
                <ul>
                  {past.map((key) => (
                    <li key={key}>
                      {key in CALENDAR_LABELS_V1
                        ? CALENDAR_LABELS_V1[key as keyof typeof CALENDAR_LABELS_V1]
                        : key === 'disclosure'
                          ? 'Data única de divulgação'
                          : `Divulgação de ${key.slice('disclosure.'.length)}`}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {review.field === 'calendar' || review.field === 'autoUpdate' ? (
              <p>
                Agendamentos obsoletos serão invalidados. Publicações confirmadas e revogações não
                são desfeitas por esta alteração.
              </p>
            ) : null}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="ghost" isDisabled={disabled} onPress={close}>
              Voltar
            </Button>
            <Button isDisabled={disabled} isPending={disabled} onPress={confirm}>
              {review.inherit ? 'Confirmar herança' : 'Confirmar alteração'}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
function SettingsScopeV1({
  client,
  scope,
  canWrite,
  scopeLabel,
  describeScope,
  onCommitted,
}: StudentSettingsPropsV1) {
  const [fixedScope] = useState(() => ({ ...scope }));
  const [load, setLoad] = useState<PortalLoadStateV1<EffectiveSettingsV1>>({ state: 'idle' });
  const [mutation, setMutation] = useState<SettingsMutationStateV1>({ state: 'idle' });
  const [review, setReview] = useState<ReviewV1 | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [clock, setClock] = useState(Date.now);
  const request = useMemo(() => createLatestPortalRequestV1<EffectiveSettingsV1>(setLoad), []);
  const writer = useMemo(() => createSettingsMutationV1(client, setMutation), [client]);
  const label = scopeLabel ?? settingsScopeLabelV1(fixedScope);
  const reload = useCallback(
    () =>
      request.run(async (signal) => {
        const result = await client.query(
          { contractVersion: 1, operation: 'settings', scope: fixedScope, page: { limit: 50 } },
          signal,
        );
        if (
          result.state !== 'settings' ||
          settingsScopeKeyV1(result.settings.scope) !== settingsScopeKeyV1(fixedScope)
        )
          throw new PortalClientErrorV1('invalid-response');
        return result.settings;
      }),
    [client, fixedScope, request],
  );
  useEffect(() => {
    void reload();
    return () => request.clear();
  }, [reload, request]);
  useEffect(() => () => writer.clear(), [writer]);
  useEffect(() => {
    if (load.state !== 'ready') setReview(null);
  }, [load.state]);
  useEffect(() => {
    if (mutation.state !== 'error') return;
    setReview(null);
    if (mutation.error.state === 'unauthenticated' || mutation.error.state === 'forbidden') {
      request.clear();
      setLoad({ state: 'error', error: mutation.error });
    }
  }, [mutation, request]);
  useEffect(() => {
    if (mutation.state !== 'committed') return;
    setReview(null);
    setNotice('Configuração salva. Confira o estado atualizado abaixo.');
    writer.clear();
    void reload();
    onCommitted?.();
  }, [mutation, onCommitted, reload, writer]);
  useEffect(() => {
    if (mutation.state !== 'error' || !mutation.retryable) return;
    setClock(Date.now());
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [mutation]);
  useEffect(() => {
    if (!canWrite) {
      writer.clear();
      setReview(null);
    }
  }, [canWrite, writer]);
  const busy = mutation.state === 'pending' || closing;
  const discardAndReload = useCallback(() => {
    writer.clear();
    setReview(null);
    setNotice(null);
    void reload();
  }, [reload, writer]);
  const linksClosed = useCallback(() => {
    setNotice('Vínculos de 2026 encerrados. O histórico foi preservado.');
    void reload();
    onCommitted?.();
  }, [onCommitted, reload]);
  async function confirm() {
    if (!canWrite || busy || !review || load.state !== 'ready') return;
    const common = {
      contractVersion: 1 as const,
      scope: fixedScope,
      expectedVersion: review.expectedVersion,
      idempotencyKey: crypto.randomUUID(),
    };
    try {
      await writer.submit(
        review.inherit
          ? { ...common, operation: 'settings-inherit', keys: [review.field] }
          : {
              ...common,
              operation: 'settings-set',
              value: review.value,
              acknowledgeImmediateEffect: true,
            },
      );
    } catch {
      setNotice('Não foi possível preparar a alteração. Recarregue e revise os valores.');
    }
  }
  const sourceLabel = (source: ScopeV1) =>
    settingsScopeKeyV1(source) === settingsScopeKeyV1(fixedScope)
      ? label
      : (describeScope?.(source) ?? settingsScopeLabelV1(source));
  return (
    <section className="pa-settings" aria-label="Configurações do Portal do Aluno">
      <header className="pa-settings-heading">
        <div>
          <h2>Configurações do Portal</h2>
          <p>{label}</p>
        </div>
        <Button size="sm" variant="outline" isDisabled={busy} onPress={discardAndReload}>
          Descartar edições e recarregar
        </Button>
      </header>
      <p>
        As configurações seguem escola → turma → aluno. Cada campo mostra sua origem; salvar no
        escopo atual cria ou altera um valor próprio.
      </p>
      {notice ? <p role="status">{notice}</p> : null}
      {load.state === 'idle' || load.state === 'loading' ? (
        <div role="status" className="pa-settings-loading">
          <Spinner size="sm" />
          Carregando configurações
        </div>
      ) : load.state === 'error' ? (
        <div role="alert" className="pa-settings-error">
          <p>
            {load.error.state === 'unauthenticated'
              ? 'Sessão expirada. Entre novamente no ADM.'
              : load.error.state === 'forbidden'
                ? 'Sem permissão para consultar este escopo.'
                : 'Configuração indisponível. Não é possível editar sem uma política válida do servidor.'}
          </p>
          <Button size="sm" variant="secondary" onPress={() => void reload()}>
            Tentar carregar novamente
          </Button>
        </div>
      ) : load.state === 'ready' ? (
        <>
          {mutation.state === 'error' ? (
            <div className="pa-settings-error" role="alert">
              <p>
                {mutation.error.state === 'conflict'
                  ? 'A configuração mudou em outra operação. Recarregue e revise antes de salvar novamente.'
                  : mutation.error.state === 'unauthenticated' ||
                      mutation.error.state === 'forbidden'
                    ? 'A operação não foi autorizada. Recarregue sua sessão e permissões.'
                    : 'Não foi possível confirmar o resultado da operação. Tente a mesma operação novamente ou recarregue o estado antes de uma nova alteração.'}
              </p>
              {mutation.retryable && canWrite ? (
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={clock < mutation.retryAt}
                  onPress={() => void writer.retry()}
                >
                  Repetir a mesma operação
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onPress={discardAndReload}>
                Recarregar estado
              </Button>
            </div>
          ) : null}
          <div className="pa-settings-fields">
            {(Object.keys(SETTINGS_LABELS_V1) as SettingsFieldV1[]).map((field) => (
              <FieldCardV1
                key={`${load.data.version}:${field}`}
                field={field}
                settings={load.data}
                canWrite={canWrite}
                disabled={busy || mutation.state === 'error' || review !== null}
                sourceLabel={sourceLabel(load.data.sources[field])}
                review={(intent) => setReview({ ...intent, expectedVersion: load.data.version })}
              />
            ))}
          </div>
          {fixedScope.kind === 'school' && canWrite ? (
            <LinkClosureV1
              key={load.data.version}
              client={client}
              disabled={
                mutation.state === 'pending' || review !== null || mutation.state === 'error'
              }
              onClosed={linksClosed}
              onBusyChange={setClosing}
            />
          ) : null}
          {review && canWrite ? (
            <ReviewDialogV1
              review={review}
              settings={load.data}
              scopeLabel={label}
              disabled={busy}
              close={() => setReview(null)}
              confirm={() => void confirm()}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
/** The scope key remounts before paint: stale data/drafts/previews cannot flash in a new scope. */
export function StudentSettingsV1(props: StudentSettingsPropsV1) {
  return <SettingsScopeV1 key={settingsScopeKeyV1(props.scope)} {...props} />;
}
