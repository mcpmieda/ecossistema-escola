import {
  analysisMatrixRequestV2, performanceAnalysisRequestSchemaV3, performanceAnalysisResponseSchemaV3,
  performanceAnalysisMatchesV3, ANALYSIS_BUCKETS_V3,
  type PerformanceAnalysisRequestV3, type PerformanceAnalysisResponseV3, type PerformanceAnalysisV3, type AnalysisReadingV3,
} from '../../../../../shared/gradebook-contracts/performance/performance-analysis-v3';
import type { PerformanceMatrixV2 } from '../../../../../shared/gradebook-contracts/performance/relational-performance-v2';
import { SIMPLIFIED_TERM_MAXIMUM_MILLI_V1 } from '../../../../../src/gradebook-domain/calculations/simplified/resolve-simplified-academic-engine-v1';
import type { PerformanceProjectionV2 } from '../../results/relational-performance-facts-v2';
import type { D1WriteDatabaseV1 } from '../../../persistence/d1/write/d1-write-adapter-v1';
import { readRelationalPerformanceV2 } from './relational-performance-v2';

const TERMS = [1, 2, 3] as const;
const ANNUAL_MAXIMUM = TERMS.reduce((sum, term) => sum + SIMPLIFIED_TERM_MAXIMUM_MILLI_V1[term], 0);
type Column = PerformanceAnalysisV3['columns'][number];
type RawReading = Pick<AnalysisReadingV3, 'valueMilli' | 'maximumMilli' | 'recordedMilli' | 'state'>;
const empty = (state: RawReading['state'] = 'unavailable'): RawReading => ({ valueMilli: null, maximumMilli: null, recordedMilli: null, state });
function sum(values: readonly number[]): number {
  const result = values.reduce((total, value) => total + value, 0);
  if (!Number.isSafeInteger(result)) throw new Error('analysis-value-overflow');
  return result;
}
function dimension(projection: PerformanceProjectionV2, request: PerformanceAnalysisRequestV3): RawReading {
  const terms = request.period === 'annual' ? TERMS : [request.period];
  const outcomes = terms.map((term) => projection.terms[term - 1]);
  if (outcomes.some((value) => value == null)) return empty();
  const quantitative = request.lens === 'quantitative';
  const factsByTerm = terms.map((term) => projection.facts.filter((fact) => fact.term === term && (quantitative ? fact.slot === 1 || fact.slot === 2 : fact.slot >= 11)));
  if (factsByTerm.some((facts) => facts.length === 0)) return empty();
  // Completude da dimensão é cobertura dos slots do núcleo, não um novo resultado final.
  const resolved = factsByTerm.flatMap((facts, index) => facts.map((fact) => outcomes[index]!.coverage.resolvedSlots.includes(fact.slot)));
  const state = resolved.every(Boolean) ? 'complete' : resolved.some(Boolean) ? 'partial' : 'not-recorded';
  const maxima = quantitative ? outcomes.map((value) => value!.quantitativeMaximumMilli) : factsByTerm.flat().map((fact) => fact.maximumMilli);
  const maximumMilli = maxima.some((value) => value === null) ? null : sum(maxima as number[]);
  return {
    state, recordedMilli: null, maximumMilli: maximumMilli === 0 ? null : maximumMilli,
    valueMilli: state === 'not-recorded' ? null : sum(outcomes.map((value) => quantitative ? value!.quantitativeConsideredMilli : value!.qualitativeOperationalMilli)),
  };
}
function assessment(projection: PerformanceProjectionV2, column: Column): RawReading {
  const fact = projection.facts.find((value) => value.term === column.term && value.slot === column.slot);
  if (!fact) return empty();
  const outcome = projection.terms[column.term! - 1];
  const maximumMilli = fact.slot === 3 ? outcome?.quantitativeMaximumMilli ?? null : fact.maximumMilli;
  const base = { maximumMilli, recordedMilli: fact.valueMilli };
  if (fact.slot === 3 && outcome?.parallelApplicable !== true)
    return { ...base, valueMilli: null, state: outcome?.parallelApplicable === false ? 'not-applicable' : 'unavailable' };
  return { ...base, valueMilli: fact.valueMilli, state: fact.valueMilli === null ? 'not-recorded' : 'complete' };
}
function reading(raw: RawReading, key: string, eligible: boolean, minimum: number, classifyPartialResult: boolean): AnalysisReadingV3 {
  // Resultado may already expose a numeric term total while its instrument coverage is partial.
  // Classify that visible total proportionally for the dashboard, without changing the source state
  // or converting a missing value into zero. Composition lenses still require complete coverage.
  const classificationReady = raw.state === 'complete' || (classifyPartialResult && raw.state === 'partial');
  const percent = classificationReady && raw.valueMilli !== null && raw.maximumMilli !== null ? raw.valueMilli / raw.maximumMilli * 100 : null;
  const bucket = !eligible || raw.state === 'not-applicable' ? 'excluded' : raw.state === 'no-show' ? 'no-show' : !classificationReady ? 'incomplete' : percent === null ? 'unscaled' :
    BigInt(raw.valueMilli!) * BigInt(ANNUAL_MAXIMUM) >= BigInt(raw.maximumMilli!) * BigInt(minimum) ? 'above' : 'below';
  return { ...raw, key, percent, bucket };
}
function emptySummary(): Column['summary'] {
  return { considered: 0, scaled: 0, meanPercent: null, medianPercent: null, groups: { above: [], below: [], incomplete: [], 'no-show': [], unscaled: [] } };
}
export function buildPerformanceAnalysisV3(matrix: PerformanceMatrixV2, projections: ReadonlyMap<number, readonly PerformanceProjectionV2[]>, request: PerformanceAnalysisRequestV3): PerformanceAnalysisV3 {
  let columns: Column[];
  if (request.lens === 'assessments') {
    const source = [...projections.values()].flat().find((value) => value.offerId === request.offerId);
    columns = (source?.facts ?? []).filter((fact) => request.period === 'annual' || fact.term === request.period)
      .map((fact) => ({ key: `${request.offerId}:${fact.term}:${fact.slot}`, offerId: request.offerId!, term: fact.term, slot: fact.slot,
        label: request.period === 'annual' ? `T${fact.term} · ${fact.label}` : fact.label, summary: emptySummary() }));
  } else columns = matrix.offers.map((offer) => ({ key: String(offer.id), offerId: offer.id, label: offer.subject.label, term: null, slot: null, summary: emptySummary() }));
  const offerIndexes = new Map(matrix.offers.map((offer, i) => [offer.id, i]));
  const rows = matrix.rows.map((row) => {
    const byOffer = new Map((projections.get(row.student.id) ?? []).map((value) => [value.offerId, value]));
    return { studentId: row.student.id, values: columns.map((column) => {
      const cell = row.cells[offerIndexes.get(column.offerId)!]!;
      const projection = byOffer.get(column.offerId);
      const raw: RawReading = request.lens === 'result' ? { valueMilli: cell.valueMilli, maximumMilli: cell.maximumMilli, recordedMilli: null, state: cell.state } :
        !projection ? empty() : request.lens === 'assessments' ? assessment(projection, column) : dimension(projection, request);
      return reading(raw, column.key, row.student.indicatorEligible && (matrix.mode === 'regular' || cell.recoveryApplicable === true), matrix.context.minimumApprovalMilli, request.lens === 'result');
    }) };
  });
  columns = columns.map((column, i) => {
    const summary = emptySummary();
    const percentages: number[] = [];
    for (const row of rows) {
      const value = row.values[i]!;
      if (value.bucket === 'excluded') continue;
      summary.groups[value.bucket].push(row.studentId);
      if (value.percent !== null) percentages.push(value.percent);
    }
    summary.considered = ANALYSIS_BUCKETS_V3.reduce((total, bucket) => total + summary.groups[bucket].length, 0);
    summary.scaled = percentages.length;
    if (percentages.length) {
      percentages.sort((a, b) => a - b);
      summary.meanPercent = percentages.reduce((total, value) => total + value / percentages.length, 0);
      const mid = Math.floor(percentages.length / 2);
      summary.medianPercent = percentages.length % 2 ? percentages[mid]! : percentages[mid - 1]! / 2 + percentages[mid]! / 2;
    }
    return { ...column, summary };
  });
  return { transportVersion: 3, state: 'ready', operation: 'analysis', matrix, lens: request.lens, offerId: request.offerId, columns, rows };
}

export function createPerformanceAnalysisV3(database: D1WriteDatabaseV1) {
  return { async execute(input: unknown): Promise<PerformanceAnalysisResponseV3> {
    const parsed = performanceAnalysisRequestSchemaV3.safeParse(input);
    if (!parsed.success) return { transportVersion: 3, state: 'invalid-request' };
    if (!('transaction' in database) || typeof database.transaction !== 'function') return { transportVersion: 3, state: 'unavailable' };
    const request = parsed.data;
    const db = database as D1WriteDatabaseV1 & { transaction<T>(operation: (tx: D1WriteDatabaseV1) => Promise<T>): Promise<T> };
    return db.transaction(async (tx) => {
      await tx.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      let projections: ReadonlyMap<number, readonly PerformanceProjectionV2[]> = new Map();
      const matrix = await readRelationalPerformanceV2(tx, analysisMatrixRequestV2(request), {
        ...(request.offerId === null ? {} : { descriptionOfferId: request.offerId }), collect: (value) => { projections = value; },
      });
      if (matrix.state !== 'ready') return { transportVersion: 3, state: matrix.state } as const;
      if (matrix.operation !== 'matrix') throw new Error('unexpected-analysis-operation');
      if (request.offerId !== null && !matrix.offers.some((offer) => offer.id === request.offerId)) return { transportVersion: 3, state: 'not-found' } as const;
      const response = performanceAnalysisResponseSchemaV3.parse(buildPerformanceAnalysisV3(matrix, projections, request));
      if (!performanceAnalysisMatchesV3(request, response)) throw new Error('inconsistent-analysis-response');
      return response;
    });
  } };
}
