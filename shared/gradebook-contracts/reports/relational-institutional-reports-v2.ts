import { z } from 'zod';
import { GRADEBOOK_ACADEMIC_YEAR_MAX_V2, GRADEBOOK_ACADEMIC_YEAR_MIN_V2 } from '../academic-year-v2';
import {
  GRADEBOOK_IMPORT_DIAGNOSTIC_CODES_V1,
  GRADEBOOK_IMPORT_DIAGNOSTIC_SEVERITIES_V1,
} from '../imports/import-diagnostics-v1';
import {
  performanceAnalysisResponseSchemaV3,
} from '../performance/performance-analysis-v3';
import {
  performanceTermComparisonResponseSchemaV4,
} from '../performance/performance-term-comparison-v4';
import { relationalCouncilResponseSchemaV3 } from '../council/relational-council-v3';
import { relationalBulletinResponseSchemaV2 } from '../bulletins/relational-bulletin-v2';

export const RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2 = 2 as const;
export const RELATIONAL_INSTITUTIONAL_REPORTS_LIMITS_V2 = Object.freeze({
  classes: 100,
  students: 150,
  offers: 40,
  pairs: 1_000,
  diagnostics: 100,
  diagnosticsOffset: 100_000,
  bulletinStudents: 50,
});

export const RELATIONAL_INSTITUTIONAL_REPORT_FAMILIES_V2 = [
  'class-results',
  'composition',
  'recovery',
  'council',
  'audit',
] as const;
export type RelationalInstitutionalReportFamilyV2 =
  (typeof RELATIONAL_INSTITUTIONAL_REPORT_FAMILIES_V2)[number];

const id = z.number().int().positive().max(2_147_483_647);
const year = z.number().int().min(GRADEBOOK_ACADEMIC_YEAR_MIN_V2).max(GRADEBOOK_ACADEMIC_YEAR_MAX_V2);
const term = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const period = z.union([term, z.literal('annual')]);
const status = z.union([
  z.null(),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(7),
]);
const uniqueStatuses = z
  .array(status)
  .min(1)
  .max(7)
  .refine((values) => new Set(values).size === values.length, 'duplicate-status');
const uniqueIds = z
  .array(id)
  .min(1)
  .max(RELATIONAL_INSTITUTIONAL_REPORTS_LIMITS_V2.bulletinStudents)
  .refine((values) => new Set(values).size === values.length, 'duplicate-student-id');

const performanceRequest = z
  .object({
    contractVersion: z.literal(RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2),
    operation: z.literal('performance'),
    family: z.enum(['class-results', 'composition', 'recovery']),
    year,
    classId: id,
    period,
    lens: z.enum(['result', 'quantitative', 'qualitative']),
    referenceTerm: term.nullable(),
    statuses: uniqueStatuses,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.family === 'class-results' && value.lens !== 'result') {
      context.addIssue({ code: 'custom', path: ['lens'], message: 'class results require result lens' });
    }
    if (value.family === 'composition' && value.lens === 'result') {
      context.addIssue({ code: 'custom', path: ['lens'], message: 'composition requires a composition lens' });
    }
    if (value.referenceTerm !== null) {
      if (value.period === 'annual' || value.referenceTerm >= value.period) {
        context.addIssue({
          code: 'custom',
          path: ['referenceTerm'],
          message: 'reference term must precede the current term in the selected academic year',
        });
      }
    }
  });

export const relationalInstitutionalReportRequestSchemaV2 = z.discriminatedUnion('operation', [
  z
    .object({
      contractVersion: z.literal(RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2),
      operation: z.literal('catalog'),
      year,
    })
    .strict(),
  performanceRequest,
  z
    .object({
      contractVersion: z.literal(RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2),
      operation: z.literal('council'),
      year,
      classId: id,
    })
    .strict(),
  z
    .object({
      contractVersion: z.literal(RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2),
      operation: z.literal('audit'),
      year,
      severities: z.array(z.enum(GRADEBOOK_IMPORT_DIAGNOSTIC_SEVERITIES_V1)).max(2),
      codes: z.array(z.enum(GRADEBOOK_IMPORT_DIAGNOSTIC_CODES_V1)).max(
        GRADEBOOK_IMPORT_DIAGNOSTIC_CODES_V1.length,
      ),
      classCode: z.string().trim().min(1).max(24).nullable(),
      limit: z.number().int().min(1).max(RELATIONAL_INSTITUTIONAL_REPORTS_LIMITS_V2.diagnostics),
      offset: z.number().int().min(0).max(RELATIONAL_INSTITUTIONAL_REPORTS_LIMITS_V2.diagnosticsOffset),
    })
    .strict(),
  z
    .object({
      contractVersion: z.literal(RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2),
      operation: z.literal('bulletin-history'),
      year,
      classId: id,
      studentIds: uniqueIds.optional(),
    })
    .strict(),
  z
    .object({
      contractVersion: z.literal(RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2),
      operation: z.literal('bulletin-reprint'),
      snapshotId: z.string().uuid(),
      snapshotVersion: z.number().int().positive(),
    })
    .strict(),
]);

export type RelationalInstitutionalReportRequestV2 = z.infer<
  typeof relationalInstitutionalReportRequestSchemaV2
>;
export type RelationalInstitutionalPerformanceReportRequestV2 = z.infer<
  typeof performanceRequest
>;

const label = z.string().trim().min(1).max(500);
const diagnostic = z
  .object({
    id,
    academicYear: year,
    fileName: z.string().trim().min(1).max(255),
    key: z.string().trim().min(1).max(320),
    severity: z.enum(GRADEBOOK_IMPORT_DIAGNOSTIC_SEVERITIES_V1),
    code: z.enum(GRADEBOOK_IMPORT_DIAGNOSTIC_CODES_V1),
    message: z.string().trim().min(1).max(300),
    recommendedAction: z.string().trim().min(1).max(500),
    classCode: z.string().trim().min(1).max(24).optional(),
    subject: z.string().trim().min(1).max(160).optional(),
    period: z.string().trim().min(1).max(64).optional(),
    studentNumber: z.number().int().min(1).max(9_999).optional(),
    studentName: z.string().trim().min(1).max(240).nullable(),
    fieldKind: z.enum(['assessment', 'term-result', 'recovery', 'configuration', 'student', 'file']),
    slot: z.number().int().min(0).max(999).optional(),
    fieldLabel: z.string().trim().min(1).max(240).optional(),
    foundValue: z.string().trim().min(1).max(240).optional(),
    cause: z.string().trim().min(1).max(240).optional(),
    sheetName: z.string().trim().min(1).max(80).optional(),
    cellAddress: z.string().trim().min(1).max(24).optional(),
    firstObservedAt: z.string().datetime({ offset: true }),
    lastObservedAt: z.string().datetime({ offset: true }),
    observations: z.number().int().positive(),
  })
  .strict();
export type RelationalInstitutionalDiagnosticV2 = z.infer<typeof diagnostic>;

const classItem = z
  .object({
    id,
    code: label,
    name: label,
  })
  .strict();
const ready = {
  contractVersion: z.literal(RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2),
  state: z.literal('ready'),
} as const;
const analysisReady = performanceAnalysisResponseSchemaV3.options[0];
const comparisonReady = performanceTermComparisonResponseSchemaV4.options[0];
const councilReady = relationalCouncilResponseSchemaV3.options[2];
const bulletinHistoryReady = relationalBulletinResponseSchemaV2.options[5];
const bulletinReprintReady = relationalBulletinResponseSchemaV2.options[6];

export const relationalInstitutionalReportResponseSchemaV2 = z.union([
  z.object({ ...ready, operation: z.literal('catalog'), year, classes: z.array(classItem).max(100) }).strict(),
  z
    .object({
      ...ready,
      operation: z.literal('performance'),
      family: z.enum(['class-results', 'composition', 'recovery']),
      report: z.union([analysisReady, comparisonReady]),
    })
    .strict(),
  z.object({ ...ready, operation: z.literal('council'), report: councilReady }).strict(),
  z
    .object({
      ...ready,
      operation: z.literal('audit'),
      items: z.array(diagnostic).max(RELATIONAL_INSTITUTIONAL_REPORTS_LIMITS_V2.diagnostics),
      nextOffset: z.number().int().min(1).max(RELATIONAL_INSTITUTIONAL_REPORTS_LIMITS_V2.diagnosticsOffset).nullable(),
    })
    .strict(),
  z.object({ ...ready, operation: z.literal('bulletin-history'), report: bulletinHistoryReady }).strict(),
  z.object({ ...ready, operation: z.literal('bulletin-reprint'), report: bulletinReprintReady }).strict(),
  z
    .object({
      contractVersion: z.literal(RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2),
      operation: z.enum([
        'catalog',
        'performance',
        'council',
        'audit',
        'bulletin-history',
        'bulletin-reprint',
      ]),
      state: z.enum([
        'invalid-request',
        'not-authorized',
        'not-found',
        'scope-too-large',
        'unavailable',
      ]),
    })
    .strict(),
]);

export type RelationalInstitutionalReportResponseV2 = z.infer<
  typeof relationalInstitutionalReportResponseSchemaV2
>;
export type RelationalInstitutionalReportFailureV2 = Extract<
  RelationalInstitutionalReportResponseV2,
  { readonly state: Exclude<RelationalInstitutionalReportResponseV2['state'], 'ready'> }
>['state'];

export function relationalInstitutionalReportResponseMatchesV2(
  request: RelationalInstitutionalReportRequestV2,
  response: RelationalInstitutionalReportResponseV2,
): boolean {
  if (request.operation !== response.operation || response.state !== 'ready') {
    return request.operation === response.operation;
  }
  if (request.operation === 'catalog') {
    return response.operation === 'catalog' && response.year === request.year;
  }
  if (request.operation === 'performance') {
    if (response.operation !== 'performance' || response.family !== request.family) return false;
    const matrix = response.report.transportVersion === 4
      ? response.report.analysis.matrix
      : response.report.matrix;
    return matrix.context.year === request.year && matrix.classGroup.id === request.classId &&
      matrix.period === request.period && matrix.mode === (request.family === 'recovery' ? 'recovery' : 'regular');
  }
  if (request.operation === 'council') {
    return response.operation === 'council' &&
      response.report.workspace.context.year === request.year &&
      response.report.workspace.classGroup.id === request.classId;
  }
  if (request.operation === 'audit') {
    return response.operation === 'audit' && response.items.every((item) => item.academicYear === request.year);
  }
  if (request.operation === 'bulletin-history') {
    return response.operation === 'bulletin-history' && response.report.items.every((item) =>
      item.classId === request.classId &&
      (request.studentIds === undefined || request.studentIds.includes(item.studentId)));
  }
  return response.operation === 'bulletin-reprint' &&
    response.report.snapshot.snapshotId === request.snapshotId &&
    response.report.snapshot.snapshotVersion === request.snapshotVersion;
}
