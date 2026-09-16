import { useMemo, useState } from 'react';
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
  Switch,
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
import { InfoV1 } from '../shared/info-v1';
import { DurationEditorV1, durationLabelV1, RISK_HELP_V1 } from './security-duration-v1';
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
  const [isOpen, setOpen] = useState(false);
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
        isOpen={isOpen}
        onOpenChange={setOpen}
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
          <DateField.Input
            onClick={(event) => {
              const type = (event.target as HTMLElement)
                .closest('[data-type]')
                ?.getAttribute('data-type');
              if (!disabled && (!type || ['day', 'month', 'year', 'literal'].includes(type)))
                setOpen(true);
            }}
          >
            {(segment) => <DateField.Segment segment={segment} />}
          </DateField.Input>
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
  { label: 'Ano letivo', keys: ['enrollmentStartsAt', 'yearEndsAt'] },
  { label: '1º trimestre', keys: ['yearStartsAt', 't1EndsAt'] },
  { label: '2º trimestre', keys: ['t2StartsAt', 't2EndsAt'] },
  { label: '3º trimestre', keys: ['t3StartsAt', 't3EndsAt'] },
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
      <div className="pa-calendar-zone">
        <span>Horário de Brasília</span>
        <InfoV1 label="Sobre os horários">
          Início incluído. No horário de encerramento, o acesso ao período termina. Campo vazio não
          define uma data.
        </InfoV1>
      </div>
      <div className="pa-calendar-sections">
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
                  onChange={(date) =>
                    onChange({ ...value, dates: { ...value.dates, [key]: date } })
                  }
                />
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <fieldset className="pa-calendar-group pa-calendar-disclosure">
        <legend>
          Divulgação das notas{' '}
          <InfoV1 label="Sobre a liberação">
            Trocar o modo limpa as datas de divulgação. O resultado final usa a data própria acima.
          </InfoV1>
        </legend>
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
      </fieldset>
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
      <div className="pa-security-grid">
        {Object.entries(RISK_LABELS_V1).map(([key, label]) => {
          const name = key as keyof RiskDraftV1,
            schema = riskPolicyV1.shape[name];
          return (
            <div className="pa-security-field" key={key}>
              <div className="pa-security-label">
                <span>{label}</span>
                <InfoV1 label={`Sobre ${label}`}>{RISK_HELP_V1[name]}</InfoV1>
              </div>
              {name.endsWith('Seconds') ? (
                <DurationEditorV1
                  label={label}
                  value={risk[name]}
                  disabled={disabled}
                  min={schema.minValue ?? 1}
                  max={schema.maxValue ?? 31_536_000}
                  onChange={(next) => onChange({ ...risk, [name]: next })}
                />
              ) : (
                <TextField isDisabled={disabled} aria-label={label}>
                  <Input
                    aria-label={label}
                    type="number"
                    inputMode="numeric"
                    step={1}
                    min={schema.minValue ?? undefined}
                    max={schema.maxValue ?? undefined}
                    value={risk[name]}
                    onChange={(e) => onChange({ ...risk, [name]: e.currentTarget.value })}
                  />
                  <span className="pa-settings-hint">tentativas</span>
                </TextField>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <Switch
      aria-label={SETTINGS_LABELS_V1[field]}
      isSelected={value as boolean}
      isDisabled={disabled}
      onChange={onChange}
    >
      <Switch.Content>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Label>{value ? 'Ativado' : 'Desativado'}</Label>
      </Switch.Content>
    </Switch>
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
            <dd>
              {key.endsWith('Seconds')
                ? durationLabelV1(risk[key as keyof typeof risk])
                : `${risk[key as keyof typeof risk]} tentativas`}
            </dd>
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
  return <p>{value ? 'Ativado' : 'Desativado'}</p>;
}
