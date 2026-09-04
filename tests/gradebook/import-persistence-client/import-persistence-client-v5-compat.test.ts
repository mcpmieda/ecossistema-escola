import { describe, expect, it } from 'vitest';
import {
  normalizeGradebookImportPersistenceResponseV5,
  resolveGradebookImportPersistenceResponseV5,
} from '../../../src/features/gradebook/import/import-persistence-client-v2';

const emptySummary = {
  assessmentDefinitions: { total: 0, resolved: 0, blocked: 0 },
  assessmentComponents: { unchanged: 0, new: 0, changed: 0, blocked: 0 },
  academicRecords: {
    unchanged: 0,
    new: 0,
    changed: 0,
    missingFromNewSource: 0,
    blocked: 0,
  },
  plannedWrites: {
    logicalSources: 0,
    sourceFileVersions: 0,
    importBatchVersions: 0,
    assessmentComponentVersions: 0,
    academicRecordVersions: 0,
    logicalSourceRecordAssociationVersions: 0,
    total: 0,
  },
  committedWrites: {
    logicalSources: 0,
    sourceFileVersions: 0,
    importBatchVersions: 0,
    assessmentComponentVersions: 0,
    academicRecordVersions: 0,
    logicalSourceRecordAssociationVersions: 0,
    total: 0,
  },
} as const;

describe('Gradebook import persistence client V5 response compatibility', () => {
  it('keeps a valid V5 response unchanged', () => {
    const response = { transportVersion: 5, state: 'unavailable' } as const;
    expect(normalizeGradebookImportPersistenceResponseV5(response)).toBe(response);
  });

  it.each([
    { transportVersion: 4, state: 'not-authorized' } as const,
    { transportVersion: 4, state: 'unavailable' } as const,
    {
      transportVersion: 4,
      state: 'invalid-request',
      reason: 'payload-too-large',
    } as const,
  ])('promotes only pre-negotiation V4 failure %s to V5', (response) => {
    expect(normalizeGradebookImportPersistenceResponseV5(response)).toEqual({
      ...response,
      transportVersion: 5,
    });
  });

  it('rejects a V4 academic result instead of masking a server downgrade', () => {
    const response = {
      transportVersion: 4,
      state: 'no-changes',
      summary: emptySummary,
    } as const;
    expect(normalizeGradebookImportPersistenceResponseV5(response)).toBeNull();
  });

  it('resolves an allowed V4 pre-negotiation failure through the HTTP response gate', () => {
    expect(
      resolveGradebookImportPersistenceResponseV5({
        status: 403,
        contentType: 'application/json; charset=utf-8',
        payload: { transportVersion: 4, state: 'not-authorized' },
        jsonParsed: true,
      }),
    ).toEqual({ transportVersion: 5, state: 'not-authorized' });
  });

  it('classifies a non-JSON edge response without leaking the body', () => {
    const privateBody = '<html>PRIVATE-STUDENT-CONTENT</html>';
    let error: Error | null = null;
    try {
      resolveGradebookImportPersistenceResponseV5({
        status: 502,
        contentType: 'text/html; charset=UTF-8',
        payload: privateBody,
        jsonParsed: false,
      });
    } catch (cause) {
      error = cause instanceof Error ? cause : new Error(String(cause));
    }

    expect(error?.message).toBe(
      'Resposta de persistência incompatível (HTTP 502; conteúdo non-json; envelope non-json).',
    );
    expect(error?.message).not.toContain(privateBody);
  });

  it('classifies a valid V4 academic envelope as wrong transport', () => {
    expect(() =>
      resolveGradebookImportPersistenceResponseV5({
        status: 200,
        contentType: 'application/json',
        payload: { transportVersion: 4, state: 'no-changes', summary: emptySummary },
        jsonParsed: true,
      }),
    ).toThrow(
      'Resposta de persistência incompatível (HTTP 200; conteúdo json; envelope wrong-transport).',
    );
  });

  it('classifies an unknown V5 state without exposing the payload', () => {
    expect(() =>
      resolveGradebookImportPersistenceResponseV5({
        status: 200,
        contentType: 'application/problem+json',
        payload: { transportVersion: 5, state: 'mystery-state', detail: 'PRIVATE' },
        jsonParsed: true,
      }),
    ).toThrow(
      'Resposta de persistência incompatível (HTTP 200; conteúdo json; envelope unknown-state).',
    );
  });

  it('classifies a structurally invalid known V5 envelope', () => {
    expect(() =>
      resolveGradebookImportPersistenceResponseV5({
        status: 200,
        contentType: 'application/json',
        payload: { transportVersion: 5, state: 'applied' },
        jsonParsed: true,
      }),
    ).toThrow(
      'Resposta de persistência incompatível (HTTP 200; conteúdo json; envelope invalid-v5-envelope).',
    );
  });
});
