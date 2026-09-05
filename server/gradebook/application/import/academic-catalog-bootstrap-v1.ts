import type {
  ClassGroupId,
  ClassGroupV1,
  EnrollmentId,
  EnrollmentV1,
  StudentId,
  StudentV1,
  SubjectId,
  SubjectV1,
  TeacherId,
  TeacherV1,
  TeachingAssignmentId,
  TeachingAssignmentV1,
} from '../../../../shared/gradebook-contracts/entities';
import type { GradebookImportPersistenceRequestV4 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v4';
import type {
  GradebookImportPersistenceRequestV5,
  GradebookImportSourceStudentV5,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v5';
import type {
  AcademicEntityKindV1,
  AcademicEntityRecordV1,
  AcademicEntityRepositoryV1,
  AcademicPersistenceContextV1,
  VersionedRecordV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type { PersistenceUnitOfWorkV2 } from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';

export type AcademicCatalogBootstrapResultV1 =
  | {
      readonly status: 'ready';
      readonly request: GradebookImportPersistenceRequestV4;
      readonly records: readonly AcademicEntityRecordV1[];
      readonly repository: AcademicEntityRepositoryV1;
      readonly plannedAssignments: readonly TeachingAssignmentV1[];
    }
  | {
      readonly status: 'review-required';
      readonly reason:
        | 'academic-year-unavailable'
        | 'academic-year-mismatch'
        | 'missing-trimester-roster'
        | 'divergent-trimester-roster'
        | 'divergent-class-roster'
        | 'unknown-recovery-student'
        | 'ambiguous-catalog-match'
        | 'enrollment-roster-conflict'
        | 'catalog-too-large';
    };

type EntityRecord<K extends AcademicEntityRecordV1['kind']> = Extract<
  AcademicEntityRecordV1,
  { readonly kind: K }
>;

const KINDS = [
  'teacher',
  'class-group',
  'subject',
  'teaching-assignment',
  'student',
  'enrollment',
] as const satisfies readonly AcademicEntityKindV1[];

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toUpperCase();

const rosterKey = (student: GradebookImportSourceStudentV5) =>
  `${student.position}:${normalize(student.label)}`;

async function opaqueId(prefix: string, parts: readonly (string | number)[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([prefix, ...parts]));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `${prefix}:${Array.from(digest.slice(0, 18), (value) => value.toString(16).padStart(2, '0')).join('')}`;
}

async function listKind<K extends (typeof KINDS)[number]>(
  repository: AcademicEntityRepositoryV1,
  context: AcademicPersistenceContextV1,
  kind: K,
): Promise<readonly VersionedRecordV1<EntityRecord<K>>[] | null> {
  const values: VersionedRecordV1<EntityRecord<K>>[] = [];
  let cursor: string | null = null;
  const seen = new Set<string>();
  for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
    const page = await repository.list(context, kind, { limit: 100, cursor });
    for (const entry of page.items) {
      if (entry.value.kind !== kind) return null;
      values.push(entry as VersionedRecordV1<EntityRecord<K>>);
    }
    if (page.nextCursor === null) return values;
    if (seen.has(page.nextCursor)) return null;
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  return null;
}

function unique<T>(values: readonly T[]): T | null | 'ambiguous' {
  return values.length === 0 ? null : values.length === 1 ? values[0]! : 'ambiguous';
}

function gradeAndSection(label: string): Pick<ClassGroupV1, 'grade' | 'section'> {
  const compact = label.trim().replace(/\s+/gu, ' ');
  const parts = compact.split(' ');
  return { grade: compact, section: parts.at(-1) ?? compact };
}

function overlayRepository(
  base: AcademicEntityRepositoryV1,
  academicYearId: AcademicPersistenceContextV1['academicYearId'],
  cached: readonly VersionedRecordV1<AcademicEntityRecordV1>[],
  planned: readonly AcademicEntityRecordV1[],
): AcademicEntityRepositoryV1 {
  const cachedByKey = new Map(
    cached.map((entry) => [`${entry.value.kind}:${entry.value.value.id}`, entry]),
  );
  const plannedByKey = new Map(
    planned.map((record) => [`${record.kind}:${record.value.id}`, record]),
  );
  return {
    async get(context, reference) {
      if (context.academicYearId === academicYearId) {
        const plannedRecord = plannedByKey.get(`${reference.kind}:${reference.id}`);
        if (plannedRecord) {
          return { value: plannedRecord, version: 1, recordedAt: '1970-01-01T00:00:00.000Z' };
        }
        const cachedRecord = cachedByKey.get(`${reference.kind}:${reference.id}`);
        if (cachedRecord) return cachedRecord;
      }
      return base.get(context, reference);
    },
    async list(context, kind, page) {
      if (page.cursor !== null && page.cursor !== undefined) return base.list(context, kind, page);
      const existing = await base.list(context, kind, page);
      const ids = new Set(existing.items.map((entry) => entry.value.value.id));
      const appended = planned
        .filter((record) => record.kind === kind && !ids.has(record.value.id))
        .map((record) => ({ value: record, version: 1, recordedAt: '1970-01-01T00:00:00.000Z' }));
      return { items: [...existing.items, ...appended], nextCursor: existing.nextCursor };
    },
    appendVersion: base.appendVersion,
  };
}

export async function planAcademicCatalogBootstrapV1(input: {
  readonly request: GradebookImportPersistenceRequestV5;
  readonly unitOfWork: Pick<PersistenceUnitOfWorkV2, 'entities'>;
}): Promise<AcademicCatalogBootstrapResultV1> {
  const { request } = input;
  const academicYearId = request.confirmedContext.academicYearId;
  const context = { academicYearId } satisfies AcademicPersistenceContextV1;
  const yearRecord = await input.unitOfWork.entities.get(context, {
    kind: 'academic-year',
    id: academicYearId,
  });
  if (
    !yearRecord ||
    yearRecord.value.kind !== 'academic-year' ||
    yearRecord.value.value.status !== 'active'
  ) {
    return { status: 'review-required', reason: 'academic-year-unavailable' };
  }
  if (yearRecord.value.value.year !== request.recognizedSuggestions.academicYear) {
    return { status: 'review-required', reason: 'academic-year-mismatch' };
  }

  const listed = await Promise.all(
    KINDS.map(
      async (kind) => [kind, await listKind(input.unitOfWork.entities, context, kind)] as const,
    ),
  );
  if (listed.some(([, records]) => records === null)) {
    return { status: 'review-required', reason: 'catalog-too-large' };
  }
  const catalog = new Map(listed.map(([kind, records]) => [kind, records ?? []]));
  const values = <K extends (typeof KINDS)[number]>(kind: K) =>
    (catalog.get(kind) ?? []) as readonly VersionedRecordV1<EntityRecord<K>>[];
  const cachedRecords: VersionedRecordV1<AcademicEntityRecordV1>[] = [
    yearRecord as VersionedRecordV1<AcademicEntityRecordV1>,
  ];
  for (const [, records] of listed) {
    if (records) {
      cachedRecords.push(...(records as readonly VersionedRecordV1<AcademicEntityRecordV1>[]));
    }
  }

  const termGroups = new Map<
    string,
    Extract<(typeof request.sheets)[number], { kind: 'term' }>[]
  >();
  for (const sheet of request.sheets) {
    if (sheet.kind !== 'term') continue;
    const key = JSON.stringify([
      normalize(sheet.recognizedContext.classGroupLabel),
      normalize(sheet.recognizedContext.subjectLabel),
      sheet.recognizedContext.disciplineIndex,
    ]);
    const group = termGroups.get(key) ?? [];
    group.push(sheet);
    termGroups.set(key, group);
  }
  if (termGroups.size === 0)
    return { status: 'review-required', reason: 'missing-trimester-roster' };

  const classRosters = new Map<string, readonly GradebookImportSourceStudentV5[]>();
  for (const sheets of termGroups.values()) {
    const byTerm = new Map(sheets.map((sheet) => [sheet.term, sheet]));
    if (
      sheets.length !== 3 ||
      byTerm.size !== 3 ||
      !byTerm.has(1) ||
      !byTerm.has(2) ||
      !byTerm.has(3)
    ) {
      return { status: 'review-required', reason: 'missing-trimester-roster' };
    }
    const official = byTerm.get(1)!.students.map((student) => student.sourceStudent);
    if (new Set(official.map((student) => student.position)).size !== official.length) {
      return { status: 'review-required', reason: 'divergent-trimester-roster' };
    }
    const signature = JSON.stringify(official.map(rosterKey));
    if (
      JSON.stringify(byTerm.get(2)!.students.map((student) => rosterKey(student.sourceStudent))) !==
        signature ||
      JSON.stringify(byTerm.get(3)!.students.map((student) => rosterKey(student.sourceStudent))) !==
        signature
    ) {
      return { status: 'review-required', reason: 'divergent-trimester-roster' };
    }
    const classKey = normalize(byTerm.get(1)!.recognizedContext.classGroupLabel);
    const known = classRosters.get(classKey);
    if (known && JSON.stringify(known.map(rosterKey)) !== signature) {
      return { status: 'review-required', reason: 'divergent-class-roster' };
    }
    classRosters.set(classKey, official);
  }

  const planned: AcademicEntityRecordV1[] = [];
  const teacherName = request.recognizedSuggestions.teacherName.trim();
  const teacherMatch = unique(
    values('teacher').filter(({ value }) => {
      const teacher = value.value;
      return [teacher.displayName, ...teacher.sourceNames].some(
        (name) => normalize(name) === normalize(teacherName),
      );
    }),
  );
  if (teacherMatch === 'ambiguous')
    return { status: 'review-required', reason: 'ambiguous-catalog-match' };
  let teacher: TeacherV1;
  if (teacherMatch) teacher = teacherMatch.value.value;
  else {
    teacher = {
      id: (await opaqueId('teacher', [normalize(teacherName)])) as TeacherId,
      displayName: teacherName,
      sourceNames: [teacherName],
      status: 'active',
    };
    planned.push({ kind: 'teacher', value: teacher });
  }

  const classes = new Map<string, ClassGroupV1>();
  const subjects = new Map<string, SubjectV1>();
  const rosterReferences = new Map<string, { studentId: StudentId; enrollmentId: EnrollmentId }>();
  const rosterReferencesByName = new Map<
    string,
    { studentId: StudentId; enrollmentId: EnrollmentId } | null
  >();
  const existingEnrollments = values('enrollment').map(({ value }) => value.value);
  const existingStudents = new Map(
    values('student').map(({ value }) => [value.value.id, value.value]),
  );

  for (const [classKey, roster] of classRosters) {
    const label = request.sheets
      .find((sheet) => normalize(sheet.recognizedContext.classGroupLabel) === classKey)!
      .recognizedContext.classGroupLabel.trim();
    const classMatch = unique(
      values('class-group').filter(
        ({ value }) =>
          value.value.academicYearId === academicYearId && normalize(value.value.code) === classKey,
      ),
    );
    if (classMatch === 'ambiguous')
      return { status: 'review-required', reason: 'ambiguous-catalog-match' };
    let classGroup: ClassGroupV1;
    if (classMatch) classGroup = classMatch.value.value;
    else {
      classGroup = {
        id: (await opaqueId('class-group', [academicYearId, classKey])) as ClassGroupId,
        academicYearId,
        code: label,
        ...gradeAndSection(label),
      };
      planned.push({ kind: 'class-group', value: classGroup });
    }
    classes.set(classKey, classGroup);

    for (const sourceStudent of roster) {
      const matches = existingEnrollments.filter(
        (enrollment) =>
          enrollment.academicYearId === academicYearId &&
          enrollment.classGroupId === classGroup.id &&
          enrollment.sourcePosition === sourceStudent.position &&
          enrollment.position === 'current',
      );
      const match = unique(matches);
      if (match === 'ambiguous')
        return { status: 'review-required', reason: 'ambiguous-catalog-match' };
      let student: StudentV1;
      let enrollment: EnrollmentV1;
      if (match) {
        const knownStudent = existingStudents.get(match.studentId);
        if (
          !knownStudent ||
          normalize(knownStudent.displayName) !== normalize(sourceStudent.label)
        ) {
          return { status: 'review-required', reason: 'enrollment-roster-conflict' };
        }
        student = knownStudent;
        enrollment = match;
      } else {
        const identity = [
          academicYearId,
          classGroup.id,
          sourceStudent.position,
          normalize(sourceStudent.label),
        ];
        student = {
          id: (await opaqueId('student', identity)) as StudentId,
          displayName: sourceStudent.label.trim(),
          sourceNames: [sourceStudent.label.trim()],
          sourceIdentityMarks: [`${academicYearId}:${classGroup.id}:${sourceStudent.position}`],
        };
        enrollment = {
          id: (await opaqueId('enrollment', identity)) as EnrollmentId,
          academicYearId,
          studentId: student.id,
          classGroupId: classGroup.id,
          effectivePeriod: {},
          position: 'current',
          sourcePosition: sourceStudent.position,
        };
        planned.push(
          { kind: 'student', value: student },
          { kind: 'enrollment', value: enrollment },
        );
        existingStudents.set(student.id, student);
        existingEnrollments.push(enrollment);
      }
      rosterReferences.set(`${classKey}:${rosterKey(sourceStudent)}`, {
        studentId: student.id,
        enrollmentId: enrollment.id,
      });
      const nameKey = `${classKey}:${normalize(sourceStudent.label)}`;
      rosterReferencesByName.set(
        nameKey,
        rosterReferencesByName.has(nameKey)
          ? null
          : { studentId: student.id, enrollmentId: enrollment.id },
      );
    }
  }

  const assignments = new Map<string, TeachingAssignmentV1>();
  for (const sheet of request.sheets) {
    const classKey = normalize(sheet.recognizedContext.classGroupLabel);
    const classGroup = classes.get(classKey);
    if (!classGroup) return { status: 'review-required', reason: 'unknown-recovery-student' };
    const subjectKey = normalize(sheet.recognizedContext.subjectLabel);
    let subject = subjects.get(subjectKey);
    if (!subject) {
      const subjectMatch = unique(
        values('subject').filter(
          ({ value }) =>
            normalize(value.value.code) === subjectKey ||
            normalize(value.value.displayName) === subjectKey,
        ),
      );
      if (subjectMatch === 'ambiguous')
        return { status: 'review-required', reason: 'ambiguous-catalog-match' };
      subject = subjectMatch?.value.value ?? {
        id: (await opaqueId('subject', [subjectKey])) as SubjectId,
        code: sheet.recognizedContext.subjectLabel.trim(),
        displayName: sheet.recognizedContext.subjectLabel.trim(),
        shortName: sheet.recognizedContext.subjectLabel.trim().slice(0, 64),
        status: 'active',
      };
      if (!subjectMatch) planned.push({ kind: 'subject', value: subject });
      subjects.set(subjectKey, subject);
    }
    const assignmentKey = JSON.stringify([
      classGroup.id,
      subject.id,
      sheet.recognizedContext.disciplineIndex,
    ]);
    let assignment = assignments.get(assignmentKey);
    if (!assignment) {
      const assignmentMatch = unique(
        values('teaching-assignment').filter(
          ({ value }) =>
            value.value.academicYearId === academicYearId &&
            value.value.teacherId === teacher.id &&
            value.value.classGroupId === classGroup.id &&
            value.value.subjectId === subject!.id &&
            value.value.sourceDisciplineIndex === sheet.recognizedContext.disciplineIndex,
        ),
      );
      if (assignmentMatch === 'ambiguous')
        return { status: 'review-required', reason: 'ambiguous-catalog-match' };
      assignment = assignmentMatch?.value.value ?? {
        id: (await opaqueId('teaching-assignment', [
          academicYearId,
          teacher.id,
          classGroup.id,
          subject.id,
          sheet.recognizedContext.disciplineIndex,
        ])) as TeachingAssignmentId,
        academicYearId,
        teacherId: teacher.id,
        classGroupId: classGroup.id,
        subjectId: subject.id,
        sourceDisciplineIndex: sheet.recognizedContext.disciplineIndex,
        effectivePeriod: {},
        confirmationOrigin: 'imported-source',
      };
      if (!assignmentMatch) planned.push({ kind: 'teaching-assignment', value: assignment });
      assignments.set(assignmentKey, assignment);
    }
  }

  const convertedSheets: GradebookImportPersistenceRequestV4['sheets'][number][] = [];
  for (const sheet of request.sheets) {
    const classKey = normalize(sheet.recognizedContext.classGroupLabel);
    const subjectKey = normalize(sheet.recognizedContext.subjectLabel);
    const classGroup = classes.get(classKey)!;
    const subject = subjects.get(subjectKey)!;
    const assignment = assignments.get(
      JSON.stringify([classGroup.id, subject.id, sheet.recognizedContext.disciplineIndex]),
    )!;
    const students = [];
    for (const observed of sheet.students) {
      const reference =
        sheet.kind === 'recovery'
          ? rosterReferencesByName.get(`${classKey}:${normalize(observed.sourceStudent.label)}`)
          : rosterReferences.get(`${classKey}:${rosterKey(observed.sourceStudent)}`);
      if (!reference) return { status: 'review-required', reason: 'unknown-recovery-student' };
      const { sourceStudent: _sourceStudent, ...rest } = observed;
      void _sourceStudent;
      students.push({ ...rest, confirmedStudent: reference });
    }
    convertedSheets.push({
      ...sheet,
      teachingAssignmentId: assignment.id,
      students,
    } as GradebookImportPersistenceRequestV4['sheets'][number]);
  }
  const converted: GradebookImportPersistenceRequestV4 = {
    ...request,
    transportVersion: 4,
    recognizedSuggestions: request.recognizedSuggestions,
    sheets: convertedSheets,
  };
  return {
    status: 'ready',
    request: converted,
    records: planned,
    repository: overlayRepository(
      input.unitOfWork.entities,
      academicYearId,
      cachedRecords,
      planned,
    ),
    plannedAssignments: planned.flatMap((record) =>
      record.kind === 'teaching-assignment' ? [record.value] : [],
    ),
  };
}
