import { describe, expect, it } from 'vitest';
import {
  isAcademicYearManagementRequestV1,
  isAcademicYearManagementResponseV1,
} from '../../../../shared/gradebook-contracts/operational-workspace/academic-year-management-v1';

describe('academic-year-management-v1', () => {
  it('accepts bounded list/create requests without client-owned identity', () => {
    expect(isAcademicYearManagementRequestV1({ managementVersion: 1, operation: 'list' })).toBe(
      true,
    );
    expect(
      isAcademicYearManagementRequestV1({
        managementVersion: 1,
        operation: 'create',
        year: 2026,
      }),
    ).toBe(true);
    expect(
      isAcademicYearManagementRequestV1({
        managementVersion: 1,
        operation: 'create',
        year: 2026,
        academicYearId: 'browser-owned',
      }),
    ).toBe(false);
  });

  it('validates the server-owned academic-year projection', () => {
    expect(
      isAcademicYearManagementResponseV1({
        managementVersion: 1,
        state: 'created',
        item: { id: 'academic-year:synthetic', year: 2026, status: 'active' },
      }),
    ).toBe(true);
  });
});
