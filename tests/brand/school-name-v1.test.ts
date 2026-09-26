// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCHOOL_CARD_NAME_LINES_V1, SCHOOL_NAME_V1 } from '../../src/shared/brand/school-name-v1';

describe('official school name', () => {
  it('keeps the owner-approved spelling', () => {
    expect(SCHOOL_NAME_V1).toBe('Escola Mun. Prof.ª Iêda Alves de Oliveira MCPM');
  });

  it('splits the access card header without dropping any part of the name', () => {
    expect(SCHOOL_CARD_NAME_LINES_V1).toEqual([
      'ESCOLA MUN.',
      'PROF.ª IÊDA ALVES DE OLIVEIRA MCPM',
    ]);
    expect(SCHOOL_CARD_NAME_LINES_V1.join(' ')).toBe(SCHOOL_NAME_V1.toLocaleUpperCase('pt-BR'));
  });

  it('is not spelled out by hand in the card renderer or the Portal page title', () => {
    const renderer = readFileSync(
      'src/features/student-portal-admin/credentials/qr-access-card-render-v1.ts',
      'utf8',
    );
    expect(renderer).not.toMatch(/ESCOLA MUNICIPAL|IÊDA ALVES/u);
    expect(readFileSync('src/student-portal/index.html', 'utf8')).toContain(SCHOOL_NAME_V1);
  });
});
