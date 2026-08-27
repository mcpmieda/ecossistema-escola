// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { encodeBase64Url, encodeJson } from '../server/auth/base64url';
import { routeBancoNotasAddinApi } from '../server/banco-notas/addin-api';
import { D1BancoNotasAddinAuthorizer } from '../server/banco-notas/d1-addin-authorizer';
import { D1GradeEventStore } from '../server/banco-notas/d1-grade-event-store';
import type { RuntimeEnv } from '../server/env';
import type { GradeEventInput } from '../shared/banco-notas-grade-events';
import { testEnv } from './fixtures';

const root = process.cwd();
const migrations = [
  '0001_banco_notas_foundation.sql',
  '0002_banco_notas_cross_year_integrity.sql',
  '0007_banco_notas_teacher_entra_identity.sql',
].map((name) => readFileSync(join(root, 'infra/banco-notas/d1/migrations', name), 'utf8'));

class SqlitePrepared {
  private values: SQLInputValue[] = [];

  constructor(private readonly statement: StatementSync) {}

  bind(...values: SQLInputValue[]): SqlitePrepared {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    return (this.statement.get(...this.values) as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.statement.all(...this.values) as T[] };
  }

  async run(): Promise<unknown> {
    return this.statement.run(...this.values);
  }
}

class SqliteD1 {
  constructor(readonly database: DatabaseSync) {}

  prepare(sql: string): SqlitePrepared {
    return new SqlitePrepared(this.database.prepare(sql));
  }

  async batch(statements: SqlitePrepared[]): Promise<unknown[]> {
    this.database.exec('BEGIN');
    try {
      const results: unknown[] = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

const tenantId = '11111111-1111-4111-8111-111111111111';
const audience = 'api://banco-notas-addin-homologation';
const scope = 'BancoNotas.Sync';
const ownerOid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherOid = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const schoolYearId = '22222222-2222-4222-8222-222222222222';
const sourceId = '33333333-3333-4333-8333-333333333333';
const modelId = '44444444-4444-4444-8444-444444444444';
const teacherId = '55555555-5555-4555-8555-555555555555';
const versionId = '66666666-6666-4666-8666-666666666666';
const gradeKey = '2026|T01|M|aluno-sintetico-001';
const now = 2_000_000_000;
const kid = 'addin-integration-signing-key';
let privateKey: CryptoKey;
let publicJwk: JsonWebKey;

const openDatabases: DatabaseSync[] = [];

afterEach(() => {
  while (openDatabases.length) openDatabases.pop()?.close();
});

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  privateKey = pair.privateKey;
  publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
});

async function token(overrides: Record<string, unknown> = {}): Promise<string> {
  const header = encodeJson({ alg: 'RS256', kid });
  const payload = encodeJson({
    aud: audience,
    iss: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    tid: tenantId,
    oid: ownerOid,
    sub: 'addin-subject',
    exp: now + 300,
    nbf: now - 30,
    iat: now - 30,
    scp: `openid ${scope}`,
    ...overrides,
  });
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

const fetcher: typeof fetch = async () =>
  new Response(JSON.stringify({ keys: [{ ...publicJwk, kid, use: 'sig', alg: 'RS256' }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

function runtime(syncEnabled = true): SqliteD1 {
  const database = new DatabaseSync(':memory:');
  openDatabases.push(database);
  for (const migration of migrations) database.exec(migration);
  database.exec(`
    INSERT INTO school_years (id, year, name, starts_on, ends_on)
    VALUES ('${schoolYearId}', 2026, '2026', '2026-01-01', '2026-12-31');

    INSERT INTO teachers (id, display_name, status, entra_object_id)
    VALUES ('${teacherId}', 'Professor sintético', 'active', '${ownerOid}');

    INSERT INTO data_sources
      (id, school_year_id, type, name, description, created_by)
    VALUES
      ('${sourceId}', '${schoolYearId}', 'linked_teacher_model', 'Fonte sintética', '', 'actor');

    INSERT INTO teacher_models
      (id, school_year_id, teacher_id, state, sync_enabled, environment)
    VALUES
      ('${modelId}', '${schoolYearId}', '${teacherId}', 'connected', 1, 'homologation');

    INSERT INTO teacher_model_versions
      (id, teacher_model_id, version, model_hash, mapping_version, provenance_json)
    VALUES
      ('${versionId}', '${modelId}', 1, 'hash-modelo', 1, '{}');

    INSERT INTO cell_mappings
      (id, teacher_model_version_id, grade_key, sheet_key, cell_address, field)
    VALUES
      ('77777777-7777-4777-8777-777777777777', '${versionId}', '${gradeKey}', 'sheet-sintetica', 'F12', 'NotaT1');

    INSERT INTO source_assignments
      (id, school_year_id, data_source_id, scope, authority, sync_enabled,
       effective_from, operator_id, reason)
    VALUES
      ('88888888-8888-4888-8888-888888888888', '${schoolYearId}', '${sourceId}',
       'school_year_default', 'authoritative', ${syncEnabled ? 1 : 0},
       '2026-01-01', 'actor', 'homologação sintética');
  `);
  return new SqliteD1(database);
}

function env(configured = true): RuntimeEnv {
  const base: RuntimeEnv = { ...testEnv, TENANT_ID: tenantId };
  if (!configured) return base;
  return {
    ...base,
    BANCO_NOTAS_ADDIN_AUDIENCE: audience,
    BANCO_NOTAS_ADDIN_SCOPE: scope,
  };
}

function input(overrides: Partial<GradeEventInput> = {}): GradeEventInput {
  return {
    schemaVersion: 1,
    eventId: '99999999-9999-4999-8999-999999999999',
    correlationId: '10101010-1010-4010-8010-101010101010',
    eventType: 'grade.changed',
    gradeKey,
    field: 'NotaT1',
    dataSourceId: sourceId,
    teacherModelId: modelId,
    source: {
      kind: 'excel-addin',
      workbookId: 'workbook-sintetico',
      worksheetId: 'worksheet-sintetica',
      cellAddress: 'F12',
    },
    valueBefore: null,
    valueAfter: 8.5,
    isAbsent: false,
    sequence: 1,
    clientSentAt: '2026-08-27T10:00:00.000Z',
    ...overrides,
  };
}

async function request(payload = input(), tokenOverrides: Record<string, unknown> = {}) {
  return new Request('https://admin.escolaieda.com/api/banco-notas/v1/grade-events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await token(tokenOverrides)}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `addin-${payload.eventId}`,
    },
    body: JSON.stringify(payload),
  });
}

function route(current: SqliteD1, requestValue: Request, configured = true) {
  const database = current as unknown as D1Database;
  return routeBancoNotasAddinApi({
    request: requestValue,
    env: env(configured),
    store: new D1GradeEventStore(database),
    authorizer: new D1BancoNotasAddinAuthorizer(database),
    now,
    fetcher,
  });
}

describe('Banco de Notas sealed add-in ingestion boundary', () => {
  it('combines a valid delegated token, model ownership and authoritative D1 ingestion', async () => {
    const current = runtime();
    const response = await route(current, await request());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      status: 'applied',
      eventId: input().eventId,
      snapshot: { field: 'NotaT1', value: 8.5, sequence: 1 },
    });
    expect(
      current.database.prepare('SELECT COUNT(*) AS total FROM grade_events').get(),
    ).toMatchObject({ total: 1 });
  });

  it('rejects a valid tenant token whose oid owns another teacher model', async () => {
    const current = runtime();

    await expect(route(current, await request(input(), { oid: otherOid }))).rejects.toMatchObject({
      status: 403,
      message: 'teacher_model_not_owned',
    });
    expect(
      current.database.prepare('SELECT COUNT(*) AS total FROM grade_events').get(),
    ).toMatchObject({ total: 0 });
  });

  it('rejects missing delegated scope and missing add-in configuration before persistence', async () => {
    const withoutScope = runtime();
    await expect(
      route(withoutScope, await request(input(), { scp: 'openid profile' })),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      withoutScope.database.prepare('SELECT COUNT(*) AS total FROM grade_events').get(),
    ).toMatchObject({ total: 0 });

    const withoutConfiguration = runtime();
    await expect(route(withoutConfiguration, await request(), false)).rejects.toMatchObject({
      status: 503,
      message: 'Banco de Notas add-in identity is not configured',
    });
  });

  it('accepts only excel-addin events at the sealed bearer boundary', async () => {
    const current = runtime();
    const webModelInput = input({
      source: {
        kind: 'web-model',
        workbookId: 'workbook-sintetico',
        worksheetId: 'worksheet-sintetica',
        cellAddress: 'F12',
      },
    });

    await expect(route(current, await request(webModelInput))).rejects.toMatchObject({
      status: 403,
      message: 'grade_event_source_not_excel_addin',
    });
    expect(
      current.database.prepare('SELECT COUNT(*) AS total FROM grade_events').get(),
    ).toMatchObject({ total: 0 });
  });

  it('preserves the D1 authority/sync gate after token and ownership authorization', async () => {
    const current = runtime(false);

    await expect(route(current, await request())).rejects.toMatchObject({
      status: 403,
      message: 'source_not_authoritative_or_sync_disabled',
    });
    expect(
      current.database.prepare('SELECT COUNT(*) AS total FROM grade_events').get(),
    ).toMatchObject({ total: 0 });
  });

  it('does not expose receipts or snapshots through the add-in bearer boundary', async () => {
    const current = runtime();
    const database = current as unknown as D1Database;
    const authorizer = new D1BancoNotasAddinAuthorizer(database);
    const store = new D1GradeEventStore(database);

    await expect(
      routeBancoNotasAddinApi({
        request: new Request(
          'https://admin.escolaieda.com/api/banco-notas/v1/grade-events/99999999-9999-4999-8999-999999999999',
        ),
        env: env(),
        store,
        authorizer,
        now,
        fetcher,
      }),
    ).rejects.toMatchObject({ status: 404 });

    await expect(
      routeBancoNotasAddinApi({
        request: new Request('https://admin.escolaieda.com/api/banco-notas/v1/grade-events'),
        env: env(),
        store,
        authorizer,
        now,
        fetcher,
      }),
    ).rejects.toMatchObject({ status: 405 });
  });
});
