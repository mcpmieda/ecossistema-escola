import type { AcademicYearId } from '../../../../shared/gradebook-contracts/entities';
import type {
  CouncilActorReferenceV1,
  CouncilClassReferenceV1,
  CouncilStudentReferenceV1,
} from '../../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import type {
  CouncilClosureReferenceV2,
  CouncilClosureReviewItemV2,
  CouncilClosureSnapshotV2,
  CouncilReviewReferenceV2,
  CouncilVoteTallyV2,
} from '../../../../shared/gradebook-contracts/council/council-institutional-contract-v2';

export interface CouncilSessionStoreKeyV2 {
  readonly academicYearId: AcademicYearId;
  readonly classReference: CouncilClassReferenceV1;
}

export interface CouncilSessionStateV2 extends CouncilSessionStoreKeyV2 {
  readonly state: 'open' | 'closed';
  readonly version: number;
  readonly votes: readonly CouncilVoteTallyV2[];
  readonly closure: CouncilClosureSnapshotV2 | null;
}

export interface CouncilSessionVoteInputV2 extends CouncilSessionStoreKeyV2 {
  readonly studentReference: CouncilStudentReferenceV1;
  readonly expectedVersion: number;
  readonly approvedVotes: number;
  readonly failedVotes: number;
  readonly actorReference: CouncilActorReferenceV1;
  readonly recordedAt: string;
}

export type CouncilSessionVoteResultV2 =
  | {
      readonly status: 'applied';
      readonly version: number;
      readonly vote: CouncilVoteTallyV2;
    }
  | {
      readonly status: 'version-conflict';
      readonly currentVersion: number;
    }
  | {
      readonly status: 'closed';
      readonly currentVersion: number;
    };

export interface CouncilSessionCloseInputV2 extends CouncilSessionStoreKeyV2 {
  readonly expectedVersion: number;
  readonly reviewReference: CouncilReviewReferenceV2;
  readonly items: readonly CouncilClosureReviewItemV2[];
  readonly actorReference: CouncilActorReferenceV1;
  readonly closedAt: string;
}

export type CouncilSessionCloseResultV2 =
  | {
      readonly status: 'closed';
      readonly version: number;
      readonly snapshot: CouncilClosureSnapshotV2;
    }
  | {
      readonly status: 'version-conflict';
      readonly currentVersion: number;
    }
  | {
      readonly status: 'already-closed';
      readonly currentVersion: number;
    };

/**
 * Provider-independent institutional session port. Physical D1 durability is intentionally not
 * selected here; #340 owns physical decision/snapshot durability and #343 composes providers.
 */
export interface CouncilSessionStoreV2 {
  getState(key: CouncilSessionStoreKeyV2): Promise<CouncilSessionStateV2>;
  getHistory(key: CouncilSessionStoreKeyV2): Promise<readonly CouncilClosureSnapshotV2[]>;
  runExclusive<T>(key: CouncilSessionStoreKeyV2, operation: () => Promise<T>): Promise<T>;
  touchOpen(key: CouncilSessionStoreKeyV2): Promise<
    | { readonly status: 'touched'; readonly version: number }
    | { readonly status: 'closed'; readonly currentVersion: number }
  >;
  recordVote(input: CouncilSessionVoteInputV2): Promise<CouncilSessionVoteResultV2>;
  close(input: CouncilSessionCloseInputV2): Promise<CouncilSessionCloseResultV2>;
}

function keyToken(key: CouncilSessionStoreKeyV2): string {
  return JSON.stringify([key.academicYearId, key.classReference]);
}

function closureReference(
  key: CouncilSessionStoreKeyV2,
  version: number,
): CouncilClosureReferenceV2 {
  return `council-closure:${encodeURIComponent(keyToken(key))}:${version}` as CouncilClosureReferenceV2;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function immutableClone<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function initialState(key: CouncilSessionStoreKeyV2): CouncilSessionStateV2 {
  return Object.freeze({
    academicYearId: key.academicYearId,
    classReference: key.classReference,
    state: 'open' as const,
    version: 0,
    votes: Object.freeze([]) as readonly CouncilVoteTallyV2[],
    closure: null,
  });
}

function voteComparison(approvedVotes: number, failedVotes: number): CouncilVoteTallyV2['comparison'] {
  if (approvedVotes === failedVotes) return 'tie';
  return approvedVotes > failedVotes ? 'approved-leading' : 'failed-leading';
}

/**
 * Disposable process-local V2 session implementation. State is immutable while the process lives,
 * closing is append-only, reopening is intentionally absent and no cross-restart durability is claimed.
 */
export function createLocalCouncilSessionStoreV2(): CouncilSessionStoreV2 {
  const states = new Map<string, CouncilSessionStateV2>();
  const histories = new Map<string, readonly CouncilClosureSnapshotV2[]>();
  const tails = new Map<string, Promise<void>>();

  function current(key: CouncilSessionStoreKeyV2): CouncilSessionStateV2 {
    return states.get(keyToken(key)) ?? initialState(key);
  }

  return {
    async getState(key) {
      return current(key);
    },

    async getHistory(key) {
      return [...(histories.get(keyToken(key)) ?? [])];
    },

    async runExclusive<T>(key: CouncilSessionStoreKeyV2, operation: () => Promise<T>): Promise<T> {
      const token = keyToken(key);
      const previous = tails.get(token) ?? Promise.resolve();
      const ready = previous.catch(() => undefined);
      let release: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const tail = ready.then(() => gate);
      tails.set(token, tail);
      await ready;
      try {
        return await operation();
      } finally {
        release?.();
        if (tails.get(token) === tail) tails.delete(token);
      }
    },

    async touchOpen(key) {
      const state = current(key);
      if (state.state === 'closed') {
        return { status: 'closed' as const, currentVersion: state.version };
      }
      const next = Object.freeze({ ...state, version: state.version + 1 });
      states.set(keyToken(key), next);
      return { status: 'touched' as const, version: next.version };
    },

    async recordVote(input) {
      const state = current(input);
      if (state.state === 'closed') {
        return { status: 'closed' as const, currentVersion: state.version };
      }
      if (state.version !== input.expectedVersion) {
        return { status: 'version-conflict' as const, currentVersion: state.version };
      }

      const version = state.version + 1;
      const vote = deepFreeze({
        studentReference: input.studentReference,
        approvedVotes: input.approvedVotes,
        failedVotes: input.failedVotes,
        comparison: voteComparison(input.approvedVotes, input.failedVotes),
        version,
        actorReference: input.actorReference,
        recordedAt: input.recordedAt,
      } satisfies CouncilVoteTallyV2);
      const existingIndex = state.votes.findIndex(
        (item) => item.studentReference === input.studentReference,
      );
      const votes = [...state.votes];
      if (existingIndex === -1) votes.push(vote);
      else votes[existingIndex] = vote;
      const next = Object.freeze({
        ...state,
        version,
        votes: Object.freeze(votes) as readonly CouncilVoteTallyV2[],
      });
      states.set(keyToken(input), next);
      return { status: 'applied' as const, version, vote };
    },

    async close(input) {
      const state = current(input);
      if (state.state === 'closed') {
        return { status: 'already-closed' as const, currentVersion: state.version };
      }
      if (state.version !== input.expectedVersion) {
        return { status: 'version-conflict' as const, currentVersion: state.version };
      }

      const version = state.version + 1;
      const snapshot = immutableClone({
        closureReference: closureReference(input, version),
        version,
        academicYearId: input.academicYearId,
        classReference: input.classReference,
        reviewReference: input.reviewReference,
        items: input.items,
        closedBy: input.actorReference,
        closedAt: input.closedAt,
      } satisfies CouncilClosureSnapshotV2);
      const token = keyToken(input);
      const history = histories.get(token) ?? [];
      histories.set(token, Object.freeze([...history, snapshot]));
      states.set(
        token,
        Object.freeze({
          academicYearId: input.academicYearId,
          classReference: input.classReference,
          state: 'closed' as const,
          version,
          votes: state.votes,
          closure: snapshot,
        }),
      );
      return { status: 'closed' as const, version, snapshot };
    },
  };
}
