import { describe, expect, it, vi } from 'vitest';
import type {
  AcademicYearId,
  EnrollmentId,
  StudentId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import { SESSION_COOKIE } from '../../../server/auth/session';
import { seal } from '../../../server/auth/sealed';
import type { RuntimeEnv } from '../../../server/env';
import {
  GRADEBOOK_IMPORT_PERSISTENCE_ROUTE_V2,
  handleGradebookImportPersistenceRequestV2,
} from '../../../server/gradebook/http/import-persistence-routes-v2';
import { testEnv } from '../../fixtures';

const origin = 'http://localhost:8788';

function body() {
  return {
    transportVersion: 2,
    operation: 'persist-recognized-file',
    manifest: {
      fileName: 'fixture-sintetica.xlsx',
      extension: 'xlsx',
      reportedMimeType: null,
      sizeBytes: 64,
      lastModifiedAt: null,
      sha256: 'a'.repeat(64),
      sourceContractVersion: 2,
      parserVersion: 'synthetic-v2',
      readAt: '2026-09-03T12:00:00.000Z',
    },
    recognizedSuggestions: { academicYear: null, teacherName: null },
    confirmedContext: { academicYearId: 'academic-year:http-v2' as AcademicYearId },
    sourceResolution: { mode: 'resolve-or-create' },
    sheets: [
      {
        kind: 'recovery',
        sourceSheetName: 'REC-SINTETICA',
        recognizedContext: {
          classGroupLabel: 'Turma sintética',
          subjectLabel: 'Componente sintético',
          disciplineIndex: 'D1',
        },
        teachingAssignmentId: 'teaching-assignment:http-v2' as TeachingAssignmentId,
        students: [
          {
            sourceRow: 5,
            confirmedStudent: {
              studentId: 'student:http-v2' as StudentId,
              enrollmentId: 'enrollment:http-v2' as EnrollmentId,
            },
            recovery: {
              trimester1: null,
              trimester2: null,
              trimester3: null,
              totalAfterRecovery: null,
              originalTrimester1: null,
              originalTrimester2: null,
              originalTrimester3: null,
              originalAnnual: null,
              eligibleTrimester1: false,
              eligibleTrimester2: false,
              eligibleTrimester3: false,
            },
          },
        ],
      },
    ],
    diagnostics: [],
  };
}

function env(binding: unknown, production = false): RuntimeEnv {
  return {
    ...testEnv,
    OFFICIAL_ORIGIN: production ? testEnv.OFFICIAL_ORIGIN : origin,
    RUNTIME_ENVIRONMENT: production ? 'production' : 'local',
    GRADEBOOK_D1: binding,
  };
}

async function headers(role?: 'ADMINISTRADOR' | 'PROFESSOR', requestOrigin = origin) {
  const result = new Headers({ Origin: requestOrigin, 'Content-Type': 'application/json' });
  if (!role) return result;
  const session = await seal(
    {
      oid: '00000000-0000-4000-8000-000000000410',
      name: 'Pessoa Sintética',
      username: 'synthetic@example.test',
      roles: [role],
      exp: Math.floor(Date.now() / 1000) + 600,
    },
    testEnv.SESSION_SECRET,
  );
  result.set('Cookie', `${SESSION_COOKIE}=${session}`);
  return result;
}

async function request(value: unknown, role?: 'ADMINISTRADOR' | 'PROFESSOR', base = origin) {
  return new Request(`${base}${GRADEBOOK_IMPORT_PERSISTENCE_ROUTE_V2}`, {
    method: 'POST',
    headers: await headers(role, base),
    body: JSON.stringify(value),
  });
}

describe('Gradebook import persistence HTTP V2', () => {
  it('enforces method, official origin and write origin before body/planning', async () => {
    const local = env(undefined);
    await expect(
      handleGradebookImportPersistenceRequestV2(
        new Request(`${origin}${GRADEBOOK_IMPORT_PERSISTENCE_ROUTE_V2}`, {
          method: 'GET',
          headers: await headers('ADMINISTRADOR'),
        }),
        local,
      ),
    ).rejects.toMatchObject({ status: 405 });
    await expect(
      handleGradebookImportPersistenceRequestV2(
        new Request(`http://unofficial.test${GRADEBOOK_IMPORT_PERSISTENCE_ROUTE_V2}`, {
          method: 'POST',
          headers: await headers('ADMINISTRADOR', 'http://unofficial.test'),
          body: JSON.stringify(body()),
        }),
        local,
      ),
    ).rejects.toMatchObject({ status: 421 });
    await expect(
      handleGradebookImportPersistenceRequestV2(
        new Request(`${origin}${GRADEBOOK_IMPORT_PERSISTENCE_ROUTE_V2}`, {
          method: 'POST',
          headers: await headers('ADMINISTRADOR', 'http://write-origin.test'),
          body: JSON.stringify(body()),
        }),
        local,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('returns opaque 401/403 with no-store before touching D1', async () => {
    const prepare = vi.fn(() => {
      throw new Error('must-not-touch');
    });
    for (const [role, status] of [
      [undefined, 401],
      ['PROFESSOR', 403],
    ] as const) {
      const response = await handleGradebookImportPersistenceRequestV2(
        await request(body(), role),
        env({ prepare, exec: vi.fn() }),
      );
      expect(response?.status).toBe(status);
      expect(response?.headers.get('Cache-Control')).toContain('no-store');
      await expect(response?.json()).resolves.toEqual({
        transportVersion: 2,
        state: 'not-authorized',
      });
    }
    expect(prepare).not.toHaveBeenCalled();
  });

  it('rejects forbidden identity and oversized bodies before the production gate/storage', async () => {
    const prepare = vi.fn(() => {
      throw new Error('must-not-touch');
    });
    const forbidden = { ...body(), logicalSourceId: 'logical-source:browser-forbidden' };
    const invalid = await handleGradebookImportPersistenceRequestV2(
      await request(forbidden, 'ADMINISTRADOR'),
      env({ prepare, exec: vi.fn() }),
    );
    expect(invalid?.status).toBe(400);
    await expect(invalid?.json()).resolves.toEqual({
      transportVersion: 2,
      state: 'invalid-request',
      reason: 'forbidden-client-payload',
    });
    expect(invalid?.headers.get('Cache-Control')).toContain('no-store');

    const unknown = await handleGradebookImportPersistenceRequestV2(
      await request({ ...body(), browserDecision: 'new' }, 'ADMINISTRADOR'),
      env({ prepare, exec: vi.fn() }),
    );
    expect(unknown?.status).toBe(400);
    await expect(unknown?.json()).resolves.toEqual({
      transportVersion: 2,
      state: 'invalid-request',
      reason: 'invalid-request',
    });

    const oversizedRequest = new Request(`${origin}${GRADEBOOK_IMPORT_PERSISTENCE_ROUTE_V2}`, {
      method: 'POST',
      headers: await headers('ADMINISTRADOR'),
      body: JSON.stringify({ padding: 'x'.repeat(8_388_608) }),
    });
    const oversized = await handleGradebookImportPersistenceRequestV2(
      oversizedRequest,
      env({ prepare, exec: vi.fn() }),
    );
    expect(oversized?.status).toBe(413);
    expect(oversized?.headers.get('Cache-Control')).toContain('no-store');
    await expect(oversized?.json()).resolves.toEqual({
      transportVersion: 2,
      state: 'invalid-request',
      reason: 'payload-too-large',
    });
    expect(prepare).not.toHaveBeenCalled();
  });

  it('fails closed at the production gate after V2 inspection and before D1', async () => {
    const prepare = vi.fn(() => {
      throw new Error('must-not-touch');
    });
    const response = await handleGradebookImportPersistenceRequestV2(
      await request(body(), 'ADMINISTRADOR', testEnv.OFFICIAL_ORIGIN),
      env({ prepare, exec: vi.fn() }, true),
    );
    expect(response?.status).toBe(503);
    expect(response?.headers.get('Cache-Control')).toContain('no-store');
    await expect(response?.json()).resolves.toEqual({ transportVersion: 2, state: 'unavailable' });
    expect(prepare).not.toHaveBeenCalled();
  });
});
