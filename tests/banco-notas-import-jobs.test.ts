import { describe, expect, it } from 'vitest';
import {
  assertImportJobGate,
  assertImportJobTransition,
  InvalidImportJobTransitionError,
} from '../server/banco-notas/import-jobs';
import {
  importJobCreateSchema,
  importJobTransitionSchema,
} from '../shared/banco-notas-import-jobs';

describe('Banco de Notas import job domain', () => {
  it('accepts the complete gated lifecycle', () => {
    const states = [
      'draft',
      'analyzed',
      'generated',
      'validated',
      'ready_to_share',
      'shared',
      'connected',
    ] as const;
    for (let index = 0; index < states.length - 1; index++) {
      expect(() => assertImportJobTransition(states[index]!, states[index + 1]!)).not.toThrow();
    }
  });

  it('blocks skipped gates and transitions out of terminal states', () => {
    expect(() => assertImportJobTransition('draft', 'generated')).toThrow(
      InvalidImportJobTransitionError,
    );
    expect(() => assertImportJobTransition('connected', 'failed')).toThrow(
      InvalidImportJobTransitionError,
    );
    expect(() => assertImportJobTransition('failed', 'draft')).toThrow(
      InvalidImportJobTransitionError,
    );
  });

  it('allows analysis to persist blockers but blocks generation until they are resolved', () => {
    expect(() =>
      assertImportJobGate({ targetState: 'analyzed', unresolvedErrorFindingCount: 1 }),
    ).not.toThrow();
    expect(() =>
      assertImportJobGate({ targetState: 'generated', unresolvedErrorFindingCount: 1 }),
    ).toThrow('import_job_has_unresolved_error_findings');
    expect(() =>
      assertImportJobGate({ targetState: 'generated', unresolvedErrorFindingCount: 0 }),
    ).not.toThrow();
    expect(() =>
      assertImportJobGate({ targetState: 'failed', unresolvedErrorFindingCount: 1 }),
    ).not.toThrow();
  });

  it('requires a source hash, teacher, provenance and an auditable transition reason', () => {
    expect(() =>
      importJobCreateSchema.parse({
        schoolYearId: '11111111-1111-4111-8111-111111111111',
        teacherId: '22222222-2222-4222-8222-222222222222',
        dataSourceId: '33333333-3333-4333-8333-333333333333',
        idempotencyKey: 'synthetic-import-key',
        sourceHash: 'not-a-hash',
        sourceFormat: 'xlsb',
        provenance: {},
      }),
    ).toThrow();
    expect(() =>
      importJobTransitionSchema.parse({ targetState: 'analyzed', reason: 'x', provenance: {} }),
    ).toThrow();
  });

  it('accepts unique finding resolutions and rejects duplicate resolution ids', () => {
    const findingId = '44444444-4444-4444-8444-444444444444';
    expect(
      importJobTransitionSchema.parse({
        targetState: 'generated',
        reason: 'Correspondência revisada',
        resolvedFindingIds: [findingId],
      }).resolvedFindingIds,
    ).toEqual([findingId]);
    expect(() =>
      importJobTransitionSchema.parse({
        targetState: 'generated',
        reason: 'Correspondência revisada',
        resolvedFindingIds: [findingId, findingId],
      }),
    ).toThrow('resolved finding ids must be unique');
  });
});
