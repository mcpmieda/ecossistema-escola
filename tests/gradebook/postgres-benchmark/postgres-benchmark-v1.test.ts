import { describe, expect, it } from 'vitest';
import {
  createPostgresBenchmarkSnapshotV1,
  parsePostgresBenchmarkApplyResultV1,
  POSTGRES_BENCHMARK_MAX_SIZE_V1,
} from '../../../server/gradebook/benchmark/postgres-benchmark-v1';

describe('Postgres benchmark synthetic model', () => {
  it('creates deterministic synthetic-only rows and changes only the requested prefix', () => {
    const baseline = createPostgresBenchmarkSnapshotV1(5, 1, 5);
    const next = createPostgresBenchmarkSnapshotV1(5, 2, 2);
    expect(baseline).toHaveLength(5);
    expect(next.map((row) => row.stream_key)).toEqual(baseline.map((row) => row.stream_key));
    expect(next[0]!.payload_hash).not.toBe(baseline[0]!.payload_hash);
    expect(next[1]!.payload_hash).not.toBe(baseline[1]!.payload_hash);
    expect(next[2]!.payload_hash).toBe(baseline[2]!.payload_hash);
    expect(JSON.stringify(next)).not.toMatch(/name|email|fileName|studentId/iu);
    expect(next.every((row) => /^[0-9a-f]{64}$/u.test(row.payload_hash))).toBe(true);
  });

  it('rejects out-of-bound workloads', () => {
    expect(() => createPostgresBenchmarkSnapshotV1(0)).toThrow();
    expect(() => createPostgresBenchmarkSnapshotV1(POSTGRES_BENCHMARK_MAX_SIZE_V1 + 1)).toThrow();
    expect(() => createPostgresBenchmarkSnapshotV1(10, 2, 11)).toThrow();
  });

  it('accepts only coherent aggregate results', () => {
    expect(parsePostgresBenchmarkApplyResultV1({ total: '5399', changed: 100, unchanged: 5299 })).toEqual({
      total: 5399,
      changed: 100,
      unchanged: 5299,
    });
    expect(() => parsePostgresBenchmarkApplyResultV1({ total: 10, changed: 1, unchanged: 8 })).toThrow();
  });
});
