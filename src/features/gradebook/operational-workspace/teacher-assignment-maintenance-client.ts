import type {
  AcademicYearId,
  ClassGroupId,
  EffectivePeriodV1,
  SubjectId,
  TeacherId,
  TeacherV1,
  TeachingAssignmentId,
  TeachingAssignmentV1,
} from '../../../../shared/gradebook-contracts/entities';

const OPERATIONAL_WORKSPACE_ENDPOINT = '/api/gradebook/operational-workspace';
const MAINTENANCE_VERSION = 1 as const;

export type TeacherAssignmentMaintenanceClientFailureV1 = 'not-authorized' | 'unavailable';

export class TeacherAssignmentMaintenanceClientErrorV1 extends Error {
  override readonly name = 'TeacherAssignmentMaintenanceClientErrorV1';

  constructor(readonly code: TeacherAssignmentMaintenanceClientFailureV1) {
    super(code === 'not-authorized' ? 'Teacher maintenance is not authorized.' : 'Teacher maintenance is unavailable.');
  }
}

export interface TeacherMaintenanceAssignmentClientV1 {
  readonly reference: TeachingAssignmentId;
  readonly currentVersion: number;
  readonly confirmationOrigin: TeachingAssignmentV1['confirmationOrigin'];
  readonly effectivePeriod: EffectivePeriodV1;
  readonly classGroup: { readonly reference: ClassGroupId; readonly label: string } | null;
  readonly subject: { readonly reference: SubjectId; readonly label: string } | null;
}

export interface TeacherMaintenanceStateClientV1 {
  readonly maintenanceVersion: typeof MAINTENANCE_VERSION;
  readonly state: 'ready';
  readonly academicYearId: AcademicYearId;
  readonly teacher: {
    readonly reference: TeacherId;
    readonly displayName: string;
    readonly status: TeacherV1['status'];
    readonly sourceNames: readonly string[];
    readonly currentVersion: number;
  };
  readonly assignments: readonly TeacherMaintenanceAssignmentClientV1[];
}

export type TeacherMaintenanceMutationClientV1 =
  | {
      readonly maintenanceVersion: typeof MAINTENANCE_VERSION;
      readonly state: 'written';
      readonly entity: 'teacher' | 'teaching-assignment';
      readonly reference: TeacherId | TeachingAssignmentId;
      readonly currentVersion: number;
      readonly change:
        | 'teacher-registered'
        | 'teacher-source-name-confirmed'
        | 'assignment-registered'
        | 'assignment-confirmed';
    }
  | {
      readonly maintenanceVersion: typeof MAINTENANCE_VERSION;
      readonly state: 'unchanged';
      readonly entity: 'teacher' | 'teaching-assignment';
      readonly reference: TeacherId | TeachingAssignmentId;
      readonly currentVersion: number;
    }
  | {
      readonly maintenanceVersion: typeof MAINTENANCE_VERSION;
      readonly state: 'version-conflict';
      readonly currentVersion: number | null;
    }
  | {
      readonly maintenanceVersion: typeof MAINTENANCE_VERSION;
      readonly state: 'not-found';
      readonly target: 'academic-year' | 'teacher' | 'class-group' | 'subject' | 'teaching-assignment';
    }
  | {
      readonly maintenanceVersion: typeof MAINTENANCE_VERSION;
      readonly state: 'unavailable';
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isEffectivePeriod(value: unknown): value is EffectivePeriodV1 {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => key === 'startsOn' || key === 'endsOn') &&
    (value.startsOn === undefined || nonEmptyString(value.startsOn)) &&
    (value.endsOn === undefined || nonEmptyString(value.endsOn))
  );
}

function isAssignment(value: unknown): value is TeacherMaintenanceAssignmentClientV1 {
  return (
    isRecord(value) &&
    nonEmptyString(value.reference) &&
    positiveInteger(value.currentVersion) &&
    (value.confirmationOrigin === 'imported-source' ||
      value.confirmationOrigin === 'user-confirmed' ||
      value.confirmationOrigin === 'administrative') &&
    isEffectivePeriod(value.effectivePeriod) &&
    (value.classGroup === null ||
      (isRecord(value.classGroup) &&
        nonEmptyString(value.classGroup.reference) &&
        nonEmptyString(value.classGroup.label))) &&
    (value.subject === null ||
      (isRecord(value.subject) &&
        nonEmptyString(value.subject.reference) &&
        nonEmptyString(value.subject.label)))
  );
}

function isState(value: unknown): value is TeacherMaintenanceStateClientV1 {
  return (
    isRecord(value) &&
    value.maintenanceVersion === MAINTENANCE_VERSION &&
    value.state === 'ready' &&
    nonEmptyString(value.academicYearId) &&
    isRecord(value.teacher) &&
    nonEmptyString(value.teacher.reference) &&
    nonEmptyString(value.teacher.displayName) &&
    (value.teacher.status === 'active' || value.teacher.status === 'inactive') &&
    Array.isArray(value.teacher.sourceNames) &&
    value.teacher.sourceNames.every((name) => typeof name === 'string') &&
    positiveInteger(value.teacher.currentVersion) &&
    Array.isArray(value.assignments) &&
    value.assignments.every(isAssignment)
  );
}

function isMutation(value: unknown): value is TeacherMaintenanceMutationClientV1 {
  if (!isRecord(value) || value.maintenanceVersion !== MAINTENANCE_VERSION || typeof value.state !== 'string') {
    return false;
  }
  if (value.state === 'written') {
    return (
      (value.entity === 'teacher' || value.entity === 'teaching-assignment') &&
      nonEmptyString(value.reference) &&
      positiveInteger(value.currentVersion) &&
      ['teacher-registered', 'teacher-source-name-confirmed', 'assignment-registered', 'assignment-confirmed'].includes(
        String(value.change),
      )
    );
  }
  if (value.state === 'unchanged') {
    return (
      (value.entity === 'teacher' || value.entity === 'teaching-assignment') &&
      nonEmptyString(value.reference) &&
      positiveInteger(value.currentVersion)
    );
  }
  if (value.state === 'version-conflict') {
    return value.currentVersion === null || positiveInteger(value.currentVersion);
  }
  if (value.state === 'not-found') {
    return ['academic-year', 'teacher', 'class-group', 'subject', 'teaching-assignment'].includes(
      String(value.target),
    );
  }
  return value.state === 'unavailable';
}

async function postMaintenance(request: unknown, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(OPERATIONAL_WORKSPACE_ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  if (response.status === 401 || response.status === 403) {
    throw new TeacherAssignmentMaintenanceClientErrorV1('not-authorized');
  }
  if (response.status >= 500) throw new TeacherAssignmentMaintenanceClientErrorV1('unavailable');
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new TeacherAssignmentMaintenanceClientErrorV1('unavailable');
  return payload;
}

export async function requestTeacherMaintenanceStateV1(
  academicYearId: AcademicYearId,
  teacherReference: TeacherId,
  signal?: AbortSignal,
): Promise<TeacherMaintenanceStateClientV1> {
  const payload = await postMaintenance(
    { maintenanceVersion: MAINTENANCE_VERSION, operation: 'teacher-state', academicYearId, teacherReference },
    signal,
  );
  if (!isState(payload)) throw new TeacherAssignmentMaintenanceClientErrorV1('unavailable');
  return payload;
}

export async function registerTeacherMaintenanceV1(
  academicYearId: AcademicYearId,
  displayName: string,
): Promise<TeacherMaintenanceMutationClientV1> {
  const payload = await postMaintenance({
    maintenanceVersion: MAINTENANCE_VERSION,
    operation: 'teacher-register',
    academicYearId,
    displayName,
  });
  if (!isMutation(payload)) throw new TeacherAssignmentMaintenanceClientErrorV1('unavailable');
  return payload;
}

export async function confirmTeacherSourceNameMaintenanceV1(
  academicYearId: AcademicYearId,
  teacherReference: TeacherId,
  expectedVersion: number,
  sourceName: string,
): Promise<TeacherMaintenanceMutationClientV1> {
  const payload = await postMaintenance({
    maintenanceVersion: MAINTENANCE_VERSION,
    operation: 'teacher-confirm-source-name',
    academicYearId,
    teacherReference,
    expectedVersion,
    sourceName,
  });
  if (!isMutation(payload)) throw new TeacherAssignmentMaintenanceClientErrorV1('unavailable');
  return payload;
}

export async function registerTeachingAssignmentMaintenanceV1(input: {
  readonly academicYearId: AcademicYearId;
  readonly teacherReference: TeacherId;
  readonly classGroupReference: ClassGroupId;
  readonly subjectReference: SubjectId;
  readonly effectivePeriod: EffectivePeriodV1;
}): Promise<TeacherMaintenanceMutationClientV1> {
  const payload = await postMaintenance({
    maintenanceVersion: MAINTENANCE_VERSION,
    operation: 'assignment-register',
    ...input,
  });
  if (!isMutation(payload)) throw new TeacherAssignmentMaintenanceClientErrorV1('unavailable');
  return payload;
}

export async function confirmTeachingAssignmentMaintenanceV1(
  academicYearId: AcademicYearId,
  assignmentReference: TeachingAssignmentId,
  expectedVersion: number,
): Promise<TeacherMaintenanceMutationClientV1> {
  const payload = await postMaintenance({
    maintenanceVersion: MAINTENANCE_VERSION,
    operation: 'assignment-confirm',
    academicYearId,
    assignmentReference,
    expectedVersion,
  });
  if (!isMutation(payload)) throw new TeacherAssignmentMaintenanceClientErrorV1('unavailable');
  return payload;
}
