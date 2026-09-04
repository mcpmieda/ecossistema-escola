import type { ImportFileId } from '../../../../shared/gradebook-contracts/imports/import-ids-v1';
import type { AssessmentComponentV2 } from '../../../../shared/gradebook-contracts/results/results-contract-v2';
import type {
  AcademicEntityRecordV1,
  AcademicEntityRepositoryV1,
  AcademicRecordV1,
  VersionedRecordV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type {
  AssessmentDefinitionMaterializationV2,
  BlockedAssessmentDefinitionV2,
  MaterializedAssessmentComponentV2,
} from '../../../../src/features/gradebook/import/assessment-definition-materializer-v2';
import {
  planImportReconciliation,
  type ImportChangePlanV1,
  type ImportReconciliationFileInputV1,
  type ImportReconciliationInputV1,
  type ImportReconciliationRepositoriesV1,
} from './import-reconciliation-v1';
import {
  IMPORT_PLANNER_READ_CONCURRENCY_V1,
  mapWithBoundedConcurrencyV1,
} from './bounded-read-concurrency-v1';

export type AssessmentComponentChangeStateV2 = 'unchanged' | 'new' | 'changed' | 'blocked';

interface AssessmentComponentPlanItemBaseV2 {
  readonly importFileId: ImportFileId;
  readonly stableKey: MaterializedAssessmentComponentV2['stableKey'];
}

export type AssessmentComponentPlanItemV2 =
  | (AssessmentComponentPlanItemBaseV2 & {
      readonly state: 'unchanged';
      readonly incomingRecord: Extract<
        AcademicEntityRecordV1,
        { readonly kind: 'assessment-component' }
      >;
      readonly currentRecord: VersionedRecordV1<AcademicEntityRecordV1>;
    })
  | (AssessmentComponentPlanItemBaseV2 & {
      readonly state: 'new';
      readonly incomingRecord: Extract<
        AcademicEntityRecordV1,
        { readonly kind: 'assessment-component' }
      >;
      readonly expectedVersion: null;
    })
  | (AssessmentComponentPlanItemBaseV2 & {
      readonly state: 'changed';
      readonly incomingRecord: Extract<
        AcademicEntityRecordV1,
        { readonly kind: 'assessment-component' }
      >;
      readonly currentRecord: VersionedRecordV1<AcademicEntityRecordV1>;
      readonly expectedVersion: number;
    })
  | (AssessmentComponentPlanItemBaseV2 & {
      readonly state: 'blocked';
      readonly reason:
        | BlockedAssessmentDefinitionV2['resolution']['reason']
        | 'persisted-component-incompatible'
        | 'duplicate-component-identity'
        | 'component-read-failed';
    });

export interface AssessmentComponentPlanCountsV2 {
  readonly unchanged: number;
  readonly new: number;
  readonly changed: number;
  readonly blocked: number;
}

export interface AssessmentComponentChangePlanV2 {
  readonly items: readonly AssessmentComponentPlanItemV2[];
  readonly counts: AssessmentComponentPlanCountsV2;
  readonly plannedVersionWrites: number;
  readonly planningEvidence: {
    readonly writesPerformed: 0;
    readonly repositoryExposesGetOnly: true;
  };
}

export type AssessmentImportChangePlanV2 = ImportChangePlanV1 & {
  readonly assessmentComponentPlanV2: AssessmentComponentChangePlanV2;
};

export interface AssessmentImportReconciliationFileInputV2 extends Omit<
  ImportReconciliationFileInputV1,
  'records'
> {
  readonly materialization: AssessmentDefinitionMaterializationV2;
  /**
   * Official records derived from the same recognized source file. GradeEntry records remain
   * materialized above so blocked AssessmentComponents can still suppress their dependents.
   */
  readonly additionalRecords?: readonly Exclude<AcademicRecordV1, { readonly kind: 'grade-entry' }>[];
}

export interface AssessmentImportReconciliationInputV2 extends Omit<
  ImportReconciliationInputV1,
  'files'
> {
  readonly files: readonly AssessmentImportReconciliationFileInputV2[];
}

export interface AssessmentImportReconciliationRepositoriesV2 extends ImportReconciliationRepositoriesV1 {
  readonly entities: Pick<AcademicEntityRepositoryV1, 'get'>;
}

const OPERATIONAL_COMPONENT_BLOCK_REASONS_V2 = new Set<
  Extract<AssessmentComponentPlanItemV2, { readonly state: 'blocked' }>['reason']
>(['persisted-component-incompatible', 'duplicate-component-identity', 'component-read-failed']);

function stableSerialize(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function isCompatiblePersistedV2(
  record: VersionedRecordV1<AcademicEntityRecordV1>,
  incoming: AssessmentComponentV2,
): boolean {
  if (record.value.kind !== 'assessment-component') return false;
  const value = record.value.value;
  return (
    value.id === incoming.id &&
    value.id.startsWith('assessment-component:v2:') &&
    ['quantitative-assessment', 'qualitative-activity', 'parallel-recovery'].includes(value.type)
  );
}

function counts(items: readonly AssessmentComponentPlanItemV2[]): AssessmentComponentPlanCountsV2 {
  const result: Record<AssessmentComponentChangeStateV2, number> = {
    unchanged: 0,
    new: 0,
    changed: 0,
    blocked: 0,
  };
  for (const item of items) result[item.state] += 1;
  return result;
}

async function planComponents(
  input: AssessmentImportReconciliationInputV2,
  repository: Pick<AcademicEntityRepositoryV1, 'get'>,
): Promise<AssessmentComponentChangePlanV2> {
  const items: AssessmentComponentPlanItemV2[] = [];
  const seenIds = new Set<string>();
  const pending: {
    readonly importFileId: ImportFileId;
    readonly component: MaterializedAssessmentComponentV2;
  }[] = [];

  for (const file of [...input.files].sort((left, right) =>
    left.importFileId.localeCompare(right.importFileId),
  )) {
    for (const blocked of file.materialization.blockedDefinitions) {
      items.push({
        importFileId: file.importFileId,
        stableKey: blocked.stableKey,
        state: 'blocked',
        reason: blocked.resolution.reason,
      });
    }

    for (const component of file.materialization.components) {
      if (seenIds.has(component.value.id)) {
        items.push({
          importFileId: file.importFileId,
          stableKey: component.stableKey,
          state: 'blocked',
          reason: 'duplicate-component-identity',
        });
        continue;
      }
      seenIds.add(component.value.id);
      pending.push({ importFileId: file.importFileId, component });
    }
  }

  items.push(
    ...(await mapWithBoundedConcurrencyV1(
      pending,
      IMPORT_PLANNER_READ_CONCURRENCY_V1,
      async ({ importFileId, component }): Promise<AssessmentComponentPlanItemV2> => {
        const incomingRecord = {
          kind: 'assessment-component',
          value: component.value,
        } as const satisfies AcademicEntityRecordV1;
        let current: VersionedRecordV1<AcademicEntityRecordV1> | null;
        try {
          current = await repository.get(input.context, {
            kind: 'assessment-component',
            id: component.value.id,
          });
        } catch {
          return {
            importFileId,
            stableKey: component.stableKey,
            state: 'blocked',
            reason: 'component-read-failed',
          };
        }

        if (current === null) {
          return {
            importFileId,
            stableKey: component.stableKey,
            state: 'new',
            incomingRecord,
            expectedVersion: null,
          };
        }
        if (!isCompatiblePersistedV2(current, component.value)) {
          return {
            importFileId,
            stableKey: component.stableKey,
            state: 'blocked',
            reason: 'persisted-component-incompatible',
          };
        }
        if (stableSerialize(current.value) === stableSerialize(incomingRecord)) {
          return {
            importFileId,
            stableKey: component.stableKey,
            state: 'unchanged',
            incomingRecord,
            currentRecord: current,
          };
        }
        return {
          importFileId,
          stableKey: component.stableKey,
          state: 'changed',
          incomingRecord,
          currentRecord: current,
          expectedVersion: current.version,
        };
      },
    )),
  );

  items.sort(
    (left, right) =>
      left.importFileId.localeCompare(right.importFileId) ||
      left.stableKey.localeCompare(right.stableKey) ||
      left.state.localeCompare(right.state),
  );
  const itemCounts = counts(items);
  return {
    items,
    counts: itemCounts,
    plannedVersionWrites: itemCounts.new + itemCounts.changed,
    planningEvidence: { writesPerformed: 0, repositoryExposesGetOnly: true },
  };
}

export async function planAssessmentImportReconciliationV2(
  input: AssessmentImportReconciliationInputV2,
  repositories: AssessmentImportReconciliationRepositoriesV2,
): Promise<AssessmentImportChangePlanV2> {
  const assessmentComponentPlanV2 = await planComponents(input, repositories.entities);
  const blockedComponentKeys = new Set(
    assessmentComponentPlanV2.items
      .filter(
        (item): item is Extract<AssessmentComponentPlanItemV2, { readonly state: 'blocked' }> =>
          item.state === 'blocked' && OPERATIONAL_COMPONENT_BLOCK_REASONS_V2.has(item.reason),
      )
      .flatMap((item) => {
        const file = input.files.find((candidate) => candidate.importFileId === item.importFileId);
        const component = file?.materialization.components.find(
          (candidate) => candidate.stableKey === item.stableKey,
        );
        return component ? [`${item.importFileId}:${component.value.id}`] : [];
      }),
  );
  const recordsInput: ImportReconciliationInputV1 = {
    ...input,
    files: input.files.map((file) => ({
      importFileId: file.importFileId,
      logicalSource: file.logicalSource,
      records: [
        ...file.materialization.gradeEntries
          .filter(
            (value) =>
              !blockedComponentKeys.has(`${file.importFileId}:${value.assessmentComponentId}`),
          )
          .map((value) => ({
            kind: 'grade-entry' as const,
            value,
          })),
        ...(file.additionalRecords ?? []),
      ],
    })),
  };
  const recordPlan = await planImportReconciliation(recordsInput, repositories);
  return { ...recordPlan, assessmentComponentPlanV2 };
}
