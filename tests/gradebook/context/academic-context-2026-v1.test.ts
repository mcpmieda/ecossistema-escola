import { describe, expect, it } from 'vitest';

import type {
  AcademicYearId,
  AcademicYearV1,
  SchoolId,
} from '../../../shared/gradebook-contracts/entities';
import { createActiveAcademicContextServiceV1 } from '../../../server/gradebook/application/context/active-academic-context-service-v1';
import {
  ACADEMIC_CONTEXT_2026_IDENTITY_V1,
  ACADEMIC_EVALUATION_PROFILE_2026_V1,
  AcademicContextErrorV1,
  createAcademicContext2026V1,
  type AcademicContextErrorCodeV1,
} from '../../../src/gradebook-domain/context/academic-context-2026-v1';
import { NATIVE_ANNUAL_OUTCOME_PROFILE_2026_V1 } from '../../../src/gradebook-domain/calculations/annual-result/resolve-native-annual-outcome';
import { NATIVE_FINAL_RECOVERY_PROFILE_2026_V1 } from '../../../src/gradebook-domain/calculations/final-recovery/resolve-native-final-recovery';
import { NATIVE_PARALLEL_RECOVERY_PROFILE_2026_V1 } from '../../../src/gradebook-domain/calculations/parallel-recovery/resolve-native-parallel-recovery';
import { NATIVE_TERM_OUTCOME_PROFILE_2026_V1 } from '../../../src/gradebook-domain/calculations/term-result/compose-native-term-outcome';
import { NATIVE_TERM_COMPOSITION_PROFILE_2026_V1 } from '../../../src/gradebook-domain/calculations/term/compose-native-term-result';
import type {
  AcademicEntityRecordV1,
  AcademicEntityRepositoryV1,
  VersionedRecordV1,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';

const academicYearId = 'academic-year:context:2026' as AcademicYearId;
const schoolId = 'school:context:synthetic' as SchoolId;

function activeAcademicYear(overrides: Partial<AcademicYearV1> = {}): AcademicYearV1 {
  return {
    id: academicYearId,
    schoolId,
    year: ACADEMIC_CONTEXT_2026_IDENTITY_V1.academicYear,
    status: 'active',
    startsOn: '2026-02-01',
    endsOn: '2026-12-20',
    activeEvaluationProfileId: ACADEMIC_CONTEXT_2026_IDENTITY_V1.evaluationProfileId,
    configurationVersion: String(ACADEMIC_CONTEXT_2026_IDENTITY_V1.configurationVersion),
    ...overrides,
  };
}

function versionedAcademicYear(
  value = activeAcademicYear(),
  version = 1,
): VersionedRecordV1<AcademicEntityRecordV1> {
  return {
    value: { kind: 'academic-year', value },
    version,
    recordedAt: '2026-09-01T10:00:00.000Z',
  };
}

function repositoryWith(
  items: readonly VersionedRecordV1<AcademicEntityRecordV1>[],
  nextCursor: string | null = null,
): AcademicEntityRepositoryV1 {
  return {
    get: async () => items[0] ?? null,
    list: async () => ({ items, nextCursor }),
    appendVersion: async () => {
      throw new Error('appendVersion is not used by this context service test');
    },
  };
}

function expectContextError(operation: () => unknown, code: AcademicContextErrorCodeV1): void {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(AcademicContextErrorV1);
    expect((error as AcademicContextErrorV1).code).toBe(code);
    return;
  }
  throw new Error(`expected AcademicContextErrorV1:${code}`);
}

async function expectAsyncContextError(
  operation: () => Promise<unknown>,
  code: AcademicContextErrorCodeV1,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    expect(error).toBeInstanceOf(AcademicContextErrorV1);
    expect((error as AcademicContextErrorV1).code).toBe(code);
    return;
  }
  throw new Error(`expected AcademicContextErrorV1:${code}`);
}

describe('contexto acadêmico 2026 V1', () => {
  it('compõe uma única configuração imutável reutilizando os perfis nativos existentes', () => {
    const context = createAcademicContext2026V1(activeAcademicYear());

    expect(context.authorityMode).toBe('imported-source');
    expect(context.persistenceContext).toEqual({ academicYearId });
    expect(context.evaluationProfile).toBe(ACADEMIC_EVALUATION_PROFILE_2026_V1);
    expect(context.evaluationProfile.nativeProfiles.termComposition).toBe(
      NATIVE_TERM_COMPOSITION_PROFILE_2026_V1,
    );
    expect(context.evaluationProfile.nativeProfiles.parallelRecovery).toBe(
      NATIVE_PARALLEL_RECOVERY_PROFILE_2026_V1,
    );
    expect(context.evaluationProfile.nativeProfiles.termOutcome).toBe(
      NATIVE_TERM_OUTCOME_PROFILE_2026_V1,
    );
    expect(context.evaluationProfile.nativeProfiles.finalRecovery).toBe(
      NATIVE_FINAL_RECOVERY_PROFILE_2026_V1,
    );
    expect(context.evaluationProfile.nativeProfiles.annualOutcome).toBe(
      NATIVE_ANNUAL_OUTCOME_PROFILE_2026_V1,
    );
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.academicYear)).toBe(true);
    expect(Object.isFrozen(context.persistenceContext)).toBe(true);
    expect(Object.isFrozen(context.evaluationProfile)).toBe(true);
    expect(Object.isFrozen(context.evaluationProfile.nativeProfiles)).toBe(true);
  });

  it('falha explicitamente para ano inativo ou configuração incompatível', () => {
    expectContextError(
      () => createAcademicContext2026V1(activeAcademicYear({ status: 'planned' })),
      'context-inactive',
    );
    expectContextError(
      () => createAcademicContext2026V1(activeAcademicYear({ status: 'closed' })),
      'context-inactive',
    );
    expectContextError(
      () => createAcademicContext2026V1(activeAcademicYear({ year: 2025 })),
      'context-incompatible',
    );
    expectContextError(
      () =>
        createAcademicContext2026V1(
          activeAcademicYear({ activeEvaluationProfileId: 'evaluation-profile:other' }),
        ),
      'context-incompatible',
    );
    expectContextError(
      () => createAcademicContext2026V1(activeAcademicYear({ configurationVersion: '2' })),
      'context-incompatible',
    );
  });

  it('resolve o contexto ativo somente pelo academicYearId injetado', async () => {
    let observedAcademicYearId: AcademicYearId | null = null;
    const repository = repositoryWith([versionedAcademicYear()]);
    const entities: AcademicEntityRepositoryV1 = {
      ...repository,
      list: async (persistenceContext, kind, page) => {
        observedAcademicYearId = persistenceContext.academicYearId;
        expect(kind).toBe('academic-year');
        expect(page).toEqual({ limit: 2, cursor: null });
        return repository.list(persistenceContext, kind, page);
      },
    };
    const service = createActiveAcademicContextServiceV1({ academicYearId, entities });

    await expect(service.getActiveContext()).resolves.toMatchObject({
      authorityMode: 'imported-source',
      persistenceContext: { academicYearId },
    });
    expect(observedAcademicYearId).toBe(academicYearId);
  });

  it('falha explicitamente para contexto ausente, duplicado, inativo ou incompatível', async () => {
    const missing = createActiveAcademicContextServiceV1({
      academicYearId,
      entities: repositoryWith([]),
    });
    await expectAsyncContextError(() => missing.getActiveContext(), 'context-missing');

    const duplicate = createActiveAcademicContextServiceV1({
      academicYearId,
      entities: repositoryWith([versionedAcademicYear(), versionedAcademicYear(undefined, 2)]),
    });
    await expectAsyncContextError(() => duplicate.getActiveContext(), 'context-duplicate');

    const pagedDuplicate = createActiveAcademicContextServiceV1({
      academicYearId,
      entities: repositoryWith([versionedAcademicYear()], 'another-context'),
    });
    await expectAsyncContextError(() => pagedDuplicate.getActiveContext(), 'context-duplicate');

    const inactive = createActiveAcademicContextServiceV1({
      academicYearId,
      entities: repositoryWith([versionedAcademicYear(activeAcademicYear({ status: 'closed' }))]),
    });
    await expectAsyncContextError(() => inactive.getActiveContext(), 'context-inactive');

    const incompatible = createActiveAcademicContextServiceV1({
      academicYearId,
      entities: repositoryWith([
        versionedAcademicYear(activeAcademicYear({ configurationVersion: '99' })),
      ]),
    });
    await expectAsyncContextError(() => incompatible.getActiveContext(), 'context-incompatible');
  });
});
