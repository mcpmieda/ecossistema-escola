import { describe, expect, it } from 'vitest';
import { resolveSafeReturnHref } from '../src/banco-notas/safe-return';

describe('Banco de Notas safe internal return', () => {
  it('returns to Turmas and Acompanhamento through root-relative internal paths', () => {
    expect(resolveSafeReturnHref('/turmas/turma-1', '/professores')).toBe('/turmas/turma-1');
    expect(resolveSafeReturnHref('/acompanhamento?teacherId=teacher-1', '/professores')).toBe(
      '/acompanhamento?teacherId=teacher-1',
    );
    expect(resolveSafeReturnHref('/acompanhamento/turmas/turma-1', '/professores')).toBe(
      '/acompanhamento/turmas/turma-1',
    );
  });

  it('preserves list query context and uses the plain fallback when empty', () => {
    expect(resolveSafeReturnHref('schoolYearId=2026&page=2', '/professores')).toBe(
      '/professores?schoolYearId=2026&page=2',
    );
    expect(resolveSafeReturnHref('', '/professores')).toBe('/professores');
  });

  it('rejects protocol-relative and backslash-prefixed return targets', () => {
    expect(resolveSafeReturnHref('//example.com/path', '/professores')).toBe('/professores');
    expect(resolveSafeReturnHref('/\\example.com/path', '/professores')).toBe('/professores');
  });
});
