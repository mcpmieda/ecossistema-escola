import { lockResetWriterV1 } from '../../../student-portal/integration/year-reset/writer-v1';
import type {
  GradebookImportOfferV9,
  GradebookImportPersistenceRequestV9,
  GradebookImportPersistenceResponseV9,
  GradebookImportTermV9,
  GradebookNotesImportRequestV9,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v9';
import type {
  D1WriteDatabaseV1,
  D1WriteValueV1,
} from '../../persistence/d1/write/d1-write-adapter-v1';
import { createGradebookRelationalImportServiceV9 } from './import-relational-service-v9';

interface TransactionDatabaseV10 extends D1WriteDatabaseV1 {
  transaction<T>(operation: (database: D1WriteDatabaseV1) => Promise<T>): Promise<T>;
}

type Row = Record<string, unknown>;

function classKey(value: string): string {
  return value.trim().toUpperCase();
}

function historicalBindingKey(turmaCodigo: string, numero: number): string {
  return `${classKey(turmaCodigo)}:${numero}`;
}

function transactionDatabase(database: D1WriteDatabaseV1): TransactionDatabaseV10 {
  if (!('transaction' in database) || typeof (database as { transaction?: unknown }).transaction !== 'function') {
    throw new Error('gradebook-relational-import-requires-postgres');
  }
  return database as TransactionDatabaseV10;
}

async function all<T extends Row>(
  database: D1WriteDatabaseV1,
  query: string,
  values: readonly D1WriteValueV1[] = [],
): Promise<readonly T[]> {
  return (await database.prepare(query).bind(...values).all<T>()).results;
}

function filterTerm(
  term: GradebookImportTermV9,
  turmaCodigo: string,
  historicalBindings: ReadonlySet<string>,
): GradebookImportTermV9 {
  return {
    ...term,
    alunos: term.alunos.filter(
      ([numero]) => !historicalBindings.has(historicalBindingKey(turmaCodigo, numero)),
    ),
  };
}

function filterOffer(
  offer: GradebookImportOfferV9,
  historicalBindings: ReadonlySet<string>,
): GradebookImportOfferV9 {
  const [term1, term2, term3] = offer.trimestres;
  return {
    ...offer,
    trimestres: [
      filterTerm(term1, offer.turmaCodigo, historicalBindings),
      filterTerm(term2, offer.turmaCodigo, historicalBindings),
      filterTerm(term3, offer.turmaCodigo, historicalBindings),
    ],
    recuperacao:
      offer.recuperacao === null
        ? null
        : offer.recuperacao.filter(
            ([numero]) =>
              !historicalBindings.has(historicalBindingKey(offer.turmaCodigo, numero)),
          ),
  };
}

/**
 * Movement rule approved in #613, applied independently inside each selected year:
 * facts from a FOI_PARA binding belong to the previous class and are discarded
 * before persistence. There is deliberately no fallback to the previous class.
 */
export function filterHistoricalClassFactsV10(
  request: GradebookNotesImportRequestV9,
  historicalBindings: ReadonlySet<string>,
): GradebookNotesImportRequestV9 {
  if (historicalBindings.size === 0) return request;
  return {
    ...request,
    ofertas: request.ofertas.map((offer) => filterOffer(offer, historicalBindings)),
  };
}

async function loadHistoricalBindingsV10(
  database: D1WriteDatabaseV1,
  ano: number,
): Promise<ReadonlySet<string>> {
  const rows = await all<Row>(
    database,
    `SELECT t.codigo AS turma_codigo, v.numero
     FROM gradebook.vinculo v
     JOIN gradebook.turma t ON t.id = v.turma_id
     WHERE v.ano = ? AND v.situacao = 6`,
    [ano],
  );
  const result = new Set<string>();
  for (const row of rows) {
    const numero = typeof row.numero === 'number' ? row.numero : Number(row.numero);
    if (!Number.isSafeInteger(numero) || numero <= 0 || typeof row.turma_codigo !== 'string') {
      throw new Error('gradebook-historical-binding-invalid');
    }
    result.add(historicalBindingKey(row.turma_codigo, numero));
  }
  return result;
}

export function createGradebookRelationalImportServiceV10(database: D1WriteDatabaseV1) {
  return {
    async execute(
      request: GradebookImportPersistenceRequestV9,
    ): Promise<GradebookImportPersistenceResponseV9> {
      if (request.operation === 'persist-relacao') {
        return createGradebookRelationalImportServiceV9(database).execute(request);
      }

      return transactionDatabase(database).transaction(async (transaction) => {
        // Hold the same year lock used by V9 while selecting the current/historical
        // bindings, so a concurrent Relação import cannot change the movement state
        // between filtering and persistence. V9 reuses this transaction and lock.
        await lockResetWriterV1(transaction, request.ano);
        const historicalBindings = await loadHistoricalBindingsV10(transaction, request.ano);
        const filtered = filterHistoricalClassFactsV10(request, historicalBindings);
        return createGradebookRelationalImportServiceV9(transaction).execute(filtered);
      });
    },
  };
}
