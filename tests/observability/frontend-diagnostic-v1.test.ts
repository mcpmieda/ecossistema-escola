import { describe, expect, it } from 'vitest';

import {
  FRONTEND_DIAGNOSTIC_ADMIN_CAPABILITY_V1,
  FRONTEND_DIAGNOSTIC_BODY_BYTES_V1,
  FRONTEND_DIAGNOSTIC_DEDUPE_WINDOW_MS_V1,
  FRONTEND_DIAGNOSTIC_RATE_LIMIT_V1,
  FRONTEND_DIAGNOSTIC_ROUTE_V1,
  inspectFrontendDiagnosticSubmissionV1,
  parseFrontendDiagnosticSubmissionV1,
} from '../../shared/frontend-diagnostic-v1';

const valid = {
  version: 1,
  area: 'gradebook',
  category: 'read',
  release: '2026.09.20-136979be',
  correlationId: '11111111-1111-4111-8111-111111111111',
} as const;

describe('frontend diagnostic contract V1', () => {
  it('fixes one shared route and conservative receiver bounds', () => {
    expect(FRONTEND_DIAGNOSTIC_ROUTE_V1).toBe('/api/observability/frontend-diagnostic');
    expect(FRONTEND_DIAGNOSTIC_ADMIN_CAPABILITY_V1).toBe('platform.snapshot.read');
    expect(FRONTEND_DIAGNOSTIC_RATE_LIMIT_V1).toEqual({ windowMs: 60_000, maxReports: 6 });
    expect(FRONTEND_DIAGNOSTIC_DEDUPE_WINDOW_MS_V1).toBe(300_000);
  });

  it('accepts only the bounded metadata contract', () => {
    expect(inspectFrontendDiagnosticSubmissionV1(valid)).toBe(true);
    expect(parseFrontendDiagnosticSubmissionV1(JSON.stringify(valid))).toEqual(valid);
  });

  it.each([
    ['studentName', 'ALUNO SINTETICO'],
    ['studentId', '123'],
    ['className', 'TURMA SINTETICA'],
    ['grade', 10000],
    ['birthDate', '2000-01-01'],
    ['token', 'SYNTHETIC_SECRET_MARKER'],
    ['url', 'https://example.invalid/private?q=sensitive'],
    ['stack', 'Error: SYNTHETIC_STACK_MARKER'],
    ['message', 'SYNTHETIC_RAW_ERROR_MARKER'],
    ['requestBody', { private: 'SYNTHETIC_BODY_MARKER' }],
    ['formDraft', 'SYNTHETIC_DRAFT_MARKER'],
    ['recordedAt', '2026-09-20T00:00:00.000Z'],
  ])('rejects forbidden or server-owned field %s', (field, value) => {
    expect(
      parseFrontendDiagnosticSubmissionV1(
        JSON.stringify({ ...valid, [field]: value }),
      ),
    ).toBeNull();
  });

  it('rejects arbitrary release text, non-opaque correlation and unknown enums', () => {
    expect(parseFrontendDiagnosticSubmissionV1(JSON.stringify({
      ...valid,
      release: 'https://example.invalid/release',
    }))).toBeNull();
    expect(parseFrontendDiagnosticSubmissionV1(JSON.stringify({
      ...valid,
      correlationId: 'student-123',
    }))).toBeNull();
    expect(parseFrontendDiagnosticSubmissionV1(JSON.stringify({
      ...valid,
      category: 'raw-error',
    }))).toBeNull();
    expect(parseFrontendDiagnosticSubmissionV1(JSON.stringify({
      ...valid,
      area: 'student-123',
    }))).toBeNull();
  });

  it('fails closed for malformed and oversized bodies without echoing content', () => {
    expect(parseFrontendDiagnosticSubmissionV1(null)).toBeNull();
    expect(parseFrontendDiagnosticSubmissionV1('')).toBeNull();
    expect(parseFrontendDiagnosticSubmissionV1('{invalid-json')).toBeNull();

    const oversized = JSON.stringify({
      ...valid,
      release: 'a'.repeat(FRONTEND_DIAGNOSTIC_BODY_BYTES_V1),
    });
    expect(oversized.length).toBeGreaterThan(FRONTEND_DIAGNOSTIC_BODY_BYTES_V1);
    expect(parseFrontendDiagnosticSubmissionV1(oversized)).toBeNull();
  });
});
