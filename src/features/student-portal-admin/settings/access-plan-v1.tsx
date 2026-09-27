import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Chip, Label, ListBox, Select, Switch } from '@heroui/react';
import { CalendarClock, DoorClosed, DoorOpen, Plus, Trash2 } from 'lucide-react';
import {
  settingsOverrideV1,
  type EffectiveSettingsV1,
} from '../../../../shared/student-portal-contracts/policy-v1';
import {
  accessOpenAtV1,
  anticipateAccessV1,
  legacyAccessPlanV1,
  nextAccessChangeV1,
  settleAccessPlanV1,
  type AccessEventV1,
  type AccessPlanV1,
} from '../../../../shared/student-portal-contracts/access-schedule-v1';
import { DateInputV1 } from './settings-editors-v1';
import { calendarInputV1, calendarInstantV1, ownsSettingV1, settingsScopeKeyV1 } from './settings-values-v1';

type OverrideV1 = ReturnType<typeof settingsOverrideV1.parse>;
export type AccessReviewIntentV1 =
  | { field: 'accessEnabled'; inherit: true }
  | { field: 'accessEnabled'; inherit: false; value: OverrideV1 };

/**
 * The plan this level follows, as the server resolves it: its own switch and schedules, or — for
 * a level that never used schedules — the old "Quando o aluno pode entrar" window of the Calendário.
 */
export function accessPlanOfSettingsV1(settings: EffectiveSettingsV1): {
  plan: AccessPlanV1;
  fromCalendar: boolean;
} {
  const { value, sources } = settings;
  const sameLevel =
    settingsScopeKeyV1(sources.accessSchedule) === settingsScopeKeyV1(sources.accessEnabled);
  if (value.accessSchedule !== null && sameLevel)
    return { plan: { enabled: value.accessEnabled, schedule: value.accessSchedule }, fromCalendar: false };
  const calendar = value.calendar;
  return {
    plan: legacyAccessPlanV1(
      value.accessEnabled,
      calendar.accessStartsAt ?? calendar.yearStartsAt,
      calendar.accessEndsAt ?? calendar.yearEndsAt,
    ),
    fromCalendar: true,
  };
}

const whenFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
export const accessWhenV1 = (at: string) => whenFormat.format(new Date(at)).replace(',', '');
const actionLabel = { open: 'Abrir', close: 'Fechar' } as const;

/** Plain-language reading of a plan, used on the card and in the confirmation. */
export function AccessPlanSummaryV1({
  plan,
  now,
  wasOpen,
}: {
  plan: AccessPlanV1;
  now: number;
  /** The state before this change, to say what happens to students right away. */
  wasOpen?: boolean;
}) {
  const open = accessOpenAtV1(plan, now);
  const upcoming = plan.schedule.filter((event) => Date.parse(event.at) > now);
  return (
    <div className="pa-access-summary">
      {wasOpen === false && open ? (
        <p className="pa-access-consequence">Os alunos poderão entrar assim que você confirmar.</p>
      ) : null}
      {wasOpen === true && !open ? (
        <p className="pa-access-consequence">
          Ninguém mais poderá entrar, e quem estiver conectado sai do Portal agora.
        </p>
      ) : null}
      <p>
        <strong>{open ? 'Aberto agora.' : 'Fechado agora.'}</strong>{' '}
        {upcoming.length ? 'Depois disso:' : 'Nenhuma mudança agendada.'}
      </p>
      {upcoming.length ? (
        <ul>
          {upcoming.map((event) => (
            <li key={event.at}>
              <strong>{actionLabel[event.action]}</strong> em {accessWhenV1(event.at)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type RowV1 = { id: number; at: string; action: AccessEventV1['action'] };
let nextRowId = 1;
const rowsOfV1 = (events: readonly AccessEventV1[]): RowV1[] =>
  events.map((event) => ({ id: nextRowId++, at: calendarInputV1(event.at), action: event.action }));

/**
 * Rows followed by the same action: following the agenda, the state before an action is already
 * its opposite, so the earlier of two equal actions changes nothing.
 */
function redundantRowsV1(rows: readonly RowV1[]): Set<number> {
  const instant = (input: string) => {
    try {
      return calendarInstantV1(input);
    } catch {
      return null;
    }
  };
  const dated = rows
    .map((row) => ({ row, at: instant(row.at) }))
    .filter((item): item is { row: RowV1; at: string } => item.at !== null)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return new Set(
    dated
      .filter((item, index) => dated[index + 1]?.row.action === item.row.action)
      .map((item) => item.row.id),
  );
}

/** Validates the rows into a time-ordered schedule; every action must still be ahead. */
function parseRowsV1(rows: readonly RowV1[], now: number): AccessEventV1[] {
  const events = rows.map((row) => {
    const at = calendarInstantV1(row.at);
    if (at === null) throw new Error('Informe a data e o horário de cada agendamento, ou remova a linha.');
    if (Date.parse(at) <= now) throw new Error('Cada agendamento precisa estar no futuro.');
    return { at, action: row.action };
  });
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (events.some((event, index) => index > 0 && event.at === events[index - 1]!.at))
    throw new Error('Dois agendamentos não podem ter o mesmo horário.');
  if (events.length > 40) throw new Error('Use no máximo 40 agendamentos.');
  return events;
}

function useMinuteClockV1() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * Entrada no Portal: the switch (state now) and its scheduled Abrir/Fechar, edited and saved
 * together as one unit for this level.
 */
export function AccessPlanCardV1({
  settings,
  canWrite,
  disabled,
  sourceLabel,
  review,
  onDirtyChange,
}: Readonly<{
  settings: EffectiveSettingsV1;
  canWrite: boolean;
  disabled: boolean;
  sourceLabel: string;
  review: (intent: AccessReviewIntentV1) => void;
  onDirtyChange: (field: 'accessEnabled', dirty: boolean) => void;
}>) {
  const now = useMinuteClockV1();
  const school = settings.scope.kind === 'school';
  const owns = ownsSettingV1(settings, 'accessEnabled');
  const { plan, fromCalendar } = useMemo(() => accessPlanOfSettingsV1(settings), [settings]);
  // Settled when the card loads: the switch is the state now and the rows are what is still ahead.
  const [saved] = useState(() => settleAccessPlanV1(plan, Date.now()));
  const sourceRows = useMemo(() => rowsOfV1(saved.schedule), [saved]);
  const [rows, setRows] = useState(sourceRows);
  const [error, setError] = useState<string | null>(null);
  const dirty =
    JSON.stringify(rows.map(({ at, action }) => [at, action])) !==
    JSON.stringify(sourceRows.map(({ at, action }) => [at, action]));
  useEffect(() => {
    onDirtyChange('accessEnabled', dirty);
    return () => onDirtyChange('accessEnabled', false);
  }, [dirty, onDirtyChange]);

  const openNow = accessOpenAtV1(plan, now);
  const redundant = redundantRowsV1(rows);
  // The next real change (an Abrir while already open changes nothing).
  const nextChange = nextAccessChangeV1(plan, now, !openNow);
  const submit = (enabled: boolean, schedule: AccessEventV1[]) =>
    review({
      field: 'accessEnabled',
      inherit: false,
      value: settingsOverrideV1.parse({ accessEnabled: enabled, accessSchedule: schedule }),
    });
  const saveSchedule = () => {
    try {
      const schedule = parseRowsV1(rows, Date.now());
      setError(null);
      submit(accessOpenAtV1(plan, Date.now()), schedule);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Confira os agendamentos.');
    }
  };

  return (
    <Card className="pa-settings-card pa-settings-card--access">
      <Card.Header>
        <div className="pa-settings-card-heading">
          {/* The policies page already titles the section at school level. */}
          <h3 className={school ? 'sr-only' : undefined}>Entrada no Portal</h3>
          {!school ? (
            <Chip size="sm" variant="soft">
              {owns
                ? 'Definido aqui'
                : settings.sources.accessEnabled.kind === 'school'
                  ? 'Padrão da escola'
                  : 'Padrão de ' + sourceLabel}
            </Chip>
          ) : null}
        </div>
      </Card.Header>
      <Card.Content className="pa-access">
        <div className={'pa-access-status pa-access-status--' + (openNow ? 'open' : 'closed')} role="status">
          {openNow ? <DoorOpen size={22} aria-hidden="true" /> : <DoorClosed size={22} aria-hidden="true" />}
          <div>
            <p className="pa-access-status-title">
              {openNow ? 'O Portal está aberto agora' : 'O Portal está fechado agora'}
              {school ? '' : ` para ${settings.scope.kind === 'class' ? 'esta turma' : 'este aluno'}`}
            </p>
            <p className="pa-access-status-next">
              {nextChange !== null ? (
                <>
                  <CalendarClock size={14} aria-hidden="true" />
                  {openNow ? 'Fecha' : 'Abre'} sozinho em{' '}
                  {accessWhenV1(new Date(nextChange).toISOString())}
                </>
              ) : openNow ? (
                'Fica aberto até alguém fechar.'
              ) : (
                'Fica fechado até alguém abrir.'
              )}
            </p>
          </div>
          {canWrite ? (
            <Switch
              className="pa-access-switch"
              aria-label="Portal aberto agora"
              isSelected={openNow}
              isDisabled={disabled || dirty}
              onChange={(value) => {
                const anticipated = anticipateAccessV1(plan, Date.now(), value);
                submit(anticipated.enabled, [...anticipated.schedule]);
              }}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <Label>{openNow ? 'Aberto' : 'Fechado'}</Label>
              </Switch.Content>
            </Switch>
          ) : null}
        </div>
        {canWrite && dirty ? (
          <p className="pa-settings-hint">Salve ou desfaça os agendamentos antes de usar a chave.</p>
        ) : null}

        <section className="pa-access-schedule" aria-labelledby="pa-access-schedule-title">
          <h4 id="pa-access-schedule-title">Agendamentos</h4>
          {fromCalendar && owns && saved.schedule.length ? (
            <p className="pa-settings-hint">
              Estes horários vieram de “Quando o aluno pode entrar”, do Calendário. Ao salvar, eles
              passam a valer daqui.
            </p>
          ) : null}
          {rows.length === 0 ? (
            <p className="pa-settings-hint">Nenhum agendamento. O Portal fica como a chave estiver.</p>
          ) : (
            <ol className="pa-access-rows">
              {rows.map((row, index) => (
                <li key={row.id} className="pa-access-row">
                  <Select
                    className="pa-access-action"
                    selectedKey={row.action}
                    isDisabled={disabled || !canWrite}
                    onSelectionChange={(key) => {
                      if (key !== 'open' && key !== 'close') return;
                      setRows(rows.map((item) => (item.id === row.id ? { ...item, action: key } : item)));
                      setError(null);
                    }}
                  >
                    <Label>Ação {index + 1}</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        <ListBox.Item id="open" textValue="Abrir o Portal">
                          Abrir o Portal
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="close" textValue="Fechar o Portal">
                          Fechar o Portal
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      </ListBox>
                    </Select.Popover>
                  </Select>
                  <DateInputV1
                    label="Em"
                    value={row.at}
                    disabled={disabled || !canWrite}
                    onChange={(at) => {
                      setRows(rows.map((item) => (item.id === row.id ? { ...item, at } : item)));
                      setError(null);
                    }}
                  />
                  {redundant.has(row.id) ? (
                    <p className="pa-settings-hint pa-access-row-note">
                      Sem efeito: a ação seguinte é igual, então o Portal só muda no horário dela.
                    </p>
                  ) : null}
                  {canWrite ? (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      className="pa-access-remove"
                      aria-label={`Remover agendamento ${index + 1}`}
                      isDisabled={disabled}
                      onPress={() => {
                        setRows(rows.filter((item) => item.id !== row.id));
                        setError(null);
                      }}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
          {error ? (
            <p className="pa-settings-error" role="alert">
              {error}
            </p>
          ) : null}
          {canWrite ? (
            <div className="pa-settings-actions pa-access-actions">
              <Button
                size="sm"
                variant="tertiary"
                isDisabled={disabled || rows.length >= 40}
                onPress={() => {
                  const last = rows.at(-1);
                  setRows([
                    ...rows,
                    { id: nextRowId++, at: '', action: last ? (last.action === 'open' ? 'close' : 'open') : openNow ? 'close' : 'open' },
                  ]);
                }}
              >
                <Plus size={16} aria-hidden="true" />
                Adicionar agendamento
              </Button>
              <Button
                size="sm"
                variant="secondary"
                isDisabled={disabled || (owns && !dirty && !fromCalendar)}
                aria-label={owns ? 'Salvar agendamentos' : 'Personalizar Entrada no Portal'}
                onPress={saveSchedule}
              >
                {owns ? 'Salvar agendamentos' : 'Personalizar'}
              </Button>
              {!school && owns ? (
                <Button
                  size="sm"
                  variant="ghost"
                  isDisabled={disabled}
                  aria-label="Usar padrão de Entrada no Portal"
                  onPress={() => review({ field: 'accessEnabled', inherit: true })}
                >
                  Usar padrão
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>

        <div className="pa-access-help">
          <p className="pa-access-help-title">Como funciona</p>
          <ul>
            <li>
              O Portal segue a agenda. Antes de um <strong>Abrir</strong>, ele fica fechado; antes
              de um <strong>Fechar</strong>, fica aberto. Isso vale assim que você salvar.
            </li>
            <li>
              Exemplo: com o Portal aberto, agendar “Abrir às 10:00” fecha agora e abre às 10:00.
              Com ele fechado, agendar “Fechar às 18:00” abre agora e fecha às 18:00.
            </li>
            <li>
              Depois do último agendamento, o Portal fica como ele deixou, até alguém usar a chave.
            </li>
            <li>
              A chave mostra o estado agora. Usá-la antecipa o próximo agendamento, e os seguintes
              continuam valendo.
            </li>
            <li>
              Enquanto o Portal estiver fechado com uma abertura agendada, os alunos veem a contagem
              regressiva na tela de entrada.
            </li>
            <li>No horário de Fechar, quem estiver conectado sai do Portal.</li>
            {school ? (
              <li>
                Turmas e alunos podem ter a própria chave e os próprios agendamentos, mas só entram
                quando a escola também estiver aberta.
              </li>
            ) : (
              <li>
                A escola prevalece: {settings.scope.kind === 'class' ? 'esta turma' : 'este aluno'} só
                entra enquanto a escola também estiver aberta.
              </li>
            )}
            <li>Horários de Brasília.</li>
          </ul>
        </div>
      </Card.Content>
    </Card>
  );
}
