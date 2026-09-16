import type { EffectiveSettingsV1 } from '../../../../shared/student-portal-contracts/policy-v1';
import { calendarDraftV1, parseCalendarDraftV1, type CalendarDraftV1 } from './calendar-draft-v1';
import { singleSettingV1, type SettingsFieldV1 } from './settings-values-v1';
export const RISK_LABELS_V1 = {
  persistentSeconds: 'Permanecer conectado',
  shortSeconds: 'Acesso sem permanecer conectado',
  challengeAfter: 'Pedir verificação após',
  blockAfter: 'Bloquear após',
  blockSeconds: 'Tempo de bloqueio',
  failureWindowSeconds: 'Contar tentativas feitas nos últimos',
  challengeTtlSeconds: 'Tempo para concluir a verificação',
} as const;
export type RiskDraftV1 = Record<keyof typeof RISK_LABELS_V1, string>;
export type SettingsDraftV1 =
  boolean | EffectiveSettingsV1['value']['allowedPeriods'] | RiskDraftV1 | CalendarDraftV1;
export function settingsDraftV1(
  field: SettingsFieldV1,
  value: EffectiveSettingsV1['value'],
): SettingsDraftV1 {
  if (field === 'calendar') return calendarDraftV1(value.calendar);
  if (field === 'risk')
    return Object.fromEntries(
      Object.entries(value.risk).map(([key, number]) => [key, String(number)]),
    ) as RiskDraftV1;
  if (field === 'allowedPeriods') return [...value.allowedPeriods];
  return value[field];
}
export function parseSettingsDraftV1(field: SettingsFieldV1, draft: SettingsDraftV1) {
  if (field === 'calendar')
    return singleSettingV1(field, parseCalendarDraftV1(draft as CalendarDraftV1));
  if (field === 'risk') {
    const values = draft as RiskDraftV1;
    return singleSettingV1(
      field,
      Object.fromEntries(
        Object.keys(RISK_LABELS_V1).map((key) => {
          const value = values[key as keyof RiskDraftV1];
          if (!/^\d+$/u.test(value))
            throw new Error('Use números inteiros nos limites de sessão e acesso.');
          return [key, Number(value)];
        }),
      ),
    );
  }
  return singleSettingV1(field, draft);
}
