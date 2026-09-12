import {
  confirmationPhraseForYearResetV1,
  YEAR_RESET_CONTRACT_VERSION_V1,
  yearResetRequestSchemaV1,
  yearResetResponseSchemaV1,
  type YearResetCountsV1,
  type YearResetResponseV1,
} from '../../../../shared/gradebook-contracts/settings/year-reset-contract-v1';
import type {
  D1WriteDatabaseV1,
  D1WriteValueV1,
} from '../../persistence/d1/write/d1-write-adapter-v1';

type Row = Record<string, unknown>;
type TransactionalDatabase = D1WriteDatabaseV1 & {
  transaction<T>(operation: (database: D1WriteDatabaseV1) => Promise<T>): Promise<T>;
};

const RESET_TABLES_V1 = [
  'conselho_fechamento_item',
  'conselho_sessao_historico',
  'conselho_votacao_historico',
  'conselho_decisao_comando',
  'conselho_idempotencia',
  'conselho_votacao',
  'conselho_fechamento',
  'conselho_sessao',
  'boletim_snapshot',
  'importacao_diagnostico_tratamento',
  'nota_historico',
  'nota',
  'fechamento_historico',
  'fechamento',
  'instrumento_historico',
  'instrumento',
  'vinculo_historico',
  'vinculo',
  'conselho_anterior_historico',
  'conselho_decisao_historico',
  'conselho_decisao',
  'importacao_diagnostico',
  'importacao',
  'oferta',
  'aluno',
  'turma',
  'professor',
  'disciplina',
  'ano_letivo_historico',
  'ano_letivo',
] as const;

function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('invalid-year-reset-count');
  }
  return value;
}

async function first(
  database: D1WriteDatabaseV1,
  sql: string,
  values: readonly D1WriteValueV1[] = [],
): Promise<Row | null> {
  return database
    .prepare(sql)
    .bind(...values)
    .first<Row>();
}

async function loadCounts(database: D1WriteDatabaseV1, year: number): Promise<YearResetCountsV1> {
  const row = await first(
    database,
    `WITH y AS (SELECT ?::smallint AS ano)
     SELECT
       (SELECT count(*)::integer FROM gradebook.ano_letivo a,y WHERE a.ano=y.ano) AS academic_year,
       (SELECT count(*)::integer FROM gradebook.aluno a,y WHERE a.ano=y.ano) AS students,
       (SELECT count(*)::integer FROM gradebook.turma t,y WHERE t.ano=y.ano) AS classes,
       (SELECT count(*)::integer FROM gradebook.professor p,y WHERE p.ano=y.ano) AS teachers,
       (SELECT count(*)::integer FROM gradebook.disciplina d,y WHERE d.ano=y.ano) AS subjects,
       (SELECT count(*)::integer FROM gradebook.vinculo v,y WHERE v.ano=y.ano) AS bindings,
       (SELECT count(*)::integer FROM gradebook.oferta o,y WHERE o.ano=y.ano) AS offers,
       (SELECT count(*)::integer FROM gradebook.instrumento i JOIN gradebook.oferta o ON o.id=i.oferta_id,y WHERE o.ano=y.ano) AS assessments,
       (SELECT count(*)::integer FROM gradebook.nota n JOIN gradebook.instrumento i ON i.id=n.instrumento_id JOIN gradebook.oferta o ON o.id=i.oferta_id,y WHERE o.ano=y.ano) AS grades,
       (SELECT count(*)::integer FROM gradebook.fechamento f JOIN gradebook.oferta o ON o.id=f.oferta_id,y WHERE o.ano=y.ano) AS closures,
       (SELECT count(*)::integer FROM gradebook.importacao i,y WHERE i.ano=y.ano) AS imports,
       (SELECT count(*)::integer FROM gradebook.importacao_diagnostico d,y WHERE d.ano=y.ano) AS diagnostics,
       (SELECT count(*)::integer FROM gradebook.importacao_diagnostico_tratamento t,y WHERE t.ano=y.ano) AS audit_trail,
       ((SELECT count(*) FROM gradebook.conselho_decisao c JOIN gradebook.aluno a ON a.id=c.aluno_id,y WHERE a.ano=y.ano)
        +(SELECT count(*) FROM gradebook.conselho_sessao c,y WHERE c.ano=y.ano)
        +(SELECT count(*) FROM gradebook.conselho_sessao_historico c,y WHERE c.ano=y.ano)
        +(SELECT count(*) FROM gradebook.conselho_idempotencia c,y WHERE c.ano=y.ano)
        +(SELECT count(*) FROM gradebook.conselho_votacao c,y WHERE c.ano=y.ano)
        +(SELECT count(*) FROM gradebook.conselho_votacao_historico c,y WHERE c.ano=y.ano)
        +(SELECT count(*) FROM gradebook.conselho_decisao_comando c,y WHERE c.ano=y.ano)
        +(SELECT count(*) FROM gradebook.conselho_fechamento c,y WHERE c.ano=y.ano)
        +(SELECT count(*) FROM gradebook.conselho_fechamento_item i JOIN gradebook.conselho_fechamento c ON c.id=i.fechamento_id,y WHERE c.ano=y.ano))::integer AS council,
       (SELECT count(*)::integer FROM gradebook.boletim_snapshot b,y WHERE b.ano=y.ano) AS bulletins,
       ((SELECT count(*) FROM gradebook.ano_letivo_historico h,y WHERE h.ano=y.ano)
        +(SELECT count(*) FROM gradebook.conselho_anterior_historico h JOIN gradebook.aluno a ON a.id=h.aluno_id,y WHERE a.ano=y.ano)
        +(SELECT count(*) FROM gradebook.conselho_decisao_historico h JOIN gradebook.aluno a ON a.id=h.aluno_id,y WHERE a.ano=y.ano)
        +(SELECT count(*) FROM gradebook.fechamento_historico h JOIN gradebook.oferta o ON o.id=h.oferta_id,y WHERE o.ano=y.ano)
        +(SELECT count(*) FROM gradebook.instrumento_historico h JOIN gradebook.instrumento i ON i.id=h.instrumento_id JOIN gradebook.oferta o ON o.id=i.oferta_id,y WHERE o.ano=y.ano)
        +(SELECT count(*) FROM gradebook.nota_historico h JOIN gradebook.instrumento i ON i.id=h.instrumento_id JOIN gradebook.oferta o ON o.id=i.oferta_id,y WHERE o.ano=y.ano)
        +(SELECT count(*) FROM gradebook.vinculo_historico h JOIN gradebook.turma t ON t.id=h.turma_id,y WHERE t.ano=y.ano))::integer AS histories`,
    [year],
  );
  if (!row) throw new Error('year-reset-counts-missing');
  const counts = {
    academicYear: integer(row.academic_year),
    students: integer(row.students),
    classes: integer(row.classes),
    teachers: integer(row.teachers),
    subjects: integer(row.subjects),
    bindings: integer(row.bindings),
    offers: integer(row.offers),
    assessments: integer(row.assessments),
    grades: integer(row.grades),
    closures: integer(row.closures),
    imports: integer(row.imports),
    diagnostics: integer(row.diagnostics),
    auditTrail: integer(row.audit_trail),
    council: integer(row.council),
    bulletins: integer(row.bulletins),
    histories: integer(row.histories),
  };
  return {
    ...counts,
    totalRows: Object.values(counts).reduce((total, value) => total + value, 0),
  };
}

async function revisionFor(year: number, counts: YearResetCountsV1): Promise<string> {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ contractVersion: YEAR_RESET_CONTRACT_VERSION_V1, year, counts }),
  );
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function changed(result: {
  readonly changes?: number;
  readonly meta?: { readonly changes?: number };
}): number {
  const value = result.meta?.changes ?? result.changes;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('invalid-year-reset-write-count');
  }
  return value;
}

async function removeYear(database: D1WriteDatabaseV1, year: number): Promise<number> {
  let deleted = 0;
  const run = async (sql: string) => {
    deleted += changed(await database.prepare(sql).bind(year).run());
  };

  await database
    .prepare('UPDATE gradebook.conselho_sessao SET fechamento_atual_id=NULL WHERE ano=?')
    .bind(year)
    .run();
  await run(`DELETE FROM gradebook.conselho_fechamento_item i USING gradebook.conselho_fechamento c
    WHERE c.id=i.fechamento_id AND c.ano=?`);
  for (const table of [
    'conselho_sessao_historico',
    'conselho_votacao_historico',
    'conselho_decisao_comando',
    'conselho_idempotencia',
    'conselho_votacao',
    'conselho_fechamento',
    'conselho_sessao',
    'boletim_snapshot',
    'importacao_diagnostico_tratamento',
  ] as const) {
    await run(`DELETE FROM gradebook.${table} WHERE ano=?`);
  }
  await run(`DELETE FROM gradebook.nota_historico h USING gradebook.instrumento i,gradebook.oferta o
    WHERE i.id=h.instrumento_id AND o.id=i.oferta_id AND o.ano=?`);
  await run(`DELETE FROM gradebook.nota n USING gradebook.instrumento i,gradebook.oferta o
    WHERE i.id=n.instrumento_id AND o.id=i.oferta_id AND o.ano=?`);
  await run(`DELETE FROM gradebook.fechamento_historico h USING gradebook.oferta o
    WHERE o.id=h.oferta_id AND o.ano=?`);
  await run(`DELETE FROM gradebook.fechamento f USING gradebook.oferta o
    WHERE o.id=f.oferta_id AND o.ano=?`);
  await run(`DELETE FROM gradebook.instrumento_historico h USING gradebook.instrumento i,gradebook.oferta o
    WHERE i.id=h.instrumento_id AND o.id=i.oferta_id AND o.ano=?`);
  await run(`DELETE FROM gradebook.instrumento i USING gradebook.oferta o
    WHERE o.id=i.oferta_id AND o.ano=?`);
  await run(`DELETE FROM gradebook.vinculo_historico h USING gradebook.turma t
    WHERE t.id=h.turma_id AND t.ano=?`);
  await run('DELETE FROM gradebook.vinculo WHERE ano=?');
  for (const table of [
    'conselho_anterior_historico',
    'conselho_decisao_historico',
    'conselho_decisao',
  ] as const) {
    await run(`DELETE FROM gradebook.${table} c USING gradebook.aluno a
      WHERE a.id=c.aluno_id AND a.ano=?`);
  }
  await run('DELETE FROM gradebook.importacao_diagnostico WHERE ano=?');
  await run('DELETE FROM gradebook.importacao WHERE ano=?');
  await run('DELETE FROM gradebook.oferta WHERE ano=?');
  for (const table of [
    'aluno',
    'turma',
    'professor',
    'disciplina',
    'ano_letivo_historico',
    'ano_letivo',
  ] as const) {
    await run(`DELETE FROM gradebook.${table} WHERE ano=?`);
  }
  return deleted;
}

export function createYearResetServiceV1(database: D1WriteDatabaseV1) {
  return {
    async execute(input: unknown): Promise<YearResetResponseV1> {
      const parsed = yearResetRequestSchemaV1.safeParse(input);
      if (!parsed.success) {
        return { contractVersion: YEAR_RESET_CONTRACT_VERSION_V1, state: 'invalid-request' };
      }
      if (!('transaction' in database) || typeof database.transaction !== 'function') {
        return { contractVersion: YEAR_RESET_CONTRACT_VERSION_V1, state: 'unavailable' };
      }
      const request = { ...parsed.data };
      const response = await (database as TransactionalDatabase).transaction(
        async (transaction) => {
          if (request.operation === 'preview') {
            await transaction.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
            const counts = await loadCounts(transaction, request.year);
            if (counts.academicYear !== 1) {
              return {
                contractVersion: YEAR_RESET_CONTRACT_VERSION_V1,
                state: 'not-found',
              } as const;
            }
            return {
              contractVersion: YEAR_RESET_CONTRACT_VERSION_V1,
              state: 'ready',
              operation: 'preview',
              year: request.year,
              counts,
              previewRevision: await revisionFor(request.year, counts),
              confirmationPhrase: confirmationPhraseForYearResetV1(request.year),
            } as const;
          }

          await transaction.exec('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
          await transaction.exec(
            `LOCK TABLE ${RESET_TABLES_V1.map((table) => `gradebook.${table}`).join(',')}
           IN SHARE ROW EXCLUSIVE MODE`,
          );
          const counts = await loadCounts(transaction, request.year);
          if (counts.academicYear !== 1) {
            return { contractVersion: YEAR_RESET_CONTRACT_VERSION_V1, state: 'not-found' } as const;
          }
          if (
            request.confirmationPhrase !== confirmationPhraseForYearResetV1(request.year) ||
            request.previewRevision !== (await revisionFor(request.year, counts))
          ) {
            return {
              contractVersion: YEAR_RESET_CONTRACT_VERSION_V1,
              state: 'preview-changed',
            } as const;
          }
          const deletedRows = await removeYear(transaction, request.year);
          if (deletedRows !== counts.totalRows) throw new Error('year-reset-incomplete-delete');
          const remaining = await loadCounts(transaction, request.year);
          if (remaining.totalRows !== 0) throw new Error('year-reset-postcondition-failed');
          return {
            contractVersion: YEAR_RESET_CONTRACT_VERSION_V1,
            state: 'ready',
            operation: 'execute',
            year: request.year,
            deletedRows,
          } as const;
        },
      );
      return yearResetResponseSchemaV1.parse(response);
    },
  };
}
