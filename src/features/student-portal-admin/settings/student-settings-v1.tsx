import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Chip, Modal, Spinner } from '@heroui/react';
import type { EffectiveSettingsV1 } from '../../../../shared/student-portal-contracts/policy-v1';
import type { ScopeV1 } from '../../../../shared/student-portal-contracts/core-v1';
import type { PortalAdminClientV1 } from '../shared/admin-client-v1';
import {
  createLatestPortalRequestV1,
  type PortalLoadStateV1,
} from '../../student-portal/shared/latest-request-v1';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import { CustomizedSettingsV1 } from './customized-settings-v1';
import type { PortalAdminReadClientV2 } from '../accounts/accounts-client-v2';
import { InfoV1 } from '../shared/info-v1';
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
import { useDraftNavigationGuardV1 } from '../../../shared/forms/draft-navigation-v1';
import { LinkClosureV1 } from './link-closure-v1';
import { LiveReadNoticeV1 } from '../../../shared/live-data/live-read-notice-v1';
import { useLiveRefreshV1 } from '../../../shared/live-data/use-live-refresh-v1';
import './student-settings-v1.css';

type ReviewIntentV1 =
  | { field: SettingsFieldV1; inherit: true }
  | { field: SettingsFieldV1; inherit: false; value: ReturnType<typeof parseSettingsDraftV1> };
type ReviewV1 = ReviewIntentV1 & { expectedVersion: number };
export interface StudentSettingsPropsV1 {
  client: PortalAdminClientV1;
  reader?: PortalAdminReadClientV2;
  scope: ScopeV1;
  canWrite: boolean;
  scopeLabel?: string;
  describeScope?: (scope: ScopeV1) => string;
  onCommitted?: () => void;
}
const fieldHelp: Record<SettingsFieldV1, string> = {
  accessEnabled:
    'Liga ou desliga o acesso ao Portal. O aluno também precisa de cadastro, senha ou QR e de estar no período de acesso.',
  showPartials: 'Exibe as avaliações e atividades já publicadas, além da nota final do trimestre.',
  autoUpdate:
    'Atualiza as notas já liberadas quando o Banco recebe uma alteração. Não libera novos períodos por conta própria.',
  showFinalResult:
    'Mostra o resultado final autorizado pela escola, a partir da data de divulgação configurada.',
  allowedPeriods:
    'Escolha os períodos que podem aparecer. Desmarcar todos oculta as notas; Usar padrão recupera a escolha da escola ou turma.',
  risk: 'Os limites de sessão e proteção são uma configuração única. A sessão curta não pode exceder a persistente; a verificação deve começar antes do bloqueio.',
  calendar:
    'Organiza os períodos de acesso e divulgação. Uma personalização substitui o calendário inteiro neste aluno ou turma. Campo vazio não define uma data.',
};
function FieldCardV1({
  field,
  settings,
  disabled,
  canWrite,
  sourceLabel,
  review,
  onDirtyChange,
}: {
  field: SettingsFieldV1;
  settings: EffectiveSettingsV1;
  disabled: boolean;
  canWrite: boolean;
  sourceLabel: string;
  review: (review: ReviewIntentV1) => void;
  onDirtyChange: (field: SettingsFieldV1, dirty: boolean) => void;
}) {
  const sourceDraft = useMemo(() => settingsDraftV1(field, settings.value), [field, settings]);
  const sourceKey = JSON.stringify(sourceDraft);
  const [draft, setDraft] = useState(sourceDraft);
  const precedingSource = useRef(sourceKey);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== sourceKey;
  useEffect(() => {
    const wasDirty = JSON.stringify(draft) !== precedingSource.current;
    precedingSource.current = sourceKey;
    if (!wasDirty) setDraft(sourceDraft);
  }, [sourceDraft, sourceKey]);
  useEffect(() => {
    onDirtyChange(field, dirty);
    return () => onDirtyChange(field, false);
  }, [dirty, field, onDirtyChange]);
  const owns = ownsSettingV1(settings, field);
  const boolean = typeof sourceDraft === 'boolean';
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
    <Card className={`pa-settings-card pa-settings-card--${field}`}>
      <Card.Header>
        <div className="pa-settings-card-heading">
          <h3>{SETTINGS_LABELS_V1[field]}</h3>
          <Chip size="sm" variant="soft">
            {owns
              ? settings.scope.kind === 'school'
                ? 'Padrão da escola'
                : 'Definido aqui'
              : settings.sources[field].kind === 'school'
                ? 'Padrão da escola'
                : 'Padrão de ' + sourceLabel}
          </Chip>
        </div>
        <InfoV1 label={`Sobre ${SETTINGS_LABELS_V1[field]}`}>{fieldHelp[field]}</InfoV1>
      </Card.Header>
      <Card.Content>
        {canWrite ? (
          <SettingsEditorV1
            field={field}
            value={boolean ? sourceDraft : draft}
            disabled={disabled}
            onChange={(value) => {
              if (boolean) {
                review({ field, inherit: false, value: parseSettingsDraftV1(field, value) });
                return;
              }
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
          {!boolean ? (
            <Button
              size="sm"
              variant="secondary"
              isDisabled={disabled}
              onPress={prepare}
              aria-label={`Revisar ${SETTINGS_LABELS_V1[field]}`}
            >
              {owns ? 'Salvar' : 'Personalizar'}
            </Button>
          ) : null}
          {settings.scope.kind !== 'school' && owns ? (
            <Button
              size="sm"
              variant="ghost"
              isDisabled={disabled}
              onPress={() => review({ field, inherit: true })}
              aria-label={`Usar padrão de ${SETTINGS_LABELS_V1[field]}`}
            >
              Usar padrão
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
            <Modal.Heading>{review.inherit ? 'Usar padrão' : 'Confirmar alteração'}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="pa-settings-review">
            <p>
              <strong>{SETTINGS_LABELS_V1[review.field]}</strong> em {scopeLabel}.
            </p>
            {review.inherit ? (
              <p>Esta opção voltará a seguir o padrão da escola ou da turma.</p>
            ) : (
              <>
                <p>Novo valor:</p>
                <SettingsValueSummaryV1 field={review.field} value={next!} />
              </>
            )}
            <p>Esta alteração pode mudar imediatamente o acesso e as notas visíveis.</p>
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
              <p>As notas já publicadas ou retiradas não serão restauradas por esta alteração.</p>
            ) : null}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="ghost" isDisabled={disabled} onPress={close}>
              Voltar
            </Button>
            <Button isDisabled={disabled} isPending={disabled} onPress={confirm}>
              {review.inherit ? 'Usar padrão' : 'Confirmar alteração'}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
function SettingsScopeV1({
  client,
  reader,
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
  const [discardVersion, setDiscardVersion] = useState(0);
  const [dirtyFields, setDirtyFields] = useState<Set<SettingsFieldV1>>(() => new Set());
  const request = useMemo(() => createLatestPortalRequestV1<EffectiveSettingsV1>(setLoad), []);
  const writer = useMemo(() => createSettingsMutationV1(client, setMutation), [client]);
  const label = scopeLabel ?? settingsScopeLabelV1(fixedScope);
  const reload = useCallback(
    (background = false) =>
      request.run(
        async (signal) => {
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
        },
        { background },
      ),
    [client, fixedScope, request],
  );
  useEffect(() => {
    void reload(false);
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
    setNotice('Salvo.');
    writer.clear();
    void reload(true);
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
  useDraftNavigationGuardV1(dirtyFields.size > 0 || mutation.state === 'pending');
  const busy = mutation.state === 'pending' || closing;
  const onDirtyChange = useCallback((field: SettingsFieldV1, dirty: boolean) => {
    setDirtyFields((previous) => {
      if (previous.has(field) === dirty) return previous;
      const next = new Set(previous);
      if (dirty) next.add(field);
      else next.delete(field);
      return next;
    });
  }, []);
  const discardAndReload = useCallback(() => {
    writer.clear();
    setReview(null);
    setNotice(null);
    setDiscardVersion((value) => value + 1);
    setDirtyFields(new Set());
    void reload(false);
  }, [reload, writer]);
  const linksClosed = useCallback(() => {
    setNotice('Vínculos de 2026 encerrados. O histórico foi preservado.');
    void reload(true);
    onCommitted?.();
  }, [onCommitted, reload]);
  useLiveRefreshV1(() => reload(true), {
    domains: ['portal', 'gradebook'],
    canRefresh: () =>
      load.state === 'ready' &&
      !load.refreshing &&
      dirtyFields.size === 0 &&
      review === null &&
      mutation.state === 'idle' &&
      !closing,
  });
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
    <section className="pa-settings" aria-label="Configurações do Aluno">
      <header className="pa-settings-heading">
        <div>
          <h2>Configurações</h2>
          <p>{label}</p>
        </div>
        <LiveReadNoticeV1 failed={load.state === 'ready' && Boolean(load.refreshError)} />
        {dirtyFields.size > 0 ? (
          <Button size="sm" variant="outline" isDisabled={busy} onPress={discardAndReload}>
            Desfazer edições
          </Button>
        ) : null}
      </header>

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
                ? 'Sem permissão para esta consulta.'
                : 'Configurações indisponíveis. Tente novamente.'}
          </p>
          <Button size="sm" variant="secondary" onPress={() => void reload(false)}>
            Tentar novamente
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
                  Tentar novamente
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onPress={discardAndReload}>
                Recarregar
              </Button>
            </div>
          ) : null}
          <div className="pa-settings-fields">
            {(Object.keys(SETTINGS_LABELS_V1) as SettingsFieldV1[]).map((field) => (
              <FieldCardV1
                key={`${discardVersion}:${field}`}
                field={field}
                settings={load.data}
                canWrite={canWrite}
                disabled={busy || mutation.state === 'error' || review !== null}
                sourceLabel={sourceLabel(load.data.sources[field])}
                review={(intent) => setReview({ ...intent, expectedVersion: load.data.version })}
                onDirtyChange={onDirtyChange}
              />
            ))}
          </div>
          {reader && fixedScope.kind !== 'account' ? (
            <CustomizedSettingsV1
              key={settingsScopeKeyV1(fixedScope)}
              reader={reader}
              client={client}
              canWrite={canWrite}
              scope={fixedScope}
              renderEditor={(target, label, committed) => (
                <StudentSettingsV1
                  client={client}
                  scope={target}
                  scopeLabel={label}
                  canWrite={canWrite}
                  describeScope={describeScope}
                  onCommitted={committed}
                />
              )}
            />
          ) : null}
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
