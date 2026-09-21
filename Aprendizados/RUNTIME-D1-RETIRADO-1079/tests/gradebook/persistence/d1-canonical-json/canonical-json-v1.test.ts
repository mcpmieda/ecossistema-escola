import { describe, expect, it } from 'vitest';

import {
  canonicalJsonValueV1,
  structurallyEqualJsonV1,
} from '../../../../server/gradebook/persistence/d1/canonical-json-v1';

describe('D1 canonical JSON V1', () => {
  it('orders object keys recursively and omits only undefined object properties', () => {
    expect(canonicalJsonValueV1({
      z: 2,
      ignored: undefined,
      nested: { b: 2, a: 1 },
      a: [{ y: 2, x: 1 }],
    })).toEqual({
      a: [{ x: 1, y: 2 }],
      nested: { a: 1, b: 2 },
      z: 2,
    });
  });

  it('treats key order and undefined object properties as structurally equivalent', () => {
    expect(structurallyEqualJsonV1(
      { b: { y: 2, x: 1 }, a: 1, ignored: undefined },
      { a: 1, b: { x: 1, y: 2 } },
    )).toBe(true);
  });

  it('preserves array order as meaningful', () => {
    expect(structurallyEqualJsonV1(['a', 'b'], ['b', 'a'])).toBe(false);
  });

  it('fails closed when canonical values cannot be JSON serialized', () => {
    expect(structurallyEqualJsonV1({ value: 1n }, { value: 1n })).toBe(false);
  });
});
