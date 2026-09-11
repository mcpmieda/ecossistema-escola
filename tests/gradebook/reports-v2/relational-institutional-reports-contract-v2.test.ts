import { describe, expect, it } from 'vitest';
import {
  RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2,
  relationalInstitutionalReportRequestSchemaV2,
  relationalInstitutionalReportResponseMatchesV2,
  relationalInstitutionalReportResponseSchemaV2,
} from '../../../shared/gradebook-contracts/reports/relational-institutional-reports-v2';

describe('relational institutional reports V2 contract', () => {
  it('accepts valid academic years and rejects cross-year or non-previous term comparisons', () => {
    const base = {
      contractVersion: RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2,
      operation: 'performance',
      family: 'class-results',
      year: 2026,
      classId: 1,
      period: 3,
      lens: 'result',
      referenceTerm: 2,
      statuses: [null, 1, 2, 3, 4, 5, 7],
    } as const;
    expect(relationalInstitutionalReportRequestSchemaV2.safeParse(base).success).toBe(true);
    expect(relationalInstitutionalReportRequestSchemaV2.safeParse({ ...base, year: 2025 }).success).toBe(true);
    expect(relationalInstitutionalReportRequestSchemaV2.safeParse({ ...base, year: 1999 }).success).toBe(false);
    expect(relationalInstitutionalReportRequestSchemaV2.safeParse({ ...base, referenceTerm: 3 }).success).toBe(false);
    expect(relationalInstitutionalReportRequestSchemaV2.safeParse({ ...base, period: 'annual', referenceTerm: 1 }).success).toBe(false);
    expect(relationalInstitutionalReportRequestSchemaV2.safeParse({ ...base, statuses: [1, 1] }).success).toBe(false);
  });

  it('keeps report families semantically narrow', () => {
    const request = (family: string, lens: string) => ({
      contractVersion: 2,
      operation: 'performance',
      family,
      year: 2026,
      classId: 1,
      period: 1,
      lens,
      referenceTerm: null,
      statuses: [null],
    });
    expect(relationalInstitutionalReportRequestSchemaV2.safeParse(request('class-results', 'result')).success).toBe(true);
    expect(relationalInstitutionalReportRequestSchemaV2.safeParse(request('class-results', 'quantitative')).success).toBe(false);
    expect(relationalInstitutionalReportRequestSchemaV2.safeParse(request('composition', 'qualitative')).success).toBe(true);
    expect(relationalInstitutionalReportRequestSchemaV2.safeParse(request('composition', 'result')).success).toBe(false);
  });

  it('matches catalog responses to the exact operation and year', () => {
    const request = { contractVersion: 2, operation: 'catalog', year: 2026 } as const;
    const response = relationalInstitutionalReportResponseSchemaV2.parse({
      contractVersion: 2,
      operation: 'catalog',
      state: 'ready',
      year: 2026,
      classes: [{ id: 1, code: '6A', name: '6º ANO A' }],
    });
    expect(relationalInstitutionalReportResponseMatchesV2(request, response)).toBe(true);
    expect(relationalInstitutionalReportResponseMatchesV2(
      { contractVersion: 2, operation: 'bulletin-history', year: 2026, classId: 1 },
      response,
    )).toBe(false);
  });
});
