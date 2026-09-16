import { useMemo } from 'react';
import { CalendarDateTime, parseDateTime, today } from '@internationalized/date';
import { I18nProvider } from 'react-aria-components';
import {
  Calendar,
  Checkbox,
  CloseButton,
  DateField,
  DatePicker,
  Input,
  Label,
  ListBox,
  Select,
  TextField,
  Tooltip,
} from '@heroui/react';
import {
  riskPolicyV1,
  type EffectiveSettingsV1,
} from '../../../../shared/student-portal-contracts/policy-v1';
import {
  CALENDAR_LABELS_V1,
  PERIODS_V1,
  SETTINGS_LABELS_V1,
  type SettingsFieldV1,
} from './settings-values-v1';
import {
  calendarDraftModeV1,
  type CalendarDraftV1,
  type CalendarDateKeyV1,
  type CalendarPeriodV1,
} from './calendar-draft-v1';
import { RISK_LABELS_V1, type RiskDraftV1, type SettingsDraftV1 } from './settings-draft-v1';

export function SettingsCheckboxV1({
  label,
  selected,
  disabled,
  onChange,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onChange: (selected: boolean) => void;
}) {
  return (
    <Checkbox isSelected={selected} isDisabled={disabled} onChange={onChange}>
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Label>{label}</Label>
      </Checkbox.Content>
    </Checkbox>
  );
}
function PeriodsEditorV1({
  value,
  onChange,
  disabled,
  label,
}: {
  value: CalendarPeriodV1[];
  onChange: (periods: CalendarPeriodV1[]) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <fieldset className="pa-settings-periods">
      <legend>{label}</legend>
      <div>
        {PERIODS_V1.map((period) => (
          <SettingsCheckboxV1
            key={period}
            label={period}
            selected={value.includes(period)}
            disabled={disabled}
            onChange={(selected) =>
              onChange(
                PERIODS_V1.filter((candidate) =>
                  candidate === period ? selected : value.includes(candidate),
                ),
              )
            }
          />
        ))}
      </div>
    </fieldset>
  );
}
export function DateInputV1({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const placeholder = useMemo(() => {
    const date = today('America/Sao_Paulo');
    return new CalendarDateTime(date.year, date.month, date.day, 0, 0, 0);
  }, []);
  let parsed: CalendarDateTime | null = null;
  try {
    parsed = value ? parseDateTime(value) : null;
  } catch {
    /* Keep invalid source visible through the field error state. */
  }
  return (
    <I18nProvider locale="pt-BR">
      <DatePicker
        className="pa-date-picker"
        value={parsed}
        onChange={(date) => onChange(date?.toString() ?? '')}
        placeholderValue={placeholder}
        isDisabled={disabled}
        isInvalid={Boolean(value && !parsed)}
        granularity="minute"
        hourCycle={24}
        shouldForceLeadingZeros
        aria-description="Horário de Brasília. O encerramento ocorre no instante informado."
      >
        <Label>{label}</Label>
        <DateField.Group>
          <DateField.Input>{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
          <DateField.Suffix>
            {value && !disabled ? (
              <CloseButton
                slot={null}
                aria-label={`Limpar ${label}`}
                onPress={() => onChange('')}
              />
            ) : null}
            <DatePicker.Trigger aria-label="Abrir calendário">
              <DatePicker.TriggerIndicator />
            </DatePicker.Trigger>
          </DateField.Suffix>
        </DateField.Group>
        <DatePicker.Popover>
          <Calendar aria-label={label}>
            <Calendar.Header>
              <Calendar.YearPickerTrigger>
                <Calendar.YearPickerTriggerHeading />
                <Calendar.YearPickerTriggerIndicator />
              </Calendar.YearPickerTrigger>
              <Calendar.NavButton slot="previous" />
              <Calendar.NavButton slot="next" />
            </Calendar.Header>
            <Calendar.Grid>
              <Calendar.GridHeader>
                {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
              </Calendar.GridHeader>
              <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
            </Calendar.Grid>
            <Calendar.YearPickerGrid>
              <Calendar.YearPickerGridBody>
                {({ year }) => <Calendar.YearPickerCell year={year} />}
              </Calendar.YearPickerGridBody>
            </Calendar.YearPickerGrid>
          </Calendar>
        </DatePicker.Popover>
      </DatePicker>
    </I18nProvider>
  );
}
const DATE_GROUPS: { label: string; keys: CalendarDateKeyV1[] }[] = [
  { label: 'Ano letivo', keys: ['enrollmentStartsAt', 'yearStartsAt', 'yearEndsAt'] },
  { label: 'Trimestres', keys: ['t1EndsAt', 't2StartsAt', 't2EndsAt', 't3StartsAt', 't3EndsAt'] },
  { label: 'Recuperação e resultado', keys: ['recoveriesStartAt', 'finalDisclosureAt'] },
];
export function CalendarEditorV1({
  value,
  disabled,
  onChange,
}: {
  value: CalendarDraftV1;
  disabled: boolean;
  onChange: (value: CalendarDraftV1) => void;
}) {
  return (
    <div className="pa-settings-calendar">
      <Tooltip>
        <Tooltip.Trigger className="w-fit text-xs text-muted">Horário de Brasília</Tooltip.Trigger>
        <Tooltip.Content>
          Início incluído. No horário de encerramento, o acesso ao período termina. Campo vazio não
          define uma data.
        </Tooltip.Content>
      </Tooltip>
      {DATE_GROUPS.map((group) => (
        <fieldset key={group.label} className="pa-calendar-group">
          <legend>{group.label}</legend>
          <div className="pa-settings-grid">
            {group.keys.map((key) => (
              <DateInputV1
                key={key}
                label={CALENDAR_LABELS_V1[key]}
                value={value.dates[key]}
                disabled={disabled}
                onChange={(date) => onChange({ ...value, dates: { ...value.dates, [key]: date } })}
              />
            ))}
          </div>
        </fieldset>
      ))}
      <Select
        className="max-w-72"
        selectedKey={value.mode}
        isDisabled={disabled}
        onSelectionChange={(key) => {
          if (key === 'single' || key === 'per-period') onChange(calendarDraftModeV1(value, key));
        }}
      >
        <Label>Divulgação das notas</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="single" textValue="Data única">
              Data única
              <ListBox.ItemIndicator />
            </ListBox.Item>
            <ListBox.Item id="per-period" textValue="Por trimestre / recuperação">
              Por trimestre / recuperação
              <ListBox.ItemIndicator />
            </ListBox.Item>
          </ListBox>
        </Select.Popover>
      </Select>
      <Tooltip>
        <Tooltip.Trigger className="w-fit text-xs text-muted">Sobre a liberação</Tooltip.Trigger>
        <Tooltip.Content>
          Trocar o modo limpa as datas de divulgação. O resultado final usa a data própria acima.
        </Tooltip.Content>
      </Tooltip>
      {value.mode === 'single' ? (
        <>
          <DateInputV1
            label="Liberar notas em"
            value={value.singleAt}
            disabled={disabled}
            onChange={(singleAt) => onChange({ ...value, singleAt })}
          />
          <PeriodsEditorV1
            label="Notas incluídas"
            value={value.singlePeriods}
            disabled={disabled}
            onChange={(singlePeriods) => onChange({ ...value, singlePeriods })}
          />
        </>
      ) : (
        <div className="pa-settings-grid">
          {PERIODS_V1.map((period) => (
            <DateInputV1
              key={period}
              label={`Divulgação de ${period}`}
              value={value.periodAt[period]}
              disabled={disabled}
              onChange={(date) =>
                onChange({ ...value, periodAt: { ...value.periodAt, [period]: date } })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
export function SettingsEditorV1({
  field,
  value,
  disabled,
  onChange,
}: {
  field: SettingsFieldV1;
  value: SettingsDraftV1;
  disabled: boolean;
  onChange: (value: SettingsDraftV1) => void;
}) {
  if (field === 'calendar')
    return (
      <CalendarEditorV1 value={value as CalendarDraftV1} disabled={disabled} onChange={onChange} />
    );
  if (field === 'allowedPeriods')
    return (
      <PeriodsEditorV1
        label="Notas disponíveis"
        value={value as CalendarPeriodV1[]}
        disabled={disabled}
        onChange={onChange}
      />
    );
  if (field === 'risk') {
    const risk = value as RiskDraftV1;
    return (
      <div className="pa-settings-grid">
        {Object.entries(RISK_LABELS_V1).map(([key, label]) => {
          const name = key as keyof RiskDraftV1,
            schema = riskPolicyV1.shape[name];
          return (
            <TextField key={key} isDisabled={disabled}>
              <Label>{label}</Label>
              <Input
                type="number"
                inputMode="numeric"
                step={1}
                min={schema.minValue ?? undefined}
                max={schema.maxValue ?? undefined}
                value={risk[name]}
                onChange={(event) => onChange({ ...risk, [name]: event.currentTarget.value })}
              />
              <p className="pa-settings-hint">
                De {schema.minValue} a {schema.maxValue}.
              </p>
            </TextField>
          );
        })}
      </div>
    );
  }
  return (
    <SettingsCheckboxV1
      label={SETTINGS_LABELS_V1[field]}
      selected={value as boolean}
      disabled={disabled}
      onChange={onChange}
    />
  );
}
const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'medium',
});
const dateLabel = (value: string | null) =>
  value === null ? 'Não definido' : dateFormatter.format(new Date(value));
export function SettingsValueSummaryV1({
  field,
  value,
}: {
  field: SettingsFieldV1;
  value: EffectiveSettingsV1['value'][SettingsFieldV1];
}) {
  if (field === 'allowedPeriods')
    return <p>{(value as CalendarPeriodV1[]).join(', ') || 'Nenhum período'}</p>;
  if (field === 'risk') {
    const risk = value as EffectiveSettingsV1['value']['risk'];
    return (
      <dl className="pa-settings-summary">
        {Object.entries(RISK_LABELS_V1).map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{risk[key as keyof typeof risk]}</dd>
          </div>
        ))}
      </dl>
    );
  }
  if (field === 'calendar') {
    const calendar = value as EffectiveSettingsV1['value']['calendar'];
    return (
      <div>
        <p className="text-xs text-muted">Horário de Brasília</p>
        <dl className="pa-settings-summary">
          {Object.entries(CALENDAR_LABELS_V1)
            .filter(([key]) => calendar[key as CalendarDateKeyV1] !== null)
            .map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{dateLabel(calendar[key as CalendarDateKeyV1])}</dd>
              </div>
            ))}
          {calendar.disclosure.mode === 'single' ? (
            <div>
              <dt>Data única: {calendar.disclosure.periods.join(', ')}</dt>
              <dd>{dateLabel(calendar.disclosure.at)}</dd>
            </div>
          ) : (
            PERIODS_V1.filter(
              (period) =>
                calendar.disclosure.mode === 'per-period' &&
                calendar.disclosure.at[period] !== null,
            ).map((period) => (
              <div key={period}>
                <dt>Divulgação de {period}</dt>
                <dd>
                  {dateLabel(
                    calendar.disclosure.mode === 'per-period'
                      ? calendar.disclosure.at[period]
                      : null,
                  )}
                </dd>
              </div>
            ))
          )}
        </dl>
      </div>
    );
  }
  return <p>{value ? 'Ligado' : 'Desligado'}</p>;
}
