import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeEnv } from '../../../../server/env';
import { AuthorizationError } from '../../../../server/auth/roles';
import { authorizeGradebookD1RuntimeV1 } from '../../../../server/gradebook/persistence/d1/runtime/d1-runtime-authorization-v1';
import {
  createGradebookD1RuntimeV1,
  GradebookD1RuntimeErrorV1,
} from '../../../../server/gradebook/persistence/d1/runtime/d1-runtime-v1';
import type {
  ClassGroupId,
  SchoolId,
  SubjectId,
  TeacherId,
} from '../../../../shared/gradebook-contracts/entities';
import {
  GLOBAL_SEARCH_CONTRACT_VERSION_V1,
  GLOBAL_SEARCH_ORDER_V1,
} from '../../../../shared/gradebook-contracts/search/global-search-contract-v1';
import { ACADEMIC_CONTEXT_2026_IDENTITY_V1 } from '../../../../src/gradebook-domain/context/academic-context-2026-v1';
import type { AcademicEntityRecordV1 } from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  academicYearId,
  context,
  instant,
  openMigratedDatabase,
  studentId,
  type SqliteD1Database,
} from '../d1-transaction/d1-write-test-support';

const schoolId = 'school:d1-search-runtime:001' as SchoolId;
const classGroupId = 'class-group:d1-search-runtime:001' as ClassGroupId;
const teacherId = 'teacher:d1-search-runtime:001' as TeacherId;
const subjectId = 'subject:d1-search-runtime:001' as SubjectId;

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

function searchableEntities(): readonly AcademicEntityRecordV1[] {
  return [
    {
      kind: 'student',
      value: {
        id: studentId,
        displayName: 'Aluno Sintético do Runtime',
        sourceNames: ['ALUNO SINTÉTICO DO RUNTIME'],
        sourceIdentityMarks: ['marca-sintetica-runtime'],
      },
    },
    {
      kind: 'class-group',
      value: {
        id: classGroupId,
        academicYearId,
        code: '6R Sintético',
        grade: '6',
        section: 'R',
        shift: 'morning',
      },
    },
    {
      kind: 'teacher',
      value: {
        id: teacherId,
        displayName: 'Professor Sintético do Runtime',
        sourceNames: ['PROFESSOR SINTÉTICO DO RUNTIME'],
        status: 'active',
      },
    },
    {
      kind: 'subject',
      value: {
        id: subjectId,
        code: 'CMP-RUN',
        displayName: 'Componente Sintético do Runtime',
        shortName: 'RUN',
        status: 'active',
      },
    },
  ];
}

describe('pesquisa acadêmica no runtime D1 local/preview V1', () => {
  it('expõe a pesquisa pela fachada autorizada em preview usando a única UoW', async () => {
    const authorization = authorizeGradebookD1RuntimeV1({ roles: ['ADMINISTRADOR'] });
    const runtime = createGradebookD1RuntimeV1(
      { RUNTIME_ENVIRONMENT: 'preview', GRADEBOOK_D1: database } as RuntimeEnv,
      authorization,
      { now: () => instant },
    );
    const unit = runtime.persistenceUnitOfWork();

    await unit.entities.appendVersion(context, academicYear(), { expectedVersion: null });
    for (const entity of searchableEntities()) {
      await unit.entities.appendVersion(context, entity, { expectedVersion: null });
    }

    await expect(
      runtime.operationalReadModels().search.search({
        contractVersion: GLOBAL_SEARCH_CONTRACT_VERSION_V1,
        academicYearId,
        query: 'sintetico',
        scope: { kinds: ['student', 'class-group', 'teacher', 'subject'] },
        page: { limit: 10, cursor: null },
        order: GLOBAL_SEARCH_ORDER_V1,
      }),
    ).resolves.toEqual({
      contractVersion: 1,
      outcome: 'results',
      academicYearId,
      order: GLOBAL_SEARCH_ORDER_V1,
      limit: 10,
      items: [
        { kind: 'student', id: studentId, displayName: 'Aluno Sintético do Runtime' },
        { kind: 'class-group', id: classGroupId, code: '6R Sintético' },
        { kind: 'teacher', id: teacherId, displayName: 'Professor Sintético do Runtime' },
        { kind: 'subject', id: subjectId, displayName: 'Componente Sintético do Runtime' },
      ],
      nextCursor: null,
    });
  });

  it('bloqueia não autorização e produção antes de inspecionar o binding', () => {
    const unauthorizedPrepare = vi.fn();
    expect(() =>
      createGradebookD1RuntimeV1(
        {
          RUNTIME_ENVIRONMENT: 'preview',
          GRADEBOOK_D1: { prepare: unauthorizedPrepare, exec: vi.fn() },
        } as unknown as RuntimeEnv,
        {} as never,
      ),
    ).toThrow(AuthorizationError);
    expect(unauthorizedPrepare).not.toHaveBeenCalled();

    const authorization = authorizeGradebookD1RuntimeV1({ roles: ['ADMINISTRADOR'] });
    const productionPrepare = vi.fn();
    expect(() =>
      createGradebookD1RuntimeV1(
        {
          RUNTIME_ENVIRONMENT: 'production',
          GRADEBOOK_D1: { prepare: productionPrepare, exec: vi.fn() },
        } as unknown as RuntimeEnv,
        authorization,
      ),
    ).toThrow(GradebookD1RuntimeErrorV1);
    expect(productionPrepare).not.toHaveBeenCalled();
  });
});
