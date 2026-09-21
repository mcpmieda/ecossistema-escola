import { describe, expect, it, vi } from 'vitest';
import { createRelationalImportDiagnosticsReadV2 } from '../../../server/gradebook/persistence/postgres/relational-import-diagnostics-read-v2';
import type { GradebookPostgresReadPortV1 } from '../../../server/gradebook/persistence/postgres/postgres-database-v1';

const diagnosticRow = {
  id: 1, ano: 2026, arquivo: 'fonte-sintetica.xlsb', chave: 'synthetic',
  nivel: 'warning', codigo: 'source-unavailable', turma_codigo: '6A',
  disciplina: 'Matemática', periodo: '1º trimestre', aluno_numero: 1,
  campo: 'term-result', rotulo: 'Resultado', valor_encontrado: null,
  causa: 'Sem resultado salvo', guia: '1º TRI', celula: 'AM5',
  primeiro_em: '2026-09-10T10:00:00.000Z', ultimo_em: '2026-09-10T11:00:00.000Z',
  ocorrencias: 2, aluno_nome: 'Aluno Sintético',
};

describe('relational import diagnostics read V2', () => {
  it('uses one bounded native SELECT with parameterized filters and no writes', async () => {
    const query = vi.fn(async () => [diagnosticRow]);
    const source = createRelationalImportDiagnosticsReadV2({ query } as unknown as GradebookPostgresReadPortV1);
    const page = await source.list({
      year: 2026,
      severities: ['warning'],
      codes: ['source-unavailable'],
      classCode: '6A',
      limit: 50,
      offset: 0,
    });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0] as unknown as [string, readonly unknown[]];
    expect(sql).toMatch(/^SELECT/u);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/iu);
    expect(sql).toContain('d.ano = $1');
    expect(sql).toContain('d.nivel IN ($2)');
    expect(sql).toContain('d.codigo IN ($3)');
    expect(sql).toContain('upper(btrim($4))');
    expect(sql).toContain('LIMIT $5 OFFSET $6');
    expect(values).toEqual([2026, 'warning', 'source-unavailable', '6A', 51, 0]);
    expect(page.items[0]).toMatchObject({ academicYear: 2026, studentName: 'Aluno Sintético', observations: 2 });
    expect(page.nextOffset).toBeNull();
  });

  it('numbers every placeholder once, so SQL text and values cannot drift', async () => {
    // The native path is sent as written: a leftover `?` would reach PostgreSQL untranslated.
    const query = vi.fn(async () => []);
    const source = createRelationalImportDiagnosticsReadV2({ query } as unknown as GradebookPostgresReadPortV1);
    await source.list({
      year: 2026,
      severities: ['warning', 'blocking-error'],
      codes: ['source-unavailable', 'invalid-text', 'above-maximum'],
      classCode: '6A',
      limit: 25,
      offset: 50,
    });
    const [sql, values] = query.mock.calls[0] as unknown as [string, readonly unknown[]];
    expect(sql).not.toContain('?');
    const placeholders = [...sql.matchAll(/\$(\d+)/gu)].map((match) => Number(match[1]));
    expect(placeholders).toEqual(values.map((_, index) => index + 1));
    expect(values).toEqual([2026, 'warning', 'blocking-error', 'source-unavailable', 'invalid-text', 'above-maximum', '6A', 26, 50]);
  });

  it('does not advertise a page beyond the contract offset limit', async () => {
    const query = vi.fn(async () => [diagnosticRow, { ...diagnosticRow, id: 2, chave: 'synthetic-2' }]);
    const source = createRelationalImportDiagnosticsReadV2({ query } as unknown as GradebookPostgresReadPortV1);

    const page = await source.list({
      year: 2026,
      severities: [],
      codes: [],
      classCode: null,
      limit: 1,
      offset: 100_000,
    });

    expect(page.items).toHaveLength(1);
    expect(page.nextOffset).toBeNull();
  });
});
