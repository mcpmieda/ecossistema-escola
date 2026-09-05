import { describe, expect, it } from 'vitest';
import { gradebookImportStagingInitializationFailureMessageV1 } from '../../../src/features/gradebook/import/import-staging-client-v1';

describe('staging initialize client diagnostics', () => {
  it('accepts only the ready schema 6 response', () => {
    expect(
      gradebookImportStagingInitializationFailureMessageV1(200, {
        state: 'ready',
        schemaVersion: 6,
      }),
    ).toBeNull();
  });

  it('distinguishes the production gate from storage and migration failures', () => {
    expect(
      gradebookImportStagingInitializationFailureMessageV1(409, {
        state: 'runtime-review-required',
        reason: 'production-gate-disabled',
      }),
    ).toContain('trava de produção');
    expect(
      gradebookImportStagingInitializationFailureMessageV1(503, {
        state: 'unavailable',
        reason: 'storage-missing',
      }),
    ).toContain('binding do D1');
    expect(
      gradebookImportStagingInitializationFailureMessageV1(503, {
        state: 'unavailable',
        reason: 'migration-apply-failed',
      }),
    ).toContain('migration de staging');
  });

  it('renders sanitized schema and baseline review information', () => {
    expect(
      gradebookImportStagingInitializationFailureMessageV1(409, {
        state: 'schema-review-required',
        schema: { currentVersion: 5, latestVersion: 6, pendingCount: 1 },
      }),
    ).toContain('atual: 5; esperado: 6; pendências: 1');

    const baseline = gradebookImportStagingInitializationFailureMessageV1(409, {
      state: 'baseline-review-required',
      schemaVersion: 6,
      counts: {
        logicalSources: 1,
        sourceFiles: 2,
        importBatches: 1,
        students: 10,
        enrollments: 10,
        assessmentComponents: 4,
        gradeEntries: 20,
        termResults: 10,
        finalRecoveries: 0,
        annualResults: 3,
        associations: 20,
      },
    });
    expect(baseline).toContain('Contagens sanitizadas');
    expect(baseline).toContain('notas: 20');
  });

  it('keeps authorization, invalid requests and unknown states explicit', () => {
    expect(
      gradebookImportStagingInitializationFailureMessageV1(403, { state: 'not-authorized' }),
    ).toContain('não está autorizada');
    expect(
      gradebookImportStagingInitializationFailureMessageV1(400, { state: 'invalid-request' }),
    ).toContain('solicitação interna');
    expect(
      gradebookImportStagingInitializationFailureMessageV1(503, {
        state: 'unavailable',
        reason: 'future-safe-reason',
      }),
    ).toContain('motivo não classificado');
  });
});
