import type { D1ReadDatabaseV1 } from '../../persistence/d1/read/d1-read-adapter-v1';
import {
  resolveSimplifiedComponentRecoveryV1,
  resolveSimplifiedTermV1,
  type SimplifiedAcademicTermV1,
  type SimplifiedComponentRecoveryOutcomeV1,
  type SimplifiedInstrumentFactV1,
  type SimplifiedRecoveryValueV1,
  type SimplifiedTermOutcomeV1,
} from '../../../../src/gradebook-domain/calculations/simplified/resolve-simplified-academic-engine-v1';

type Row = Record<string, unknown>;
type BindValue = string | number | null;

export type RelationalSourceComparisonV1 = 'match' | 'mismatch' | 'unavailable';

export interface RelationalTermProjectionV1 {
  readonly term: SimplifiedAcademicTermV1;
  readonly outcome: SimplifiedTermOutcomeV1;
  readonly sourceAmMilli: number | null;
  readonly sourceComparison: RelationalSourceComparisonV1;
}

export interface RelationalAcademicProjectionV1 {
  readonly ano: number;
  readonly ofertaId: number;
  readonly alunoId: number;
  readonly minimumApprovalMilli: number;
  readonly terms: readonly [
    RelationalTermProjectionV1,
    RelationalTermProjectionV1,
    RelationalTermProjectionV1,
  ];
  readonly recovery: SimplifiedComponentRecoveryOutcomeV1;
  readonly sourceUMilli: number | null;
  readonly sourceUComparison: RelationalSourceComparisonV1;
}

export type RelationalAcademicProjectionErrorCodeV1 =
  | 'offer-student-not-found'
  | 'invalid-relational-row'
  | 'incomplete-offer-definition';

export class RelationalAcademicProjectionErrorV1 extends Error {
  constructor(readonly code: RelationalAcademicProjectionErrorCodeV1) {
    super(code);
    this.name = 'RelationalAcademicProjectionErrorV1';
  }
}

function asInteger(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new RelationalAcademicProjectionErrorV1('invalid-relational-row');
  }
  return number;
}

function nullableInteger(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return asInteger(value);
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

function sourceComparison(
  calculated: number | null,
  source: number | null,
): RelationalSourceComparisonV1 {
  if (calculated === null || source === null) return 'unavailable';
  return calculated === source ? 'match' : 'mismatch';
}

function recoveryValue(
  row: Row | null,
  term: SimplifiedAcademicTermV1,
): SimplifiedRecoveryValueV1 {
  if (!row) return null;
  const mask = asInteger(row.rec_nc_mask ?? 0);
  const bit = 1 << (term - 1);
  if ((mask & bit) !== 0) return 'NC';
  return nullableInteger(row[`rec${term}`]);
}

function sourceAm(row: Row | null, term: SimplifiedAcademicTermV1): number | null {
  return row ? nullableInteger(row[`am${term}_fonte`]) : null;
}

export function createRelationalAcademicProjectionServiceV1(database: D1ReadDatabaseV1) {
  return {
    async project(input: { readonly ofertaId: number; readonly alunoId: number }): Promise<RelationalAcademicProjectionV1> {
      if (!Number.isSafeInteger(input.ofertaId) || input.ofertaId <= 0 || !Number.isSafeInteger(input.alunoId) || input.alunoId <= 0) {
        throw new RelationalAcademicProjectionErrorV1('invalid-relational-row');
      }

      const base = await first<Row>(
        database,
        `SELECT o.ano, a.minimo_aprovacao
         FROM gradebook.oferta o
         JOIN gradebook.ano_letivo a ON a.ano = o.ano
         WHERE o.id = ?
           AND EXISTS (
             SELECT 1
             FROM gradebook.vinculo v
             WHERE v.turma_id = o.turma_id
               AND v.aluno_id = ?
               AND COALESCE(v.situacao, 0) <> 6
           )`,
        [input.ofertaId, input.alunoId],
      );
      if (!base) throw new RelationalAcademicProjectionErrorV1('offer-student-not-found');

      const instrumentRows = await all<Row>(
        database,
        `SELECT i.trimestre, i.slot, i.maximo, n.valor
         FROM gradebook.instrumento i
         LEFT JOIN gradebook.nota n
           ON n.instrumento_id = i.id AND n.aluno_id = ?
         WHERE i.oferta_id = ?
         ORDER BY i.trimestre, i.slot`,
        [input.alunoId, input.ofertaId],
      );

      const closing = await first<Row>(
        database,
        `SELECT am1_fonte, am2_fonte, am3_fonte,
                rec1, rec2, rec3, rec_nc_mask, u_fonte
         FROM gradebook.fechamento
         WHERE oferta_id = ? AND aluno_id = ?`,
        [input.ofertaId, input.alunoId],
      );

      const terms = [1, 2, 3].map((termValue) => {
        const term = termValue as SimplifiedAcademicTermV1;
        const facts: SimplifiedInstrumentFactV1[] = instrumentRows
          .filter((row) => asInteger(row.trimestre) === term)
          .map((row) => ({
            slot: asInteger(row.slot) as SimplifiedInstrumentFactV1['slot'],
            maximumMilli: nullableInteger(row.maximo),
            valueMilli: nullableInteger(row.valor),
          }));
        let outcome: SimplifiedTermOutcomeV1;
        try {
          outcome = resolveSimplifiedTermV1({ term, instruments: facts });
        } catch {
          throw new RelationalAcademicProjectionErrorV1('incomplete-offer-definition');
        }
        const sourceAmMilli = sourceAm(closing, term);
        return {
          term,
          outcome,
          sourceAmMilli,
          sourceComparison: sourceComparison(
            outcome.coverage.complete ? outcome.roundedMilli : null,
            sourceAmMilli,
          ),
        } satisfies RelationalTermProjectionV1;
      }) as unknown as RelationalAcademicProjectionV1['terms'];

      const minimumApprovalMilli = asInteger(base.minimo_aprovacao);
      const recovery = resolveSimplifiedComponentRecoveryV1({
        terms: [terms[0].outcome, terms[1].outcome, terms[2].outcome],
        recovery: {
          1: recoveryValue(closing, 1),
          2: recoveryValue(closing, 2),
          3: recoveryValue(closing, 3),
        },
        minimumApprovalMilli,
      });
      const sourceUMilli = closing ? nullableInteger(closing.u_fonte) : null;

      return {
        ano: asInteger(base.ano),
        ofertaId: input.ofertaId,
        alunoId: input.alunoId,
        minimumApprovalMilli,
        terms,
        recovery,
        sourceUMilli,
        sourceUComparison: sourceComparison(recovery.postRecoveryTotalMilli, sourceUMilli),
      };
    },
  };
}
