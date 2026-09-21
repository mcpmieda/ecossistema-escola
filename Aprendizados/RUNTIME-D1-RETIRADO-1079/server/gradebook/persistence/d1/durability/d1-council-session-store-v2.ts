import type {
  CouncilClosureReferenceV2,
  CouncilClosureSnapshotV2,
  CouncilVoteTallyV2,
} from '../../../../../shared/gradebook-contracts/council/council-institutional-contract-v2';
import type {
  CouncilSessionCloseInputV2,
  CouncilSessionCloseResultV2,
  CouncilSessionStateV2,
  CouncilSessionStoreKeyV2,
  CouncilSessionStoreV2,
  CouncilSessionVoteInputV2,
  CouncilSessionVoteResultV2,
} from '../../../application/council/council-session-store-v2';
import {
  GradebookD1DurabilityConflictV1,
  runGradebookD1DurabilitySavepointV1,
} from './d1-durability-transaction-v1';
import type { D1WriteDatabaseV1, D1WriteRunResultV1 } from '../write/d1-write-adapter-v1';

export type GradebookD1CouncilSessionErrorCodeV2 =
  | 'database-read-failed'
  | 'database-write-failed'
  | 'invalid-input'
  | 'incompatible-row';

const ERROR_MESSAGES: Record<GradebookD1CouncilSessionErrorCodeV2, string> = {
  'database-read-failed': 'Não foi possível consultar a sessão institucional persistida.',
  'database-write-failed': 'Não foi possível persistir a sessão institucional.',
  'invalid-input': 'A sessão institucional recebida é inválida.',
  'incompatible-row': 'A sessão institucional persistida é incompatível.',
};

type SessionRowV2 = Record<string, unknown>;

export class GradebookD1CouncilSessionErrorV2 extends Error {
  readonly code: GradebookD1CouncilSessionErrorCodeV2;

  constructor(code: GradebookD1CouncilSessionErrorCodeV2) {
    super(ERROR_MESSAGES[code]);
    this.name = 'GradebookD1CouncilSessionErrorV2';
    this.code = code;
  }
}

function fail(code: GradebookD1CouncilSessionErrorCodeV2): never {
  throw new GradebookD1CouncilSessionErrorV2(code);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function validInstant(value: unknown): value is string {
  return (
    nonBlankString(value) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function changes(result: D1WriteRunResultV1): number {
  const value = result.meta?.changes ?? result.changes;
  if (result.success === false || !nonNegativeInteger(value)) return fail('database-write-failed');
  return value;
}

function validKey(key: CouncilSessionStoreKeyV2): boolean {
  return nonBlankString(key.academicYearId) && nonBlankString(key.classReference);
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

function voteComparison(
  approvedVotes: number,
  failedVotes: number,
): CouncilVoteTallyV2['comparison'] {
  if (approvedVotes === failedVotes) return 'tie';
  return approvedVotes > failedVotes ? 'approved-leading' : 'failed-leading';
}

function validVote(vote: unknown, stateVersion: number): vote is CouncilVoteTallyV2 {
  if (!isObject(vote)) return false;
  return (
    nonBlankString(vote.studentReference) &&
    nonNegativeInteger(vote.approvedVotes) &&
    nonNegativeInteger(vote.failedVotes) &&
    (vote.comparison === 'approved-leading' ||
      vote.comparison === 'failed-leading' ||
      vote.comparison === 'tie') &&
    vote.comparison === voteComparison(vote.approvedVotes, vote.failedVotes) &&
    positiveInteger(vote.version) &&
    vote.version <= stateVersion &&
    nonBlankString(vote.actorReference) &&
    validInstant(vote.recordedAt)
  );
}

function validClosure(
  closure: unknown,
  key: CouncilSessionStoreKeyV2,
  version: number,
): closure is CouncilClosureSnapshotV2 {
  if (!isObject(closure)) return false;
  return (
    nonBlankString(closure.closureReference) &&
    closure.closureReference === closureReference(key, version) &&
    closure.version === version &&
    closure.academicYearId === key.academicYearId &&
    closure.classReference === key.classReference &&
    nonBlankString(closure.reviewReference) &&
    Array.isArray(closure.items) &&
    nonBlankString(closure.closedBy) &&
    validInstant(closure.closedAt)
  );
}

function stateFromRow(row: SessionRowV2, key: CouncilSessionStoreKeyV2): CouncilSessionStateV2 {
  if (
    !positiveInteger(row.current_version) ||
    !positiveInteger(row.version) ||
    row.current_version !== row.version ||
    (row.root_state !== 'open' && row.root_state !== 'closed') ||
    (row.version_state !== 'open' && row.version_state !== 'closed') ||
    row.root_state !== row.version_state ||
    typeof row.payload_json !== 'string'
  ) {
    return fail('incompatible-row');
  }

  try {
    const parsed = JSON.parse(row.payload_json) as unknown;
    if (!isObject(parsed) || !Array.isArray(parsed.votes)) return fail('incompatible-row');
    const state = parsed as unknown as CouncilSessionStateV2;
    if (
      state.academicYearId !== key.academicYearId ||
      state.classReference !== key.classReference ||
      state.version !== row.version ||
      state.state !== row.version_state ||
      !state.votes.every((vote) => validVote(vote, state.version))
    ) {
      return fail('incompatible-row');
    }

    if (state.state === 'open') {
      if (state.closure !== null || row.closure_reference !== null) return fail('incompatible-row');
    } else {
      if (
        !validClosure(state.closure, key, state.version) ||
        row.closure_reference !== state.closure.closureReference
      ) {
        return fail('incompatible-row');
      }
    }
    return immutableClone(state);
  } catch (cause) {
    if (cause instanceof GradebookD1CouncilSessionErrorV2) throw cause;
    return fail('incompatible-row');
  }
}

function serializeState(state: CouncilSessionStateV2): string {
  try {
    const serialized = JSON.stringify(state);
    return serialized.length > 0 ? serialized : fail('database-write-failed');
  } catch {
    return fail('database-write-failed');
  }
}

function validVoteInput(input: CouncilSessionVoteInputV2): boolean {
  return (
    validKey(input) &&
    nonBlankString(input.studentReference) &&
    nonNegativeInteger(input.expectedVersion) &&
    nonNegativeInteger(input.approvedVotes) &&
    nonNegativeInteger(input.failedVotes) &&
    nonBlankString(input.actorReference) &&
    validInstant(input.recordedAt)
  );
}

function validCloseInput(input: CouncilSessionCloseInputV2): boolean {
  return (
    validKey(input) &&
    nonNegativeInteger(input.expectedVersion) &&
    nonBlankString(input.reviewReference) &&
    Array.isArray(input.items) &&
    nonBlankString(input.actorReference) &&
    validInstant(input.closedAt)
  );
}

export class GradebookD1CouncilSessionStoreV2 implements CouncilSessionStoreV2 {
  private readonly tails = new Map<string, Promise<void>>();

  constructor(private readonly database: D1WriteDatabaseV1) {}

  private async safelyRead<Result>(operation: () => Promise<Result>): Promise<Result> {
    try {
      return await operation();
    } catch (cause) {
      if (cause instanceof GradebookD1CouncilSessionErrorV2) throw cause;
      return fail('database-read-failed');
    }
  }

  private async readState(
    database: D1WriteDatabaseV1,
    key: CouncilSessionStoreKeyV2,
  ): Promise<CouncilSessionStateV2> {
    const row = await database
      .prepare(
        `SELECT s.current_version, s.state AS root_state,
                v.version, v.state AS version_state,
                v.closure_reference, v.payload_json
           FROM council_session_streams AS s
           JOIN council_session_versions AS v
             ON v.academic_year_id = s.academic_year_id
            AND v.class_reference = s.class_reference
            AND v.version = s.current_version
          WHERE s.academic_year_id = ?
            AND s.class_reference = ?`,
      )
      .bind(key.academicYearId, key.classReference)
      .first<SessionRowV2>();
    return row === null ? initialState(key) : stateFromRow(row, key);
  }

  private async appendState(
    database: D1WriteDatabaseV1,
    previous: CouncilSessionStateV2,
    next: CouncilSessionStateV2,
  ): Promise<void> {
    if (next.version !== previous.version + 1 || next.state === 'open' && next.closure !== null) {
      return fail('database-write-failed');
    }

    if (previous.version === 0) {
      const inserted = changes(
        await database
          .prepare(
            `INSERT OR IGNORE INTO council_session_streams (
               academic_year_id, class_reference, current_version, state
             ) VALUES (?, ?, 1, ?)`,
          )
          .bind(next.academicYearId, next.classReference, next.state)
          .run(),
      );
      if (inserted !== 1) throw new GradebookD1DurabilityConflictV1();
    } else {
      const advanced = changes(
        await database
          .prepare(
            `UPDATE council_session_streams
                SET current_version = ?, state = ?
              WHERE academic_year_id = ?
                AND class_reference = ?
                AND current_version = ?
                AND state = ?`,
          )
          .bind(
            next.version,
            next.state,
            next.academicYearId,
            next.classReference,
            previous.version,
            previous.state,
          )
          .run(),
      );
      if (advanced !== 1) throw new GradebookD1DurabilityConflictV1();
    }

    const appended = changes(
      await database
        .prepare(
          `INSERT INTO council_session_versions (
             academic_year_id, class_reference, version, previous_version,
             state, closure_reference, payload_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          next.academicYearId,
          next.classReference,
          next.version,
          previous.version === 0 ? null : previous.version,
          next.state,
          next.closure?.closureReference ?? null,
          serializeState(next),
        )
        .run(),
    );
    if (appended !== 1) return fail('database-write-failed');
  }

  async getState(key: CouncilSessionStoreKeyV2): Promise<CouncilSessionStateV2> {
    if (!validKey(key)) return fail('invalid-input');
    return this.safelyRead(() => this.readState(this.database, key));
  }

  async getHistory(key: CouncilSessionStoreKeyV2): Promise<readonly CouncilClosureSnapshotV2[]> {
    if (!validKey(key)) return fail('invalid-input');
    return this.safelyRead(async () => {
      const result = await this.database
        .prepare(
          `SELECT version AS current_version, state AS root_state,
                  version, state AS version_state, closure_reference, payload_json
             FROM council_session_versions
            WHERE academic_year_id = ?
              AND class_reference = ?
              AND state = 'closed'
            ORDER BY version ASC`,
        )
        .bind(key.academicYearId, key.classReference)
        .all<SessionRowV2>();
      if (!Array.isArray(result.results)) return fail('database-read-failed');
      return result.results.map((row) => {
        const state = stateFromRow(row, key);
        if (state.state !== 'closed' || state.closure === null) return fail('incompatible-row');
        return state.closure;
      });
    });
  }

  async runExclusive<T>(key: CouncilSessionStoreKeyV2, operation: () => Promise<T>): Promise<T> {
    if (!validKey(key)) return fail('invalid-input');
    const token = keyToken(key);
    const previous = this.tails.get(token) ?? Promise.resolve();
    const ready = previous.catch(() => undefined);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = ready.then(() => gate);
    this.tails.set(token, tail);
    await ready;
    try {
      return await operation();
    } finally {
      release();
      if (this.tails.get(token) === tail) this.tails.delete(token);
    }
  }

  async touchOpen(key: CouncilSessionStoreKeyV2): Promise<
    | { readonly status: 'touched'; readonly version: number }
    | { readonly status: 'closed'; readonly currentVersion: number }
  > {
    if (!validKey(key)) return fail('invalid-input');
    try {
      return await runGradebookD1DurabilitySavepointV1(this.database, async (database) => {
        const state = await this.readState(database, key);
        if (state.state === 'closed') {
          return { status: 'closed' as const, currentVersion: state.version };
        }
        const next = immutableClone({ ...state, version: state.version + 1 });
        await this.appendState(database, state, next);
        return { status: 'touched' as const, version: next.version };
      });
    } catch (cause) {
      if (cause instanceof GradebookD1DurabilityConflictV1) {
        const current = await this.getState(key);
        if (current.state === 'closed') {
          return { status: 'closed', currentVersion: current.version };
        }
      }
      if (cause instanceof GradebookD1CouncilSessionErrorV2) throw cause;
      return fail('database-write-failed');
    }
  }

  async recordVote(input: CouncilSessionVoteInputV2): Promise<CouncilSessionVoteResultV2> {
    if (!validVoteInput(input)) return fail('invalid-input');
    try {
      return await runGradebookD1DurabilitySavepointV1(this.database, async (database) => {
        const state = await this.readState(database, input);
        if (state.state === 'closed') {
          return { status: 'closed' as const, currentVersion: state.version };
        }
        if (state.version !== input.expectedVersion) {
          return { status: 'version-conflict' as const, currentVersion: state.version };
        }

        const version = state.version + 1;
        const vote = immutableClone({
          studentReference: input.studentReference,
          approvedVotes: input.approvedVotes,
          failedVotes: input.failedVotes,
          comparison: voteComparison(input.approvedVotes, input.failedVotes),
          version,
          actorReference: input.actorReference,
          recordedAt: input.recordedAt,
        } satisfies CouncilVoteTallyV2);
        const votes = [...state.votes];
        const existingIndex = votes.findIndex(
          (candidate) => candidate.studentReference === input.studentReference,
        );
        if (existingIndex === -1) votes.push(vote);
        else votes[existingIndex] = vote;
        const next = immutableClone({
          ...state,
          version,
          votes: Object.freeze(votes) as readonly CouncilVoteTallyV2[],
        });
        await this.appendState(database, state, next);
        return { status: 'applied' as const, version, vote };
      });
    } catch (cause) {
      if (cause instanceof GradebookD1DurabilityConflictV1) {
        const current = await this.getState(input);
        return current.state === 'closed'
          ? { status: 'closed', currentVersion: current.version }
          : { status: 'version-conflict', currentVersion: current.version };
      }
      if (cause instanceof GradebookD1CouncilSessionErrorV2) throw cause;
      return fail('database-write-failed');
    }
  }

  async close(input: CouncilSessionCloseInputV2): Promise<CouncilSessionCloseResultV2> {
    if (!validCloseInput(input)) return fail('invalid-input');
    try {
      return await runGradebookD1DurabilitySavepointV1(this.database, async (database) => {
        const state = await this.readState(database, input);
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
        const next = immutableClone({
          academicYearId: input.academicYearId,
          classReference: input.classReference,
          state: 'closed' as const,
          version,
          votes: state.votes,
          closure: snapshot,
        } satisfies CouncilSessionStateV2);
        await this.appendState(database, state, next);
        return { status: 'closed' as const, version, snapshot };
      });
    } catch (cause) {
      if (cause instanceof GradebookD1DurabilityConflictV1) {
        const current = await this.getState(input);
        return current.state === 'closed'
          ? { status: 'already-closed', currentVersion: current.version }
          : { status: 'version-conflict', currentVersion: current.version };
      }
      if (cause instanceof GradebookD1CouncilSessionErrorV2) throw cause;
      return fail('database-write-failed');
    }
  }
}

export function createGradebookD1CouncilSessionStoreV2(
  database: D1WriteDatabaseV1,
): GradebookD1CouncilSessionStoreV2 {
  return new GradebookD1CouncilSessionStoreV2(database);
}
