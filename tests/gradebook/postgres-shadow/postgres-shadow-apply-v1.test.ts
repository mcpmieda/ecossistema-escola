import { describe, expect, it } from 'vitest';
import {
  inspectPostgresShadowItemsV1,
  PostgresShadowApplyErrorV1,
  type PostgresShadowBoundsV1,
  type PostgresShadowItemV1,
} from '../../../server/gradebook/persistence/shadow/postgres-shadow-apply-v1';

function item(index: number, payload: unknown = { value: index }): PostgresShadowItemV1 {
  return {
    category: 'academic-record',
    stream_key: `synthetic:${index}`,
    expected_version: null,
    payload,
  };
}

function bounds(overrides: Partial<PostgresShadowBoundsV1> = {}): PostgresShadowBoundsV1 {
  return {
    maxItems: 100,
    maxBytes: 10_000,
    chunkBytes: 1_000,
    chunkItems: 10,
    ...overrides,
  };
}

function expectInspectionFailure(
  action: () => unknown,
  code: PostgresShadowApplyErrorV1['code'],
): PostgresShadowApplyErrorV1 {
  try {
    action();
  } catch (cause) {
    expect(cause).toBeInstanceOf(PostgresShadowApplyErrorV1);
    expect(cause).toMatchObject({ stage: 'inspect', code });
    return cause as PostgresShadowApplyErrorV1;
  }
  throw new Error('expected shadow inspection failure');
}

describe('Postgres shadow diagnostics', () => {
  it('reports only aggregate transport metrics for a valid capture', () => {
    const result = inspectPostgresShadowItemsV1([item(1), item(2), item(3)], bounds({ chunkItems: 2 }));
    expect(result).toMatchObject({
      itemCount: 3,
      chunkCount: 2,
      duplicateKeys: 0,
    });
    expect(result.payloadBytes).toBeGreaterThan(0);
    expect(result.maxItemBytes).toBeGreaterThan(0);
    expect(result.maxItemBytes).toBeLessThan(result.payloadBytes);
  });

  it('fails closed with aggregate metrics when one item exceeds the chunk bound', () => {
    const failure = expectInspectionFailure(
      () => inspectPostgresShadowItemsV1([item(1, { value: 'x'.repeat(300) })], bounds({ chunkBytes: 100 })),
      'item-too-large',
    );
    expect(failure.diagnostics).toMatchObject({ itemCount: 1, chunkCount: 0, duplicateKeys: 0 });
    expect(failure.diagnostics.maxItemBytes).toBeGreaterThan(100);
  });

  it('distinguishes a total payload bound from an individual item bound', () => {
    const failure = expectInspectionFailure(
      () =>
        inspectPostgresShadowItemsV1(
          [item(1, { value: 'a'.repeat(150) }), item(2, { value: 'b'.repeat(150) })],
          bounds({ maxBytes: 250, chunkBytes: 1_000 }),
        ),
      'payload-too-large',
    );
    expect(failure.diagnostics.itemCount).toBe(2);
    expect(failure.diagnostics.payloadBytes).toBeGreaterThan(250);
  });

  it('detects duplicate category/stream keys before PostgreSQL', () => {
    const duplicate = { ...item(1), payload: { value: 'second' } };
    const failure = expectInspectionFailure(
      () => inspectPostgresShadowItemsV1([item(1), duplicate], bounds()),
      'duplicate-key',
    );
    expect(failure.diagnostics.duplicateKeys).toBe(1);
  });

  it('sanitizes JSON serialization failures without exposing the payload', () => {
    const failure = expectInspectionFailure(
      () => inspectPostgresShadowItemsV1([item(1, { value: 1n })], bounds()),
      'serialization-failed',
    );
    expect(failure.message).toBe('serialization-failed');
    expect(failure.diagnostics.itemCount).toBe(1);
  });

  it('rejects an empty capture as an inspection error', () => {
    const failure = expectInspectionFailure(
      () => inspectPostgresShadowItemsV1([], bounds()),
      'item-count-invalid',
    );
    expect(failure.diagnostics).toMatchObject({
      itemCount: 0,
      payloadBytes: 0,
      maxItemBytes: 0,
      chunkCount: 0,
    });
  });
});
