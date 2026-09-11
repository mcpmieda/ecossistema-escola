import { CURRENT_GRADEBOOK_ACADEMIC_YEAR_V1 } from '../../shared/gradebook-contracts/current-academic-year-v1';

/** Legacy IDs are opaque: only map the global year to one exact catalogue label. */
export function resolveLegacyAcademicYear<T extends { readonly id: string; readonly label: string }>(
  year: number | null | undefined,
  options: readonly T[],
): T['id'] | null {
  if (year !== CURRENT_GRADEBOOK_ACADEMIC_YEAR_V1) return null;
  const matches = options.filter((option) => option.label.trim() === String(year));
  return matches.length === 1 ? matches[0]!.id : null;
}
