import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeEnv } from '../../../../server/env';
import {
  academicRecordStreamKeyV1,
  logicalSourceRecordAssociationStreamForV1,
} from '../../../../server/gradebook/application/import/import-reconciliation-v1';
import { createGradebookD1PersistenceUnitOfWorkV1 } from '../../../../server/gradebook/persistence/d1/composition/d1-persistence-unit-of-work-v1';
import { authorizeGradebookD1RuntimeV1 } from '../../../../server/gradebook/persistence/d1/runtime/d1-runtime-authorization-v1';
import {
  createGradebookD1RuntimeV1,
  GradebookD1RuntimeErrorV1,
} from '../../../../server/gradebook/persistence/d1/runtime/d1-runtime-v1';
import type {
  AuditOccurrenceId,
  ReconciliationResultId,
} from '../../../../shared/gradebook-contracts/audit/audit-contract-v1';
import type {
  ClassGroupId,
  SchoolId,
  StudentStatusEventId,
  SubjectId,
  TeacherId,
  TeachingAssignmentId,
} from '../../../../shared/gradebook-contracts/entities';
import type { ImportBatchResultV1 } from '../../../../shared/gradebook-contracts/imports/import-contract-v1';
import { ACADEMIC_CONTEXT_2026_IDENTITY_V1 } from '../../../../src/gradebook-domain/context/academic-context-2026-v1';
import type {
  AcademicEntityRecordV1,
  AuditRecordV1,
  LogicalSourceRecordAssociationV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  academicYearId,
  assessmentComponentId,
  context,
  enrollmentId,
  gradeRecord,
  gradeStream,
  importBatchId,
  importFileId,
  instant,
  logicalSourceId,
  openMigratedDatabase,
  sourceFileVersion,
  studentId,
  type SqliteD1Database,
} from '../d1-transaction/d1-write-test-support';

const schoolId = 'school:d1-composition:001' as SchoolId;
const teacherId = 'teacher:d1-composition:001' as TeacherId;
const classGroupId = 'class-group:d1-composition:001' as ClassGroupId;
const subjectId = 'subject:d1-composition:001' as SubjectId;
const assignmentId = 'teaching-assignment:d1-composition:001' as TeachingAssignmentId;
const statusEventId = 'student-status-event:d1-composition:001' as StudentStatusEventId;
const occurrenceId = 'audit-occurrence:d1-composition:001' as AuditOccurrenceId;
const reconciliationId = 'reconciliation:d1-composition:001' as ReconciliationResultId;

let database: SqliteD1Database;

beforeEach(async () => {
  database = await openMigratedDatabase();
});

afterEach(() => {
  database.raw.close();
});

function academicYear(): AcademicEntityRecordV1 {
  return {
    kind: 'academic-year',
    value: {
      id: academicYearId,
      schoolId,
      year: ACADEMIC_CONTEXT_2026_IDENTITY_V1.academicYear,
      status: 'active',
      startsOn: '2026-02-01',
      endsOn: '2026-12-20',
      activeEvaluationProfileId: ACADEMIC_CONTEXT_2026_IDENTITY_V1.evaluationProfileId,
      configurationVersion: String(ACADEMIC_CONTEXT_2026_IDENTITY_V1.configurationVersion),
    },
  };
}

function academicEntities(): readonly AcademicEntityRecordV1[] {
  return [
    {
      kind: 'teacher',
      value: {
        id: teacherId,
        displayName: 'Docente Sintético da Composição',
        sourceNames: ['DOCENTE SINTÉTICO DA COMPOSIÇÃO'],
        status: 'active',
      },
    },
    {
      kind: 'class-group',
      value: {
        id: classGroupId,
        academicYearId,
        code: '6S',
        grade: '6',
        section: 'S',
        shift: 'morning',
      },
    },
    {
      kind: 'subject',
      value: {
        id: subjectId,
        code: 'SYN-COMP',
        displayName: 'Componente Sintético da Composição',
        shortName: 'CSC',
        status: 'active',
      },
    },
    {
      kind: 'teaching-assignment',
      value: {
        id: assignmentId,
        academicYearId,
        teacherId,
        classGroupId,
        subjectId,
        sourceDisciplineIndex: 'D1',
        effectivePeriod: { startsOn: '2026-02-01', endsOn: '2026-12-20' },
        confirmationOrigin: 'imported-source',
      },
    },
    {
      kind: 'student',
      value: {
        id: studentId,
        displayName: 'Estudante Sintético da Composição',
        sourceNames: ['ESTUDANTE SINTÉTICO DA COMPOSIÇÃO'],
        sourceIdentityMarks: ['synthetic-position:1'],
      },
    },
    {
      kind: 'enrollment',
      value: {
        id: enrollmentId,
        academicYearId,
        studentId,
        classGroupId,
        effectivePeriod: { startsOn: '2026-02-01' },
        position: 'current',
        sourcePosition: 1,
      },
    },
    {
      kind: 'student-status-event',
      value: {
        id: statusEventId,
        academicYearId,
        enrollmentId,
        status: 'active',
        sourceText: 'SITUAÇÃO SINTÉTICA ATIVA',
        occurredOn: '2026-02-01',
        sourceReference: 'synthetic-composition-source',
      },
    },
    {
      kind: 'assessment-component',
      value: {
        id: assessmentComponentId,
        academicYearId,
        teachingAssignmentId: assignmentId,
        term: 1,
        type: 'written',
        name: 'Avaliação Sintética da Composição',
        maximum: 10,
        order: 1,
        applicability: { state: 'applicable' },
      },
    },
  ];
}

function approvedBatch(source = sourceFileVersion()): ImportBatchResultV1 {
  return {
    id: importBatchId,
    status: 'approved',
    files: [
      {
        id: importFileId,
        sourceFile: {
          fileName: source.manifest.fileName,
          extension: source.manifest.extension,
          reportedMimeType: source.manifest.reportedMimeType,
          sizeBytes: source.manifest.sizeBytes,
          lastModifiedAt: source.manifest.lastModifiedAt,
        },
        manifest: source.manifest,
        status: 'approved',
        diagnosticIds: [],
      },
    ],
    diagnostics: [],
    receivedAt: instant,
    updatedAt: instant,
    summary: {
      totalFileCount: 1,
      processedFileCount: 1,
      approvedFileCount: 1,
      reviewRequiredFileCount: 0,
      rejectedFileCount: 0,
      failedFileCount: 0,
      informationCount: 0,
      warningCount: 0,
      blockingErrorCount: 0,
      criticalErrorCount: 0,
    },
  };
}

describe('composição D1 local da PersistenceUnitOfWorkV1', () => {
  it('expõe todas as famílias por uma única UoW sem duplicar o ano acadêmico oficial', async () => {
    const unit = createGradebookD1PersistenceUnitOfWorkV1(database, { now: () => instant });
    await expect(
      unit.entities.appendVersion(context, academicYear(), { expectedVersion: null }),
    ).resolves.toMatchObject({ status: 'written', record: { version: 1 } });
    for (const entity of academicEntities()) {
      await expect(
        unit.entities.appendVersion(context, entity, { expectedVersion: null }),
      ).resolves.toMatchObject({ status: 'written', record: { value: entity, version: 1 } });
    }
    await expect(
      unit.entities.list(context, 'academic-year', { limit: 10 }),
    ).resolves.toMatchObject({
      items: [{ value: academicYear(), version: 1 }],
      nextCursor: null,
    });
    await expect(unit.entities.list(context, 'student', { limit: 10 })).resolves.toMatchObject({
      items: [{ value: academicEntities()[4], version: 1 }],
      nextCursor: null,
    });
    await expect(
      unit.entities.get(context, { kind: 'student', id: studentId }),
    ).resolves.toMatchObject({ value: academicEntities()[4], version: 1 });

    database.raw
      .prepare(
        `INSERT INTO logical_sources (
           academic_year_id, logical_source_id, teacher_ref_kind, teacher_id,
           class_group_ref_kind, class_group_id, subject_ref_kind, subject_id,
           source_context, created_at
         ) VALUES (?, ?, 'teacher', ?, 'class-group', ?, 'subject', ?, ?, ?)`,
      )
      .run(
        academicYearId,
        logicalSourceId,
        teacherId,
        classGroupId,
        subjectId,
        'synthetic-composition-context',
        instant,
      );

    const sourceV1 = sourceFileVersion('a', 'synthetic-gradebook.xlsx');
    const sourceV2 = sourceFileVersion('a', 'synthetic-gradebook-renamed.xlsx');
    await unit.imports.appendSourceFileVersion(context, sourceV1, { expectedVersion: null });
    await unit.imports.appendSourceFileVersion(context, sourceV2, { expectedVersion: 1 });
    await expect(
      unit.imports.listLogicalSourceVersions(context, logicalSourceId, { limit: 10 }),
    ).resolves.toMatchObject({
      items: [{ version: 1 }, { version: 2 }],
      nextCursor: null,
    });
    await expect(
      unit.imports.findSourceFileByHash(context, sourceV2.manifest.sha256),
    ).resolves.toMatchObject({ value: sourceV2, version: 2 });
    await expect(
      unit.imports.getSourceFileVersion(context, sourceV2.manifest.id),
    ).resolves.toMatchObject({ value: sourceV2, version: 2 });
    const batch = approvedBatch(sourceV1);
    await expect(
      unit.imports.appendImportBatchVersion(context, batch, { expectedVersion: null }),
    ).resolves.toMatchObject({ status: 'written', record: { value: batch, version: 1 } });
    await expect(unit.imports.getImportBatch(context, importBatchId)).resolves.toMatchObject({
      value: batch,
      version: 1,
    });

    const recordV1 = gradeRecord(8);
    const recordV2 = gradeRecord(9, '002');
    await unit.academicRecords.appendVersion(context, gradeStream, recordV1, {
      expectedVersion: null,
    });
    await unit.academicRecords.appendVersion(context, gradeStream, recordV2, {
      expectedVersion: 1,
    });
    const recordPage1 = await unit.academicRecords.listVersions(context, gradeStream, {
      limit: 1,
    });
    const recordPage2 = await unit.academicRecords.listVersions(context, gradeStream, {
      limit: 1,
      cursor: recordPage1.nextCursor,
    });
    expect([...recordPage1.items, ...recordPage2.items]).toMatchObject([
      { value: recordV1, version: 1 },
      { value: recordV2, version: 2 },
    ]);
    await expect(unit.academicRecords.getCurrent(context, gradeStream)).resolves.toMatchObject({
      value: recordV2,
      version: 2,
    });

    const associationStream = logicalSourceRecordAssociationStreamForV1(
      logicalSourceId,
      gradeStream,
    );
    const association = (sourceManifestVersion: number): LogicalSourceRecordAssociationV1 => ({
      academicYearId,
      logicalSourceId,
      academicRecordStream: gradeStream,
      stableKey: academicRecordStreamKeyV1(gradeStream),
      state: 'active',
      sourceManifestId: sourceV1.manifest.id,
      sourceManifestVersion,
    });
    await unit.logicalSourceRecords.appendVersion(context, associationStream, association(1), {
      expectedVersion: null,
    });
    await unit.logicalSourceRecords.appendVersion(context, associationStream, association(2), {
      expectedVersion: 1,
    });
    await expect(
      unit.logicalSourceRecords.listVersions(context, associationStream, { limit: 10 }),
    ).resolves.toMatchObject({
      items: [
        { value: association(1), version: 1 },
        { value: association(2), version: 2 },
      ],
      nextCursor: null,
    });
    await expect(
      unit.logicalSourceRecords.getCurrent(context, associationStream),
    ).resolves.toMatchObject({ value: association(2), version: 2 });
    await expect(
      unit.logicalSourceRecords.listCurrentStreams(context, logicalSourceId),
    ).resolves.toEqual([gradeStream]);

    const occurrence = {
      kind: 'occurrence',
      value: {
        id: occurrenceId,
        severity: 'warning',
        category: 'synthetic-composition',
        message: 'Ocorrência sintética da composição.',
        recommendedAction: 'Conferir somente a evidência sintética.',
        createdAt: instant,
        state: 'open',
        stateHistory: [],
      },
    } satisfies AuditRecordV1;
    const reconciliation = {
      kind: 'reconciliation',
      value: {
        id: reconciliationId,
        target: { kind: 'grade-entry', id: recordV2.value.id },
        value: recordV2.value.value,
        status: 'match',
        difference: 0,
        tolerance: 0,
        ruleVersion: 'synthetic-composition-reconciliation-v1',
      },
    } satisfies AuditRecordV1;
    await unit.audit.appendVersion(context, { kind: 'occurrence', id: occurrenceId }, occurrence, {
      expectedVersion: null,
    });
    await unit.audit.appendVersion(
      context,
      { kind: 'reconciliation', id: reconciliationId },
      reconciliation,
      { expectedVersion: null },
    );
    await expect(
      unit.audit.listVersions(context, { kind: 'occurrence', id: occurrenceId }, { limit: 10 }),
    ).resolves.toMatchObject({ items: [{ value: occurrence, version: 1 }], nextCursor: null });
    await expect(
      unit.audit.getCurrent(context, { kind: 'reconciliation', id: reconciliationId }),
    ).resolves.toMatchObject({ value: reconciliation, version: 1 });
  });

  it('expõe a UoW e a fachada operacional no runtime autorizado e continua fail-closed', async () => {
    const authorization = authorizeGradebookD1RuntimeV1({ roles: ['ADMINISTRADOR'] });
    const runtime = createGradebookD1RuntimeV1(
      { RUNTIME_ENVIRONMENT: 'preview', GRADEBOOK_D1: database } as RuntimeEnv,
      authorization,
      { now: () => instant },
    );
    expect(runtime.persistenceUnitOfWork()).toMatchObject({
      entities: expect.any(Object),
      imports: expect.any(Object),
      academicRecords: expect.any(Object),
      logicalSourceRecords: expect.any(Object),
      audit: expect.any(Object),
    });
    const unit = runtime.persistenceUnitOfWork();
    await unit.entities.appendVersion(context, academicYear(), { expectedVersion: null });
    for (const entity of academicEntities()) {
      await unit.entities.appendVersion(context, entity, { expectedVersion: null });
    }
    const readModels = runtime.operationalReadModels();
    await expect(readModels.students.get(context, studentId)).resolves.toMatchObject({
      student: { value: { id: studentId } },
      enrollments: [{ enrollment: { value: { id: enrollmentId } } }],
    });
    await expect(readModels.classGroups.get(context, classGroupId)).resolves.toMatchObject({
      classGroup: { value: { id: classGroupId } },
      students: [{ student: { value: { id: studentId } } }],
    });
    await expect(readModels.teachers.get(context, teacherId)).resolves.toMatchObject({
      teacher: { value: { id: teacherId } },
      assignments: [{ assignment: { value: { id: assignmentId } } }],
    });
    await expect(readModels.subjects.get(context, subjectId)).resolves.toMatchObject({
      subject: { value: { id: subjectId } },
      assignments: [{ assignment: { value: { id: assignmentId } } }],
    });

    const prepare = vi.fn();
    expect(() =>
      createGradebookD1RuntimeV1(
        {
          RUNTIME_ENVIRONMENT: 'production',
          GRADEBOOK_D1: { prepare, exec: vi.fn() },
        } as unknown as RuntimeEnv,
        authorization,
      ),
    ).toThrow(GradebookD1RuntimeErrorV1);
    expect(prepare).not.toHaveBeenCalled();
  });
});
