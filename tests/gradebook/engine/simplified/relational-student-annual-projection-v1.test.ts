import { describe, expect, it } from 'vitest';
import type { D1ReadDatabaseV1 } from '../../../../server/gradebook/persistence/d1/read/d1-read-adapter-v1';
import {
  createRelationalStudentAnnualProjectionServiceV1,
  type RelationalStudentAnnualProjectionDependenciesV1,
} from '../../../../server/gradebook/application/results/relational-student-annual-projection-v1';
import type { RelationalAcademicProjectionV1 } from '../../../../server/gradebook/application/results/relational-academic-projection-v1';

type Row = Record<string, unknown>;

function fakeDatabase(input: {
  readonly base?: Row | null;
  readonly offers?: readonly Row[];
  readonly queries?: string[];
}): D1ReadDatabaseV1 {
  return {
    prepare(sql: string) {
      input.queries?.push(sql);
      return {
        bind() {
          return this;
        },
        async first<T extends Row>() {
          if (sql.includes('FROM gradebook.aluno a')) return (input.base ?? null) as T | null;
          return null;
        },
        async all<T extends Row>() {
          return {
            results: (sql.includes('FROM gradebook.oferta o') ? input.offers ?? [] : []) as readonly T[],
          };
        },
      };
    },
  };
}

function projection(
  classification:
    | 'in-progress'
    | 'approved-direct'
    | 'recovery-pending'
    | 'approved-after-recovery'
    | 'not-approved'
    | 'failed-no-show',
  input: {
    readonly ano?: number;
    readonly am?: readonly ['match' | 'mismatch' | 'unavailable', 'match' | 'mismatch' | 'unavailable', 'match' | 'mismatch' | 'unavailable'];
    readonly u?: 'match' | 'mismatch' | 'unavailable';
  } = {},
): RelationalAcademicProjectionV1 {
  const am = input.am ?? ['match', 'match', 'match'];
  return {
    ano: input.ano ?? 2026,
    ofertaId: 1,
    alunoId: 1,
    minimumApprovalMilli: 60_000,
    terms: [1, 2, 3].map((term, index) => ({
      term,
      outcome: {},
      sourceAmMilli: null,
      sourceComparison: am[index],
    })),
    recovery: { classification },
    sourceUMilli: null,
    sourceUComparison: input.u ?? 'unavailable',
  } as unknown as RelationalAcademicProjectionV1;
}

const base: Row = {
  ano: 2026,
  aluno_nome: 'ALUNO TESTE',
  conselho_anterior: 0,
  turma_id: 7,
  numero: 12,
  situacao: null,
  turma_codigo: '7A',
  turma_nome: '7º ANO A',
  minimo_aprovacao: 60_000,
  max_componentes_conselho: 2,
  conselho_decisao: null,
};

const offers: readonly Row[] = [
  {
    oferta_id: 41,
    disciplina_id: 5,
    disciplina_nome: 'ARTE',
    professor_id: 3,
    professor_nome: 'PROFESSOR A',
  },
  {
    oferta_id: 42,
    disciplina_id: 6,
    disciplina_nome: 'REDAÇÃO',
    professor_id: 4,
    professor_nome: 'PROFESSOR B',
  },
];

describe('relational student annual projection v1', () => {
  it('aggregates only current-class offers into the calculated annual outcome', async () => {
    const queries: string[] = [];
    const projected = new Map<number, RelationalAcademicProjectionV1>([
      [41, projection('approved-direct', { u: 'match' })],
      [42, projection('approved-direct')],
    ]);
    const dependencies: RelationalStudentAnnualProjectionDependenciesV1 = {
      projectOffer: async ({ ofertaId }) => projected.get(ofertaId)!,
    };

    const result = await createRelationalStudentAnnualProjectionServiceV1(
      fakeDatabase({ base, offers, queries }),
      dependencies,
    ).project({ ano: 2026, alunoId: 9 });

    expect(result.turma).toEqual({ id: 7, codigo: '7A', nome: '7º ANO A', numero: 12 });
    expect(result.components.map((component) => component.disciplina)).toEqual(['ARTE', 'REDAÇÃO']);
    expect(result.calculatedAnnual.visibleResult).toBe('APROVADO DIRETO');
    expect(result.calculatedAnnual.failedComponentCount).toBe(0);
    expect(result.formalCouncilDecision).toBeNull();
    expect(result.homologation.am).toEqual({ match: 6, mismatch: 0, unavailable: 0 });
    expect(result.homologation.u).toEqual({ match: 1, mismatch: 0, unavailable: 1 });
    expect(queries[0]).toContain('COALESCE(v.situacao, 0) <> 6');
  });

  it('honors terminal enrollment status before any grade projection', async () => {
    const queries: string[] = [];
    let projectionCalls = 0;
    const assistedBase = { ...base, situacao: 2, conselho_anterior: null };
    const result = await createRelationalStudentAnnualProjectionServiceV1(
      fakeDatabase({ base: assistedBase, offers, queries }),
      {
        projectOffer: async () => {
          projectionCalls += 1;
          throw new Error('offer should not be projected for terminal status');
        },
      },
    ).project({ ano: 2026, alunoId: 9 });

    expect(result.status).toBe(2);
    expect(result.components).toEqual([]);
    expect(result.calculatedAnnual.state).toBe('no-result');
    expect(result.calculatedAnnual.visibleResult).toBeNull();
    expect(result.homologation.am).toEqual({ match: 0, mismatch: 0, unavailable: 0 });
    expect(projectionCalls).toBe(0);
    expect(queries.some((query) => query.includes('FROM gradebook.oferta o'))).toBe(false);
  });

  it('blocks duplicate current offers for the same discipline instead of double-counting it', async () => {
    const duplicated: readonly Row[] = [
      offers[0]!,
      {
        oferta_id: 99,
        disciplina_id: 5,
        disciplina_nome: 'ARTE',
        professor_id: 8,
        professor_nome: 'PROFESSOR NOVO',
      },
    ];

    await expect(
      createRelationalStudentAnnualProjectionServiceV1(
        fakeDatabase({ base, offers: duplicated }),
        { projectOffer: async () => projection('approved-direct') },
      ).project({ ano: 2026, alunoId: 9 }),
    ).rejects.toMatchObject({ code: 'duplicate-current-discipline-offers' });
  });

  it('keeps the formal Council decision separate from the calculated eligibility', async () => {
    const councilBase = { ...base, conselho_decisao: 1 };
    const result = await createRelationalStudentAnnualProjectionServiceV1(
      fakeDatabase({ base: councilBase, offers: [offers[0]!] }),
      { projectOffer: async () => projection('not-approved') },
    ).project({ ano: 2026, alunoId: 9 });

    expect(result.calculatedAnnual.state).toBe('council-eligible');
    expect(result.calculatedAnnual.visibleResult).toBeNull();
    expect(result.formalCouncilDecision).toEqual({
      code: 1,
      visibleResult: 'APROVADO PELO CONSELHO',
    });
  });

  it('does not project a student without a current binding', async () => {
    await expect(
      createRelationalStudentAnnualProjectionServiceV1(fakeDatabase({ base: null })).project({
        ano: 2026,
        alunoId: 9,
      }),
    ).rejects.toMatchObject({ code: 'student-current-binding-not-found' });
  });
});
