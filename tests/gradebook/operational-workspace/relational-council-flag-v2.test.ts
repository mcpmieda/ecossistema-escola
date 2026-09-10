import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { createGradebookPostgresDatabaseFromSqlV1, type GradebookPostgresDatabaseV1 } from '../../../server/gradebook/persistence/postgres/postgres-database-v1';
import { createRelationalWorkspaceV2 } from '../../../server/gradebook/application/operational-workspace/relational-workspace-v2';

let pg: PGlite;
let db: GradebookPostgresDatabaseV1;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(readFileSync('migrations/gradebook-simplified/0001_current_schema.sql', 'utf8'));
  await pg.exec(`
    INSERT INTO gradebook.ano_letivo VALUES (2090,60000,2);
    INSERT INTO gradebook.aluno (id,ano,nome,conselho_anterior,conselho_anterior_por) VALUES
      (1,2090,'SINTETICO SIM',true,'11111111-1111-4111-8111-111111111111'),
      (2,2090,'SINTETICO NAO',false,'11111111-1111-4111-8111-111111111111'),
      (3,2090,'SINTETICO DESCONHECIDO',null,null);
  `);
  db = createGradebookPostgresDatabaseFromSqlV1({
    async unsafe() { throw new Error('read-outside-transaction'); },
    async begin(operation) {
      return pg.transaction(async (tx) => operation({ async unsafe(sql, values = []) {
        const result = await tx.query<Record<string, unknown>>(sql, [...values]);
        return Object.assign(result.rows, { count: result.affectedRows ?? result.rows.length });
      } }));
    },
    async end() { await pg.close(); },
  });
}, 30_000);
afterAll(async () => { await db?.close(); });

it.each([[1, true], [2, false], [3, null]] as const)(
  'preserves Council prior answer %i through the real PostgreSQL facade', async (id, councilPrevious) => {
    const response = await createRelationalWorkspaceV2(db).execute({ contractVersion: 2, operation: 'center', year: 2090, kind: 'student', id, offset: 0, limit: 100 });
    expect(response).toMatchObject({ state: 'ready', center: { studentInfo: { councilPrevious } } });
  },
);
