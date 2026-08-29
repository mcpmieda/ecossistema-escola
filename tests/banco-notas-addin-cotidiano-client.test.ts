// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import type { AddinContextResponse } from '../shared/banco-notas-addin-context';
import {
  AddinContextApiError,
  AddinWorkbookError,
  compareWorkbookValues,
  fetchAddinContext,
  parseWorkbookMetadata,
} from '../addin/banco-notas/workbook';

const workbookModelId = '11111111-1111-4111-8111-111111111111';
const relationshipSnapshotId = '22222222-2222-4222-8222-222222222222';
const sourceHash = 'a'.repeat(64);

function metadataRows() {
  return [
    ['Banco de Notas metadata'],
    ['schemaVersion', 1],
    ['modelId', workbookModelId],
    ['schoolYear', 2026],
    ['definitionVersion', 'definition-v1'],
    ['layoutVersion', 'layout-v1'],
    ['mappingVersion', 3],
    ['presentationVersion', 'presentation-v1'],
    ['sourceHash', sourceHash],
    ['relationshipSnapshotId', relationshipSnapshotId],
    [],
    ['sheetKey', 'sheetName', 'cellAddress', 'gradeKey', 'field', 'studentPosition'],
    ['sheet-matematica', '2º Ano A — Matemática', 'F12', 'grade-key', 'NotaT1', 1],
  ];
}

function context(): AddinContextResponse {
  return {
    schemaVersion: 1,
    teacher: { label: 'Professor Sintético' },
    schoolYear: { label: 'Ano 2026' },
    assignment: { classGroupLabel: '2º Ano A', componentLabel: 'Matemática' },
    model: { version: 2, mappingVersion: 3, state: 'connected' },
    syncEnabled: false,
    lastActivityAt: null,
    preflight: {
      status: 'warning',
      checks: {
        structureValid: true,
        modelRecognized: true,
        teacherAuthorized: true,
        workbookCompatible: true,
      },
      reasons: ['sync_disabled_by_administration'],
    },
    pending: [
      {
        severity: 'info',
        code: 'sync_disabled_by_administration',
        message: 'Sincronização indisponível pela administração enquanto o piloto não está ativo.',
      },
    ],
    mappings: [
      {
        cellAddress: 'F12',
        field: 'NotaT1',
        studentLabel: 'Estudante Sintético 01',
        known: true,
        knownValue: 0,
        knownAbsent: false,
      },
      {
        cellAddress: 'G12',
        field: 'NotaT2',
        studentLabel: 'Estudante Sintético 01',
        known: true,
        knownValue: null,
        knownAbsent: true,
      },
      {
        cellAddress: 'H12',
        field: 'NotaT3',
        studentLabel: 'Estudante Sintético 01',
        known: false,
        knownValue: null,
        knownAbsent: false,
      },
    ],
  };
}

describe('Banco de Notas add-in cotidiano workbook client', () => {
  it('reads only the governed metadata for the active sheet', () => {
    expect(parseWorkbookMetadata(metadataRows(), '2º Ano A — Matemática')).toEqual({
      activeSheetName: '2º Ano A — Matemática',
      query: {
        workbookModelId,
        sourceHash,
        relationshipSnapshotId,
        definitionVersion: 'definition-v1',
        layoutVersion: 'layout-v1',
        mappingVersion: 3,
        schoolYear: 2026,
        sheetKey: 'sheet-matematica',
      },
    });
  });

  it('fails closed for an unknown worksheet or malformed metadata', () => {
    expect(() => parseWorkbookMetadata(metadataRows(), 'Guia desconhecida')).toThrow(
      AddinWorkbookError,
    );
    const malformed = metadataRows();
    malformed[2] = ['modelId', 'not-a-uuid'];
    expect(() => parseWorkbookMetadata(malformed, '2º Ano A — Matemática')).toThrow(
      'workbook_metadata_invalid',
    );
  });

  it('keeps zero distinct from absence and ignores fields without a known baseline', () => {
    const unchanged = compareWorkbookValues(
      context().mappings,
      new Map<string, unknown>([
        ['F12', 0],
        ['G12', ''],
        ['H12', 9],
      ]),
    );
    expect(unchanged).toMatchObject({
      changedFields: 0,
      affectedStudents: 0,
      unknownBaselineFields: 1,
    });

    const changed = compareWorkbookValues(
      context().mappings,
      new Map<string, unknown>([
        ['F12', ''],
        ['G12', 0],
      ]),
    );
    expect(changed.changedFields).toBe(2);
    expect(changed.affectedStudents).toBe(1);
    expect(changed.changes).toEqual([
      expect.objectContaining({ before: 0, beforeAbsent: false, after: null, afterAbsent: true }),
      expect.objectContaining({ before: null, beforeAbsent: true, after: 0, afterAbsent: false }),
    ]);
  });

  it('requests context read-only and keeps the delegated token only in the header', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(context()));
    const result = await fetchAddinContext({
      accessToken: 'memory-only-token',
      query: parseWorkbookMetadata(metadataRows(), '2º Ano A — Matemática').query,
      origin: 'https://admin.escolaieda.com',
      fetcher,
    });
    expect(result.teacher.label).toBe('Professor Sintético');
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain('/api/banco-notas/v1/addin/context?');
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer memory-only-token');
    expect(String(url)).not.toContain('memory-only-token');
    expect(init?.body).toBeUndefined();
  });

  it('classifies ownership, missing model and network failures without exposing the token', async () => {
    for (const [status, code] of [
      [403, 'teacher_model_not_owned'],
      [404, 'addin_workbook_not_recognized'],
    ] as const) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ error: code }, { status }));
      await expect(
        fetchAddinContext({
          accessToken: 'sensitive-token',
          query: parseWorkbookMetadata(metadataRows(), '2º Ano A — Matemática').query,
          origin: 'https://admin.escolaieda.com',
          fetcher,
        }),
      ).rejects.toMatchObject({ status, code });
    }
    await expect(
      fetchAddinContext({
        accessToken: 'sensitive-token',
        query: parseWorkbookMetadata(metadataRows(), '2º Ano A — Matemática').query,
        origin: 'https://admin.escolaieda.com',
        fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
      }),
    ).rejects.toEqual(new AddinContextApiError(0, 'network_unavailable'));
  });
});
