import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type {
  AcademicYearId,
  ClassGroupId,
  SchoolId,
  SubjectId,
  TeacherId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import {
  createTeacherAssignmentMaintenanceV1,
  isTeacherAssignmentMaintenanceRequestV1,
} from '../../../server/gradebook/application/operational-workspace/teacher-assignment-maintenance-v1';
import { createTeachingCenterQueriesV1 } from '../../../server/gradebook/application/read-models/teaching/teaching-center-read-models-v1';
import { createGradebookD1PersistenceUnitOfWorkV1 } from '../../../server/gradebook/persistence/d1/composition/d1-persistence-unit-of-work-v1';
import { SqliteD1Database } from '../persistence/d1-transaction/d1-write-test-support';

const academicYearId = 'academic-year:maintenance:2026' as AcademicYearId;
const schoolId = 'school:maintenance:synthetic' as SchoolId;
const teacherId = 'teacher:maintenance:imported' as TeacherId;
const createdTeacherId = 'teacher:maintenance:created' as TeacherId;
const classGroupId = 'class-group:maintenance:6a' as ClassGroupId;
const subjectId = 'subject:maintenance:math' as SubjectId;
const importedAssignmentId = 'teaching-assignment:maintenance:imported' as TeachingAssignmentId;
const createdAssignmentId = 'teaching-assignment:maintenance:created' as TeachingAssignmentId;
const instant = '2026-09-02T10:30:00.000Z';

async function fixture() {
  const sqliteModuleName = 'node:sqlite';
  const sqlite = await import(/* @vite-ignore */ sqliteModuleName);
  const raw = new sqlite.DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON;');
  raw.exec(
    readFileSync(
      join(process.cwd(), 'migrations', 'gradebook', '0001_gradebook_context_entities_imports_v1.sql'),
      'utf8',
    ),
  );
  const database = new SqliteD1Database(raw);
  const unit = createGradebookD1PersistenceUnitOfWorkV1(database, { now: () => instant });
  const context = { academicYearId } as const;

  await unit.entities.appendVersion(
    context,
    {
      kind: 'academic-year',
      value: {
        id: academicYearId,
        schoolId,
        year: 2026,
        status: 'active',
        startsOn: '2026-02-01',
        endsOn: '2026-12-20',
        activeEvaluationProfileId: 'profile:maintenance:synthetic',
        configurationVersion: 'maintenance-v1',
      },
    },
    { expectedVersion: null },
  );
  await unit.entities.appendVersion(
    context,
    {
      kind: 'teacher',
      value: {
        id: teacherId,
        displayName: 'Professora Sintética Importada',
        sourceNames: ['PROFESSORA SINTÉTICA'],
        status: 'active',
      },
    },
    { expectedVersion: null },
  );
  await unit.entities.appendVersion(
    context,
    {
      kind: 'class-group',
      value: {
        id: classGroupId,
        academicYearId,
        code: '6A',
        grade: '6º ano',
        section: 'A',
      },
    },
    { expectedVersion: null },
  );
  await unit.entities.appendVersion(
    context,
    {
      kind: 'subject',
      value: {
        id: subjectId,
        code: 'MAT',
        displayName: 'Matemática Sintética',
        shortName: 'Matemática',
        status: 'active',
      },
    },
    { expectedVersion: null },
  );
  await unit.entities.appendVersion(
    context,
    {
      kind: 'teaching-assignment',
      value: {
        id: importedAssignmentId,
        academicYearId,
        teacherId,
        classGroupId,
        subjectId,
        sourceDisciplineIndex: 'D1',
        effectivePeriod: { startsOn: '2026-02-01' },
        confirmationOrigin: 'imported-source',
      },
    },
    { expectedVersion: null },
  );

  const teachers = createTeachingCenterQueriesV1(unit.entities).teachers;
  const service = createTeacherAssignmentMaintenanceV1({
    entities: unit.entities,
    teachers,
    createTeacherId: () => createdTeacherId,
    createTeachingAssignmentId: () => createdAssignmentId,
  });
  return { raw, unit, context, service };
}

async function withFixture(run: (value: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
  const value = await fixture();
  try {
    await run(value);
  } finally {
    value.raw.close();
  }
}

describe('teacher and annual assignment maintenance v1', () => {
  it('prova que o fluxo é explícito por ano e rejeita claims/campos não previstos', () => {
    expect(
      isTeacherAssignmentMaintenanceRequestV1({
        maintenanceVersion: 1,
        operation: 'teacher-register',
        academicYearId,
        displayName: 'Nova Professora Sintética',
      }),
    ).toBe(true);
    expect(
      isTeacherAssignmentMaintenanceRequestV1({
        maintenanceVersion: 1,
        operation: 'teacher-register',
        displayName: 'Sem ano explícito',
      }),
    ).toBe(false);
    expect(
      isTeacherAssignmentMaintenanceRequestV1({
        maintenanceVersion: 1,
        operation: 'assignment-confirm',
        academicYearId,
        assignmentReference: importedAssignmentId,
        expectedVersion: 1,
        actorId: 'browser-actor',
        capability: 'gradebook.persistence.admin',
        occurredAt: '2000-01-01T00:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('cadastra professor mínimo sem inventar nome de origem ou identidade paralela', async () => {
    await withFixture(async ({ service, unit, context }) => {
      const response = await service.execute({
        maintenanceVersion: 1,
        operation: 'teacher-register',
        academicYearId,
        displayName: 'Nova Professora Sintética',
      });
      expect(response).toEqual({
        maintenanceVersion: 1,
        state: 'written',
        entity: 'teacher',
        reference: createdTeacherId,
        currentVersion: 1,
        change: 'teacher-registered',
      });
      const persisted = await unit.entities.get(context, { kind: 'teacher', id: createdTeacherId });
      expect(persisted?.value).toEqual({
        kind: 'teacher',
        value: {
          id: createdTeacherId,
          displayName: 'Nova Professora Sintética',
          sourceNames: [],
          status: 'active',
        },
      });
    });
  });

  it('confirma nome observado com CAS e preserva aliases anteriores sem matching aproximado', async () => {
    await withFixture(async ({ service, unit, context }) => {
      const response = await service.execute({
        maintenanceVersion: 1,
        operation: 'teacher-confirm-source-name',
        academicYearId,
        teacherReference: teacherId,
        expectedVersion: 1,
        sourceName: 'PROF. SINTÉTICA 2026',
      });
      expect(response).toMatchObject({ state: 'written', currentVersion: 2 });
      const persisted = await unit.entities.get(context, { kind: 'teacher', id: teacherId });
      if (persisted?.value.kind !== 'teacher') throw new Error('Expected teacher.');
      expect(persisted.value.value.sourceNames).toEqual([
        'PROFESSORA SINTÉTICA',
        'PROF. SINTÉTICA 2026',
      ]);

      const stale = await service.execute({
        maintenanceVersion: 1,
        operation: 'teacher-confirm-source-name',
        academicYearId,
        teacherReference: teacherId,
        expectedVersion: 1,
        sourceName: 'OUTRO NOME',
      });
      expect(stale).toEqual({ maintenanceVersion: 1, state: 'version-conflict', currentVersion: 2 });
    });
  });

  it('expõe estado de manutenção a partir do read model oficial com versões e origem da atribuição', async () => {
    await withFixture(async ({ service }) => {
      const response = await service.execute({
        maintenanceVersion: 1,
        operation: 'teacher-state',
        academicYearId,
        teacherReference: teacherId,
      });
      expect(response).toMatchObject({
        maintenanceVersion: 1,
        state: 'ready',
        academicYearId,
        teacher: {
          reference: teacherId,
          currentVersion: 1,
          sourceNames: ['PROFESSORA SINTÉTICA'],
        },
        assignments: [
          {
            reference: importedAssignmentId,
            currentVersion: 1,
            confirmationOrigin: 'imported-source',
            classGroup: { reference: classGroupId, label: '6A' },
            subject: { reference: subjectId, label: 'Matemática Sintética' },
          },
        ],
      });
    });
  });

  it('confirma atribuição importada sem alterar referências, D1 ou vigência e aplica CAS', async () => {
    await withFixture(async ({ service, unit, context }) => {
      const response = await service.execute({
        maintenanceVersion: 1,
        operation: 'assignment-confirm',
        academicYearId,
        assignmentReference: importedAssignmentId,
        expectedVersion: 1,
      });
      expect(response).toMatchObject({
        state: 'written',
        reference: importedAssignmentId,
        currentVersion: 2,
        change: 'assignment-confirmed',
      });
      const persisted = await unit.entities.get(context, {
        kind: 'teaching-assignment',
        id: importedAssignmentId,
      });
      if (persisted?.value.kind !== 'teaching-assignment') throw new Error('Expected assignment.');
      expect(persisted.value.value).toEqual({
        id: importedAssignmentId,
        academicYearId,
        teacherId,
        classGroupId,
        subjectId,
        sourceDisciplineIndex: 'D1',
        effectivePeriod: { startsOn: '2026-02-01' },
        confirmationOrigin: 'user-confirmed',
      });

      const stale = await service.execute({
        maintenanceVersion: 1,
        operation: 'assignment-confirm',
        academicYearId,
        assignmentReference: importedAssignmentId,
        expectedVersion: 1,
      });
      expect(stale).toEqual({ maintenanceVersion: 1, state: 'version-conflict', currentVersion: 2 });
    });
  });

  it('cadastra atribuição anual administrativa somente com referências existentes do ano explícito', async () => {
    await withFixture(async ({ service, unit, context }) => {
      const response = await service.execute({
        maintenanceVersion: 1,
        operation: 'assignment-register',
        academicYearId,
        teacherReference: teacherId,
        classGroupReference: classGroupId,
        subjectReference: subjectId,
        effectivePeriod: { startsOn: '2026-02-03', endsOn: '2026-12-18' },
      });
      expect(response).toEqual({
        maintenanceVersion: 1,
        state: 'written',
        entity: 'teaching-assignment',
        reference: createdAssignmentId,
        currentVersion: 1,
        change: 'assignment-registered',
      });
      const persisted = await unit.entities.get(context, {
        kind: 'teaching-assignment',
        id: createdAssignmentId,
      });
      expect(persisted?.value).toEqual({
        kind: 'teaching-assignment',
        value: {
          id: createdAssignmentId,
          academicYearId,
          teacherId,
          classGroupId,
          subjectId,
          effectivePeriod: { startsOn: '2026-02-03', endsOn: '2026-12-18' },
          confirmationOrigin: 'administrative',
        },
      });
    });
  });

  it('falha fechado para referência inexistente e não cria associação por nome', async () => {
    await withFixture(async ({ service, unit, context }) => {
      const response = await service.execute({
        maintenanceVersion: 1,
        operation: 'assignment-register',
        academicYearId,
        teacherReference: teacherId,
        classGroupReference: 'class-group:maintenance:missing' as ClassGroupId,
        subjectReference: subjectId,
        effectivePeriod: {},
      });
      expect(response).toEqual({ maintenanceVersion: 1, state: 'not-found', target: 'class-group' });
      expect(
        await unit.entities.get(context, { kind: 'teaching-assignment', id: createdAssignmentId }),
      ).toBeNull();
    });
  });
});
