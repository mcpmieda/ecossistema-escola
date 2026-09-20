import { compareCanonicalStringsV1 } from '../../../../shared/gradebook-contracts/string-order-v1';

function isCanonicalRecordV1(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function canonicalJsonValueV1(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValueV1);
  if (!isCanonicalRecordV1(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort(compareCanonicalStringsV1)
      .map((key) => [key, canonicalJsonValueV1(value[key])]),
  );
}

export function structurallyEqualJsonV1(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(canonicalJsonValueV1(left)) === JSON.stringify(canonicalJsonValueV1(right));
  } catch {
    return false;
  }
}
