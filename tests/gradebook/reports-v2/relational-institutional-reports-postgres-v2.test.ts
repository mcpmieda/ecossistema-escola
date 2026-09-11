import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRelationalBulletinServiceV2 } from '../../../server/gradebook/application/bulletins/relational-bulletin-v2';
import { createRelationalCouncilV3 } from '../../../server/gradebook/application/council/relational-council-v3';
import { createPerformanceAnalysisV3 } from '../../../server/gradebook/application/read-models/performance/performance-analysis-v3';
import { createPerformanceTermComparisonV4 } from '../../../server/gradebook/application/read-models/performance/performance-term-comparison-v4';
import { createRelationalInstitutionalReportsServiceV2 } from '../../../server/gradebook/application/reports/relational-institutional-reports-v2';
import {
  createGradebookPostgresDatabaseFromSqlV1,
  type GradebookPostgresDatabaseV1,
} from '../../../server/gradebook/persistence/postgres/postgres-database-v1';
import { createRelationalBulletinSnapshotRepositoryV2 } from '../../../server/gradebook/persistence/postgres/relational-bulletin-snapshot-v2';
import { createRelationalImportDiagnosticsReadV2 } from '../../../server/gradebook/persistence/postgres/relational-import-diagnostics-read-v2';
import {
  relationalInstitutionalReportResponseMatchesV2,
  relationalInstitutionalReportResponseSchemaV2,
  type RelationalInstitutionalReportRequestV2,
} from '../../../shared/gradebook-contracts/reports/relational-institutional-reports-v2';

let pg: PGlite;
let database: GradebookPostgresDatabaseV1;
const queries: string[] = [];

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(readFileSync('migrations/gradebook-simplified/0001_current_schema.sql', 'utf8'));
  await pg.exec('CREATE ROLE gradebook_app NOLOGIN NOSUPERUSER NOBYPASSRLS;');
  for (const migration of [
    '0003_council_session_v3.sql',
    '0004_council_v3_least_privilege.sql',
    '0005_relational_bulletin_snapshot_v2.sql',
  ]) {
    await pg.exec(readFileSync(`migrations/gradebook-simplified/${migration}`, 'utf8'));
  }
  await pg.exec(`
    INSERT INTO gradebook.ano_letivo VALUES (2026,60000,2);
    INSERT INTO gradebook.turma (id,ano,codigo,nome,etapa,turno)
      VALUES (10,2026,'6A','6º ANO A',6,'M');
    INSERT INTO gradebook.professor (id,ano,nome) VALUES (1,2026,'DOCENTE SINTÉTICO');
    INSERT INTO gradebook.disciplina (id,ano,nome) VALUES
      (1,2026,'PORTUGUÊS'),(2,2026,'MATEMÁTICA');
    INSERT INTO gradebook.oferta (id,ano,turma_id,professor_id,disciplina_id)
      VALUES (10,2026,10,1,1),(20,2026,10,1,2);
    INSERT INTO gradebook.aluno (id,ano,nome) VALUES
      (1,2026,'ALUNO SINTÉTICO A'),(2,2026,'ALUNO SINTÉTICO B');
    INSERT INTO gradebook.vinculo (ano,turma_id,numero,aluno_id,situacao)
      VALUES (2026,10,1,1,NULL),(2026,10,2,2,NULL);
    INSERT INTO gradebook.instrumento (id,oferta_id,trimestre,slot,maximo,descricao)
      SELECT oferta_id * 1000 + trimestre * 100 + slot, oferta_id, trimestre, slot,
             CASE WHEN slot=11 THEN CASE WHEN trimestre=3 THEN 22000 ELSE 16500 END
                  ELSE CASE WHEN trimestre=3 THEN 9000 ELSE 6750 END END,
             CASE slot WHEN 1 THEN 'AV1' WHEN 2 THEN 'AV2' ELSE 'ATIVIDADE' END
      FROM (VALUES (10),(20)) oferta(oferta_id)
      CROSS JOIN generate_series(1,3) trimestre
      CROSS JOIN (VALUES (1),(2),(11)) instrumento(slot);
    INSERT INTO gradebook.nota (instrumento_id,aluno_id,valor)
      SELECT id, aluno_id, CASE WHEN aluno_id=1 THEN maximo ELSE maximo/2 END
      FROM gradebook.instrumento CROSS JOIN (VALUES (1),(2)) aluno(aluno_id);
    INSERT INTO gradebook.fechamento
      (oferta_id,aluno_id,am1_fonte,am2_fonte,am3_fonte,rec_nc_mask,u_fonte)
      VALUES (10,1,30000,30000,40000,0,100000),(20,1,30000,30000,40000,0,100000),
             (10,2,15000,15000,20000,0,50000),(20,2,15000,15000,20000,0,50000);
    INSERT INTO gradebook.importacao_diagnostico
      (ano,arquivo,hash,chave,nivel,codigo,turma_codigo,disciplina,periodo,
       aluno_numero,campo,rotulo,causa)
      VALUES (2026,'fonte-sintetica.xlsb',decode(repeat('a',64),'hex'),'achado-1',
              'warning','source-unavailable','6A','MATEMÁTICA','1º trimestre',2,
              'term-result','Resultado','Sem resultado calculado salvo');
  `);
  const execute = async (sql: string, values: readonly unknown[] = []) => {
    queries.push(sql);
    const result = await pg.query<Record<string, unknown>>(sql, [...values]);
    return Object.assign(result.rows, { count: result.affectedRows ?? result.rows.length });
  };
  database = createGradebookPostgresDatabaseFromSqlV1({
    unsafe: execute,
    async begin(operation) {
      return pg.transaction(async (transaction) => operation({
        async unsafe(sql, values = []) {
          queries.push(sql);
          const result = await transaction.query<Record<string, unknown>>(sql, [...values]);
          return Object.assign(result.rows, { count: result.affectedRows ?? result.rows.length });
        },
      }));
    },
    async end() { await pg.close(); },
  });
}, 30_000);

afterAll(async () => database?.close());
beforeEach(() => { queries.length = 0; });

function service() {
  const bulletins = createRelationalBulletinServiceV2({
    database,
    snapshots: createRelationalBulletinSnapshotRepositoryV2(database),
  });
  return createRelationalInstitutionalReportsServiceV2({
    performanceAnalysis: createPerformanceAnalysisV3(database),
    performanceComparison: createPerformanceTermComparisonV4(database),
    council: createRelationalCouncilV3(database, '11111111-1111-4111-8111-111111111111'),
    bulletins,
    diagnostics: createRelationalImportDiagnosticsReadV2(database),
  });
}

async function execute(request: RelationalInstitutionalReportRequestV2) {
  const response = await service().execute(request, { oid: '11111111-1111-4111-8111-111111111111' });
  expect(relationalInstitutionalReportResponseSchemaV2.safeParse(response).success).toBe(true);
  expect(relationalInstitutionalReportResponseMatchesV2(request, response)).toBe(true);
  expect(queries.join('\n')).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/iu);
  return response;
}

describe('relational institutional reports V2 on PostgreSQL', () => {
  it('loads the canonical class catalog without legacy relations', async () => {
    await expect(execute({ contractVersion: 2, operation: 'catalog', year: 2026 })).resolves.toMatchObject({
      state: 'ready',
      classes: [{ id: 10, code: '6A', name: '6º ANO A' }],
    });
    expect(queries.join('\n')).not.toMatch(/academic_(?:entity|record)|streams|versions/iu);
  });

  it('returns a bounded performance analysis in canonical subject order', async () => {
    const request: RelationalInstitutionalReportRequestV2 = {
      contractVersion: 2, operation: 'performance', family: 'class-results', year: 2026,
      classId: 10, period: 1, lens: 'result', referenceTerm: null,
      statuses: [null,1,2,3,4,5,7],
    };
    const response = await execute(request);
    expect(response).toMatchObject({
      state: 'ready',
      operation: 'performance',
      report: { transportVersion: 3 },
    });
    if (response.state === 'ready' && response.operation === 'performance') {
      const analysis = response.report.operation === 'term-comparison' ? response.report.analysis : response.report;
      expect(analysis.matrix.rows[0]?.student.name).toBe('ALUNO SINTÉTICO A');
      expect(analysis.columns.map((item) => item.label)).toEqual(['PORTUGUÊS', 'MATEMÁTICA']);
    }
    expect(queries.length).toBeLessThanOrEqual(7);
  });

  it('reads only current import diagnostics and exposes empty bulletin history', async () => {
    await expect(execute({
      contractVersion: 2, operation: 'audit', year: 2026, severities: ['warning'],
      codes: ['source-unavailable'], classCode: '6A', limit: 50, offset: 0,
    })).resolves.toMatchObject({ state: 'ready', items: [{ studentName: 'ALUNO SINTÉTICO B' }] });
    expect(queries).toHaveLength(1);
    queries.length = 0;
    await expect(execute({ contractVersion: 2, operation: 'bulletin-history', year: 2026, classId: 10 })).resolves.toMatchObject({
      state: 'ready',
      report: { items: [] },
    });
  });

  it('reuses the read-only Council V3 workspace without inventing director tie-breaks', async () => {
    await expect(execute({ contractVersion: 2, operation: 'council', year: 2026, classId: 10 })).resolves.toMatchObject({
      state: 'ready',
      report: { operation: 'workspace', workspace: { classGroup: { id: 10 } } },
    });
  });
});
