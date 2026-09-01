import type {
  CouncilActorReferenceV1,
  CouncilClassReferenceV1,
  CouncilDecisionHistoryEntryV1,
  CouncilDecisionReferenceV1,
  CouncilDecisionSelectionV1,
  CouncilStudentReferenceV1,
} from '../../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import type { AcademicYearId } from '../../../../shared/gradebook-contracts/entities';

export interface CouncilDecisionStoreKeyV1 {
  readonly academicYearId: AcademicYearId;
  readonly classReference: CouncilClassReferenceV1;
  readonly studentReference: CouncilStudentReferenceV1;
}

export interface CouncilDecisionAppendV1 extends CouncilDecisionStoreKeyV1 {
  readonly expectedVersion: number;
  readonly decision: CouncilDecisionSelectionV1;
  readonly justification: string;
  readonly actorReference: CouncilActorReferenceV1;
  readonly decidedAt: string;
}

export type CouncilDecisionAppendResultV1 =
  | {
      readonly status: 'applied';
      readonly record: CouncilDecisionHistoryEntryV1;
    }
  | {
      readonly status: 'version-conflict';
      readonly currentVersion: number;
    };

export interface CouncilDecisionVersionV1 {
  readonly key: CouncilDecisionStoreKeyV1;
  readonly version: number;
}

export interface CouncilDecisionStoreV1 {
  getCurrent(key: CouncilDecisionStoreKeyV1): Promise<CouncilDecisionHistoryEntryV1 | null>;
  getHistory(key: CouncilDecisionStoreKeyV1): Promise<readonly CouncilDecisionHistoryEntryV1[]>;
  getVersions(keys: readonly CouncilDecisionStoreKeyV1[]): Promise<readonly CouncilDecisionVersionV1[]>;
  append(input: CouncilDecisionAppendV1): Promise<CouncilDecisionAppendResultV1>;
}

function keyToken(key: CouncilDecisionStoreKeyV1): string {
  return JSON.stringify([key.academicYearId, key.classReference, key.studentReference]);
}

function decisionReference(key: CouncilDecisionStoreKeyV1, version: number): CouncilDecisionReferenceV1 {
  return `council-decision:${encodeURIComponent(keyToken(key))}:${version}` as CouncilDecisionReferenceV1;
}

function frozenRecord(
  key: CouncilDecisionStoreKeyV1,
  version: number,
  input: CouncilDecisionAppendV1,
): CouncilDecisionHistoryEntryV1 {
  const reference = decisionReference(key, version);
  const decision = Object.freeze({ ...input.decision });
  const annualFinalDecision = Object.freeze({
    status: 'recorded' as const,
    outcome: decision.outcome,
    basis: 'class-council' as const,
    resultingState: decision.resultingState,
    decidedAt: input.decidedAt,
    reference,
  });
  return Object.freeze({
    decisionReference: reference,
    version,
    decision,
    annualFinalDecision,
    justification: input.justification,
    actorReference: input.actorReference,
    decidedAt: input.decidedAt,
  });
}

/**
 * Disposable process-local history implementation for local/preview use. It is append-only while
 * the process lives and deliberately makes no cross-restart durability claim.
 */
export function createLocalCouncilDecisionStoreV1(): CouncilDecisionStoreV1 {
  const histories = new Map<string, readonly CouncilDecisionHistoryEntryV1[]>();

  return {
    async getCurrent(key) {
      const history = histories.get(keyToken(key)) ?? [];
      return history.at(-1) ?? null;
    },

    async getHistory(key) {
      return [...(histories.get(keyToken(key)) ?? [])];
    },

    async getVersions(keys) {
      return keys.map((key) => ({
        key,
        version: histories.get(keyToken(key))?.at(-1)?.version ?? 0,
      }));
    },

    async append(input) {
      const token = keyToken(input);
      const history = histories.get(token) ?? [];
      const currentVersion = history.at(-1)?.version ?? 0;
      if (currentVersion !== input.expectedVersion) {
        return { status: 'version-conflict', currentVersion };
      }

      const record = frozenRecord(input, currentVersion + 1, input);
      histories.set(token, Object.freeze([...history, record]));
      return { status: 'applied', record };
    },
  };
}
