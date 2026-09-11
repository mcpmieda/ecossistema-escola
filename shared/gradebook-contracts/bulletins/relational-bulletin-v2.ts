import { z } from 'zod';

export const RELATIONAL_BULLETIN_CONTRACT_VERSION_V2 = 2 as const;
export const RELATIONAL_BULLETIN_MODEL_VERSION_V2 = 2 as const;
export const RELATIONAL_BULLETIN_YEAR_V2 = 2026 as const;
export const RELATIONAL_BULLETIN_LIMITS_V2 = Object.freeze({
  classes: 100,
  students: 150,
  offers: 40,
  batchStudents: 50,
  historyItems: 100,
});

const positiveInteger = z.number().int().positive();
const nonNegativeInteger = z.number().int().nonnegative();
const nullableMilli = nonNegativeInteger.nullable();
const uniqueStudentIds = z
  .array(positiveInteger)
  .min(1)
  .max(RELATIONAL_BULLETIN_LIMITS_V2.batchStudents)
  .refine((values) => new Set(values).size === values.length, 'duplicate-student-id');
const term = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const period = z.union([
  z.object({ kind: z.literal('term'), term }).strict(),
  z.object({ kind: z.literal('annual') }).strict(),
]);
const detail = z.enum(['summary', 'detailed']);
const presentation = z
  .object({
    locale: z.string().trim().min(1).max(32),
    dateStyle: z.enum(['short', 'long']),
  })
  .strict();

const selection = {
  year: z.literal(RELATIONAL_BULLETIN_YEAR_V2),
  classId: positiveInteger,
  period,
  detail,
  presentation,
} as const;

const singleSelection = z
  .object({
    ...selection,
    studentId: positiveInteger,
  })
  .strict();

export const relationalBulletinRequestSchemaV2 = z.discriminatedUnion('operation', [
  z
    .object({
      contractVersion: z.literal(RELATIONAL_BULLETIN_CONTRACT_VERSION_V2),
      operation: z.literal('catalog'),
      year: z.literal(RELATIONAL_BULLETIN_YEAR_V2),
    })
    .strict(),
  z
    .object({
      contractVersion: z.literal(RELATIONAL_BULLETIN_CONTRACT_VERSION_V2),
      operation: z.literal('students'),
      year: z.literal(RELATIONAL_BULLETIN_YEAR_V2),
      classId: positiveInteger,
    })
    .strict(),
  z
    .object({
      contractVersion: z.literal(RELATIONAL_BULLETIN_CONTRACT_VERSION_V2),
      operation: z.literal('preview'),
      selection: singleSelection,
    })
    .strict(),
  z
    .object({
      contractVersion: z.literal(RELATIONAL_BULLETIN_CONTRACT_VERSION_V2),
      operation: z.literal('emit'),
      selection: singleSelection,
    })
    .strict(),
  z
    .object({
      contractVersion: z.literal(RELATIONAL_BULLETIN_CONTRACT_VERSION_V2),
      operation: z.literal('emit-batch'),
      selection: z
        .object({
          ...selection,
          studentIds: uniqueStudentIds,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      contractVersion: z.literal(RELATIONAL_BULLETIN_CONTRACT_VERSION_V2),
      operation: z.literal('history'),
      year: z.literal(RELATIONAL_BULLETIN_YEAR_V2),
      classId: positiveInteger,
      studentIds: uniqueStudentIds.optional(),
    })
    .strict(),
  z
    .object({
      contractVersion: z.literal(RELATIONAL_BULLETIN_CONTRACT_VERSION_V2),
      operation: z.literal('reprint'),
      snapshotId: z.string().uuid(),
      snapshotVersion: positiveInteger,
    })
    .strict(),
]);

export type RelationalBulletinRequestV2 = z.infer<typeof relationalBulletinRequestSchemaV2>;
export type RelationalBulletinSelectionV2 = z.infer<typeof singleSelection>;
export type RelationalBulletinPeriodV2 = z.infer<typeof period>;
export type RelationalBulletinDetailV2 = z.infer<typeof detail>;

const coverage = z
  .object({
    complete: z.boolean(),
    requiredSlots: z.array(positiveInteger),
    resolvedSlots: z.array(positiveInteger),
    missingSlots: z.array(positiveInteger),
    reasons: z.array(z.string()),
  })
  .strict();

const instrument = z
  .object({
    id: positiveInteger,
    term,
    slot: positiveInteger,
    label: z.string().min(1),
    maximumMilli: nullableMilli,
    valueMilli: nullableMilli,
  })
  .strict();

const termResult = z
  .object({
    term,
    maximumMilli: nonNegativeInteger,
    sourceAmMilli: nullableMilli,
    calculatedAmMilli: nullableMilli,
    comparison: z.enum(['match', 'mismatch', 'unavailable']),
    quantitative: z
      .object({
        originalMilli: nonNegativeInteger,
        parallelMilli: nullableMilli,
        parallelApplicable: z.boolean().nullable(),
        consideredMilli: nonNegativeInteger,
      })
      .strict(),
    qualitativeMilli: nonNegativeInteger,
    coverage,
    warningCodes: z.array(z.string()),
    instruments: z.array(instrument),
  })
  .strict();

const recoveryTerm = z
  .object({
    term,
    applicable: z.boolean().nullable(),
    source: z.union([nonNegativeInteger, z.literal('NC')]).nullable(),
    replacementMilli: nullableMilli,
  })
  .strict();

const subject = z
  .object({
    offerId: positiveInteger,
    subject: z
      .object({
        id: positiveInteger,
        label: z.string().min(1),
        abbreviation: z.string().min(1).nullable(),
      })
      .strict(),
    teacher: z.object({ id: positiveInteger, label: z.string().min(1) }).strict(),
    terms: z.array(termResult).min(1).max(3),
    annual: z
      .object({
        originalTotalMilli: nonNegativeInteger,
        sourceUMilli: nullableMilli,
        calculatedPostRecoveryMilli: nullableMilli,
        comparison: z.enum(['match', 'mismatch', 'unavailable']),
        recoveryRequired: z.boolean().nullable(),
        recoveryTerms: z.array(recoveryTerm).length(3),
        classification: z.enum([
          'in-progress',
          'approved-direct',
          'recovery-pending',
          'approved-after-recovery',
          'not-approved',
          'failed-no-show',
        ]),
        warningCodes: z.array(z.string()),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const relationalBulletinModelSchemaV2 = z
  .object({
    contractVersion: z.literal(RELATIONAL_BULLETIN_CONTRACT_VERSION_V2),
    modelVersion: z.literal(RELATIONAL_BULLETIN_MODEL_VERSION_V2),
    year: z.literal(RELATIONAL_BULLETIN_YEAR_V2),
    period,
    detail,
    authority: z
      .object({
        officialValues: z.literal('imported-source'),
        calculatedValues: z.literal('descriptive-comparison'),
        formalDecision: z.literal('human-recorded-only'),
      })
      .strict(),
    readAt: z.string().datetime({ offset: true }),
    classGroup: z
      .object({
        id: positiveInteger,
        code: z.string().min(1),
        name: z.string().min(1),
      })
      .strict(),
    student: z
      .object({
        id: positiveInteger,
        number: positiveInteger,
        name: z.string().min(1),
        statusCode: z.number().int().min(1).max(7).nullable(),
        statusLabel: z.string().min(1),
      })
      .strict(),
    subjects: z.array(subject).max(RELATIONAL_BULLETIN_LIMITS_V2.offers),
    overall: z
      .object({
        calculatedResult: z.string().min(1).nullable(),
        formalCouncilDecision: z.string().min(1).nullable(),
        visibleResult: z.string().min(1).nullable(),
      })
      .strict(),
    emissionReadiness: z
      .object({
        ready: z.boolean(),
        reasons: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

export type RelationalBulletinModelV2 = z.infer<typeof relationalBulletinModelSchemaV2>;

export const relationalBulletinSnapshotSchemaV2 = z
  .object({
    snapshotId: z.string().uuid(),
    snapshotVersion: positiveInteger,
    dataVersion: z.string().min(1),
    emittedAt: z.string().datetime({ offset: true }),
    presentation,
    model: relationalBulletinModelSchemaV2,
  })
  .strict();
export type RelationalBulletinSnapshotV2 = z.infer<typeof relationalBulletinSnapshotSchemaV2>;

const failure = z.enum([
  'invalid-request',
  'not-authorized',
  'not-found',
  'scope-too-large',
  'ambiguous-offers',
  'insufficient-data',
  'version-conflict',
  'unavailable',
]);
export type RelationalBulletinFailureV2 = z.infer<typeof failure>;

const classItem = z
  .object({
    id: positiveInteger,
    code: z.string().min(1),
    name: z.string().min(1),
    label: z.string().min(1),
    studentCount: nonNegativeInteger,
  })
  .strict();
const studentItem = z
  .object({
    id: positiveInteger,
    number: positiveInteger,
    name: z.string().min(1),
    statusCode: z.number().int().min(1).max(7).nullable(),
    statusLabel: z.string().min(1),
  })
  .strict();
const historyItem = z
  .object({
    snapshotId: z.string().uuid(),
    snapshotVersion: positiveInteger,
    dataVersion: z.string().min(1),
    emittedAt: z.string().datetime({ offset: true }),
    classId: positiveInteger,
    className: z.string().min(1),
    studentId: positiveInteger,
    studentName: z.string().min(1),
    period,
    detail,
  })
  .strict();
export type RelationalBulletinHistoryItemV2 = z.infer<typeof historyItem>;

export const relationalBulletinResponseSchemaV2 = z.union([
  z
    .object({
      contractVersion: z.literal(RELATIONAL_BULLETIN_CONTRACT_VERSION_V2),
      operation: z.literal('catalog'),
      state: z.literal('ready'),
      year: z.literal(RELATIONAL_BULLETIN_YEAR_V2),
      classes: z.array(classItem).max(RELATIONAL_BULLETIN_LIMITS_V2.classes),
    })
    .strict(),
  z
    .object({
      contractVersion: z.literal(RELATIONAL_BULLETIN_CONTRACT_VERSION_V2),
      operation: z.literal('students'),
      state: z.literal('ready'),
      classGroup: classItem.omit({ studentCount: true }),
      students: z.array(studentItem).max(RELATIONAL_BULLETIN_LIMITS_V2.students),
    })
    .strict(),
  z
    .object({
      contractVersion: z.literal(RELATIONAL_BULLETIN_CONTRACT_VERSION_V2),
      operation: z.literal('preview'),
      state: z.literal('ready'),
      model: relationalBulletinModelSchemaV2,
    })
    .strict(),
  z
    .object({
      contractVersion: z.literal(RELATIONAL_BULLETIN_CONTRACT_VERSION_V2),
      operation: z.literal('emit'),
      state: z.literal('ready'),
      snapshot: relationalBulletinSnapshotSchemaV2,
    })
    .strict(),
  z
    .object({
      contractVersion: z.literal(RELATIONAL_BULLETIN_CONTRACT_VERSION_V2),
      operation: z.literal('emit-batch'),
      state: z.literal('ready'),
      ready: z.array(
        z
          .object({ studentId: positiveInteger, snapshot: relationalBulletinSnapshotSchemaV2 })
          .strict(),
      ),
      blocked: z.array(
        z.object({ studentId: positiveInteger, reasons: z.array(z.string()).min(1) }).strict(),
      ),
    })
    .strict(),
  z
    .object({
      contractVersion: z.literal(RELATIONAL_BULLETIN_CONTRACT_VERSION_V2),
      operation: z.literal('history'),
      state: z.literal('ready'),
      items: z.array(historyItem).max(RELATIONAL_BULLETIN_LIMITS_V2.historyItems),
    })
    .strict(),
  z
    .object({
      contractVersion: z.literal(RELATIONAL_BULLETIN_CONTRACT_VERSION_V2),
      operation: z.literal('reprint'),
      state: z.literal('ready'),
      source: z.literal('historical-snapshot'),
      snapshot: relationalBulletinSnapshotSchemaV2,
    })
    .strict(),
  z
    .object({
      contractVersion: z.literal(RELATIONAL_BULLETIN_CONTRACT_VERSION_V2),
      operation: z.enum([
        'catalog',
        'students',
        'preview',
        'emit',
        'emit-batch',
        'history',
        'reprint',
      ]),
      state: failure,
      reasons: z.array(z.string()).optional(),
    })
    .strict(),
]);
export type RelationalBulletinResponseV2 = z.infer<typeof relationalBulletinResponseSchemaV2>;

export function relationalBulletinResponseMatchesV2(
  request: RelationalBulletinRequestV2,
  response: RelationalBulletinResponseV2,
): boolean {
  return response.operation === request.operation;
}
