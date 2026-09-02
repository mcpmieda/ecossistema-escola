import { describe, expect, it } from 'vitest';

import type { RuntimeEnv } from '../../../../server/env';
import { authorizeGradebookD1RuntimeV1 } from '../../../../server/gradebook/persistence/d1/runtime/d1-runtime-authorization-v1';
import { createGradebookD1RuntimeV1 } from '../../../../server/gradebook/persistence/d1/runtime/d1-runtime-v1';
import type {
  CouncilActorReferenceV1,
  CouncilClassReferenceV1,
} from '../../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import type { AcademicYearId } from '../../../../shared/gradebook-contracts/entities';
import { openMigratedDatabase } from '../d1-transaction/d1-write-test-support';

const academicYearId = 'academic-year:wave-16:synthetic' as AcademicYearId;
const classReference = 'class-group:wave-16:synthetic' as CouncilClassReferenceV1;

describe('composição do Council Workspace no runtime D1 V1', () => {
  it('expõe a projeção oficial #332 upstream por um workspace autorizado e fail-closed sem turma', async () => {
    const database = await openMigratedDatabase();
    try {
      const authorization = authorizeGradebookD1RuntimeV1({ roles: ['ADMINISTRADOR'] });
      const runtime = createGradebookD1RuntimeV1(
        { RUNTIME_ENVIRONMENT: 'preview', GRADEBOOK_D1: database } as RuntimeEnv,
        authorization,
      );
      const workspace = runtime.councilWorkspace({
        decisionIdentity: () => ({
          actorReference: 'actor:wave-16:synthetic' as CouncilActorReferenceV1,
          decidedAt: '2026-09-02T00:00:00.000Z',
        }),
      });

      await expect(
        workspace.queue({
          operation: 'queue',
          contractVersion: 1,
          academicYearId,
          classReference,
          page: { limit: 20, cursor: null },
        }),
      ).resolves.toEqual({
        contractVersion: 1,
        outcome: 'no-results',
        items: [],
        nextCursor: null,
      });
    } finally {
      database.raw.close();
    }
  });
});
