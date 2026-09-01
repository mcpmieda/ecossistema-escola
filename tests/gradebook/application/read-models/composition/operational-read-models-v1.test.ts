import { describe, expect, it, vi } from 'vitest';

import { createGradebookOperationalReadModelsV1 } from '../../../../../server/gradebook/application/read-models/composition/operational-read-models-v1';
import type {
  AcademicYearId,
  ClassGroupId,
  StudentId,
  SubjectId,
  TeacherId,
} from '../../../../../shared/gradebook-contracts/entities';
import type {
  AcademicEntityRecordV1,
  AcademicEntityRepositoryV1,
  AcademicPersistenceContextV1,
  PersistenceUnitOfWorkV1,
  VersionedRecordV1,
} from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';

const academicYearId = 'academic-year:operational-read-models:2026' as AcademicYearId;
const context = { academicYearId } satisfies AcademicPersistenceContextV1;
const studentId = 'student:operational-read-models:001' as StudentId;
const classGroupId = 'class-group:operational-read-models:001' as ClassGroupId;
const teacherId = 'teacher:operational-read-models:001' as TeacherId;
const subjectId = 'subject:operational-read-models:001' as SubjectId;
const recordedAt = '2026-09-01T13:30:00.000Z';

const roots = [
  {
    kind: 'student',
    value: {
      id: studentId,
      displayName: 'Estudante Sintético da Fachada',
      sourceNames: ['ESTUDANTE SINTÉTICO DA FACHADA'],
    },
  },
  {
    kind: 'class-group',
    value: {
      id: classGroupId,
      academicYearId,
      code: '6F',
      grade: '6',
      section: 'F',
    },
  },
  {
    kind: 'teacher',
    value: {
      id: teacherId,
      displayName: 'Docente Sintético da Fachada',
      sourceNames: ['DOCENTE SINTÉTICO DA FACHADA'],
      status: 'active',
    },
  },
  {
    kind: 'subject',
    value: {
      id: subjectId,
      code: 'SYN-FAC',
      displayName: 'Componente Sintético da Fachada',
      shortName: 'CSF',
      status: 'active',
    },
  },
] satisfies readonly AcademicEntityRecordV1[];

function versioned(value: AcademicEntityRecordV1): VersionedRecordV1<AcademicEntityRecordV1> {
  return { value, version: 1, recordedAt };
}

describe('fachada operacional dos read models V1', () => {
  it('compõe os quatro centros sobre o único repositório de entidades da UoW', async () => {
    const repository: AcademicEntityRepositoryV1 = {
      get: vi.fn(async (_context, reference) => {
        const root = roots.find(
          (candidate) => candidate.kind === reference.kind && candidate.value.id === reference.id,
        );
        return root === undefined ? null : versioned(root);
      }),
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      appendVersion: vi.fn(async () => {
        throw new Error('Synthetic read-only repository.');
      }),
    };
    const unitOfWork = { entities: repository } as PersistenceUnitOfWorkV1;
    const readModels = createGradebookOperationalReadModelsV1(unitOfWork, { pageSize: 1 });

    await expect(readModels.students.get(context, studentId)).resolves.toMatchObject({
      academicYearId,
      student: { value: { id: studentId } },
      enrollments: [],
    });
    await expect(readModels.classGroups.get(context, classGroupId)).resolves.toMatchObject({
      academicYearId,
      classGroup: { value: { id: classGroupId } },
      students: [],
      assignments: [],
    });
    await expect(readModels.teachers.get(context, teacherId)).resolves.toMatchObject({
      academicYearId,
      teacher: { value: { id: teacherId } },
      assignments: [],
    });
    await expect(readModels.subjects.get(context, subjectId)).resolves.toMatchObject({
      academicYearId,
      subject: { value: { id: subjectId } },
      assignments: [],
    });

    expect(repository.appendVersion).not.toHaveBeenCalled();
    expect(repository.get).toHaveBeenCalledTimes(4);
  });
});
