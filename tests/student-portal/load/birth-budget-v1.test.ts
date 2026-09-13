import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { BirthYearServiceV1 } from '../../../server/student-portal/birth-year/birth-year-service-v1';
import type { StudentPortalPostgresSqlV1 } from '../../../server/student-portal/persistence/postgres-persistence-v1';
import type { CryptoPortV1 } from '../../../shared/student-portal-contracts/ports-v1';
import { installResetSchemaFixtureV1 } from '../year-reset/schema-fixture';

let pg: PGlite;
let sql: StudentPortalPostgresSqlV1;
let calls = 0;
let derivations = 0;
let failKdf = false;
const unused = () => { throw new Error('synthetic-unused'); };
// This test measures call budget/receipts, not real KDF timing (separate workerd evidence).
const cryptoPort: CryptoPortV1 = { randomToken: unused, hashOpaqueToken: unused, signQr: unused, verifyQr: unused, verifySecret: unused,
  async deriveVerifier(_secret, pepperVersion) {
    derivations++;
    if (failKdf) throw new Error('synthetic-kdf-failure');
    return { algorithm: 'synthetic-budget-only', parameters: {}, salt: 'synthetic', pepperVersion, digest: crypto.randomUUID() };
  } };
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(readFileSync('migrations/gradebook-simplified/0001_current_schema.sql', 'utf8'));
  await installResetSchemaFixtureV1(pg);
  await pg.exec(`INSERT INTO gradebook.ano_letivo VALUES(2026,60000,2);
    INSERT INTO gradebook.turma(id,ano,codigo,nome,etapa,turno) VALUES(940001,2026,'LOAD','SYNTHETIC BUDGET',6,'TESTE');
    INSERT INTO gradebook.aluno(id,ano,nome) SELECT 940000+i,2026,'SYNTHETIC BUDGET '||i FROM generate_series(1,100) i;
    INSERT INTO gradebook.vinculo(ano,turma_id,numero,aluno_id) SELECT 2026,940001,i,940000+i FROM generate_series(1,100) i;
    SELECT * FROM student_portal.synchronize_profiles_v1(true);`);
  const run = async <R extends Record<string, unknown>>(target: Pick<PGlite, 'query'>, query: string, args: readonly unknown[] = []) => {
    calls++;
    return (await target.query<R>(query, [...args])).rows;
  };
  sql = { unsafe: (query, args) => run(pg, query, args), begin: (op) => pg.transaction((tx) => op({ unsafe: (query, args) => run(tx, query, args) })) };
}, 30_000);
afterAll(async () => { await pg?.close(); });

it('resumes 100 outcomes across new service instances with <=1 KDF calls and <=65 SQL calls each', async () => {
  const actor = '11111111-1111-4111-8111-111111111111';
  const page = await new BirthYearServiceV1(sql, cryptoPort, 1).readClass(940001, 100);
  const command = { contractVersion: 1, operation: 'birth-batch', idempotencyKey: crypto.randomUUID(),
    expectedVersion: page.scopeVersion, classId: 940001, expectedCount: 100, confirmed: true,
    items: page.items.map((item, index) => ({ accountId: item.accountId, expectedVersion: 0, action: 'set', year: '2001',
      confirmation: index % 2 ? 'confirmed' : 'unconfirmed-test' })) };
  for (let pass = 1; pass <= 100; pass++) {
    calls = 0; derivations = 0;
    const result = await new BirthYearServiceV1(sql, cryptoPort, 1).batch(actor, command);
    expect(derivations).toBe(1);
    expect(calls).toBeLessThanOrEqual(65);
    expect(result.items.filter((item) => item.state === 'committed')).toHaveLength(pass);
    expect(result.items.filter((item) => item.state === 'unavailable')).toHaveLength(100 - pass);
  }
  calls = 0; derivations = 0;
  const replay = await new BirthYearServiceV1(sql, cryptoPort, 1).batch(actor, command);
  expect(replay.items.every((item) => item.state === 'committed')).toBe(true);
  expect(derivations).toBe(0);
  expect(calls).toBeLessThanOrEqual(8);
  expect((await pg.query('SELECT event_id FROM student_portal.audit_event')).rows).toHaveLength(100);
  expect((await pg.query("SELECT account_id FROM student_portal.account_access_data WHERE confirmation='unconfirmed-test'")).rows).toHaveLength(50);

  const next = { ...command, idempotencyKey: crypto.randomUUID(), items: command.items.map((item) => ({ ...item, year: '2002', expectedVersion: 1 })) };
  calls = 0; derivations = 0; failKdf = true;
  const failed = await new BirthYearServiceV1(sql, cryptoPort, 1).batch(actor, next);
  expect(derivations).toBe(1);
  expect(calls).toBeLessThanOrEqual(65);
  expect(failed.items.every((item) => item.state === 'unavailable')).toBe(true);
  expect((await pg.query('SELECT event_id FROM student_portal.audit_event')).rows).toHaveLength(100);
  failKdf = false;
  derivations = 0;
  const resumed = await new BirthYearServiceV1(sql, cryptoPort, 1).batch(actor, next);
  expect(resumed.items.filter((item) => item.state === 'committed')).toHaveLength(1);
  expect(derivations).toBe(1);

  const current = await new BirthYearServiceV1(sql, cryptoPort, 1).readClass(940001, 100);
  const clear = { ...command, idempotencyKey: crypto.randomUUID(), expectedVersion: current.scopeVersion,
    items: current.items.map((item) => ({ action: 'clear', accountId: item.accountId, expectedVersion: item.version })) };
  for (let pass = 1; pass <= 50; pass++) {
    calls = 0; derivations = 0;
    const result = await new BirthYearServiceV1(sql, cryptoPort, 1).batch(actor, clear);
    expect(derivations).toBe(0);
    expect(calls).toBeLessThanOrEqual(65);
    expect(result.items.filter((item) => item.state === 'committed')).toHaveLength(pass * 2);
  }
  expect((await pg.query('SELECT account_id FROM student_portal.account_access_data WHERE birth_year IS NOT NULL')).rows).toHaveLength(0);
}, 30_000);
