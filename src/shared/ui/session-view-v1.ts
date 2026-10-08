/*
 * What the operator had chosen on a screen (a class, a period, a tab), kept for this browser
 * tab so a reload returns to the same view. Only identifiers of choices are kept, never names,
 * marks or any other academic data, and the screen revalidates them against what it reads.
 */
const PREFIX_V1 = 'ecossistema-view-v1:';

export function readSessionViewV1<T>(key: string, parse: (value: unknown) => T | null): T | null {
  try {
    const stored = window.sessionStorage.getItem(PREFIX_V1 + key);
    return stored === null ? null : parse(JSON.parse(stored) as unknown);
  } catch {
    // Blocked storage or a malformed entry: the screen simply opens on its defaults.
    return null;
  }
}

/** The stored view as a plain record, for screens that check each field themselves. */
export function readSessionRecordV1(key: string): Readonly<Record<string, unknown>> | null {
  return readSessionViewV1(key, (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null,
  );
}

export const storedIdV1 = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;

export function writeSessionViewV1(key: string, value: unknown): void {
  try {
    window.sessionStorage.setItem(PREFIX_V1 + key, JSON.stringify(value));
  } catch {
    // Persistence is a convenience; the screen works without it.
  }
}
