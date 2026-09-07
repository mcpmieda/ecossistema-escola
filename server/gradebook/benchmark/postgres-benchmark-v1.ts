export const POSTGRES_BENCHMARK_DEFAULT_SIZE_V1 = 5_399;
export const POSTGRES_BENCHMARK_MAX_SIZE_V1 = 10_000;
export const POSTGRES_BENCHMARK_DEFAULT_CHANGED_V1 = 100;

export interface PostgresBenchmarkSnapshotItemV1 {
  readonly stream_key: string;
  readonly payload_hash: string;
  readonly payload: {
    readonly student: number;
    readonly component: number;
    readonly term: number;
    readonly value: number;
    readonly authorityMode: 'imported-source';
  };
}

export interface PostgresBenchmarkApplyResultV1 {
  readonly total: number;
  readonly changed: number;
  readonly unchanged: number;
}

function syntheticHash(index: number, revision: number): string {
  const value = BigInt(index) + BigInt(revision) * 1_000_000n;
  return value.toString(16).padStart(64, '0');
}

export function createPostgresBenchmarkSnapshotV1(
  size = POSTGRES_BENCHMARK_DEFAULT_SIZE_V1,
  revision = 1,
  changedPrefix = size,
): readonly PostgresBenchmarkSnapshotItemV1[] {
  if (!Number.isInteger(size) || size < 1 || size > POSTGRES_BENCHMARK_MAX_SIZE_V1)
    throw new RangeError('postgres-benchmark-size-invalid');
  if (!Number.isInteger(revision) || revision < 1) throw new RangeError('postgres-benchmark-revision-invalid');
  if (!Number.isInteger(changedPrefix) || changedPrefix < 0 || changedPrefix > size)
    throw new RangeError('postgres-benchmark-changed-prefix-invalid');

  return Array.from({ length: size }, (_, offset) => {
    const index = offset + 1;
    const rowRevision = index <= changedPrefix ? revision : 1;
    return {
      stream_key: `stream:${index}`,
      payload_hash: syntheticHash(index, rowRevision),
      payload: {
        student: index % 900,
        component: index % 468,
        term: (index % 3) + 1,
        value: (index % 100) / 10 + (rowRevision > 1 ? 0.1 : 0),
        authorityMode: 'imported-source',
      },
    };
  });
}

export function parsePostgresBenchmarkApplyResultV1(value: unknown): PostgresBenchmarkApplyResultV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('postgres-benchmark-result-invalid');
  const row = value as Record<string, unknown>;
  const asInteger = (candidate: unknown): number => {
    const parsed = typeof candidate === 'string' ? Number(candidate) : candidate;
    if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed < 0)
      throw new TypeError('postgres-benchmark-result-invalid');
    return parsed;
  };
  const result = {
    total: asInteger(row.total),
    changed: asInteger(row.changed),
    unchanged: asInteger(row.unchanged),
  };
  if (result.changed + result.unchanged !== result.total)
    throw new TypeError('postgres-benchmark-result-invalid');
  return result;
}
