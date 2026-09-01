import {
  freezeBulletinSnapshotV1,
  isBulletinSnapshotCoherentV1,
  type BulletinSnapshotIdV1,
  type BulletinSnapshotV1,
} from '../../../../shared/gradebook-contracts/bulletins/bulletin-contract-v1';

export type BulletinSnapshotSeriesKeyV1 = string & {
  readonly __bulletinSnapshotSeriesKeyV1: true;
};

export type BulletinSnapshotAppendResultV1 =
  | { readonly status: 'appended'; readonly snapshot: BulletinSnapshotV1 }
  | { readonly status: 'version-conflict' }
  | { readonly status: 'incoherent-snapshot' };

/**
 * Provider-independent, append-only snapshot boundary. Remote storage is deliberately absent from
 * this implementation issue; a later adapter can implement this port without changing emission.
 */
export interface BulletinSnapshotRepositoryV1 {
  getLatest(seriesKey: BulletinSnapshotSeriesKeyV1): Promise<BulletinSnapshotV1 | null>;
  getHistorical(
    snapshotId: BulletinSnapshotIdV1,
    snapshotVersion: number,
  ): Promise<BulletinSnapshotV1 | null>;
  append(
    seriesKey: BulletinSnapshotSeriesKeyV1,
    snapshot: BulletinSnapshotV1,
    expectedPreviousVersion: number,
  ): Promise<BulletinSnapshotAppendResultV1>;
}

function cloneSnapshot(snapshot: BulletinSnapshotV1): BulletinSnapshotV1 {
  function clone<Value>(value: Value): Value {
    if (Array.isArray(value)) return value.map((item) => clone(item)) as Value;
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) result[key] = clone(item);
      return result as Value;
    }
    return value;
  }

  return clone(snapshot);
}

/**
 * Local/disposable snapshot storage. Every append owns a deep immutable copy; no object supplied by
 * the caller is retained, mutated or frozen through aliasing. It provisions no remote persistence.
 */
export function createLocalBulletinSnapshotRepositoryV1(): BulletinSnapshotRepositoryV1 {
  const bySeries = new Map<BulletinSnapshotSeriesKeyV1, BulletinSnapshotV1[]>();
  const byHistoricalIdentity = new Map<string, BulletinSnapshotV1>();

  function historicalKey(snapshotId: BulletinSnapshotIdV1, snapshotVersion: number): string {
    return `${snapshotId}\u0000${snapshotVersion}`;
  }

  return {
    async getLatest(seriesKey) {
      const snapshots = bySeries.get(seriesKey);
      return snapshots?.[snapshots.length - 1] ?? null;
    },

    async getHistorical(snapshotId, snapshotVersion) {
      return byHistoricalIdentity.get(historicalKey(snapshotId, snapshotVersion)) ?? null;
    },

    async append(seriesKey, candidate, expectedPreviousVersion) {
      if (!isBulletinSnapshotCoherentV1(candidate)) {
        return { status: 'incoherent-snapshot' };
      }

      const snapshots = bySeries.get(seriesKey) ?? [];
      const latest = snapshots[snapshots.length - 1] ?? null;
      const currentVersion = latest?.snapshotVersion ?? 0;
      if (
        currentVersion !== expectedPreviousVersion ||
        candidate.snapshotVersion !== expectedPreviousVersion + 1 ||
        (latest !== null && latest.snapshotId !== candidate.snapshotId) ||
        byHistoricalIdentity.has(historicalKey(candidate.snapshotId, candidate.snapshotVersion))
      ) {
        return { status: 'version-conflict' };
      }

      const snapshot = freezeBulletinSnapshotV1(cloneSnapshot(candidate));
      snapshots.push(snapshot);
      bySeries.set(seriesKey, snapshots);
      byHistoricalIdentity.set(
        historicalKey(snapshot.snapshotId, snapshot.snapshotVersion),
        snapshot,
      );
      return { status: 'appended', snapshot };
    },
  };
}

/** Backward-compatible name for the local/disposable implementation. */
export function createInMemoryBulletinSnapshotRepositoryV1(): BulletinSnapshotRepositoryV1 {
  return createLocalBulletinSnapshotRepositoryV1();
}
