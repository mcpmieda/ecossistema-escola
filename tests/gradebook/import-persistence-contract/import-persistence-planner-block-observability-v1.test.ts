import { describe, expect, it } from 'vitest';
import { classifyGradebookImportPersistenceBlockedPlanV1 } from '../../../server/gradebook/application/import/import-persistence-service-v2';

describe('Import persistence planner block observability', () => {
  it('keeps a semantic definition block classified as blocked-definition', () => {
    expect(
      classifyGradebookImportPersistenceBlockedPlanV1({
        blockedDefinitions: 1,
        blockedComponents: 1,
        blockedAcademicRecords: 0,
      }),
    ).toEqual([{ code: 'blocked-definition', scope: 'file' }]);
  });

  it('classifies an operational component block as planning-failed', () => {
    expect(
      classifyGradebookImportPersistenceBlockedPlanV1({
        blockedDefinitions: 0,
        blockedComponents: 1,
        blockedAcademicRecords: 0,
      }),
    ).toEqual([{ code: 'planning-failed', scope: 'file' }]);
  });

  it('classifies an academic-record planner block as planning-failed', () => {
    expect(
      classifyGradebookImportPersistenceBlockedPlanV1({
        blockedDefinitions: 0,
        blockedComponents: 0,
        blockedAcademicRecords: 1,
      }),
    ).toEqual([{ code: 'planning-failed', scope: 'file' }]);
  });

  it('preserves both sanitized codes when semantic and operational blocks coexist', () => {
    expect(
      classifyGradebookImportPersistenceBlockedPlanV1({
        blockedDefinitions: 1,
        blockedComponents: 2,
        blockedAcademicRecords: 1,
      }),
    ).toEqual([
      { code: 'blocked-definition', scope: 'file' },
      { code: 'planning-failed', scope: 'file' },
    ]);
  });

  it('rejects impossible use without a blocked cause', () => {
    expect(() =>
      classifyGradebookImportPersistenceBlockedPlanV1({
        blockedDefinitions: 0,
        blockedComponents: 0,
        blockedAcademicRecords: 0,
      }),
    ).toThrow('blocked-plan-without-cause');
  });
});
