import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { GradebookRelationImportRequestV9 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v9';
import { createGradebookRelationalImportServiceV11 } from '../../../server/gradebook/application/import/import-relational-service-v11';
import {
  createGradebookPostgresDatabaseFromSqlV1,
  type GradebookPostgresDatabaseV1,
  type GradebookPostgresQuerySqlV1,
  type GradebookPostgresSqlV1,
} from '../../../server/gradebook/persistence/postgres/postgres-database-v1';
import { installResetSchemaFixtureV1 } from '../../student-portal/year-reset/schema-fixture';

type Row = Record<string, unknown>;
const migrations = 'migrations/gradebook-simplified/';
let pg: PGlite;
let database: GradebookPostgresDatabaseV1;

async function execute(
  client: Pick<PGlite, 'query'>,
  query: string,
  values: readonly unknown[] = [],
) {
  const result = await client.query<Row>(query, [...values]);
  return Object.assign(result.rows, { count: result.affectedRows ?? result.rows.length });
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(readFileSync(`${migrations}0001_current_schema.sql`, 'utf8'));
  await pg.exec('CREATE ROLE gradebook_app NOLOGIN NOSUPERUSER NOBYPASSRLS;');
  for (const migration of [
    '0003_council_session_v3.sql',
    '0004_council_v3_least_privilege.sql',
    '0005_relational_bulletin_snapshot_v2.sql',
    '0006_import_diagnostic_treatment_v1.sql',
    '0007_multiyear_rr_v1.sql',
  ])
    await pg.exec(readFileSync(`${migrations}${migration}`, 'utf8'));

  const sql: GradebookPostgresSqlV1 = {
    unsafe: (query, values = []) => execute(pg, query, values),
    begin: (operation) =>
      pg.transaction((client) => {
        const transaction: GradebookPostgresQuerySqlV1 = {
          unsafe: (query, values = []) => execute(client, query, values),
        };
        return operation(transaction);
      }),
    end: () => pg.close(),
  };
  await installResetSchemaFixtureV1(pg);
  database = createGradebookPostgresDatabaseFromSqlV1(sql);
}, 30_000);

afterAll(async () => {
  await database?.close();
});

function relation(
  prefix: string,
  digit: string,
  linked: boolean,
): GradebookRelationImportRequestV9 {
  return {
    transportVersion: 9,
    operation: 'persist-relacao',
    manifest: {
      fileName: `RELACAO SINTETICA ${prefix}.xlsb`,
      sha256: digit.repeat(64),
      parserVersion: 'synthetic-split-identity-repair-v9',
    },
    ano: 2026,
    turmas: [
      {
        codigo: `${prefix}A`,
        nome: `TURMA ${prefix} A`,
        etapa: 7,
        turno: 'MATUTINO',
        alunos: [
          linked
            ? ([1, 'ESTUDANTE SINTETICO', 6, `${prefix}B`] as const)
            : ([1, 'ESTUDANTE SINTETICO', 4] as const),
        ],
      },
      {
        codigo: `${prefix}B`,
        nome: `TURMA ${prefix} B`,
        etapa: 7,
        turno: 'MATUTINO',
        alunos: [
          linked
            ? ([1, 'ESTUDANTE SINTÉTICO', 7, `${prefix}A`] as const)
            : ([1, 'ESTUDANTE SINTÉTICO', 0] as const),
        ],
      },
    ],
  };
}

async function pair(prefix: string) {
  const rows = (
    await pg.query<{ codigo: string; turma_id: number; aluno_id: number }>(
      `SELECT t.codigo,t.id AS turma_id,v.aluno_id
       FROM gradebook.turma t
       JOIN gradebook.vinculo v ON v.turma_id=t.id
       WHERE t.ano=2026 AND t.codigo IN ($1,$2)
       ORDER BY t.codigo`,
      [`${prefix}A`, `${prefix}B`],
    )
  ).rows;
  expect(rows).toHaveLength(2);
  return { origin: rows[0]!, destination: rows[1]! };
}

async function addCurrentFact(
  prefix: string,
  turmaId: number,
  alunoId: number,
  value: number,
) {
  const professor = (
    await pg.query<{ id: number }>(
      `INSERT INTO gradebook.professor (ano,nome)
       VALUES (2026,$1) RETURNING id`,
      [`DOCENTE ${prefix}`],
    )
  ).rows[0]!;
  const disciplina = (
    await pg.query<{ id: number }>(
      `INSERT INTO gradebook.disciplina (ano,nome)
       VALUES (2026,$1) RETURNING id`,
      [`COMPONENTE ${prefix}`],
    )
  ).rows[0]!;
  const oferta = (
    await pg.query<{ id: number }>(
      `INSERT INTO gradebook.oferta (ano,turma_id,professor_id,disciplina_id)
       VALUES (2026,$1,$2,$3) RETURNING id`,
      [turmaId, professor.id, disciplina.id],
    )
  ).rows[0]!;
  const instrumento = (
    await pg.query<{ id: number }>(
      `INSERT INTO gradebook.instrumento (oferta_id,trimestre,slot,maximo,descricao)
       VALUES ($1,1,1,30000,'AVALIACAO SINTETICA') RETURNING id`,
      [oferta.id],
    )
  ).rows[0]!;
  await pg.query(
    'INSERT INTO gradebook.nota (instrumento_id,aluno_id,valor) VALUES ($1,$2,$3)',
    [instrumento.id, alunoId, value],
  );
  await pg.query(
    `INSERT INTO gradebook.fechamento
      (oferta_id,aluno_id,am1_fonte,rec_nc_mask,rec_rr_mask)
      VALUES ($1,$2,$3,0,0)`,
    [oferta.id, alunoId, value],
  );
  return { ofertaId: oferta.id, instrumentoId: instrumento.id };
}

describe('reparo de identidade dividida por movimentacao explicita V9', () => {
  it('reancora fatos correntes no id da origem e preserva o historico tecnico', async () => {
    const service = createGradebookRelationalImportServiceV11(database);
    await expect(service.execute(relation('R1105', 'a', false))).resolves.toMatchObject({
      state: 'applied',
    });
    const before = await pair('R1105');
    expect(before.origin.aluno_id).not.toBe(before.destination.aluno_id);

    await addCurrentFact('R1105A', before.origin.turma_id, before.origin.aluno_id, 11000);
    await addCurrentFact(
      'R1105B',
      before.destination.turma_id,
      before.destination.aluno_id,
      22000,
    );

    const corrected = relation('R1105', 'b', true);
    await expect(service.execute(corrected)).resolves.toMatchObject({ state: 'applied' });

    const after = await pair('R1105');
    expect(after.origin.aluno_id).toBe(before.origin.aluno_id);
    expect(after.destination.aluno_id).toBe(before.origin.aluno_id);

    expect(
      (
        await pg.query<{ aluno_id: number; valor: number }>(
          `SELECT aluno_id,valor FROM gradebook.nota
           WHERE aluno_id IN ($1,$2)
           ORDER BY valor`,
          [before.origin.aluno_id, before.destination.aluno_id],
        )
      ).rows,
    ).toEqual([
      { aluno_id: before.origin.aluno_id, valor: 11000 },
      { aluno_id: before.origin.aluno_id, valor: 22000 },
    ]);
    expect(
      (
        await pg.query<{ aluno_id: number; am1_fonte: number }>(
          `SELECT aluno_id,am1_fonte FROM gradebook.fechamento
           WHERE aluno_id IN ($1,$2)
           ORDER BY am1_fonte`,
          [before.origin.aluno_id, before.destination.aluno_id],
        )
      ).rows,
    ).toEqual([
      { aluno_id: before.origin.aluno_id, am1_fonte: 11000 },
      { aluno_id: before.origin.aluno_id, am1_fonte: 22000 },
    ]);

    expect(
      (
        await pg.query<{ count: number }>(
          'SELECT count(*)::integer AS count FROM gradebook.aluno WHERE id IN ($1,$2)',
          [before.origin.aluno_id, before.destination.aluno_id],
        )
      ).rows[0]?.count,
    ).toBe(2);
    await expect(service.execute(corrected)).resolves.toMatchObject({ state: 'no-changes' });
  });

  it('falha fechado e reverte tudo se os ids tiverem a mesma chave academica corrente', async () => {
    const service = createGradebookRelationalImportServiceV11(database);
    await expect(service.execute(relation('R1106', 'c', false))).resolves.toMatchObject({
      state: 'applied',
    });
    const before = await pair('R1106');
    const fact = await addCurrentFact(
      'R1106',
      before.origin.turma_id,
      before.origin.aluno_id,
      13000,
    );
    await pg.query(
      'INSERT INTO gradebook.nota (instrumento_id,aluno_id,valor) VALUES ($1,$2,$3)',
      [fact.instrumentoId, before.destination.aluno_id, 14000],
    );

    await expect(service.execute(relation('R1106', 'd', true))).resolves.toMatchObject({
      state: 'conflict',
      reason: 'A movimentação corrigida conflita com dados acadêmicos já existentes.',
    });

    const after = await pair('R1106');
    expect(after.origin.aluno_id).toBe(before.origin.aluno_id);
    expect(after.destination.aluno_id).toBe(before.destination.aluno_id);
    expect(
      (
        await pg.query<{ aluno_id: number; valor: number }>(
          'SELECT aluno_id,valor FROM gradebook.nota WHERE instrumento_id=$1 ORDER BY aluno_id',
          [fact.instrumentoId],
        )
      ).rows,
    ).toEqual([
      { aluno_id: before.origin.aluno_id, valor: 13000 },
      { aluno_id: before.destination.aluno_id, valor: 14000 },
    ]);
  });
});
