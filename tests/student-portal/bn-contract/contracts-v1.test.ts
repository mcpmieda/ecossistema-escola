import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  academicRevisionSchemaV1,
  academicRevisionEventSchemaV1,
  academicVersionSchemaV1,
  portalAcademicLinkSchemaV1,
} from '../../../shared/gradebook-contracts/student-portal/academic-revision-v1';
import {
  resolveEligibilityV1,
  eligibilitySchemaV1,
} from '../../../shared/gradebook-contracts/student-portal/eligibility-v1';
import {
  academicMarkSchemaV1,
  academicStudentSchemaV1,
} from '../../../shared/gradebook-contracts/student-portal/academic-student-reader-v1';
import {
  yearResetPreviewIsCurrentV1,
  yearResetPreviewProofSchemaV1,
  portalResetGuardResultSchemaV1,
} from '../../../shared/gradebook-contracts/student-portal/year-reset-portal-guard-v1';
import {
  yearResetRequestSchemaV1,
  yearResetResponseSchemaV1,
  yearResetCountsSchemaV1,
} from '../../../shared/gradebook-contracts/settings/year-reset-contract-v1';
import { requestYearResetV1 } from '../../../src/features/gradebook/settings/year-reset-client-v1';
import { selfResponseV1 } from '../../../shared/student-portal-contracts/self-v1';
import { resolveSimplifiedAnnualOutcomeV1 } from '../../../src/gradebook-domain/calculations/simplified/resolve-simplified-annual-outcome-v1';
import type { SimplifiedComponentRecoveryOutcomeV1 } from '../../../src/gradebook-domain/calculations/simplified/resolve-simplified-academic-engine-v1';
import { compareSourceSubjectPresentationV1 } from '../../../shared/gradebook-contracts/source/subject-abbreviations-v1';

const version = `${'a'.repeat(32)}:1`;
const next = `${'a'.repeat(32)}:2`;
const id = '11111111-1111-4111-8111-111111111111';
const link = { academicYear: 2026, studentId: 900001 } as const;
const binding = { ...link, classId: 900002, status: null };
const score = { kind: 'score', valueMilli: 0, maximumMilli: null, meetsMinimum: null } as const;
const student = {
  contractVersion: 1,
  link,
  dataVersion: version,
  profile: {
    name: 'Pessoa Sintética',
    classId: 900002,
    classLabel: 'Turma Sintética',
    academicState: 'regular',
    result: 'in-progress',
  },
  subjects: [
    {
      subjectId: 900003,
      label: 'PORTUGUES',
      order: 0,
      periods: [{ period: 'T1', final: score }],
      officialAnnual: { kind: 'absent' },
    },
  ],
};
const state = { academicRevision: version, resetRevision: version, portalLinkRevision: version };
const proof = {
  contractVersion: 1 as const,
  operation: 'execute' as const,
  year: 2026,
  actorDigest: 'b'.repeat(64),
  tokenDigest: 'c'.repeat(64),
  issuedAt: '2026-09-12T12:00:00Z',
  expiresAt: '2026-09-12T12:05:00Z',
  state,
  consumed: false,
};
const context = {
  year: 2026,
  actorDigest: proof.actorDigest,
  now: new Date('2026-09-12T12:01:00Z'),
  state,
};

describe('BN identity and movement contract', () => {
  it.each([null, 1, 2, 7] as const)('keeps status %s eligible', (status) => {
    expect(resolveEligibilityV1(link, version, [{ ...binding, status }]).state).toBe('eligible');
  });
  it.each([3, 4, 5] as const)(
    'revokes eligibility on exit %s and recognizes return on same ID',
    (status) => {
      expect(resolveEligibilityV1(link, version, [{ ...binding, status }]).state).toBe('exit');
      expect(resolveEligibilityV1(link, next, [binding]).state).toBe('eligible');
    },
  );
  it('moves to status 7 without selecting the historical status 6', () => {
    const result = resolveEligibilityV1(link, next, [
      { ...binding, status: 6 },
      { ...binding, classId: 900004, status: 7 },
    ]);
    expect(result.current?.classId).toBe(900004);
    expect(result.link).toEqual(link);
    expect(result.dataVersion).toBe(next);
  });
  it('fails closed for absent, only historical, duplicate and foreign identity bindings', () => {
    for (const rows of [
      [],
      [{ ...binding, status: 6 as const }],
      [binding, { ...binding, classId: 900004 }],
      [{ ...binding, studentId: 900099 }],
    ])
      expect(resolveEligibilityV1(link, version, rows)).toMatchObject({
        current: null,
        state: 'unresolved',
      });
  });
  it.each([2025, 2027, 0, NaN])('rejects Portal year %s', (academicYear) => {
    expect(portalAcademicLinkSchemaV1.safeParse({ ...link, academicYear }).success).toBe(false);
  });
  it('rejects fabricated status 0 and inconsistent eligibility envelopes', () => {
    expect(() =>
      resolveEligibilityV1(link, version, [{ ...binding, status: 0 as never }]),
    ).toThrow();
    expect(
      eligibilitySchemaV1.safeParse({
        contractVersion: 1,
        link,
        dataVersion: version,
        current: { ...binding, status: 3 },
        state: 'eligible',
      }).success,
    ).toBe(false);
  });
});

describe('durable revision and preview boundaries', () => {
  it.each([
    '2026-09-12T12:00:00Z',
    '1',
    `${'a'.repeat(32)}:0`,
    `${'a'.repeat(32)}:01`,
    `${'a'.repeat(32)}:1.2`,
  ])('rejects noncanonical revision %s', (dataVersion) => {
    expect(academicVersionSchemaV1.safeParse(dataVersion).success).toBe(false);
  });
  it('carries a durable year-wide event without an incomplete student list', () => {
    const revision = { contractVersion: 1, academicYear: 2026, dataVersion: version };
    expect(academicRevisionSchemaV1.parse(revision)).toEqual(revision);
    const event = { ...revision, eventId: id, cause: 'marks', scope: 'academic-year' };
    expect(academicRevisionEventSchemaV1.safeParse(event).success).toBe(true);
    expect(
      academicRevisionEventSchemaV1.safeParse({ ...event, studentIds: [900001] }).success,
    ).toBe(false);
  });
  it('accepts a current persisted proof', () =>
    expect(yearResetPreviewIsCurrentV1(proof, context)).toBe(true));
  it.each(['academicRevision', 'resetRevision', 'portalLinkRevision'] as const)(
    'invalidates same-count changes in %s',
    (key) => {
      // No count is part of this decision: note edit, snapshot replacement, and link ABA each invalidate.
      expect(
        yearResetPreviewIsCurrentV1(proof, { ...context, state: { ...state, [key]: next } }),
      ).toBe(false);
    },
  );
  it('rejects a reset/reimport generation even when the counter is the same', () => {
    expect(
      yearResetPreviewIsCurrentV1(proof, {
        ...context,
        state: { ...state, academicRevision: `${'d'.repeat(32)}:1` },
      }),
    ).toBe(false);
  });
  it.each(['2026-09-12T11:59:59Z', '2026-09-12T12:05:00Z', 'invalid'])(
    'rejects time outside the window %s',
    (now) => {
      expect(yearResetPreviewIsCurrentV1(proof, { ...context, now: new Date(now) })).toBe(false);
    },
  );
  it('binds year, actor, operation and one-time consumption', () => {
    expect(yearResetPreviewIsCurrentV1(proof, { ...context, year: 2027 })).toBe(false);
    expect(yearResetPreviewIsCurrentV1(proof, { ...context, actorDigest: 'd'.repeat(64) })).toBe(
      false,
    );
    expect(yearResetPreviewIsCurrentV1({ ...proof, consumed: true }, context)).toBe(false);
    expect(
      yearResetPreviewProofSchemaV1.safeParse({ ...proof, operation: 'preview' }).success,
    ).toBe(false);
    expect(
      yearResetPreviewProofSchemaV1.safeParse({ ...proof, expiresAt: '2026-09-12T12:05:01Z' })
        .success,
    ).toBe(false);
  });
});

describe('official academic values and PA compatibility', () => {
  it('preserves academic zero and an unknown maximum separately from absence', () => {
    expect(academicMarkSchemaV1.parse(score)).toEqual(score);
    expect(academicMarkSchemaV1.parse({ kind: 'absent' })).not.toEqual(score);
    expect(academicMarkSchemaV1.safeParse({ ...score, maximumMilli: 0 }).success).toBe(false);
    expect(academicMarkSchemaV1.safeParse({ ...score, valueMilli: 0.1 }).success).toBe(false);
  });
  it.each(['nc', 'rr', 'recovery-pending'])('accepts %s only in REC periods', (kind) => {
    const subject = { ...student.subjects[0], periods: [{ period: 'REC1', final: { kind } }] };
    expect(academicStudentSchemaV1.safeParse({ ...student, subjects: [subject] }).success).toBe(
      true,
    );
    expect(
      academicStudentSchemaV1.safeParse({
        ...student,
        subjects: [{ ...subject, periods: [{ period: 'T1', final: { kind } }] }],
      }).success,
    ).toBe(false);
  });
  it('maps an explicit allowlist into the PA #702 self contract', () => {
    const facts = academicStudentSchemaV1.parse(student);
    const result = selfResponseV1.parse({
      contractVersion: 1,
      requestId: id,
      state: 'ready',
      profile: {
        accountId: id,
        link: facts.link,
        name: facts.profile.name,
        classLabel: facts.profile.classLabel,
        academicState: facts.profile.academicState,
        result: facts.profile.result,
      },
      revisions: { dataVersion: facts.dataVersion, policyVersion: '1', publicationVersion: '1' },
      generatedAt: proof.issuedAt,
      subjects: facts.subjects.map((s) => ({
        subjectId: s.subjectId,
        label: s.label,
        order: s.order,
        periods: s.periods.map((p) => ({
          period: p.period,
          final:
            p.final.kind === 'score'
              ? {
                  kind: 'score',
                  value: p.final.valueMilli / 1000,
                  maximum: p.final.maximumMilli === null ? null : p.final.maximumMilli / 1000,
                  meetsMinimum: p.final.meetsMinimum,
                }
              : p.final,
        })),
      })),
    });
    expect(result.subjects[0]?.periods[0]?.final).toEqual({
      kind: 'score',
      value: 0,
      maximum: null,
      meetsMinimum: null,
    });
    expect(JSON.stringify(result)).not.toContain('officialAnnual');
  });
  it.each(['teacher', 'formula', 'sourceFile', 'calculatedAmMilli', 'otherStudents'])(
    'rejects forbidden %s fields rather than silently spreading them',
    (field) => {
      expect(academicStudentSchemaV1.safeParse({ ...student, [field]: 'synthetic' }).success).toBe(
        false,
      );
      expect(
        academicStudentSchemaV1.safeParse({
          ...student,
          subjects: [{ ...student.subjects[0], [field]: 'synthetic' }],
        }).success,
      ).toBe(false);
    },
  );
  it('uses institutional subject order, not alphabetical order', () => {
    expect(['MATEMATICA', 'ARTE', 'PORTUGUES'].sort(compareSourceSubjectPresentationV1)).toEqual([
      'PORTUGUES',
      'MATEMATICA',
      'ARTE',
    ]);
    expect(
      academicStudentSchemaV1.safeParse({
        ...student,
        subjects: [{ ...student.subjects[0], order: 1 }],
      }).success,
    ).toBe(false);
  });
  it('agrees with the official core on ESPECIAL and ASSISTIDO precedence', () => {
    expect(
      resolveSimplifiedAnnualOutcomeV1({ status: 1, components: [], maxCouncilComponents: 2 })
        .visibleResult,
    ).toBe('APROVADO');
    expect(
      resolveSimplifiedAnnualOutcomeV1({ status: 2, components: [], maxCouncilComponents: 2 })
        .visibleResult,
    ).toBeNull();
    expect(
      academicStudentSchemaV1.safeParse({
        ...student,
        profile: { ...student.profile, academicState: 'assisted', result: 'approved' },
      }).success,
    ).toBe(false);
    expect(
      academicStudentSchemaV1.safeParse({
        ...student,
        profile: { ...student.profile, academicState: 'assisted', result: 'not-applicable' },
      }).success,
    ).toBe(true);
  });
  it.each([
    ['failed-repeat', 'REPROVADO', 'not-eligible'],
    ['failed-no-show', 'REPROVADO POR NÃO COMPARECIMENTO', 'not-eligible'],
    ['approved-direct', 'APROVADO DIRETO', 'not-applicable'],
    ['recovery-pending', 'EM RECUPERAÇÃO', 'not-applicable'],
  ] as const)('keeps the official annual authority for %s', (classification, result, council) => {
    const component: SimplifiedComponentRecoveryOutcomeV1 = {
      originalTotalMilli: 0,
      originalComplete: true,
      recoveryRequired: true,
      recoveryTerms: {
        1: { term: 1, applicable: true, source: null, replacementMilli: null },
        2: { term: 2, applicable: true, source: null, replacementMilli: null },
        3: { term: 3, applicable: true, source: null, replacementMilli: null },
      },
      postRecoveryTotalMilli: null,
      classification,
      warnings: [],
    };
    expect(
      resolveSimplifiedAnnualOutcomeV1({
        status: 7,
        components: [component],
        maxCouncilComponents: 2,
      }),
    ).toMatchObject({ visibleResult: result, councilEligibility: council });
  });
});

describe('reset wire compatibility', () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    'invalid-request',
    'not-authorized',
    'not-found',
    'preview-changed',
    'unavailable',
    'portal-linked-accounts',
  ])('preserves failure %s', (state) => {
    expect(yearResetResponseSchemaV1.safeParse({ contractVersion: 1, state }).success).toBe(true);
  });
  it('preserves old preview and execute envelopes', () => {
    const counts = Object.fromEntries(
      Object.keys(yearResetCountsSchemaV1.shape).map((key) => [key, 0]),
    );
    expect(
      yearResetResponseSchemaV1.safeParse({
        contractVersion: 1,
        state: 'ready',
        operation: 'preview',
        year: 2026,
        counts,
        previewRevision: 'a'.repeat(64),
        confirmationPhrase: 'RESETAR 2026',
      }).success,
    ).toBe(true);
    expect(
      yearResetResponseSchemaV1.safeParse({
        contractVersion: 1,
        state: 'ready',
        operation: 'execute',
        year: 2026,
        deletedRows: 0,
      }).success,
    ).toBe(true);
    expect(
      yearResetRequestSchemaV1.safeParse({
        contractVersion: 1,
        operation: 'execute',
        year: 2026,
        previewRevision: 'a'.repeat(64),
        confirmationPhrase: 'RESETAR 2026',
        understandsIrreversible: true,
      }).success,
    ).toBe(true);
  });
  it('existing browser client accepts the new refusal without granting success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ contractVersion: 1, state: 'portal-linked-accounts' }), {
            status: 409,
          }),
      ),
    );
    expect(
      await requestYearResetV1({ contractVersion: 1, operation: 'preview', year: 2026 }),
    ).toEqual({ contractVersion: 1, state: 'portal-linked-accounts' });
  });
  it('guard exposes no list or account-state filter, including blocked/inactive links', () => {
    const guard = { year: 2026, state: 'portal-linked-accounts', portalLinkRevision: version };
    expect(portalResetGuardResultSchemaV1.safeParse(guard).success).toBe(true);
    for (const field of ['accounts', 'students', 'blocked', 'activeOnly'])
      expect(portalResetGuardResultSchemaV1.safeParse({ ...guard, [field]: [] }).success).toBe(
        false,
      );
    expect(
      yearResetResponseSchemaV1.safeParse({
        contractVersion: 1,
        state: 'portal-linked-accounts',
        students: [],
      }).success,
    ).toBe(false);
  });
});
