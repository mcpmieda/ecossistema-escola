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
import type {
  AcademicEntityKindV1,
  AcademicEntityRecordV1,
  AcademicEntityRepositoryV1,
  AcademicPersistenceContextV1,
  VersionedRecordV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type { TeacherCenterQueryV1 } from '../read-models/teaching/teaching-center-read-models-v1';

export const TEACHER_ASSIGNMENT_MAINTENANCE_VERSION_V1 = 1 as const;

export const TEACHER_ASSIGNMENT_MAINTENANCE_OPERATIONS_V1 = [
  'teacher-state',
  'teacher-register',
  'teacher-confirm-source-name',
  'assignment-register',
  'assignment-confirm',
] as const;
export type TeacherAssignmentMaintenanceOperationV1 =
  (typeof TEACHER_ASSIGNMENT_MAINTENANCE_OPERATIONS_V1)[number];

interface MaintenanceRequestBaseV1 {
  readonly maintenanceVersion: typeof TEACHER_ASSIGNMENT_MAINTENANCE_VERSION_V1;
  readonly academicYearId: AcademicYearId;
}

export interface TeacherMaintenanceStateRequestV1 extends MaintenanceRequestBaseV1 {
  readonly operation: 'teacher-state';
  readonly teacherReference: TeacherId;
}

export interface TeacherRegisterRequestV1 extends MaintenanceRequestBaseV1 {
  readonly operation: 'teacher-register';
  readonly displayName: string;
}

export interface TeacherConfirmSourceNameRequestV1 extends MaintenanceRequestBaseV1 {
  readonly operation: 'teacher-confirm-source-name';
  readonly teacherReference: TeacherId;
  readonly expectedVersion: number;
  readonly sourceName: string;
}

export interface TeachingAssignmentRegisterRequestV1 extends MaintenanceRequestBaseV1 {
  readonly operation: 'assignment-register';
  readonly teacherReference: TeacherId;
  readonly classGroupReference: ClassGroupId;
  readonly subjectReference: SubjectId;
  readonly effectivePeriod: EffectivePeriodV1;
}

export interface TeachingAssignmentConfirmRequestV1 extends MaintenanceRequestBaseV1 {
  readonly operation: 'assignment-confirm';
  readonly assignmentReference: TeachingAssignmentId;
  readonly expectedVersion: number;
}

export type TeacherAssignmentMaintenanceRequestV1 =
  | TeacherMaintenanceStateRequestV1
  | TeacherRegisterRequestV1
  | TeacherConfirmSourceNameRequestV1
  | TeachingAssignmentRegisterRequestV1
  | TeachingAssignmentConfirmRequestV1;

export interface TeacherMaintenanceAssignmentViewV1 {
  readonly reference: TeachingAssignmentId;
  readonly currentVersion: number;
  readonly confirmationOrigin: TeachingAssignmentV1['confirmationOrigin'];
  readonly effectivePeriod: EffectivePeriodV1;
  readonly classGroup: { readonly reference: ClassGroupId; readonly label: string } | null;
  readonly subject: { readonly reference: SubjectId; readonly label: string } | null;
}

export interface TeacherMaintenanceStateReadyV1 {
  readonly maintenanceVersion: typeof TEACHER_ASSIGNMENT_MAINTENANCE_VERSION_V1;
  readonly state: 'ready';
  readonly academicYearId: AcademicYearId;
  readonly teacher: {
    readonly reference: TeacherId;
    readonly displayName: string;
    readonly status: TeacherV1['status'];
    readonly sourceNames: readonly string[];
    readonly currentVersion: number;
  };
  readonly assignments: readonly TeacherMaintenanceAssignmentViewV1[];
}

export interface TeacherMaintenanceWrittenV1 {
  readonly maintenanceVersion: typeof TEACHER_ASSIGNMENT_MAINTENANCE_VERSION_V1;
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

export interface TeacherMaintenanceUnchangedV1 {
  readonly maintenanceVersion: typeof TEACHER_ASSIGNMENT_MAINTENANCE_VERSION_V1;
  readonly state: 'unchanged';
  readonly entity: 'teacher' | 'teaching-assignment';
  readonly reference: TeacherId | TeachingAssignmentId;
  readonly currentVersion: number;
}

export interface TeacherMaintenanceVersionConflictV1 {
  readonly maintenanceVersion: typeof TEACHER_ASSIGNMENT_MAINTENANCE_VERSION_V1;
  readonly state: 'version-conflict';
  readonly currentVersion: number | null;
}

export interface TeacherMaintenanceNotFoundV1 {
  readonly maintenanceVersion: typeof TEACHER_ASSIGNMENT_MAINTENANCE_VERSION_V1;
  readonly state: 'not-found';
  readonly target: 'academic-year' | 'teacher' | 'class-group' | 'subject' | 'teaching-assignment';
}

export interface TeacherMaintenanceUnavailableV1 {
  readonly maintenanceVersion: typeof TEACHER_ASSIGNMENT_MAINTENANCE_VERSION_V1;
  readonly state: 'unavailable';
}

export type TeacherAssignmentMaintenanceResponseV1 =
  | TeacherMaintenanceStateReadyV1
  | TeacherMaintenanceWrittenV1
  | TeacherMaintenanceUnchangedV1
  | TeacherMaintenanceVersionConflictV1
  | TeacherMaintenanceNotFoundV1
  | TeacherMaintenanceUnavailableV1;

export interface TeacherAssignmentMaintenanceDependenciesV1 {
  readonly entities: AcademicEntityRepositoryV1;
  readonly teachers: TeacherCenterQueryV1;
  readonly createTeacherId: () => TeacherId;
  readonly createTeachingAssignmentId: () => TeachingAssignmentId;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function validEffectivePeriod(value: unknown): value is EffectivePeriodV1 {
  return (
    isObject(value) &&
    hasOnlyKeys(value, ['startsOn', 'endsOn']) &&
    (value.startsOn === undefined || nonEmptyString(value.startsOn)) &&
    (value.endsOn === undefined || nonEmptyString(value.endsOn))
  );
}

export function isTeacherAssignmentMaintenanceRequestV1(
  value: unknown,
): value is TeacherAssignmentMaintenanceRequestV1 {
  if (
    !isObject(value) ||
    value.maintenanceVersion !== TEACHER_ASSIGNMENT_MAINTENANCE_VERSION_V1 ||
    !nonEmptyString(value.academicYearId) ||
    typeof value.operation !== 'string' ||
    !(TEACHER_ASSIGNMENT_MAINTENANCE_OPERATIONS_V1 as readonly string[]).includes(value.operation)
  ) {
    return false;
  }

  switch (value.operation) {
    case 'teacher-state':
      return (
        hasOnlyKeys(value, [
          'maintenanceVersion',
          'operation',
          'academicYearId',
          'teacherReference',
        ]) && nonEmptyString(value.teacherReference)
      );
    case 'teacher-register':
      return (
        hasOnlyKeys(value, ['maintenanceVersion', 'operation', 'academicYearId', 'displayName']) &&
        nonEmptyString(value.displayName)
      );
    case 'teacher-confirm-source-name':
      return (
        hasOnlyKeys(value, [
          'maintenanceVersion',
          'operation',
          'academicYearId',
          'teacherReference',
          'expectedVersion',
          'sourceName',
        ]) &&
        nonEmptyString(value.teacherReference) &&
        positiveInteger(value.expectedVersion) &&
        nonEmptyString(value.sourceName)
      );
    case 'assignment-register':
      return (
        hasOnlyKeys(value, [
          'maintenanceVersion',
          'operation',
          'academicYearId',
          'teacherReference',
          'classGroupReference',
          'subjectReference',
          'effectivePeriod',
        ]) &&
        nonEmptyString(value.teacherReference) &&
        nonEmptyString(value.classGroupReference) &&
        nonEmptyString(value.subjectReference) &&
        validEffectivePeriod(value.effectivePeriod)
      );
    case 'assignment-confirm':
      return (
        hasOnlyKeys(value, [
          'maintenanceVersion',
          'operation',
          'academicYearId',
          'assignmentReference',
          'expectedVersion',
        ]) &&
        nonEmptyString(value.assignmentReference) &&
        positiveInteger(value.expectedVersion)
      );
    default:
      return false;
  }
}

function unavailable(): TeacherMaintenanceUnavailableV1 {
  return { maintenanceVersion: TEACHER_ASSIGNMENT_MAINTENANCE_VERSION_V1, state: 'unavailable' };
}

function notFound(target: TeacherMaintenanceNotFoundV1['target']): TeacherMaintenanceNotFoundV1 {
  return {
    maintenanceVersion: TEACHER_ASSIGNMENT_MAINTENANCE_VERSION_V1,
    state: 'not-found',
    target,
  };
}

function conflict(currentVersion: number | null): TeacherMaintenanceVersionConflictV1 {
  return {
    maintenanceVersion: TEACHER_ASSIGNMENT_MAINTENANCE_VERSION_V1,
    state: 'version-conflict',
    currentVersion,
  };
}

function contextFor(academicYearId: AcademicYearId): AcademicPersistenceContextV1 {
  return { academicYearId };
}

type EntityRecordOf<Kind extends AcademicEntityKindV1> = Extract<
  AcademicEntityRecordV1,
  { readonly kind: Kind }
>;
type VersionedEntityRecordOf<Kind extends AcademicEntityKindV1> = VersionedRecordV1<
  EntityRecordOf<Kind>
>;

function requireKind<Kind extends AcademicEntityKindV1>(
  record: VersionedRecordV1<AcademicEntityRecordV1> | null,
  kind: Kind,
): VersionedEntityRecordOf<Kind> | null {
  if (record === null) return null;
  return record.value.kind === kind ? (record as VersionedEntityRecordOf<Kind>) : null;
}

async function academicYearExists(
  repository: AcademicEntityRepositoryV1,
  context: AcademicPersistenceContextV1,
): Promise<boolean> {
  const record = await repository.get(context, {
    kind: 'academic-year',
    id: context.academicYearId,
  });
  return record !== null && record.value.kind === 'academic-year';
}

async function getEntity<Kind extends AcademicEntityKindV1>(
  repository: AcademicEntityRepositoryV1,
  context: AcademicPersistenceContextV1,
  kind: Kind,
  id: EntityRecordOf<Kind>['value']['id'],
): Promise<VersionedEntityRecordOf<Kind> | null> {
  return requireKind(
    await repository.get(context, { kind, id } as Parameters<AcademicEntityRepositoryV1['get']>[1]),
    kind,
  );
}

function cleanEffectivePeriod(value: EffectivePeriodV1): EffectivePeriodV1 {
  return {
    ...(value.startsOn === undefined ? {} : { startsOn: value.startsOn.trim() }),
    ...(value.endsOn === undefined ? {} : { endsOn: value.endsOn.trim() }),
  };
}

export function createTeacherAssignmentMaintenanceV1(
  dependencies: TeacherAssignmentMaintenanceDependenciesV1,
) {
  return {
    async execute(
      request: TeacherAssignmentMaintenanceRequestV1,
    ): Promise<TeacherAssignmentMaintenanceResponseV1> {
      const context = contextFor(request.academicYearId);
      if (!(await academicYearExists(dependencies.entities, context))) {
        return notFound('academic-year');
      }

      if (request.operation === 'teacher-state') {
        const model = await dependencies.teachers.get(context, request.teacherReference);
        if (model === null) return notFound('teacher');
        if (
          model.academicYearId !== request.academicYearId ||
          model.teacher.value.id !== request.teacherReference
        ) {
          return unavailable();
        }
        return {
          maintenanceVersion: TEACHER_ASSIGNMENT_MAINTENANCE_VERSION_V1,
          state: 'ready',
          academicYearId: request.academicYearId,
          teacher: {
            reference: model.teacher.value.id,
            displayName: model.teacher.value.displayName,
            status: model.teacher.value.status,
            sourceNames: [...model.teacher.value.sourceNames],
            currentVersion: model.teacher.version,
          },
          assignments: model.assignments.map((entry) => ({
            reference: entry.assignment.value.id,
            currentVersion: entry.assignment.version,
            confirmationOrigin: entry.assignment.value.confirmationOrigin,
            effectivePeriod: { ...entry.assignment.value.effectivePeriod },
            classGroup:
              entry.classGroup === null
                ? null
                : {
                    reference: entry.classGroup.value.id,
                    label: entry.classGroup.value.code,
                  },
            subject:
              entry.subject === null
                ? null
                : {
                    reference: entry.subject.value.id,
                    label: entry.subject.value.displayName,
                  },
          })),
        };
      }

      if (request.operation === 'teacher-register') {
        const id = dependencies.createTeacherId();
        const result = await dependencies.entities.appendVersion(
          context,
          {
            kind: 'teacher',
            value: {
              id,
              displayName: request.displayName.trim(),
              sourceNames: [],
              status: 'active',
            },
          },
          { expectedVersion: null },
        );
        if (result.status === 'version-conflict') return conflict(result.currentVersion);
        if (result.record.value.kind !== 'teacher' || result.record.value.value.id !== id) {
          return unavailable();
        }
        return {
          maintenanceVersion: TEACHER_ASSIGNMENT_MAINTENANCE_VERSION_V1,
          state: 'written',
          entity: 'teacher',
          reference: id,
          currentVersion: result.record.version,
          change: 'teacher-registered',
        };
      }

      if (request.operation === 'teacher-confirm-source-name') {
        const current = await getEntity(
          dependencies.entities,
          context,
          'teacher',
          request.teacherReference,
        );
        if (current === null) return notFound('teacher');
        if (current.version !== request.expectedVersion) return conflict(current.version);
        const sourceName = request.sourceName.trim();
        if (current.value.value.sourceNames.includes(sourceName)) {
          return {
            maintenanceVersion: TEACHER_ASSIGNMENT_MAINTENANCE_VERSION_V1,
            state: 'unchanged',
            entity: 'teacher',
            reference: request.teacherReference,
            currentVersion: current.version,
          };
        }
        const result = await dependencies.entities.appendVersion(
          context,
          {
            kind: 'teacher',
            value: {
              ...current.value.value,
              sourceNames: [...current.value.value.sourceNames, sourceName],
            },
          },
          { expectedVersion: request.expectedVersion },
        );
        if (result.status === 'version-conflict') return conflict(result.currentVersion);
        return {
          maintenanceVersion: TEACHER_ASSIGNMENT_MAINTENANCE_VERSION_V1,
          state: 'written',
          entity: 'teacher',
          reference: request.teacherReference,
          currentVersion: result.record.version,
          change: 'teacher-source-name-confirmed',
        };
      }

      if (request.operation === 'assignment-register') {
        const [teacher, classGroup, subject] = await Promise.all([
          getEntity(dependencies.entities, context, 'teacher', request.teacherReference),
          getEntity(dependencies.entities, context, 'class-group', request.classGroupReference),
          getEntity(dependencies.entities, context, 'subject', request.subjectReference),
        ]);
        if (teacher === null) return notFound('teacher');
        if (classGroup === null) return notFound('class-group');
        if (subject === null) return notFound('subject');
        if (classGroup.value.value.academicYearId !== request.academicYearId) return unavailable();

        const id = dependencies.createTeachingAssignmentId();
        const result = await dependencies.entities.appendVersion(
          context,
          {
            kind: 'teaching-assignment',
            value: {
              id,
              academicYearId: request.academicYearId,
              teacherId: request.teacherReference,
              classGroupId: request.classGroupReference,
              subjectId: request.subjectReference,
              effectivePeriod: cleanEffectivePeriod(request.effectivePeriod),
              confirmationOrigin: 'administrative',
            },
          },
          { expectedVersion: null },
        );
        if (result.status === 'version-conflict') return conflict(result.currentVersion);
        if (
          result.record.value.kind !== 'teaching-assignment' ||
          result.record.value.value.id !== id
        ) {
          return unavailable();
        }
        return {
          maintenanceVersion: TEACHER_ASSIGNMENT_MAINTENANCE_VERSION_V1,
          state: 'written',
          entity: 'teaching-assignment',
          reference: id,
          currentVersion: result.record.version,
          change: 'assignment-registered',
        };
      }

      const current = await getEntity(
        dependencies.entities,
        context,
        'teaching-assignment',
        request.assignmentReference,
      );
      if (current === null) return notFound('teaching-assignment');
      if (current.value.value.academicYearId !== request.academicYearId) return unavailable();
      if (current.version !== request.expectedVersion) return conflict(current.version);
      if (current.value.value.confirmationOrigin !== 'imported-source') {
        return {
          maintenanceVersion: TEACHER_ASSIGNMENT_MAINTENANCE_VERSION_V1,
          state: 'unchanged',
          entity: 'teaching-assignment',
          reference: request.assignmentReference,
          currentVersion: current.version,
        };
      }
      const result = await dependencies.entities.appendVersion(
        context,
        {
          kind: 'teaching-assignment',
          value: {
            ...current.value.value,
            confirmationOrigin: 'user-confirmed',
          },
        },
        { expectedVersion: request.expectedVersion },
      );
      if (result.status === 'version-conflict') return conflict(result.currentVersion);
      return {
        maintenanceVersion: TEACHER_ASSIGNMENT_MAINTENANCE_VERSION_V1,
        state: 'written',
        entity: 'teaching-assignment',
        reference: request.assignmentReference,
        currentVersion: result.record.version,
        change: 'assignment-confirmed',
      };
    },
  };
}
