import type { AcademicYearId, AcademicYearStatusV1 } from '../entities';

export const ACADEMIC_YEAR_MANAGEMENT_VERSION_V1 = 1 as const;

export type AcademicYearManagementRequestV1 =
  | { readonly managementVersion: 1; readonly operation: 'list' }
  | { readonly managementVersion: 1; readonly operation: 'create'; readonly year: number };

export interface AcademicYearManagementItemV1 {
  readonly id: AcademicYearId;
  readonly year: number;
  readonly status: AcademicYearStatusV1;
}

export type AcademicYearManagementResponseV1 =
  | {
      readonly managementVersion: 1;
      readonly state: 'ready';
      readonly items: readonly AcademicYearManagementItemV1[];
    }
  | {
      readonly managementVersion: 1;
      readonly state: 'created' | 'already-present';
      readonly item: AcademicYearManagementItemV1;
    }
  | { readonly managementVersion: 1; readonly state: 'not-authorized' | 'unavailable' };

export function isAcademicYearManagementRequestV1(
  value: unknown,
): value is AcademicYearManagementRequestV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  if (request.managementVersion !== 1) return false;
  if (request.operation === 'list') {
    return Object.keys(request).length === 2;
  }
  return (
    request.operation === 'create' &&
    Object.keys(request).length === 3 &&
    typeof request.year === 'number' &&
    Number.isSafeInteger(request.year) &&
    request.year >= 2000 &&
    request.year <= 9999
  );
}

export function isAcademicYearManagementResponseV1(
  value: unknown,
): value is AcademicYearManagementResponseV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const response = value as Record<string, unknown>;
  if (response.managementVersion !== 1 || typeof response.state !== 'string') return false;
  if (response.state === 'not-authorized' || response.state === 'unavailable') return true;
  const validItem = (candidate: unknown) => {
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate))
      return false;
    const item = candidate as Record<string, unknown>;
    return (
      typeof item.id === 'string' &&
      item.id.trim().length > 0 &&
      typeof item.year === 'number' &&
      Number.isSafeInteger(item.year) &&
      item.year >= 2000 &&
      item.year <= 9999 &&
      (item.status === 'planned' || item.status === 'active' || item.status === 'closed')
    );
  };
  if (response.state === 'ready') {
    return Array.isArray(response.items) && response.items.every(validItem);
  }
  return (
    (response.state === 'created' || response.state === 'already-present') &&
    validItem(response.item)
  );
}
