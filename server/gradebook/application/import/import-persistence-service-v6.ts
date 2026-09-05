import type {
  StudentStatusEventId,
  StudentStatusEventV1,
  StudentStatusV1,
} from '../../../../shared/gradebook-contracts/entities';
import type { GradebookImportPersistenceRequestV4 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v4';
import type { GradebookImportPersistenceServiceDependenciesV4 } from './import-persistence-service-v2';
import {
  asGradebookImportPersistenceResponseV6,
  type GradebookImportPersistenceRequestV6,
  type GradebookImportPersistenceResponseV6,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import type {
  AcademicEntityRecordV1,
  AcademicPersistenceContextV1,
  VersionedRecordV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import { createGradebookImportPersistenceServiceV5 } from './import-persistence-service-v5';
import { expandGradebookImportPersistenceRequestV6 } from './import-persistence-v6-adapter';

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toUpperCase();
}

async function opaqueId(prefix: string, parts: readonly string[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([prefix, ...parts]));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `${prefix}:${Array.from(digest.slice(0, 18), (value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function observedStatus(sourceText: string): {
  readonly status: StudentStatusV1;
  readonly transfer?: StudentStatusEventV1['transfer'];
} {
  const value = normalize(sourceText);
  const outgoing = value.match(/^FOI PARA\s+(.+)$/u);
  if (outgoing?.[1]) {
    return { status: 'transferred', transfer: { destinationClassGroupCode: outgoing[1].trim() } };
  }
  if (value.includes('TRANSFER')) return { status: 'transferred' };
  const incoming = value.match(/^ESTAVA NO\s+(.+)$/u);
  if (incoming?.[1]) {
    return { status: 'active', transfer: { originClassGroupCode: incoming[1].trim() } };
  }
  if (value === 'ATIVO' || value === 'EM CURSO' || value === 'CURSANDO') return { status: 'active' };
  if (value.includes('DESIST') || value.includes('EVADI')) return { status: 'withdrawn' };
  if (value.includes('FALEC')) return { status: 'deceased' };
  return { status: 'other' };
}

function referenceKey(classGroupLabel: string, position: number): string {
  return `${normalize(classGroupLabel)}:${position}`;
}

type StatusBulkRepositoryV1 = GradebookImportPersistenceServiceDependenciesV4['unitOfWork']['entities'] & {
  readonly getStudentStatusEventsMany?: (
    context: AcademicPersistenceContextV1,
    ids: readonly string[],
  ) => Promise<readonly (VersionedRecordV1<AcademicEntityRecordV1> | null)[]>;
};

async function statusRecords(input: {
  readonly request: GradebookImportPersistenceRequestV6;
  readonly catalogRequest: GradebookImportPersistenceRequestV4;
  readonly dependencies: GradebookImportPersistenceServiceDependenciesV4;
}): Promise<readonly AcademicEntityRecordV1[]> {
  const references = new Map<string, { readonly enrollmentId: string }>();
  for (const sheet of input.catalogRequest.sheets) {
    if (sheet.kind !== 'term') continue;
    for (const student of sheet.students) {
      const position = student.sourceRow - 4;
      const key = referenceKey(sheet.recognizedContext.classGroupLabel, position);
      const known = references.get(key);
      if (known && known.enrollmentId !== student.confirmedStudent.enrollmentId) {
        throw new Error('status-roster-reference-conflict');
      }
      references.set(key, { enrollmentId: student.confirmedStudent.enrollmentId });
    }
  }

  const context = {
    academicYearId: input.request.confirmedContext.academicYearId,
  } satisfies AcademicPersistenceContextV1;
  const candidates: Array<{
    readonly id: StudentStatusEventId;
    readonly enrollmentId: StudentStatusEventV1['enrollmentId'];
    readonly sourceText: string;
    readonly semantic: ReturnType<typeof observedStatus>;
  }> = [];
  for (const roster of input.request.rosters) {
    for (const student of roster.students) {
      const sourceText = student[2]?.trim() ?? '';
      if (!sourceText) continue;
      const reference = references.get(referenceKey(roster.classGroupLabel, student[0]));
      if (!reference) throw new Error('status-roster-reference-missing');
      candidates.push({
        id: (await opaqueId('student-status-event', [
          String(input.request.confirmedContext.academicYearId),
          reference.enrollmentId,
          normalize(sourceText),
        ])) as StudentStatusEventId,
        enrollmentId: reference.enrollmentId as StudentStatusEventV1['enrollmentId'],
        sourceText,
        semantic: observedStatus(sourceText),
      });
    }
  }
  if (candidates.length === 0) return [];

  const repository = input.dependencies.unitOfWork.entities as StatusBulkRepositoryV1;
  const existing = repository.getStudentStatusEventsMany
    ? await repository.getStudentStatusEventsMany(
        context,
        candidates.map((candidate) => candidate.id),
      )
    : await Promise.all(
        candidates.map((candidate) =>
          repository.get(context, { kind: 'student-status-event', id: candidate.id }),
        ),
      );
  if (existing.length !== candidates.length) throw new Error('status-bulk-read-incompatible');

  return candidates.flatMap((candidate, index) => {
    if (existing[index] !== null) return [];
    return [
      {
        kind: 'student-status-event' as const,
        value: {
          id: candidate.id,
          academicYearId: input.request.confirmedContext.academicYearId,
          enrollmentId: candidate.enrollmentId,
          status: candidate.semantic.status,
          sourceText: candidate.sourceText,
          sourceReference: 'RELACAO',
          ...(candidate.semantic.transfer ? { transfer: candidate.semantic.transfer } : {}),
        },
      },
    ];
  });
}

export function createGradebookImportPersistenceServiceV6(
  dependencies: GradebookImportPersistenceServiceDependenciesV4,
) {
  return {
    async execute(
      request: GradebookImportPersistenceRequestV6,
    ): Promise<GradebookImportPersistenceResponseV6> {
      const expanded = expandGradebookImportPersistenceRequestV6(request);
      if (!expanded) {
        return {
          transportVersion: 6,
          state: 'invalid-request',
          reason: 'invalid-academic-shape',
        };
      }
      const service = createGradebookImportPersistenceServiceV5(dependencies, {
        additionalCatalogRecords: async ({ catalog }) =>
          statusRecords({ request, catalogRequest: catalog.request, dependencies }),
      });
      return asGradebookImportPersistenceResponseV6(await service.execute(expanded));
    },
  };
}
