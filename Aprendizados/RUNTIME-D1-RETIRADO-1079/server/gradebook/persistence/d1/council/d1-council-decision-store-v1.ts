import {
  COUNCIL_WORKSPACE_MAX_JUSTIFICATION_LENGTH_V1,
  type CouncilDecisionHistoryEntryV1,
  type CouncilDecisionReferenceV1,
} from '../../../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import type {
  CouncilDecisionAppendResultV1,
  CouncilDecisionAppendV1,
  CouncilDecisionStoreKeyV1,
  CouncilDecisionStoreV1,
  CouncilDecisionVersionV1,
} from '../../../application/council/council-decision-store-v1';
import {
  GradebookD1DurabilityConflictV1,
  runGradebookD1DurabilitySavepointV1,
} from '../durability/d1-durability-transaction-v1';
import type { D1WriteDatabaseV1, D1WriteRunResultV1 } from '../write/d1-write-adapter-v1';

export const D1_COUNCIL_HISTORY_MIN_LIMIT_V1 = 1 as const;
export const D1_COUNCIL_HISTORY_MAX_LIMIT_V1 = 100 as const;
export const D1_COUNCIL_VERSION_BATCH_MAX_KEYS_V1 = 100 as const;

export type D1CouncilHistoryCursorV1 = string & {
  readonly __d1CouncilHistoryCursorV1: true;
};

export interface D1CouncilDecisionHistoryPageQueryV1 {
  readonly key: CouncilDecisionStoreKeyV1;
  readonly limit: number;
  readonly cursor: D1CouncilHistoryCursorV1 | null;
}

export interface D1CouncilDecisionHistoryPageV1 {
  /** Items are newest first; the provider-independent getHistory keeps chronological order. */
  readonly items: readonly CouncilDecisionHistoryEntryV1[];
  readonly nextCursor: D1CouncilHistoryCursorV1 | null;
}

export type GradebookD1CouncilDecisionErrorCodeV1 =
  | 'database-read-failed'
  | 'database-write-failed'
  | 'invalid-input'
  | 'invalid-page'
  | 'invalid-cursor'
  | 'incompatible-row';

const ERROR_MESSAGES: Record<GradebookD1CouncilDecisionErrorCodeV1, string> = {
  'database-read-failed': 'Não foi possível consultar as decisões persistidas.',
  'database-write-failed': 'Não foi possível persistir a decisão.',
  'invalid-input': 'A decisão recebida é inválida.',
  'invalid-page': 'A página de decisões solicitada é inválida.',
  'invalid-cursor': 'O cursor de decisões é inválido.',
  'incompatible-row': 'A decisão persistida é incompatível.',
};

export class GradebookD1CouncilDecisionErrorV1 extends Error {
  readonly code: GradebookD1CouncilDecisionErrorCodeV1;

  constructor(code: GradebookD1CouncilDecisionErrorCodeV1) {
    super(ERROR_MESSAGES[code]);
    this.name = 'GradebookD1CouncilDecisionErrorV1';
    this.code = code;
  }
}

type DecisionRowV1 = Record<string, unknown>;

function fail(code: GradebookD1CouncilDecisionErrorCodeV1): never {
  throw new GradebookD1CouncilDecisionErrorV1(code);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
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

function changes(result: D1WriteRunResultV1): number {
  const value = result.meta?.changes ?? result.changes;
  if (result.success === false || !nonNegativeInteger(value)) {
    return fail('database-write-failed');
  }
  return value;
}

function sameKey(left: CouncilDecisionStoreKeyV1, right: CouncilDecisionStoreKeyV1): boolean {
  return (
    left.academicYearId === right.academicYearId &&
    left.classReference === right.classReference &&
    left.studentReference === right.studentReference
  );
}

function validKey(key: CouncilDecisionStoreKeyV1): boolean {
  return (
    nonBlankString(key.academicYearId) &&
    nonBlankString(key.classReference) &&
    nonBlankString(key.studentReference)
  );
}

function validDecisionInput(input: CouncilDecisionAppendV1): boolean {
  if (
    input === null ||
    typeof input !== 'object' ||
    input.decision === null ||
    typeof input.decision !== 'object'
  ) {
    return false;
  }
  const decisionIsCanonical =
    (input.decision.outcome === 'approved' &&
      input.decision.resultingState === 'approved-by-council') ||
    (input.decision.outcome === 'failed' &&
      input.decision.resultingState === 'failed-by-council-decision');
  return (
    validKey(input) &&
    nonNegativeInteger(input.expectedVersion) &&
    decisionIsCanonical &&
    nonBlankString(input.justification) &&
    input.justification.length <= COUNCIL_WORKSPACE_MAX_JUSTIFICATION_LENGTH_V1 &&
    nonBlankString(input.actorReference) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(input.decidedAt) &&
    !Number.isNaN(Date.parse(input.decidedAt))
  );
}

function decisionReference(
  key: CouncilDecisionStoreKeyV1,
  version: number,
): CouncilDecisionReferenceV1 {
  const token = JSON.stringify([key.academicYearId, key.classReference, key.studentReference]);
  return `council-decision:${encodeURIComponent(token)}:${version}` as CouncilDecisionReferenceV1;
}

function frozenRecord(
  input: CouncilDecisionAppendV1,
  version: number,
): CouncilDecisionHistoryEntryV1 {
  const reference = decisionReference(input, version);
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

function serializeRecord(record: CouncilDecisionHistoryEntryV1): string {
  try {
    const payload = JSON.stringify(record);
    return nonEmptyString(payload) ? payload : fail('database-write-failed');
  } catch {
    return fail('database-write-failed');
  }
}

function recordFromRow(row: DecisionRowV1): CouncilDecisionHistoryEntryV1 {
  if (!nonEmptyString(row.payload_json) || !positiveInteger(row.version)) {
    return fail('incompatible-row');
  }
  try {
    const record = JSON.parse(row.payload_json) as CouncilDecisionHistoryEntryV1;
    if (
      record.version !== row.version ||
      record.decisionReference !== row.decision_reference ||
      record.decision.outcome !== row.decision_outcome ||
      record.decision.resultingState !== row.resulting_state ||
      record.justification !== row.justification ||
      record.actorReference !== row.actor_reference ||
      record.decidedAt !== row.decided_at ||
      record.annualFinalDecision.status !== 'recorded' ||
      record.annualFinalDecision.basis !== 'class-council' ||
      record.annualFinalDecision.outcome !== record.decision.outcome ||
      record.annualFinalDecision.resultingState !== record.decision.resultingState ||
      record.annualFinalDecision.decidedAt !== record.decidedAt ||
      record.annualFinalDecision.reference !== record.decisionReference
    ) {
      return fail('incompatible-row');
    }
    return Object.freeze({
      ...record,
      decision: Object.freeze({ ...record.decision }),
      annualFinalDecision: Object.freeze({ ...record.annualFinalDecision }),
    });
  } catch (cause) {
    if (cause instanceof GradebookD1CouncilDecisionErrorV1) throw cause;
    return fail('incompatible-row');
  }
}

function encodeCursor(version: number): D1CouncilHistoryCursorV1 {
  return encodeURIComponent(JSON.stringify([version])) as D1CouncilHistoryCursorV1;
}

function decodeCursor(cursor: D1CouncilHistoryCursorV1): number {
  try {
    const value = JSON.parse(decodeURIComponent(cursor)) as unknown;
    if (!Array.isArray(value) || value.length !== 1 || !positiveInteger(value[0])) {
      return fail('invalid-cursor');
    }
    return value[0];
  } catch (cause) {
    if (cause instanceof GradebookD1CouncilDecisionErrorV1) throw cause;
    return fail('invalid-cursor');
  }
}

function validPageLimit(limit: number): boolean {
  return (
    Number.isInteger(limit) &&
    limit >= D1_COUNCIL_HISTORY_MIN_LIMIT_V1 &&
    limit <= D1_COUNCIL_HISTORY_MAX_LIMIT_V1
  );
}

export class GradebookD1CouncilDecisionStoreV1 implements CouncilDecisionStoreV1 {
  constructor(private readonly database: D1WriteDatabaseV1) {}

  private async safelyRead<Result>(operation: () => Promise<Result>): Promise<Result> {
    try {
      return await operation();
    } catch (cause) {
      if (cause instanceof GradebookD1CouncilDecisionErrorV1) throw cause;
      return fail('database-read-failed');
    }
  }

  async getCurrent(key: CouncilDecisionStoreKeyV1): Promise<CouncilDecisionHistoryEntryV1 | null> {
    if (!validKey(key)) return null;
    return this.safelyRead(async () => {
      const row = await this.database
        .prepare(
          `SELECT v.version, v.decision_reference, v.decision_outcome,
                  v.resulting_state, v.justification, v.actor_reference,
                  v.decided_at, v.payload_json
             FROM council_decision_streams AS s
             JOIN council_decision_versions AS v
               ON v.academic_year_id = s.academic_year_id
              AND v.class_reference = s.class_reference
              AND v.student_reference = s.student_reference
              AND v.version = s.current_version
            WHERE s.academic_year_id = ?
              AND s.class_reference = ?
              AND s.student_reference = ?`,
        )
        .bind(key.academicYearId, key.classReference, key.studentReference)
        .first<DecisionRowV1>();
      return row === null ? null : recordFromRow(row);
    });
  }

  async getHistorical(
    key: CouncilDecisionStoreKeyV1,
    version: number,
  ): Promise<CouncilDecisionHistoryEntryV1 | null> {
    if (!validKey(key) || !positiveInteger(version)) return null;
    return this.safelyRead(async () => {
      const row = await this.database
        .prepare(
          `SELECT version, decision_reference, decision_outcome, resulting_state,
                  justification, actor_reference, decided_at, payload_json
             FROM council_decision_versions
            WHERE academic_year_id = ?
              AND class_reference = ?
              AND student_reference = ?
              AND version = ?`,
        )
        .bind(key.academicYearId, key.classReference, key.studentReference, version)
        .first<DecisionRowV1>();
      return row === null ? null : recordFromRow(row);
    });
  }

  async getHistory(
    key: CouncilDecisionStoreKeyV1,
  ): Promise<readonly CouncilDecisionHistoryEntryV1[]> {
    if (!validKey(key)) return [];
    return this.safelyRead(async () => {
      const result = await this.database
        .prepare(
          `SELECT version, decision_reference, decision_outcome, resulting_state,
                  justification, actor_reference, decided_at, payload_json
             FROM council_decision_versions
            WHERE academic_year_id = ?
              AND class_reference = ?
              AND student_reference = ?
            ORDER BY version ASC`,
        )
        .bind(key.academicYearId, key.classReference, key.studentReference)
        .all<DecisionRowV1>();
      if (!Array.isArray(result.results)) return fail('database-read-failed');
      return result.results.map(recordFromRow);
    });
  }

  async getHistoryPage(
    query: D1CouncilDecisionHistoryPageQueryV1,
  ): Promise<D1CouncilDecisionHistoryPageV1> {
    if (!validKey(query.key) || !validPageLimit(query.limit)) return fail('invalid-page');
    const cursor = query.cursor === null ? null : decodeCursor(query.cursor);
    return this.safelyRead(async () => {
      const values: (string | number)[] = [
        query.key.academicYearId,
        query.key.classReference,
        query.key.studentReference,
      ];
      const cursorPredicate = cursor === null ? '' : 'AND version < ?';
      if (cursor !== null) values.push(cursor);
      values.push(query.limit + 1);
      const result = await this.database
        .prepare(
          `SELECT version, decision_reference, decision_outcome, resulting_state,
                  justification, actor_reference, decided_at, payload_json
             FROM council_decision_versions
            WHERE academic_year_id = ?
              AND class_reference = ?
              AND student_reference = ?
              ${cursorPredicate}
            ORDER BY version DESC
            LIMIT ?`,
        )
        .bind(...values)
        .all<DecisionRowV1>();
      if (!Array.isArray(result.results)) return fail('database-read-failed');
      const hasMore = result.results.length > query.limit;
      const rows = result.results.slice(0, query.limit);
      const lastVersion = rows.at(-1)?.version;
      return {
        items: rows.map(recordFromRow),
        nextCursor: hasMore && positiveInteger(lastVersion) ? encodeCursor(lastVersion) : null,
      };
    });
  }

  async getVersions(
    keys: readonly CouncilDecisionStoreKeyV1[],
  ): Promise<readonly CouncilDecisionVersionV1[]> {
    if (keys.length === 0) return [];
    if (keys.length > D1_COUNCIL_VERSION_BATCH_MAX_KEYS_V1 || keys.some((key) => !validKey(key))) {
      return fail('invalid-page');
    }

    return this.safelyRead(async () => {
      const valuesClause = keys.map(() => '(?, ?, ?, ?)').join(', ');
      const values = keys.flatMap((key, ordinal) => [
        ordinal,
        key.academicYearId,
        key.classReference,
        key.studentReference,
      ]);
      const result = await this.database
        .prepare(
          `WITH requested (
             ordinal, academic_year_id, class_reference, student_reference
           ) AS (VALUES ${valuesClause})
           SELECT requested.ordinal, requested.academic_year_id,
                  requested.class_reference, requested.student_reference,
                  COALESCE(streams.current_version, 0) AS current_version
             FROM requested
             LEFT JOIN council_decision_streams AS streams
               ON streams.academic_year_id = requested.academic_year_id
              AND streams.class_reference = requested.class_reference
              AND streams.student_reference = requested.student_reference
            ORDER BY requested.ordinal`,
        )
        .bind(...values)
        .all<DecisionRowV1>();
      if (!Array.isArray(result.results) || result.results.length !== keys.length) {
        return fail('database-read-failed');
      }
      return result.results.map((row, index) => {
        const key = keys[index];
        const rowKey = {
          academicYearId: row.academic_year_id,
          classReference: row.class_reference,
          studentReference: row.student_reference,
        } as CouncilDecisionStoreKeyV1;
        if (
          key === undefined ||
          !sameKey(key, rowKey) ||
          !nonNegativeInteger(row.current_version)
        ) {
          return fail('incompatible-row');
        }
        return { key, version: row.current_version };
      });
    });
  }

  async append(input: CouncilDecisionAppendV1): Promise<CouncilDecisionAppendResultV1> {
    if (!validDecisionInput(input)) return fail('invalid-input');
    const version = input.expectedVersion + 1;
    const record = frozenRecord(input, version);
    const payload = serializeRecord(record);

    try {
      return await runGradebookD1DurabilitySavepointV1(this.database, async (database) => {
        const current = await database
          .prepare(
            `SELECT current_version
               FROM council_decision_streams
              WHERE academic_year_id = ?
                AND class_reference = ?
                AND student_reference = ?`,
          )
          .bind(input.academicYearId, input.classReference, input.studentReference)
          .first<DecisionRowV1>();
        const currentVersion =
          current === null
            ? 0
            : positiveInteger(current.current_version)
              ? current.current_version
              : fail('database-write-failed');
        if (currentVersion !== input.expectedVersion) {
          return { status: 'version-conflict', currentVersion } as const;
        }

        if (current === null) {
          const inserted = changes(
            await database
              .prepare(
                `INSERT OR IGNORE INTO council_decision_streams (
                   academic_year_id, class_reference, student_reference,
                   current_version, created_at
                 ) VALUES (?, ?, ?, 1, ?)`,
              )
              .bind(
                input.academicYearId,
                input.classReference,
                input.studentReference,
                input.decidedAt,
              )
              .run(),
          );
          if (inserted !== 1) {
            const persisted = await this.readCurrentVersion(input);
            return { status: 'version-conflict', currentVersion: persisted } as const;
          }
        } else {
          const advanced = changes(
            await database
              .prepare(
                `UPDATE council_decision_streams
                    SET current_version = ?
                  WHERE academic_year_id = ?
                    AND class_reference = ?
                    AND student_reference = ?
                    AND current_version = ?`,
              )
              .bind(
                version,
                input.academicYearId,
                input.classReference,
                input.studentReference,
                input.expectedVersion,
              )
              .run(),
          );
          if (advanced !== 1) {
            const persisted = await this.readCurrentVersion(input);
            return { status: 'version-conflict', currentVersion: persisted } as const;
          }
        }

        const appended = changes(
          await database
            .prepare(
              `INSERT INTO council_decision_versions (
                 academic_year_id, class_reference, student_reference,
                 version, previous_version, decision_reference, decision_outcome,
                 resulting_state, justification, actor_reference, decided_at, payload_json
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              input.academicYearId,
              input.classReference,
              input.studentReference,
              version,
              input.expectedVersion === 0 ? null : input.expectedVersion,
              record.decisionReference,
              record.decision.outcome,
              record.decision.resultingState,
              record.justification,
              record.actorReference,
              record.decidedAt,
              payload,
            )
            .run(),
        );
        if (appended !== 1) return fail('database-write-failed');
        return { status: 'applied', record } as const;
      });
    } catch (cause) {
      if (cause instanceof GradebookD1DurabilityConflictV1) {
        return {
          status: 'version-conflict',
          currentVersion: await this.readCurrentVersion(input),
        };
      }
      if (cause instanceof GradebookD1CouncilDecisionErrorV1) throw cause;
      return fail('database-write-failed');
    }
  }

  private async readCurrentVersion(key: CouncilDecisionStoreKeyV1): Promise<number> {
    const row = await this.database
      .prepare(
        `SELECT current_version
           FROM council_decision_streams
          WHERE academic_year_id = ?
            AND class_reference = ?
            AND student_reference = ?`,
      )
      .bind(key.academicYearId, key.classReference, key.studentReference)
      .first<DecisionRowV1>();
    if (row === null) return 0;
    return positiveInteger(row.current_version)
      ? row.current_version
      : fail('database-write-failed');
  }
}

export function createGradebookD1CouncilDecisionStoreV1(
  database: D1WriteDatabaseV1,
): GradebookD1CouncilDecisionStoreV1 {
  return new GradebookD1CouncilDecisionStoreV1(database);
}
