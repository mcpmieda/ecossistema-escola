import type { AcademicRecordV1 } from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';

export type GradebookD1ReadErrorCodeV1 =
  | 'database-read-failed'
  | 'invalid-json'
  | 'incompatible-row'
  | 'broken-reference';

const ERROR_MESSAGES: Record<GradebookD1ReadErrorCodeV1, string> = {
  'database-read-failed': 'Não foi possível consultar os dados acadêmicos persistidos.',
  'invalid-json': 'Os dados acadêmicos persistidos não puderam ser reconstruídos.',
  'incompatible-row': 'O registro acadêmico persistido possui formato incompatível.',
  'broken-reference': 'Uma referência acadêmica persistida está inconsistente.',
};

export class GradebookD1ReadErrorV1 extends Error {
  readonly code: GradebookD1ReadErrorCodeV1;

  constructor(code: GradebookD1ReadErrorCodeV1) {
    super(ERROR_MESSAGES[code]);
    this.name = 'GradebookD1ReadErrorV1';
    this.code = code;
  }
}

export function failD1ReadV1(code: GradebookD1ReadErrorCodeV1): never {
  throw new GradebookD1ReadErrorV1(code);
}

export function isD1ReadObjectV1(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function requiredD1ReadStringV1(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return failD1ReadV1('incompatible-row');
  return value;
}

export function positiveD1ReadIntegerV1(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1)
    return failD1ReadV1('incompatible-row');
  return value;
}

function academicTermV1(value: unknown): 1 | 2 | 3 {
  if (value !== 1 && value !== 2 && value !== 3) return failD1ReadV1('incompatible-row');
  return value;
}

export function validateAcademicRecordShapeV1(
  value: Record<string, unknown>,
): AcademicRecordV1 {
  if (!isD1ReadObjectV1(value.value)) return failD1ReadV1('incompatible-row');
  const record = value.value;
  requiredD1ReadStringV1(record.id);
  requiredD1ReadStringV1(record.academicYearId);
  requiredD1ReadStringV1(record.studentId);
  requiredD1ReadStringV1(record.enrollmentId);
  requiredD1ReadStringV1(record.authorityMode);
  requiredD1ReadStringV1(record.ruleVersion);

  switch (value.kind) {
    case 'grade-entry':
      requiredD1ReadStringV1(record.assessmentComponentId);
      break;
    case 'term-result':
      requiredD1ReadStringV1(record.teachingAssignmentId);
      academicTermV1(record.term);
      break;
    case 'final-recovery':
      requiredD1ReadStringV1(record.teachingAssignmentId);
      academicTermV1(record.recoveredTerm);
      break;
    case 'annual-result':
      requiredD1ReadStringV1(record.teachingAssignmentId);
      break;
    default:
      return failD1ReadV1('incompatible-row');
  }

  return value as unknown as AcademicRecordV1;
}
