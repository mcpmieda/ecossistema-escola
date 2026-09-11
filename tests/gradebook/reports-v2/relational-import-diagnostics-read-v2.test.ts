import { describe, expect, it, vi } from 'vitest';
import { createRelationalImportDiagnosticsReadV2 } from '../../../server/gradebook/persistence/postgres/relational-import-diagnostics-read-v2';
import type { D1WriteDatabaseV1 } from '../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';

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
  it('uses one bounded SELECT with parameterized filters and no writes', async () => {
    const all = vi.fn(async () => ({
      results: [diagnosticRow],
    }));
    const bind = vi.fn(() => ({ all }));
    const prepare = vi.fn((sql: string) => ({ bind, sql }));
    const source = createRelationalImportDiagnosticsReadV2({ prepare } as unknown as D1WriteDatabaseV1);
    const page = await source.list({
      year: 2026,
      severities: ['warning'],
      codes: ['source-unavailable'],
      classCode: '6A',
      limit: 50,
      offset: 0,
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    const sql = prepare.mock.calls[0]?.[0] ?? '';
    expect(sql).toMatch(/^SELECT/u);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/iu);
    expect(sql).toContain('d.ano = ?');
    expect(sql).toContain('d.nivel IN (?)');
    expect(sql).toContain('d.codigo IN (?)');
    expect(bind).toHaveBeenCalledWith(2026, 'warning', 'source-unavailable', '6A', 51, 0);
    expect(all).toHaveBeenCalledTimes(1);
    expect(page.items[0]).toMatchObject({ academicYear: 2026, studentName: 'Aluno Sintético', observations: 2 });
    expect(page.nextOffset).toBeNull();
  });

  it('does not advertise a page beyond the contract offset limit', async () => {
    const all = vi.fn(async () => ({
      results: [diagnosticRow, { ...diagnosticRow, id: 2, chave: 'synthetic-2' }],
    }));
    const source = createRelationalImportDiagnosticsReadV2({
      prepare: vi.fn(() => ({ bind: vi.fn(() => ({ all })) })),
    } as unknown as D1WriteDatabaseV1);

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
