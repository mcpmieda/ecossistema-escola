import { describe, expect, it } from 'vitest';
import {
  applyInstitutionalQualitativeCorrectionsV1,
  correctInstitutionalQualitativeDefinitionV1,
} from '../../../shared/gradebook-contracts/source/institutional-qualitative-corrections-v1';
import type {
  GradebookImportInstrumentV9,
  GradebookNotesImportRequestV9,
} from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v9';

const manifest = {
  fileName: 'NOTAS LURMARIA 2026.xlsb',
  sha256: 'a'.repeat(64),
  parserVersion: 'synthetic',
} as const;

function request(
  definition: GradebookImportInstrumentV9,
  value: null | number | readonly ['u'] = null,
): GradebookNotesImportRequestV9 {
  const term = (trimestre: 1 | 2 | 3) => ({
    trimestre,
    instrumentos: trimestre === 2 ? [definition] : ([[11, 16500, 'ATIVIDADE']] as const),
    alunos: [[1, [trimestre === 2 ? value : 1000], null]] as const,
  });
  return {
    transportVersion: 9,
    operation: 'persist-notas',
    granularObservationVersion: 1,
    manifest,
    ano: 2026,
    professor: 'LURMÁRIA',
    ofertas: [{
      turmaCodigo: '7C',
      disciplina: 'RELIGIÃO',
      trimestres: [term(1), term(2), term(3)],
      recuperacao: null,
    }],
  };
}

describe('institutional qualitative corrections #855', () => {
  it('restores the proved 6A Ética T2 maximum to 6.0 before persistence', () => {
    expect(
      correctInstitutionalQualitativeDefinitionV1({
        ano: 2026,
        professor: 'CLEBER',
        turmaCodigo: '6A',
        disciplina: 'ÉTICA',
        trimestre: 2,
        definition: [12, 3000, '2ª ATIVIDADE'],
      }),
    ).toEqual([12, 6000, '2ª ATIVIDADE']);
    expect(
      correctInstitutionalQualitativeDefinitionV1({
        ano: 2026,
        professor: 'CLEBER',
        turmaCodigo: '6A',
        disciplina: 'ÉTICA',
        trimestre: 2,
        definition: [12, 6000, '2ª ATIVIDADE'],
      }),
    ).toEqual([12, 6000, '2ª ATIVIDADE']);
  });

  it('suppresses only the exact audited empty 7C Religiao T2 P.D. definition', () => {
    const corrected = applyInstitutionalQualitativeCorrectionsV1(
      request([14, 4500, 'P.D.']),
    );
    if (corrected.operation !== 'persist-notas') throw new Error('notes expected');
    expect(corrected.ofertas[0]!.trimestres[1].instrumentos[0]).toEqual([14, null]);
    expect(corrected.ofertas[0]!.trimestres[1].alunos[0]![1][0]).toBeNull();
  });

  it.each([0, 100, ['u'] as const])(
    'fails closed if a suppressed slot gains source evidence %j',
    (value) => {
      expect(() =>
        applyInstitutionalQualitativeCorrectionsV1(
          request([14, 4500, 'P.D.'], value),
        ),
      ).toThrow(/passou a conter lançamento/iu);
    },
  );

  it('fails closed if the investigated source definition changes', () => {
    expect(() =>
      correctInstitutionalQualitativeDefinitionV1({
        ano: 2026,
        professor: 'LURMÁRIA',
        turmaCodigo: '7C',
        disciplina: 'RELIGIÃO',
        trimestre: 2,
        definition: [14, 5000, 'P.D.'],
      }),
    ).toThrow(/precisa ser revista/iu);
  });

  it('does not touch T3 or unrelated offers', () => {
    const t3 = [14, 4500, 'P.D.'] as const;
    expect(
      correctInstitutionalQualitativeDefinitionV1({
        ano: 2026,
        professor: 'LURMÁRIA',
        turmaCodigo: '7C',
        disciplina: 'RELIGIÃO',
        trimestre: 3,
        definition: t3,
      }),
    ).toBe(t3);

    const unrelated = [14, 4500, 'P.D.'] as const;
    expect(
      correctInstitutionalQualitativeDefinitionV1({
        ano: 2026,
        professor: 'OUTRO',
        turmaCodigo: '7C',
        disciplina: 'RELIGIÃO',
        trimestre: 2,
        definition: unrelated,
      }),
    ).toBe(unrelated);
  });
});
