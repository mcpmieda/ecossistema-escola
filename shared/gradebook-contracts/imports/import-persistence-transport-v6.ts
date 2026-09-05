import type { SourceCellRawValueV1 } from '../source/source-contract-v1';
import {
  SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2,
  SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2,
  type SourceQualitativeActivitySlotV2,
  type SourceQuantitativeAssessmentSlotV2,
} from '../source/source-contract-v2';
import {
  GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V5,
  GRADEBOOK_IMPORT_PERSISTENCE_FORBIDDEN_CLIENT_FIELDS_V5,
  GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V5,
  GRADEBOOK_IMPORT_PERSISTENCE_REQUEST_REJECTIONS_V5,
  GRADEBOOK_IMPORT_PERSISTENCE_SECURITY_V5,
  isGradebookImportPersistenceResponseV5,
  type GradebookImportPersistenceRequestInspectionV5,
  type GradebookImportPersistenceRequestRejectionV5,
  type GradebookImportPersistenceRequestV5,
  type GradebookImportPersistenceResponseV5,
} from './import-persistence-transport-v5';

/**
 * V6 keeps workbook interpretation local but removes repeated roster and empty-cell envelopes from
 * the wire. The browser still sends source observations only; catalog identity, CAS, authority and
 * official persistence decisions remain server-owned.
 */
export const GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V6 = 6 as const;
export const GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V6 = GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V5;
export const GRADEBOOK_IMPORT_PERSISTENCE_SECURITY_V6 = GRADEBOOK_IMPORT_PERSISTENCE_SECURITY_V5;
export const GRADEBOOK_IMPORT_PERSISTENCE_FORBIDDEN_CLIENT_FIELDS_V6 =
  GRADEBOOK_IMPORT_PERSISTENCE_FORBIDDEN_CLIENT_FIELDS_V5;
export const GRADEBOOK_IMPORT_PERSISTENCE_REQUEST_REJECTIONS_V6 =
  GRADEBOOK_IMPORT_PERSISTENCE_REQUEST_REJECTIONS_V5;

export const GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6 = {
  ...GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V5,
  maxRostersPerRequest: 128,
  maxCoursesPerRequest: 128,
  maxRosterStudentsPerClass: 46,
  maxCompactCellsPerTermRow: 17,
  maxCompactCellsPerRecoveryRow: 11,
  maxRosterStatusLength: 128,
} as const;

export type GradebookImportPersistenceRequestRejectionV6 =
  GradebookImportPersistenceRequestRejectionV5;
export type GradebookImportPersistenceRequestInspectionV6 =
  GradebookImportPersistenceRequestInspectionV5;

/** Omitted cell = structurally expected empty/absent source observation. */
export type GradebookImportCompactFormulaCellV6 =
  | readonly ['f', SourceCellRawValueV1, number | null, string]
  | readonly ['f', SourceCellRawValueV1, number | null, string, string];

export type GradebookImportCompactCellV6 =
  | number
  | string
  | boolean
  | GradebookImportCompactFormulaCellV6;

export type GradebookImportRosterStudentV6 =
  | readonly [position: number, label: string]
  | readonly [position: number, label: string, status: string];

export interface GradebookImportRosterV6 {
  readonly classGroupLabel: string;
  /** Source relation K5:K50, contiguous until the first empty/0/null name. */
  readonly students: readonly GradebookImportRosterStudentV6[];
}

export type GradebookImportAssessmentDefinitionV6 =
  | readonly [
      sourceSlot: SourceQuantitativeAssessmentSlotV2,
      maximum: number | null,
    ]
  | readonly [
      sourceSlot: SourceQualitativeActivitySlotV2,
      maximum: number | null,
      name: string | null,
    ];

export const GRADEBOOK_IMPORT_TERM_CELL_KEYS_V6 = [
  'R',
  'S',
  'T',
  'Z',
  ...SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2.map((slot) => slot.sourceSlot),
  'AK',
  'AM',
  'AN',
] as const;
export type GradebookImportTermCellKeyV6 = (typeof GRADEBOOK_IMPORT_TERM_CELL_KEYS_V6)[number];

export const GRADEBOOK_IMPORT_RECOVERY_CELL_KEYS_V6 = [
  'R',
  'S',
  'T',
  'U',
  'X',
  'Y',
  'AA',
  'AB',
  'AC',
  'AD',
  'AE',
] as const;
export type GradebookImportRecoveryCellKeyV6 =
  (typeof GRADEBOOK_IMPORT_RECOVERY_CELL_KEYS_V6)[number];

export type GradebookImportTermCellsV6 = Readonly<
  Partial<Record<GradebookImportTermCellKeyV6, GradebookImportCompactCellV6>>
>;
export type GradebookImportRecoveryCellsV6 = Readonly<
  Partial<Record<GradebookImportRecoveryCellKeyV6, GradebookImportCompactCellV6>>
>;

/** Position resolves against the class roster. Term sourceRow is position + 4 by contract. */
export type GradebookImportTermRowV6 = readonly [
  position: number,
  cells: GradebookImportTermCellsV6,
];

/** REC is a dynamic visual roster, so sourceRow is preserved separately for provenance. */
export type GradebookImportRecoveryRowV6 = readonly [
  rosterPosition: number,
  sourceRow: number,
  cells: GradebookImportRecoveryCellsV6,
];

export interface GradebookImportTermV6 {
  readonly term: 1 | 2 | 3;
  readonly sourceSheetName: string;
  readonly assessmentDefinitions: readonly GradebookImportAssessmentDefinitionV6[];
  readonly rows: readonly GradebookImportTermRowV6[];
}

export interface GradebookImportRecoveryV6 {
  readonly sourceSheetName: string;
  readonly rows: readonly GradebookImportRecoveryRowV6[];
}

export interface GradebookImportCourseV6 {
  readonly classGroupLabel: string;
  readonly subjectLabel: string;
  readonly disciplineIndex: `D${number}`;
  readonly terms: readonly [GradebookImportTermV6, GradebookImportTermV6, GradebookImportTermV6];
  readonly recovery: GradebookImportRecoveryV6 | null;
}

export interface GradebookImportPersistenceRequestV6
  extends Omit<GradebookImportPersistenceRequestV5, 'transportVersion' | 'sheets' | 'diagnostics'> {
  readonly transportVersion: typeof GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V6;
  readonly rosters: readonly GradebookImportRosterV6[];
  readonly courses: readonly GradebookImportCourseV6[];
  /** Persistence transport has never forwarded UI diagnostics; V6 makes that compact invariant explicit. */
  readonly diagnostics: readonly [];
}

export type GradebookImportPersistenceResponseV6 =
  GradebookImportPersistenceResponseV5 extends infer R
    ? R extends { readonly transportVersion: 5 }
      ? Omit<R, 'transportVersion'> & {
          readonly transportVersion: typeof GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V6;
        }
      : never
    : never;

const QUANTITATIVE_SLOTS = new Set<string>(
  SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2.map((slot) => slot.sourceSlot),
);
const QUALITATIVE_SLOTS = new Set<string>(
  SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2.map((slot) => slot.sourceSlot),
);
const TERM_CELL_KEYS = new Set<string>(GRADEBOOK_IMPORT_TERM_CELL_KEYS_V6);
const RECOVERY_CELL_KEYS = new Set<string>(GRADEBOOK_IMPORT_RECOVERY_CELL_KEYS_V6);
const FORBIDDEN_FIELDS = new Set<string>(GRADEBOOK_IMPORT_PERSISTENCE_FORBIDDEN_CLIENT_FIELDS_V6);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const present = Object.keys(value);
  return present.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function nonEmptyBounded(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function validIsoOrNull(value: unknown): boolean {
  return value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/u.test(value));
}

function validManifest(value: unknown): value is GradebookImportPersistenceRequestV5['manifest'] {
  if (!isRecord(value)) return false;
  if (
    !exactKeys(value, [
      'fileName',
      'extension',
      'reportedMimeType',
      'sizeBytes',
      'lastModifiedAt',
      'sha256',
      'sourceContractVersion',
      'parserVersion',
      'readAt',
    ])
  ) {
    return false;
  }
  return (
    nonEmptyBounded(value.fileName, GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxFileNameLength) &&
    ['xlsb', 'xlsx', 'xls'].includes(String(value.extension)) &&
    (value.reportedMimeType === null ||
      (typeof value.reportedMimeType === 'string' &&
        value.reportedMimeType.length <= GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxMimeTypeLength)) &&
    typeof value.sizeBytes === 'number' &&
    Number.isSafeInteger(value.sizeBytes) &&
    value.sizeBytes >= 0 &&
    validIsoOrNull(value.lastModifiedAt) &&
    typeof value.sha256 === 'string' &&
    /^[0-9a-f]{64}$/u.test(value.sha256) &&
    value.sourceContractVersion === 2 &&
    nonEmptyBounded(value.parserVersion, GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxParserVersionLength) &&
    typeof value.readAt === 'string' &&
    /^\d{4}-\d{2}-\d{2}T/u.test(value.readAt)
  );
}

function validRawFormulaValue(value: unknown): value is SourceCellRawValueV1 {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function validCompactCell(value: unknown): value is GradebookImportCompactCellV6 {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (typeof value === 'string') {
    return value.length > 0 && value.length <= GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxSuggestionLength;
  }
  if (!Array.isArray(value) || (value.length !== 4 && value.length !== 5)) return false;
  if (value[0] !== 'f' || !validRawFormulaValue(value[1])) return false;
  if (value[2] !== null && (typeof value[2] !== 'number' || !Number.isFinite(value[2]))) return false;
  if (
    typeof value[3] !== 'string' ||
    value[3].length === 0 ||
    value[3].length > GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxFormulaLength
  ) {
    return false;
  }
  return (
    value.length === 4 ||
    (typeof value[4] === 'string' &&
      value[4].length > 0 &&
      value[4].length <= GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxSuggestionLength)
  );
}

function containsForbiddenField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenField);
  if (!isRecord(value)) return false;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_FIELDS.has(key) || containsForbiddenField(nested)) return true;
  }
  return false;
}

function validRosterStudent(value: unknown, expectedPosition: number): value is GradebookImportRosterStudentV6 {
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3)) return false;
  if (value[0] !== expectedPosition) return false;
  if (!nonEmptyBounded(value[1], GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxSuggestionLength)) return false;
  return (
    value.length === 2 ||
    nonEmptyBounded(value[2], GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxRosterStatusLength)
  );
}

function inspectRosters(value: unknown):
  | { readonly status: 'ready'; readonly positionsByClass: ReadonlyMap<string, ReadonlySet<number>>; readonly total: number }
  | { readonly status: GradebookImportPersistenceRequestRejectionV6 } {
  if (!Array.isArray(value) || value.length === 0) return { status: 'invalid-request' };
  if (value.length > GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxRostersPerRequest) {
    return { status: 'payload-too-large' };
  }
  const positionsByClass = new Map<string, ReadonlySet<number>>();
  let total = 0;
  for (const roster of value) {
    if (
      !isRecord(roster) ||
      !exactKeys(roster, ['classGroupLabel', 'students']) ||
      !nonEmptyBounded(roster.classGroupLabel, GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxSuggestionLength) ||
      !Array.isArray(roster.students) ||
      roster.students.length === 0
    ) {
      return { status: 'invalid-request' };
    }
    if (roster.students.length > GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxRosterStudentsPerClass) {
      return { status: 'payload-too-large' };
    }
    const classKey = roster.classGroupLabel.trim().toUpperCase();
    if (positionsByClass.has(classKey)) return { status: 'duplicate-identity' };
    const positions = new Set<number>();
    const normalizedLabels = new Set<string>();
    for (const [index, student] of roster.students.entries()) {
      const expectedPosition = index + 1;
      if (!validRosterStudent(student, expectedPosition)) return { status: 'invalid-request' };
      const label = student[1].trim().toUpperCase();
      if (normalizedLabels.has(label)) return { status: 'duplicate-identity' };
      normalizedLabels.add(label);
      positions.add(expectedPosition);
    }
    total += roster.students.length;
    if (total > GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxStudentObservationsPerRequest) {
      return { status: 'payload-too-large' };
    }
    positionsByClass.set(classKey, positions);
  }
  return { status: 'ready', positionsByClass, total };
}

function validAssessmentDefinition(
  value: unknown,
): value is GradebookImportAssessmentDefinitionV6 {
  if (!Array.isArray(value)) return false;
  const slot = value[0];
  const quantitative = typeof slot === 'string' && QUANTITATIVE_SLOTS.has(slot);
  const qualitative = typeof slot === 'string' && QUALITATIVE_SLOTS.has(slot);
  if (!quantitative && !qualitative) return false;
  if (quantitative && value.length !== 2) return false;
  if (qualitative && value.length !== 3) return false;
  const maximum = value[1];
  if (
    maximum !== null &&
    (typeof maximum !== 'number' || !Number.isFinite(maximum) || maximum <= 0)
  ) {
    return false;
  }
  if (!qualitative) return true;
  return (
    value[2] === null ||
    nonEmptyBounded(value[2], GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxSuggestionLength)
  );
}

function inspectCells(
  value: unknown,
  allowed: ReadonlySet<string>,
  maxCells: number,
): GradebookImportPersistenceRequestRejectionV6 | null {
  if (!isRecord(value)) return 'invalid-academic-shape';
  const keys = Object.keys(value);
  if (keys.length > maxCells) return 'payload-too-large';
  for (const [key, cell] of Object.entries(value)) {
    if (!allowed.has(key) || !validCompactCell(cell)) return 'invalid-academic-shape';
  }
  return null;
}

function inspectTerm(
  value: unknown,
  rosterPositions: ReadonlySet<number>,
): GradebookImportPersistenceRequestRejectionV6 | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['term', 'sourceSheetName', 'assessmentDefinitions', 'rows']) ||
    ![1, 2, 3].includes(Number(value.term)) ||
    !nonEmptyBounded(value.sourceSheetName, GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxSheetNameLength) ||
    !Array.isArray(value.assessmentDefinitions) ||
    !Array.isArray(value.rows)
  ) {
    return 'invalid-academic-shape';
  }
  if (
    value.assessmentDefinitions.length >
      GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxAssessmentDefinitionsPerTermSheet ||
    value.rows.length > GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxRosterStudentsPerClass
  ) {
    return 'payload-too-large';
  }
  const definitionSlots = new Set<string>();
  for (const definition of value.assessmentDefinitions) {
    if (!validAssessmentDefinition(definition)) return 'invalid-academic-shape';
    const slot = definition[0];
    if (definitionSlots.has(slot)) return 'duplicate-identity';
    definitionSlots.add(slot);
  }
  if (!definitionSlots.has('R') || !definitionSlots.has('S')) return 'invalid-academic-shape';

  const rowPositions = new Set<number>();
  const observedQualitative = new Set<string>();
  for (const row of value.rows) {
    if (!Array.isArray(row) || row.length !== 2 || !Number.isSafeInteger(row[0])) {
      return 'invalid-academic-shape';
    }
    const position = Number(row[0]);
    if (!rosterPositions.has(position)) return 'incompatible-reference';
    if (rowPositions.has(position)) return 'duplicate-identity';
    rowPositions.add(position);
    const cellIssue = inspectCells(
      row[1],
      TERM_CELL_KEYS,
      GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxCompactCellsPerTermRow,
    );
    if (cellIssue) return cellIssue;
    for (const key of Object.keys(row[1] as Record<string, unknown>)) {
      if (QUALITATIVE_SLOTS.has(key)) {
        if (!definitionSlots.has(key)) return 'invalid-academic-shape';
        observedQualitative.add(key);
      }
    }
    if (value.term !== 3 && Object.hasOwn(row[1] as Record<string, unknown>, 'AN')) {
      return 'invalid-academic-shape';
    }
  }

  for (const definition of value.assessmentDefinitions) {
    const slot = definition[0];
    if (!QUALITATIVE_SLOTS.has(slot)) continue;
    const maximum = definition[1];
    const name = definition[2];
    if (maximum === null && name === null && !observedQualitative.has(slot)) {
      return 'invalid-academic-shape';
    }
  }
  return null;
}

function inspectRecovery(
  value: unknown,
  rosterPositions: ReadonlySet<number>,
): GradebookImportPersistenceRequestRejectionV6 | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !exactKeys(value, ['sourceSheetName', 'rows']) ||
    !nonEmptyBounded(value.sourceSheetName, GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxSheetNameLength) ||
    !Array.isArray(value.rows)
  ) {
    return 'invalid-academic-shape';
  }
  if (value.rows.length > GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxRosterStudentsPerClass) {
    return 'payload-too-large';
  }
  const positions = new Set<number>();
  const sourceRows = new Set<number>();
  for (const row of value.rows) {
    if (
      !Array.isArray(row) ||
      row.length !== 3 ||
      !Number.isSafeInteger(row[0]) ||
      !Number.isSafeInteger(row[1])
    ) {
      return 'invalid-academic-shape';
    }
    const position = Number(row[0]);
    const sourceRow = Number(row[1]);
    if (!rosterPositions.has(position)) return 'incompatible-reference';
    if (sourceRow < 5 || sourceRow > 50) return 'invalid-academic-shape';
    if (positions.has(position) || sourceRows.has(sourceRow)) return 'duplicate-identity';
    positions.add(position);
    sourceRows.add(sourceRow);
    const cellIssue = inspectCells(
      row[2],
      RECOVERY_CELL_KEYS,
      GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxCompactCellsPerRecoveryRow,
    );
    if (cellIssue) return cellIssue;
  }
  return null;
}

function inspectCourses(
  value: unknown,
  positionsByClass: ReadonlyMap<string, ReadonlySet<number>>,
): GradebookImportPersistenceRequestRejectionV6 | null {
  if (!Array.isArray(value) || value.length === 0) return 'invalid-request';
  if (value.length > GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxCoursesPerRequest) {
    return 'payload-too-large';
  }
  const courseKeys = new Set<string>();
  const sheetNames = new Set<string>();
  for (const course of value) {
    if (
      !isRecord(course) ||
      !exactKeys(course, [
        'classGroupLabel',
        'subjectLabel',
        'disciplineIndex',
        'terms',
        'recovery',
      ]) ||
      !nonEmptyBounded(course.classGroupLabel, GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxSuggestionLength) ||
      !nonEmptyBounded(course.subjectLabel, GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxSuggestionLength) ||
      typeof course.disciplineIndex !== 'string' ||
      !/^D[1-9]\d*$/u.test(course.disciplineIndex) ||
      !Array.isArray(course.terms) ||
      course.terms.length !== 3
    ) {
      return 'invalid-academic-shape';
    }
    const classKey = course.classGroupLabel.trim().toUpperCase();
    const rosterPositions = positionsByClass.get(classKey);
    if (!rosterPositions) return 'incompatible-reference';
    const courseKey = JSON.stringify([
      classKey,
      course.subjectLabel.trim().toUpperCase(),
      course.disciplineIndex,
    ]);
    if (courseKeys.has(courseKey)) return 'duplicate-identity';
    courseKeys.add(courseKey);

    const terms = [...course.terms].sort(
      (left, right) => Number((left as Record<string, unknown>).term) - Number((right as Record<string, unknown>).term),
    );
    if (terms.some((term, index) => Number((term as Record<string, unknown>).term) !== index + 1)) {
      return 'invalid-academic-shape';
    }
    for (const term of terms) {
      const issue = inspectTerm(term, rosterPositions);
      if (issue) return issue;
      const name = (term as Record<string, unknown>).sourceSheetName;
      if (typeof name !== 'string' || sheetNames.has(name)) return 'duplicate-identity';
      sheetNames.add(name);
    }
    const recoveryIssue = inspectRecovery(course.recovery, rosterPositions);
    if (recoveryIssue) return recoveryIssue;
    if (isRecord(course.recovery)) {
      const name = course.recovery.sourceSheetName;
      if (typeof name !== 'string' || sheetNames.has(name)) return 'duplicate-identity';
      sheetNames.add(name);
    }
  }
  return null;
}

export const GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_V6 = {
  version: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V6,
  operation: GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V6,
  unit: 'one-recognized-source-file-per-request',
  bounds: GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6,
  security: GRADEBOOK_IMPORT_PERSISTENCE_SECURITY_V6,
  workbookProcessing: 'browser-local-compact-observation',
  roster: {
    sourceRows: 'K5:K50-until-first-empty-zero-null',
    statusColumn: 'G',
    declaredCurrentCount: 'J1-informational-only',
    reuse: 'once-per-class-per-file',
  },
  recovery: {
    roster: 'dynamic-subset-reference-only',
    identity: 'resolved-against-class-roster-before-transport',
    sourceRow: 'preserved-for-provenance',
  },
  trustBoundary: {
    browserInput: 'untrusted-compact-source-observations',
    serverOwned: ['catalog-identity', 'cas', 'authority', 'official-results', 'persistence-plan'],
    forbiddenClientFields: GRADEBOOK_IMPORT_PERSISTENCE_FORBIDDEN_CLIENT_FIELDS_V6,
  },
} as const;

export function inspectGradebookImportPersistenceRequestV6(
  value: unknown,
): GradebookImportPersistenceRequestInspectionV6 {
  if (!isRecord(value)) return 'invalid-request';
  if (
    !exactKeys(value, [
      'transportVersion',
      'operation',
      'manifest',
      'recognizedSuggestions',
      'confirmedContext',
      'sourceResolution',
      'rosters',
      'courses',
      'diagnostics',
    ]) ||
    value.transportVersion !== GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V6 ||
    value.operation !== GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V6 ||
    containsForbiddenField(value) ||
    !validManifest(value.manifest)
  ) {
    return 'invalid-request';
  }
  if (
    !isRecord(value.recognizedSuggestions) ||
    !exactKeys(value.recognizedSuggestions, ['academicYear', 'teacherName']) ||
    !Number.isSafeInteger(value.recognizedSuggestions.academicYear) ||
    Number(value.recognizedSuggestions.academicYear) < 2000 ||
    Number(value.recognizedSuggestions.academicYear) > 9999 ||
    !nonEmptyBounded(
      value.recognizedSuggestions.teacherName,
      GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxSuggestionLength,
    ) ||
    !isRecord(value.confirmedContext) ||
    !exactKeys(value.confirmedContext, ['academicYearId']) ||
    !nonEmptyBounded(
      value.confirmedContext.academicYearId,
      GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V6.maxIdentifierLength,
    ) ||
    !isRecord(value.sourceResolution) ||
    !exactKeys(value.sourceResolution, ['mode']) ||
    value.sourceResolution.mode !== 'resolve-or-create' ||
    !Array.isArray(value.diagnostics) ||
    value.diagnostics.length !== 0
  ) {
    return 'invalid-request';
  }

  const rosters = inspectRosters(value.rosters);
  if (rosters.status !== 'ready') return rosters.status;
  const courseIssue = inspectCourses(value.courses, rosters.positionsByClass);
  return courseIssue ?? 'ready';
}

export function isGradebookImportPersistenceRequestV6(
  value: unknown,
): value is GradebookImportPersistenceRequestV6 {
  return inspectGradebookImportPersistenceRequestV6(value) === 'ready';
}

export function isGradebookImportPersistenceResponseV6(
  value: unknown,
): value is GradebookImportPersistenceResponseV6 {
  return (
    isRecord(value) &&
    value.transportVersion === GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V6 &&
    isGradebookImportPersistenceResponseV5({ ...value, transportVersion: 5 })
  );
}

export function asGradebookImportPersistenceResponseV6(
  value: GradebookImportPersistenceResponseV5,
): GradebookImportPersistenceResponseV6 {
  return { ...value, transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V6 };
}
