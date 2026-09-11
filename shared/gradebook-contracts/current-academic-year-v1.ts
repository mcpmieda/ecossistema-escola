/** Product scope fixed by #649. Year columns remain structural isolation keys. */
export const CURRENT_GRADEBOOK_ACADEMIC_YEAR_V1 = 2026 as const;

export function isCurrentGradebookAcademicYearV1(
  value: unknown,
): value is typeof CURRENT_GRADEBOOK_ACADEMIC_YEAR_V1 {
  return value === CURRENT_GRADEBOOK_ACADEMIC_YEAR_V1;
}
