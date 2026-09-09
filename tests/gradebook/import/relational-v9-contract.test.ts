import { describe, expect, it } from 'vitest';
import {
  inspectGradebookImportPersistenceRequestV9,
  type GradebookNotesImportRequestV9,
  type GradebookRelationImportRequestV9,
} from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v9';
import { canonicalMilliV9 } from '../../../src/features/gradebook/import/canonical-import-v9';
import {
  parseRelationStatusV9,
  recognizeMasterRelationV9,
} from '../../../src/features/gradebook/import/master-relation-v9';
import type { Workbook, Worksheet } from '../../../src/features/gradebook/import/spreadsheet-recognizer';

function sheet(cells: Record<string, unknown>): Worksheet {
  return Object.fromEntries(
    Object.entries(cells).map(([address, value]) => [address, { v: value }]),
  ) as Worksheet;
}

const manifest = {
  fileName: 'teste.xlsb',
  sha256: 'a'.repeat(64),
  parserVersion: 'xlsx-0.20.3:canonical-v9',
} as const;

describe('gradebook relational import v9', () => {
  it('normalizes relation statuses without persisting NOVATO', () => {
    expect(parseRelationStatusV9(' NOVATO ')).toEqual([0]);
    expect(parseRelationStatusV9('  ASSISTIDO  ')).toEqual([2]);
    expect(parseRelationStatusV9('FALECIDO.')).toEqual([5]);
    expect(parseRelationStatusV9('FOI PARA O 6B')).toEqual([6, '6B']);
    expect(parseRelationStatusV9('ESTAVA NO 6A')).toEqual([7, '6A']);
  });

  it('recognizes year, class metadata and linked movement from the master relation', () => {
    const workbook: Workbook = {
      SheetNames: ['INICIO', '|| VINCULO AGENDA ||'],
      Sheets: {
        INICIO: sheet({
          G2: 2026,
          D7: 6,
          E7: '6A',
          F7: '6º ANO A',
          I7: 'MATUTINO',
          D8: 6,
          E8: '6B',
          F8: '6º ANO B',
          I8: 'MATUTINO',
        }),
        '|| VINCULO AGENDA ||': sheet({
          I3: 'FOI PARA O 6B',
          J3: 'ALUNO TESTE',
          K3: 'ESTAVA NO 6A',
          L3: 'ALUNO TESTE',
          K4: '  ASSISTIDO  ',
          L4: 'OUTRO ALUNO',
        }),
      },
    };
    const result = recognizeMasterRelationV9(workbook);
    expect(result?.ano).toBe(2026);
    expect(result?.turmas).toHaveLength(2);
    expect(result?.turmas[0]).toMatchObject({ codigo: '6A', nome: '6º ANO A', etapa: 6 });
    expect(result?.turmas[0]?.alunos[0]).toEqual([1, 'ALUNO TESTE', 6, '6B']);
    expect(result?.turmas[1]?.alunos[0]).toEqual([1, 'ALUNO TESTE', 7, '6A']);
    expect(result?.turmas[1]?.alunos[1]).toEqual([2, 'OUTRO ALUNO', 2]);
  });

  it('accepts the current Relation layout where the year is stored in Q2', () => {
    const workbook: Workbook = {
      SheetNames: ['INICIO', '|| VINCULO AGENDA ||'],
      Sheets: {
        INICIO: sheet({ Q2: 2026, D7: 6, E7: '6A', F7: '6º ANO A', I7: 'MATUTINO' }),
        '|| VINCULO AGENDA ||': sheet({ J3: 'ALUNO TESTE' }),
      },
    };
    expect(recognizeMasterRelationV9(workbook)?.ano).toBe(2026);
  });

  it('blocks contradictory year cells instead of guessing', () => {
    const workbook: Workbook = {
      SheetNames: ['INICIO', '|| VINCULO AGENDA ||'],
      Sheets: {
        INICIO: sheet({ G2: 2025, Q2: 2026, D7: 6, E7: '6A', F7: '6º ANO A', I7: 'MATUTINO' }),
        '|| VINCULO AGENDA ||': sheet({ J3: 'ALUNO TESTE' }),
      },
    };
    expect(() => recognizeMasterRelationV9(workbook)).toThrow(/ambíguo/iu);
  });

  it('accepts exact thousandths and rejects academic rounding', () => {
    expect(canonicalMilliV9(7.25)).toBe(7250);
    expect(canonicalMilliV9(8.1)).toBe(8100);
    expect(() => canonicalMilliV9(7.2501)).toThrow(/3 casas/iu);
  });

  it('validates a compact relation request', () => {
    const request: GradebookRelationImportRequestV9 = {
      transportVersion: 9,
      operation: 'persist-relacao',
      manifest,
      ano: 2026,
      turmas: [
        {
          codigo: '6A',
          nome: '6º ANO A',
          etapa: 6,
          turno: 'MATUTINO',
          alunos: [[1, 'ALUNO TESTE', 0]],
        },
      ],
    };
    expect(inspectGradebookImportPersistenceRequestV9(request)).toBe('ready');
  });

  it('validates explicit empty, unavailable and N/C without student names in teacher rows', () => {
    const request: GradebookNotesImportRequestV9 = {
      transportVersion: 9,
      operation: 'persist-notas',
      manifest,
      ano: 2026,
      professor: 'PROFESSOR TESTE',
      ofertas: [
        {
          turmaCodigo: '6A',
          disciplina: 'MATEMÁTICA',
          trimestres: [1, 2, 3].map((trimestre) => ({
            trimestre: trimestre as 1 | 2 | 3,
            instrumentos: [[1, 10000], [2, 10000], [3, null]],
            alunos: [[1, [7250, null, ['u'] as const], null]],
          })) as unknown as GradebookNotesImportRequestV9['ofertas'][number]['trimestres'],
          recuperacao: [[1, ['n'], null, ['u'], 60000]],
        },
      ],
    };
    expect(inspectGradebookImportPersistenceRequestV9(request)).toBe('ready');
    expect(JSON.stringify(request)).not.toContain('ALUNO TESTE');
  });
});
