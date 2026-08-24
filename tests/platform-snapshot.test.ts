import { describe, expect, it } from 'vitest';
import { parseRolesJson } from '../server/platform/snapshot';

describe('platform snapshot parsing', () => {
  it('accepts a valid role allowlist', () => {
    expect(parseRolesJson('["ADMINISTRADOR","PROFESSOR"]')).toEqual(['ADMINISTRADOR', 'PROFESSOR']);
  });

  it('fails closed for malformed or unexpected role data', () => {
    expect(parseRolesJson('{')).toEqual([]);
    expect(parseRolesJson('{"role":"ADMINISTRADOR"}')).toEqual([]);
    expect(parseRolesJson(undefined)).toEqual([]);
  });
});
