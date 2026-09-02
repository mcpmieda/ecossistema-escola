import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';

import { onRequest } from '../../../functions/[[path]]';
import { SESSION_COOKIE } from '../../../server/auth/session';
import { seal } from '../../../server/auth/sealed';
import type { RuntimeEnv } from '../../../server/env';
import { GRADEBOOK_OPERATIONAL_WORKSPACE_ROUTE_V1 } from '../../../server/gradebook/http/operational-workspace-routes-v1';
import { createGradebookD1PersistenceUnitOfWorkV1 } from '../../../server/gradebook/persistence/d1/composition/d1-persistence-unit-of-work-v1';
import type {
  AcademicYearId,
  ClassGroupId,
  SchoolId,
  SubjectId,
  TeacherId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import { SqliteD1Database } from '../persistence/d1-transaction/d1-write-test-support';
import { testEnv } from '../../fixtures';

const LOCAL_ORIGIN = 'http://localhost:8788';
const academicYearId = 'academic-year:maintenance-http:2026' as AcademicYearId;
const schoolId = 'school:maintenance-http:synthetic' as SchoolId;
const teacherId = 'teacher:maintenance-http:existing' as TeacherId;
const classGroupId = 'class-group:maintenance-http:6a' as ClassGroupId;
const subjectId = 'subject:maintenance-http:math' as SubjectId;
const assignmentId = 'teaching-assignment:maintenance-http:imported' as TeachingAssignmentId;
type TestRole = 'ADMINISTRADOR' | 'PROFESSOR';

async function openDatabase(): Promise<{
  readonly raw: DatabaseSync;
  readonly database: SqliteD1Database;
}> {
  const sqliteModuleName = 'node:sqlite';
  const sqlite = await import(/* @vite-ignore */ sqliteModuleName);
  const raw = new sqlite.DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON;');
  raw.exec(
    readFileSync(
      join(process.cwd(), 'migrations', 'gradebook', '0001_gradebook_context_entities_imports_v1.sql'),
      'utf8',
    ),
  );
  return { raw, database: new SqliteD1Database(raw) };
}

function localEnv(database: unknown): RuntimeEnv {
  return {
    ...testEnv,
    RUNTIME_ENVIRONMENT: 'local',
    OFFICIAL_ORIGIN: LOCAL_ORIGIN,
    GRADEBOOK_D1: database,
  };
}

async function headers(role?: TestRole, origin = LOCAL_ORIGIN): Promise<Headers> {
  const value = new Headers({ Origin: origin, 'Content-Type': 'application/json' });
  if (!role) return value;
  const session = await seal(
    {
      oid: '44444444-4444-4444-8444-444444444444',
      name: 'Administrador Sintético F5',
      username: 'synthetic-f5@example.test',
      roles: [role],
      exp: Math.floor(Date.now() / 1000) + 600,
    },
    testEnv.SESSION_SECRET,
  );
  value.set('Cookie', `${SESSION_COOKIE}=${session}`);
  return value;
}

async function request(
  body: unknown,
  options: { readonly role?: TestRole; readonly base?: string; readonly origin?: string } = {},
): Promise<Request> {
  const base = options.base ?? LOCAL_ORIGIN;
  return new Request(`${base}${GRADEBOOK_OPERATIONAL_WORKSPACE_ROUTE_V1}`, {
    method: 'POST',
    headers: await headers(options.role, options.origin ?? base),
    body: JSON.stringify(body),
  });
}

async function invoke(requestValue: Request, env: RuntimeEnv): Promise<Response> {
  return await onRequest({ request: requestValue, env } as never);
}

async function seed(database: SqliteD1Database) {
  const unit = createGradebookD1PersistenceUnitOfWorkV1(database, {
    now: () => '2026-09-02T10:45:00.000Z',
  });
  const context = { academicYearId } as const;
  await unit.entities.appendVersion(
    context,
    {
      kind: 'academic-year',
      value: {
        id: academicYearId,
        schoolId,
        year: 2026,
        status: 'active',
        activeEvaluationProfileId: 'profile:maintenance-http',
        configurationVersion: 'maintenance-http-v1',
      },
    },
    { expectedVersion: null },
  );
  await unit.entities.appendVersion(
    context,
    {
      kind: 'teacher',
      value: { id: teacherId, displayName: 'Professora HTTP', sourceNames: [], status: 'active' },
    },
    { expectedVersion: null },
  );
  await unit.entities.appendVersion(
    context,
    {
      kind: 'class-group',
      value: { id: classGroupId, academicYearId, code: '6A', grade: '6º', section: 'A' },
    },
    { expectedVersion: null },
  );
  await unit.entities.appendVersion(
    context,
    {
      kind: 'subject',
      value: {
        id: subjectId,
        code: 'MAT',
        displayName: 'Matemática HTTP',
        shortName: 'Mat',
        status: 'active',
      },
    },
    { expectedVersion: null },
  );
  await unit.entities.appendVersion(
    context,
    {
      kind: 'teaching-assignment',
      value: {
        id: assignmentId,
        academicYearId,
        teacherId,
        classGroupId,
        subjectId,
        sourceDisciplineIndex: 'D1',
        effectivePeriod: {},
        confirmationOrigin: 'imported-source',
      },
    },
    { expectedVersion: null },
  );
  return { unit, context };
}

describe('teacher assignment maintenance on operational HTTP bridge', () => {
  it('preserva auth/no-store e não toca binding antes de autenticar', async () => {
    const prepare = vi.fn(() => {
      throw new Error('sensitive-maintenance-binding');
    });
    const env = localEnv({ prepare, exec: vi.fn() });
    const body = {
      maintenanceVersion: 1,
      operation: 'teacher-register',
      academicYearId,
      displayName: 'Professora Não Autorizada',
    };

    const unauthenticated = await invoke(await request(body), env);
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get('Cache-Control')).toContain('no-store');

    const forbidden = await invoke(await request(body, { role: 'PROFESSOR' }), env);
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get('Cache-Control')).toContain('no-store');
    expect(prepare).not.toHaveBeenCalled();
  });

  it('rejeita claims de navegador antes de tocar armazenamento', async () => {
    const prepare = vi.fn(() => {
      throw new Error('sensitive-maintenance-binding');
    });
    const response = await invoke(
      await request(
        {
          maintenanceVersion: 1,
          operation: 'assignment-confirm',
          academicYearId,
          assignmentReference: assignmentId,
          expectedVersion: 1,
          actorId: 'browser-actor',
          capability: 'gradebook.persistence.admin',
        },
        { role: 'ADMINISTRADOR' },
      ),
      localEnv({ prepare, exec: vi.fn() }),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(prepare).not.toHaveBeenCalled();
  });

  it('mantém produção fail-closed antes de inspecionar binding', async () => {
    const prepare = vi.fn(() => {
      throw new Error('production-maintenance-binding');
    });
    const env = {
      ...testEnv,
      RUNTIME_ENVIRONMENT: 'production',
      GRADEBOOK_D1: { prepare, exec: vi.fn() },
    } satisfies RuntimeEnv;
    const response = await invoke(
      await request(
        {
          maintenanceVersion: 1,
          operation: 'teacher-register',
          academicYearId,
          displayName: 'Professora Produção',
        },
        { role: 'ADMINISTRADOR', base: testEnv.OFFICIAL_ORIGIN, origin: testEnv.OFFICIAL_ORIGIN },
      ),
      env,
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(prepare).not.toHaveBeenCalled();
  });

  it('confirma atribuição importada com CAS no mesmo POST operacional', async () => {
    const { raw, database } = await openDatabase();
    try {
      const { unit, context } = await seed(database);
      const response = await invoke(
        await request(
          {
            maintenanceVersion: 1,
            operation: 'assignment-confirm',
            academicYearId,
            assignmentReference: assignmentId,
            expectedVersion: 1,
          },
          { role: 'ADMINISTRADOR' },
        ),
        localEnv(database),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toContain('no-store');
      await expect(response.json()).resolves.toMatchObject({
        maintenanceVersion: 1,
        state: 'written',
        entity: 'teaching-assignment',
        reference: assignmentId,
        currentVersion: 2,
        change: 'assignment-confirmed',
      });
      const persisted = await unit.entities.get(context, { kind: 'teaching-assignment', id: assignmentId });
      if (persisted?.value.kind !== 'teaching-assignment') throw new Error('Expected assignment.');
      expect(persisted.value.value.confirmationOrigin).toBe('user-confirmed');

      const stale = await invoke(
        await request(
          {
            maintenanceVersion: 1,
            operation: 'assignment-confirm',
            academicYearId,
            assignmentReference: assignmentId,
            expectedVersion: 1,
          },
          { role: 'ADMINISTRADOR' },
        ),
        localEnv(database),
      );
      await expect(stale.json()).resolves.toEqual({
        maintenanceVersion: 1,
        state: 'version-conflict',
        currentVersion: 2,
      });
    } finally {
      raw.close();
    }
  });

  it('expõe estado/versionamento do Professor sem criar segundo endpoint', async () => {
    const { raw, database } = await openDatabase();
    try {
      await seed(database);
      const response = await invoke(
        await request(
          {
            maintenanceVersion: 1,
            operation: 'teacher-state',
            academicYearId,
            teacherReference: teacherId,
          },
          { role: 'ADMINISTRADOR' },
        ),
        localEnv(database),
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        maintenanceVersion: 1,
        state: 'ready',
        academicYearId,
        teacher: { reference: teacherId, currentVersion: 1 },
        assignments: [{ reference: assignmentId, currentVersion: 1, confirmationOrigin: 'imported-source' }],
      });
    } finally {
      raw.close();
    }
  });
});
