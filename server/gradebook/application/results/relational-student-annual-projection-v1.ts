import type { D1ReadDatabaseV1 } from '../../persistence/d1/read/d1-read-adapter-v1';
import {
  createRelationalAcademicProjectionServiceV1,
  type RelationalAcademicProjectionV1,
  type RelationalSourceComparisonV1,
} from './relational-academic-projection-v1';
import {
  resolveSimplifiedAnnualOutcomeV1,
  type SimplifiedAnnualOutcomeV1,
  type SimplifiedEnrollmentStatusV1,
} from '../../../../src/gradebook-domain/calculations/simplified/resolve-simplified-annual-outcome-v1';

type Row = Record<string, unknown>;
type BindValue = string | number | null;

export type RelationalFormalCouncilDecisionV1 = 1 | 2 | 3;
export type RelationalFormalCouncilVisibleResultV1 =
  | 'APROVADO PELO CONSELHO'
  | 'REPROVADO PELO CONSELHO'
  | 'REPROVADO POR FALTA';

export interface RelationalAnnualComponentProjectionV1 {
  readonly ofertaId: number;
  readonly disciplinaId: number;
  readonly disciplina: string;
  readonly professorId: number;
  readonly professor: string;
  readonly projection: RelationalAcademicProjectionV1;
}

export interface RelationalComparisonSummaryV1 {
  readonly match: number;
  readonly mismatch: number;
  readonly unavailable: number;
}

export interface RelationalStudentAnnualProjectionV1 {
  readonly ano: number;
  readonly alunoId: number;
  readonly alunoNome: string;
  readonly turma: {
    readonly id: number;
    readonly codigo: string;
    readonly nome: string;
    readonly numero: number;
  };
  readonly status: SimplifiedEnrollmentStatusV1;
  readonly conselhoAnterior: boolean | null;
  readonly minimumApprovalMilli: number;
  readonly maxCouncilComponents: number;
  readonly components: readonly RelationalAnnualComponentProjectionV1[];
  readonly calculatedAnnual: SimplifiedAnnualOutcomeV1;
  readonly formalCouncilDecision: {
    readonly code: RelationalFormalCouncilDecisionV1;
    readonly visibleResult: RelationalFormalCouncilVisibleResultV1;
  } | null;
  readonly homologation: {
    readonly am: RelationalComparisonSummaryV1;
    readonly u: RelationalComparisonSummaryV1;
  };
}

export type RelationalStudentAnnualProjectionErrorCodeV1 =
  | 'student-current-binding-not-found'
  | 'invalid-relational-row'
  | 'duplicate-current-discipline-offers'
  | 'projection-year-mismatch';

export class RelationalStudentAnnualProjectionErrorV1 extends Error {
  constructor(readonly code: RelationalStudentAnnualProjectionErrorCodeV1) {
    super(code);
    this.name = 'RelationalStudentAnnualProjectionErrorV1';
  }
}

export interface RelationalStudentAnnualProjectionDependenciesV1 {
  readonly projectOffer?: (input: {
    readonly ofertaId: number;
    readonly alunoId: number;
  }) => Promise<RelationalAcademicProjectionV1>;
}

function asInteger(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new RelationalStudentAnnualProjectionErrorV1('invalid-relational-row');
  }
  return number;
}

function positiveInteger(value: unknown): number {
  const number = asInteger(value);
  if (number <= 0) throw new RelationalStudentAnnualProjectionErrorV1('invalid-relational-row');
  return number;
}

function nonNegativeInteger(value: unknown): number {
  const number = asInteger(value);
  if (number < 0) throw new RelationalStudentAnnualProjectionErrorV1('invalid-relational-row');
  return number;
}

function requiredText(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RelationalStudentAnnualProjectionErrorV1('invalid-relational-row');
  }
  return value;
}

function enrollmentStatus(value: unknown): SimplifiedEnrollmentStatusV1 {
  if (value === null || value === undefined) return null;
  const status = asInteger(value);
  if (status < 1 || status > 7) {
    throw new RelationalStudentAnnualProjectionErrorV1('invalid-relational-row');
  }
  return status as Exclude<SimplifiedEnrollmentStatusV1, null>;
}

function isStatusTerminal(status: SimplifiedEnrollmentStatusV1): boolean {
  return status === 1 || status === 2 || status === 3 || status === 4 || status === 5;
}

function nullableBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  throw new RelationalStudentAnnualProjectionErrorV1('invalid-relational-row');
}

function formalCouncilDecision(
  value: unknown,
): RelationalStudentAnnualProjectionV1['formalCouncilDecision'] {
  if (value === null || value === undefined) return null;
  const code = asInteger(value);
  switch (code) {
    case 1:
      return { code, visibleResult: 'APROVADO PELO CONSELHO' };
    case 2:
      return { code, visibleResult: 'REPROVADO PELO CONSELHO' };
    case 3:
      return { code, visibleResult: 'REPROVADO POR FALTA' };
    default:
      throw new RelationalStudentAnnualProjectionErrorV1('invalid-relational-row');
  }
}

async function first<T extends Row>(
  database: D1ReadDatabaseV1,
  sql: string,
  values: readonly BindValue[],
): Promise<T | null> {
  return database.prepare(sql).bind(...values).first<T>();
}

async function all<T extends Row>(
  database: D1ReadDatabaseV1,
  sql: string,
  values: readonly BindValue[],
): Promise<readonly T[]> {
  return (await database.prepare(sql).bind(...values).all<T>()).results;
}

function comparisonSummary(
  values: readonly RelationalSourceComparisonV1[],
): RelationalComparisonSummaryV1 {
  return {
    match: values.filter((value) => value === 'match').length,
    mismatch: values.filter((value) => value === 'mismatch').length,
    unavailable: values.filter((value) => value === 'unavailable').length,
  };
}

const EMPTY_COMPARISON_SUMMARY_V1: RelationalComparisonSummaryV1 = {
  match: 0,
  mismatch: 0,
  unavailable: 0,
};

export function createRelationalStudentAnnualProjectionServiceV1(
  database: D1ReadDatabaseV1,
  dependencies: RelationalStudentAnnualProjectionDependenciesV1 = {},
) {
  const projectOffer =
    dependencies.projectOffer ?? createRelationalAcademicProjectionServiceV1(database).project;

  return {
    async project(input: {
      readonly ano: number;
      readonly alunoId: number;
    }): Promise<RelationalStudentAnnualProjectionV1> {
      if (
        !Number.isSafeInteger(input.ano) ||
        input.ano < 2000 ||
        input.ano > 2200 ||
        !Number.isSafeInteger(input.alunoId) ||
        input.alunoId <= 0
      ) {
        throw new RelationalStudentAnnualProjectionErrorV1('invalid-relational-row');
      }

      const base = await first<Row>(
        database,
        `SELECT a.ano,
                a.nome AS aluno_nome,
                a.conselho_anterior,
                v.turma_id,
                v.numero,
                v.situacao,
                t.codigo AS turma_codigo,
                t.nome AS turma_nome,
                y.minimo_aprovacao,
                y.max_componentes_conselho,
                cd.decisao AS conselho_decisao
         FROM gradebook.aluno a
         JOIN gradebook.vinculo v
           ON v.aluno_id = a.id
          AND v.ano = a.ano
          AND COALESCE(v.situacao, 0) <> 6
         JOIN gradebook.turma t
           ON t.id = v.turma_id AND t.ano = v.ano
         JOIN gradebook.ano_letivo y ON y.ano = a.ano
         LEFT JOIN gradebook.conselho_decisao cd ON cd.aluno_id = a.id
         WHERE a.id = ? AND a.ano = ?`,
        [input.alunoId, input.ano],
      );
      if (!base) {
        throw new RelationalStudentAnnualProjectionErrorV1('student-current-binding-not-found');
      }

      const ano = asInteger(base.ano);
      const turmaId = positiveInteger(base.turma_id);
      const status = enrollmentStatus(base.situacao);
      const conselhoAnterior = nullableBoolean(base.conselho_anterior);
      const minimumApprovalMilli = positiveInteger(base.minimo_aprovacao);
      const maxCouncilComponents = nonNegativeInteger(base.max_componentes_conselho);
      const common = {
        ano,
        alunoId: input.alunoId,
        alunoNome: requiredText(base.aluno_nome),
        turma: {
          id: turmaId,
          codigo: requiredText(base.turma_codigo),
          nome: requiredText(base.turma_nome),
          numero: positiveInteger(base.numero),
        },
        status,
        conselhoAnterior,
        minimumApprovalMilli,
        maxCouncilComponents,
        formalCouncilDecision: formalCouncilDecision(base.conselho_decisao),
      } as const;

      // Status terminal is authoritative independently from the grade model. Do not let
      // an incomplete or malformed offer prevent ASSISTIDO/ESPECIAL/movement/death from
      // resolving according to the already-approved status precedence.
      if (isStatusTerminal(status)) {
        return {
          ...common,
          components: [],
          calculatedAnnual: resolveSimplifiedAnnualOutcomeV1({
            status,
            components: [],
            councilPrevious: conselhoAnterior,
            maxCouncilComponents,
          }),
          homologation: {
            am: EMPTY_COMPARISON_SUMMARY_V1,
            u: EMPTY_COMPARISON_SUMMARY_V1,
          },
        };
      }

      const offerRows = await all<Row>(
        database,
        `SELECT o.id AS oferta_id,
                d.id AS disciplina_id,
                d.nome AS disciplina_nome,
                p.id AS professor_id,
                p.nome AS professor_nome
         FROM gradebook.oferta o
         JOIN gradebook.disciplina d ON d.id = o.disciplina_id AND d.ano = o.ano
         JOIN gradebook.professor p ON p.id = o.professor_id AND p.ano = o.ano
         WHERE o.ano = ? AND o.turma_id = ?
         ORDER BY lower(d.nome), o.id`,
        [ano, turmaId],
      );

      const disciplineIds = new Set<number>();
      const components: RelationalAnnualComponentProjectionV1[] = [];
      for (const row of offerRows) {
        const disciplinaId = positiveInteger(row.disciplina_id);
        if (disciplineIds.has(disciplinaId)) {
          throw new RelationalStudentAnnualProjectionErrorV1(
            'duplicate-current-discipline-offers',
          );
        }
        disciplineIds.add(disciplinaId);

        const ofertaId = positiveInteger(row.oferta_id);
        const projection = await projectOffer({ ofertaId, alunoId: input.alunoId });
        if (projection.ano !== ano) {
          throw new RelationalStudentAnnualProjectionErrorV1('projection-year-mismatch');
        }
        components.push({
          ofertaId,
          disciplinaId,
          disciplina: requiredText(row.disciplina_nome),
          professorId: positiveInteger(row.professor_id),
          professor: requiredText(row.professor_nome),
          projection,
        });
      }

      const calculatedAnnual = resolveSimplifiedAnnualOutcomeV1({
        status,
        components: components.map((component) => component.projection.recovery),
        councilPrevious: conselhoAnterior,
        maxCouncilComponents,
      });

      return {
        ...common,
        components,
        calculatedAnnual,
        homologation: {
          am: comparisonSummary(
            components.flatMap((component) =>
              component.projection.terms.map((term) => term.sourceComparison),
            ),
          ),
          u: comparisonSummary(
            components.map((component) => component.projection.sourceUComparison),
          ),
        },
      };
    },
  };
}
