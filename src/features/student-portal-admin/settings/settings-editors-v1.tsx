import { Checkbox, Input, Label, ListBox, Select, TextField } from '@heroui/react';
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
function DateInputV1({
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
  return (
    <TextField isDisabled={disabled}>
      <Label>{label}</Label>
      <Input
        type="datetime-local"
        step={1}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        aria-description="Horário de São Paulo. Deixe vazio para não definir."
      />
    </TextField>
  );
}
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
      <p>
        Horários de São Paulo. O início inclui o instante informado; o fim é o primeiro instante
        fora do período. Datas vazias permanecem sem definição.
      </p>
      <div className="pa-settings-grid">
        {Object.entries(CALENDAR_LABELS_V1).map(([key, label]) => (
          <DateInputV1
            key={key}
            label={label}
            value={value.dates[key as CalendarDateKeyV1]}
            disabled={disabled}
            onChange={(date) => onChange({ ...value, dates: { ...value.dates, [key]: date } })}
          />
        ))}
      </div>
      <Select
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
            <ListBox.Item id="single" textValue="Uma data para os períodos escolhidos">
              Uma data para os períodos escolhidos
              <ListBox.ItemIndicator />
            </ListBox.Item>
            <ListBox.Item id="per-period" textValue="Uma data para cada período">
              Uma data para cada período
              <ListBox.ItemIndicator />
            </ListBox.Item>
          </ListBox>
        </Select.Popover>
      </Select>
      <p>
        Ao trocar o modo, informe novamente as datas de divulgação. A divulgação do resultado final
        é independente.
      </p>
      {value.mode === 'single' ? (
        <>
          <DateInputV1
            label="Data única de divulgação"
            value={value.singleAt}
            disabled={disabled}
            onChange={(singleAt) => onChange({ ...value, singleAt })}
          />
          <PeriodsEditorV1
            label="Períodos abrangidos pela data única"
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
        label="Períodos permitidos neste escopo"
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
        <p>Horários de São Paulo</p>
        <dl className="pa-settings-summary">
          {Object.entries(CALENDAR_LABELS_V1).map(([key, label]) => (
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
            PERIODS_V1.map((period) => (
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
