import { z } from 'zod';
import { instantV1, periodV1, scopeV1, versionV1 } from './core-v1';

const seconds = z.number().int().min(60).max(31_536_000);
export const riskPolicyV1 = z
  .object({
    persistentSeconds: seconds,
    shortSeconds: seconds,
    challengeAfter: z.number().int().min(1).max(10),
    blockAfter: z.number().int().min(2).max(20),
    blockSeconds: z.number().int().min(60).max(86400),
    failureWindowSeconds: z.number().int().min(60).max(86400),
    challengeTtlSeconds: z.number().int().min(30).max(600),
  })
  .strict()
  .refine(
    (v) => v.challengeAfter < v.blockAfter && v.shortSeconds <= v.persistentSeconds,
    'Inconsistent risk limits',
  );
export const DEFAULT_RISK_V1 = {
  persistentSeconds: 30 * 86400,
  shortSeconds: 12 * 3600,
  challengeAfter: 3,
  blockAfter: 5,
  blockSeconds: 900,
  failureWindowSeconds: 900,
  challengeTtlSeconds: 300,
} as const;
const periods = z
  .array(periodV1)
  .min(1)
  .max(6)
  .refine((p) => new Set(p).size === p.length, 'Duplicate period');
const periodDates = z
  .object({
    T1: instantV1.nullable(),
    T2: instantV1.nullable(),
    T3: instantV1.nullable(),
    REC1: instantV1.nullable(),
    REC2: instantV1.nullable(),
    REC3: instantV1.nullable(),
  })
  .strict();
export const disclosureV1 = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('single'),
      at: instantV1.nullable(),
      endsAt: instantV1.nullable().optional(),
      periods,
    })
    .strict(),
  z
    .object({ mode: z.literal('per-period'), at: periodDates, endsAt: periodDates.optional() })
    .strict(),
]);
export const calendarV1 = z
  .object({
    accessStartsAt: instantV1.nullable().optional(),
    accessEndsAt: instantV1.nullable().optional(),
    finalDisclosureEndsAt: instantV1.nullable().optional(),
    timezone: z.literal('America/Sao_Paulo'),
    enrollmentStartsAt: instantV1.nullable(),
    yearStartsAt: instantV1.nullable(),
    t1EndsAt: instantV1.nullable(),
    t2StartsAt: instantV1.nullable().default(null),
    t2EndsAt: instantV1.nullable(),
    t3StartsAt: instantV1.nullable().default(null),
    t3EndsAt: instantV1.nullable(),
    recoveriesStartAt: instantV1.nullable(),
    yearEndsAt: instantV1.nullable(),
    finalDisclosureAt: instantV1.nullable(),
    disclosure: disclosureV1,
  })
  .strict()
  .superRefine((v, ctx) => {
    const interval = (
      start: string | null | undefined,
      end: string | null | undefined,
      path: string[],
    ) => {
      if (start && end && Date.parse(end) <= Date.parse(start))
        ctx.addIssue({ code: 'custom', path, message: 'End must be after start' });
    };
    interval(v.accessStartsAt ?? v.yearStartsAt, v.accessEndsAt ?? v.yearEndsAt, ['accessEndsAt']);
    interval(v.finalDisclosureAt, v.finalDisclosureEndsAt, ['finalDisclosureEndsAt']);
    if (v.disclosure.mode === 'single')
      interval(v.disclosure.at, v.disclosure.endsAt, ['disclosure', 'endsAt']);
    else
      for (const period of periodV1.options)
        interval(v.disclosure.at[period], v.disclosure.endsAt?.[period], [
          'disclosure',
          'endsAt',
          period,
        ]);
    const ordered = [
      'enrollmentStartsAt',
      'yearStartsAt',
      't1EndsAt',
      't2StartsAt',
      't2EndsAt',
      't3StartsAt',
      't3EndsAt',
      'recoveriesStartAt',
      'yearEndsAt',
    ] as const;
    let previous = -Infinity;
    for (const key of ordered) {
      const raw = v[key];
      if (raw === null) continue;
      const value = Date.parse(raw);
      if (value < previous)
        ctx.addIssue({ code: 'custom', path: [key], message: 'Calendar order conflict' });
      previous = value;
    }
  });
export const settingsValueV1 = z
  .object({
    accessEnabled: z.boolean(),
    showPartials: z.boolean(),
    autoUpdate: z.boolean(),
    showFinalResult: z.boolean(),
    // Fechamento do trimestre (#1132). The policy service reads a missing school row as off.
    showTermClosing: z.boolean(),
    // On: past-tense closing of ended trimesters. Off: present-tense reading of the one in progress.
    termClosingConclusive: z.boolean(),
    allowedPeriods: z
      .array(periodV1)
      .max(6)
      .refine((p) => new Set(p).size === p.length, 'Duplicate period'),
    risk: riskPolicyV1,
    calendar: calendarV1,
  })
  .strict();
// Complete value per scope: partial field inheritance is expressed by explicit keys.
export const settingsOverrideV1 = settingsValueV1
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Empty override');
export const effectiveSettingsV1 = z
  .object({
    scope: scopeV1,
    version: versionV1,
    value: settingsValueV1,
    sources: z
      .object({
        accessEnabled: scopeV1,
        showPartials: scopeV1,
        autoUpdate: scopeV1,
        showFinalResult: scopeV1,
        showTermClosing: scopeV1,
        termClosingConclusive: scopeV1,
        allowedPeriods: scopeV1,
        risk: scopeV1,
        calendar: scopeV1,
      })
      .strict(),
  })
  .strict();
export type EffectiveSettingsV1 = z.infer<typeof effectiveSettingsV1>;
