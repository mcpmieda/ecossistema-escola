import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createGradebookPostgresDatabaseFromSqlV1, type GradebookPostgresDatabaseV1 } from '../../../server/gradebook/persistence/postgres/postgres-database-v1';
import { createPerformanceAnalysisV3 } from '../../../server/gradebook/application/read-models/performance/performance-analysis-v3';

let pg: PGlite;
let db: GradebookPostgresDatabaseV1;
const queries: string[] = [];
const request = { transportVersion: 3, operation: 'analysis', year: 2090, classId: 1, period: 'annual', mode: 'regular', statuses: [null, 7], lens: 'result', offerId: null };
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(readFileSync('migrations/gradebook-simplified/0001_current_schema.sql', 'utf8'));
  await pg.exec(`
    INSERT INTO gradebook.ano_letivo VALUES (2090,60000,2);
    INSERT INTO gradebook.turma (id,ano,codigo,nome,etapa,turno) VALUES (1,2090,'A','TURMA SINTETICA',6,'M');
    INSERT INTO gradebook.professor (id,ano,nome) VALUES (1,2090,'DOCENTE SINTETICO');
    INSERT INTO gradebook.disciplina (id,ano,nome) SELECT n,2090,'COMPONENTE SINTETICO '||n FROM generate_series(1,10) n;
    INSERT INTO gradebook.oferta (id,ano,turma_id,professor_id,disciplina_id) SELECT n,2090,1,1,n FROM generate_series(1,10) n;
    INSERT INTO gradebook.aluno (id,ano,nome) SELECT n,2090,'ALUNO SINTETICO '||n FROM generate_series(1,100) n;
    INSERT INTO gradebook.vinculo (ano,turma_id,numero,aluno_id) SELECT 2090,1,n,n FROM generate_series(1,100) n;
    INSERT INTO gradebook.instrumento (id,oferta_id,trimestre,slot,maximo,descricao)
      SELECT o*100+t*25+s,o,t,s,CASE WHEN s>=11 THEN CASE WHEN t=3 THEN 2200 ELSE 1650 END ELSE CASE WHEN t=3 THEN 9000 ELSE 6750 END END,'AVALIACAO SINTETICA '||s
      FROM generate_series(1,10) a(o) CROSS JOIN generate_series(1,3) b(t) CROSS JOIN (SELECT n AS s FROM generate_series(1,20) n WHERE n<=3 OR n>=11) c;
    INSERT INTO gradebook.nota (instrumento_id,aluno_id,valor)
      SELECT i.id,a.id,CASE WHEN i.slot>=11 THEN 1200 ELSE 6000 END FROM gradebook.instrumento i CROSS JOIN gradebook.aluno a;
  `);
  db = createGradebookPostgresDatabaseFromSqlV1({
    async unsafe() { throw new Error('read-outside-transaction'); },
    async begin(operation) {
      return pg.transaction(async (tx) => operation({ async unsafe(sql, values = []) {
        queries.push(sql);
        const result = await tx.query<Record<string, unknown>>(sql, [...values]);
        return Object.assign(result.rows, { count: result.affectedRows ?? result.rows.length });
      } }));
    },
    async end() { await pg.close(); },
  });
}, 30_000);
beforeEach(() => { queries.length = 0; });
afterAll(async () => { await db?.close(); });

it.each(['result','quantitative','qualitative','assessments'])('keeps the complete 1,000-pair base and bounded analytical payload for %s', async (lens) => {
  const result = await createPerformanceAnalysisV3(db).execute({ ...request, lens, offerId: lens === 'assessments' ? 1 : null });
  expect(result.state).toBe('ready');
  if (result.state !== 'ready') throw new Error('analysis-not-ready');
  expect(result.matrix.rows).toHaveLength(100); expect(result.matrix.offers).toHaveLength(10);
  expect(result.rows).toHaveLength(100);
  expect(result.columns).toHaveLength(lens === 'assessments' ? 39 : 10);
  expect(result.rows.every((row) => row.values.length === result.columns.length)).toBe(true);
  expect(queries).toHaveLength(6);
  expect(queries.join('\n')).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b|academic_entity|academic_record/u);
  expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(2_000_000);
  expect(gzipSync(JSON.stringify(result)).length).toBeLessThan(500_000);
}, 15_000);
it('rejects 1,010 pairs before reading facts, including for the assessment lens', async () => {
  await pg.exec("INSERT INTO gradebook.aluno (id,ano,nome) VALUES (101,2090,'LIMITE SINTETICO'); INSERT INTO gradebook.vinculo (ano,turma_id,numero,aluno_id) VALUES (2090,1,101,101)");
  try {
    expect(await createPerformanceAnalysisV3(db).execute({ ...request, lens: 'assessments', offerId: 1 })).toEqual({ transportVersion: 3, state: 'scope-too-large' });
    expect(queries).toHaveLength(5);
    expect(queries.some((sql) => sql.includes('LEFT JOIN gradebook.nota'))).toBe(false);
  } finally { await pg.exec('DELETE FROM gradebook.vinculo WHERE aluno_id=101; DELETE FROM gradebook.aluno WHERE id=101'); }
});
