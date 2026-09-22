import { settingsValueV1 } from '../../../shared/student-portal-contracts/policy-v1';
import type { PolicyValueV1 } from './calendar-v1';

/** Runtime barrier only: stored overrides and their editing provenance stay intact. */
export function enforceSchoolAccessV1(local: PolicyValueV1, school: PolicyValueV1): PolicyValueV1 {
  const bounds = (value: PolicyValueV1) =>
    [
      value.calendar.accessStartsAt ?? value.calendar.yearStartsAt,
      value.calendar.accessEndsAt ?? value.calendar.yearEndsAt,
    ] as const;
  const [localStart, localEnd] = bounds(local);
  const [schoolStart, schoolEnd] = bounds(school);
  if (!school.accessEnabled || !localStart || !localEnd || !schoolStart || !schoolEnd)
    return { ...local, accessEnabled: false };
  const start = Math.max(Date.parse(localStart), Date.parse(schoolStart));
  const end = Math.min(Date.parse(localEnd), Date.parse(schoolEnd));
  if (end <= start) return { ...local, accessEnabled: false };
  return settingsValueV1.parse({
    ...local,
    calendar: {
      ...local.calendar,
      accessStartsAt: new Date(start).toISOString(),
      accessEndsAt: new Date(end).toISOString(),
    },
  });
}
