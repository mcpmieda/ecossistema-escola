import { describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE } from '../../../server/auth/session';
import { seal } from '../../../server/auth/sealed';
import type { RuntimeEnv } from '../../../server/env';
import {
  GRADEBOOK_IMPORT_KNOWN_CONTENT_ROUTE_V1,
  handleGradebookImportKnownContentRequestV1,
} from '../../../server/gradebook/http/import-known-content-routes-v1';
import { testEnv } from '../../fixtures';

const origin = 'http://localhost:8788';

function item(hash: string) {
  return {
    academicYearId: 'academic-year:known:2026',
    fileName: 'fixture.xlsb',
    extension: 'xlsb' as const,
    reportedMimeType: null,
    sizeBytes: 123,
    lastModifiedAt: null,
    sha256: hash,
    sourceContractVersion: 2,
    parserVersion: 'synthetic:values-v2',
  };
}

async function headers(role?: 'ADMINISTRADOR' | 'PROFESSOR') {
  const headers = new Headers({ Origin: origin, 'Content-Type': 'application/json' });
  if (!role) return headers;
  const session = await seal(
    {
      oid: '00000000-0000-4000-8000-000000000609',
      name: 'Pessoa Sintética',
      username: 'synthetic@example.test',
      roles: [role],
      exp: Math.floor(Date.now() / 1000) + 600,
    },
    testEnv.SESSION_SECRET,
  );
  headers.set('Cookie', `${SESSION_COOKIE}=${session}`);
  return headers;
}

async function send(
  binding: unknown,
  body: unknown,
  role: 'ADMINISTRADOR' | 'PROFESSOR' = 'ADMINISTRADOR',
) {
  return handleGradebookImportKnownContentRequestV1(
    new Request(`${origin}${GRADEBOOK_IMPORT_KNOWN_CONTENT_ROUTE_V1}`, {
      method: 'POST',
      headers: await headers(role),
      body: JSON.stringify(body),
    }),
    {
      ...testEnv,
      OFFICIAL_ORIGIN: origin,
      RUNTIME_ENVIRONMENT: 'local',
      GRADEBOOK_D1: binding,
    } as RuntimeEnv,
  );
}

describe('Gradebook known-content HTTP V1', () => {
  it('resolves a bounded batch in one database read and preserves request order', async () => {
    const first = item('a'.repeat(64));
    const second = item('b'.repeat(64));
    const all = vi.fn(async () => ({
      success: true,
      results: [
        {
          academic_year_id: first.academicYearId,
          current_sha256: first.sha256,
          file_name: first.fileName,
          extension: first.extension,
          reported_mime_type: null,
          size_bytes: first.sizeBytes,
          last_modified_at: null,
          sha256: first.sha256,
          source_contract_version: first.sourceContractVersion,
          parser_version: first.parserVersion,
          logical_source_state: 'confirmed',
        },
      ],
    }));
    const bind = vi.fn(() => ({ all }));
    const prepare = vi.fn(() => ({ bind }));
    const response = await send(
      { prepare },
      { transportVersion: 1, operation: 'inspect-known-content', items: [first, second] },
    );
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      transportVersion: 1,
      state: 'ready',
      known: [true, false],
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(bind).toHaveBeenCalledTimes(1);
    expect(all).toHaveBeenCalledTimes(1);
  });

  it('rejects unauthorized and malformed requests before database access', async () => {
    const prepare = vi.fn();
    const forbidden = await send(
      { prepare },
      { transportVersion: 1, operation: 'inspect-known-content', items: [item('a'.repeat(64))] },
      'PROFESSOR',
    );
    expect(forbidden?.status).toBe(401);
    const invalid = await send(
      { prepare },
      { transportVersion: 1, operation: 'inspect-known-content', items: [] },
    );
    expect(invalid?.status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
  });
});
