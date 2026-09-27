import { z } from 'zod';
import { instantV1 } from './core-v1';

/*
 * Agendamentos de acesso (owner decision 2026-09-27). Each level (school, class, student) may keep
 * its own access: a switch plus scheduled "Abrir"/"Fechar" actions. The last action already
 * reached wins — a scheduled one when its time comes, or the switch as saved — so a closed Portal
 * with an "Abrir" in the future opens by itself, and the admin may change either at any time.
 *
 * The school still prevails: a student may enter only while both the school and the student's own
 * level (class or student, when they have one) are open.
 */
export const accessActionV1 = z.enum(['open', 'close']);
export const accessEventV1 = z.object({ at: instantV1, action: accessActionV1 }).strict();
export const accessScheduleV1 = z
  .array(accessEventV1)
  .max(40)
  .refine(
    (events) => events.every((event, index) => index === 0 || Date.parse(events[index - 1]!.at) < Date.parse(event.at)),
    'Access schedule must be in time order without repeated times',
  );
export type AccessEventV1 = z.infer<typeof accessEventV1>;
export type AccessScheduleV1 = z.infer<typeof accessScheduleV1>;

/** `enabled` is the switch as saved; the schedule acts on it from each event's time. */
export type AccessPlanV1 = { readonly enabled: boolean; readonly schedule: readonly AccessEventV1[] };

/** Open at `time`: the last event reached, else the saved switch. Events include their instant. */
export function accessOpenAtV1(plan: AccessPlanV1, time: number): boolean {
  let open = plan.enabled;
  for (const event of plan.schedule) {
    if (Date.parse(event.at) > time) break;
    open = event.action === 'open';
  }
  return open;
}

/** First instant after `time` at which the plan becomes `open` (true) or closed (false). */
export function nextAccessChangeV1(plan: AccessPlanV1, time: number, open: boolean): number | null {
  if (accessOpenAtV1(plan, time) === open) {
    // Already there: find when it leaves and comes back, if at all.
    const leaves = nextAccessChangeV1(plan, time, !open);
    return leaves === null ? null : nextAccessChangeV1(plan, leaves, open);
  }
  for (const event of plan.schedule) {
    const at = Date.parse(event.at);
    if (at > time && (event.action === 'open') === open) return at;
  }
  return null;
}

/** Both open at once: the school barrier over a class or student plan, as a single exact plan. */
export function combineAccessPlansV1(left: AccessPlanV1, right: AccessPlanV1): AccessPlanV1 {
  const times = [...new Set([...left.schedule, ...right.schedule].map((event) => Date.parse(event.at)))].sort(
    (a, b) => a - b,
  );
  return {
    enabled: left.enabled && right.enabled,
    schedule: times.map((time) => ({
      at: new Date(time).toISOString(),
      action: accessOpenAtV1(left, time) && accessOpenAtV1(right, time) ? ('open' as const) : ('close' as const),
    })),
  };
}

/**
 * The old "Quando o aluno pode entrar" window as a plan: closed until it starts, open inside it,
 * closed from its end. Without the switch, or without both ends, it never opens.
 */
export function legacyAccessPlanV1(
  enabled: boolean,
  start: string | null | undefined,
  end: string | null | undefined,
): AccessPlanV1 {
  if (!enabled || !start || !end || Date.parse(end) <= Date.parse(start))
    return { enabled: false, schedule: [] };
  return {
    enabled: false,
    schedule: [
      { at: new Date(Date.parse(start)).toISOString(), action: 'open' },
      { at: new Date(Date.parse(end)).toISOString(), action: 'close' },
    ],
  };
}

/** How the admin saves a plan: the switch holds the state now; only future actions remain. */
export function settleAccessPlanV1(plan: AccessPlanV1, time: number): AccessPlanV1 {
  return {
    enabled: accessOpenAtV1(plan, time),
    schedule: plan.schedule.filter((event) => Date.parse(event.at) > time),
  };
}
