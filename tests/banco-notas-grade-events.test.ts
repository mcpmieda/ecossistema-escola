import { describe, expect, it, vi } from 'vitest';
import type {
  GradeEventCommit,
  GradeEventInput,
  GradeEventStore,
  GradeField,
  GradeSnapshot,
  StoredGradeEvent,
} from '../shared/banco-notas-grade-events';
import { GradeEventConflictError, ingestGradeEvent } from '../server/banco-notas/grade-events';

const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const MODEL_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const CORRELATION_ID = '44444444-4444-4444-8444-444444444444';
const RECEIVED_AT = '2026-08-25T12:00:01.000Z';

function input(overrides: Partial<GradeEventInput> = {}): GradeEventInput {
  return {
    schemaVersion: 1,
    eventId: EVENT_ID,
    correlationId: CORRELATION_ID,
    eventType: 'grade.changed',
    gradeKey: '2026|T01|M|aluno-sintetico-001',
    field: 'NotaT1',
    dataSourceId: SOURCE_ID,
    teacherModelId: MODEL_ID,
    source: {
      kind: 'excel-addin',
      workbookId: 'workbook-sintetico',
      worksheetId: 'worksheet-sintetico',
      cellAddress: 'F12',
    },
    valueBefore: null,
    valueAfter: 7.5,
    isAbsent: false,
    sequence: 1,
    clientSentAt: '2026-08-25T12:00:00.000Z',
    ...overrides,
  };
}

class MemoryStore implements GradeEventStore {
  readonly events = new Map<string, StoredGradeEvent>();
  readonly snapshots = new Map<string, GradeSnapshot>();
  readonly assertIngestionAllowed = vi.fn(async (_input: GradeEventInput) => undefined);
  readonly commitSpy = vi.fn();

  private snapshotKey(gradeKey: string, field: GradeField): string {
    return `${gradeKey}::${field}`;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<StoredGradeEvent | null> {
    return this.events.get(idempotencyKey) ?? null;
  }

  async findByEventId(eventId: string): Promise<StoredGradeEvent | null> {
    return [...this.events.values()].find((event) => event.eventId === eventId) ?? null;
  }

  async getSnapshot(gradeKey: string, field: GradeField): Promise<GradeSnapshot | null> {
    return this.snapshots.get(this.snapshotKey(gradeKey, field)) ?? null;
  }

  async commit(command: GradeEventCommit): Promise<GradeEventCommit> {
    this.commitSpy(command);
    const current = await this.getSnapshot(command.event.gradeKey, command.event.field);
    const finalEvent =
      current && command.event.sequence <= current.sequence
        ? { ...command.event, status: 'stale' as const }
        : command.event;
    this.events.set(finalEvent.idempotencyKey, finalEvent);

    if (finalEvent.status === 'applied' && command.snapshot) {
      this.snapshots.set(
        this.snapshotKey(command.snapshot.gradeKey, command.snapshot.field),
        command.snapshot,
      );
    }
    return {
      event: finalEvent,
      snapshot: await this.getSnapshot(finalEvent.gradeKey, finalEvent.field),
    };
  }
}

describe('Banco de Notas grade event core', () => {
  it('applies a new event and advances the field snapshot', async () => {
    const store = new MemoryStore();
    const result = await ingestGradeEvent({
      input: input(),
      idempotencyKey: 'grade-event-idem-0001',
      store,
      receivedAt: RECEIVED_AT,
    });

    expect(result.status).toBe('applied');
    expect(result.snapshot).toMatchObject({
      gradeKey: '2026|T01|M|aluno-sintetico-001',
      field: 'NotaT1',
      sequence: 1,
      value: 7.5,
      isAbsent: false,
    });
    expect(store.assertIngestionAllowed).toHaveBeenCalledOnce();
    expect(store.commitSpy).toHaveBeenCalledOnce();
  });

  it('returns duplicate for the same idempotency key and identical payload without committing again', async () => {
    const store = new MemoryStore();
    const event = input();
    await ingestGradeEvent({
      input: event,
      idempotencyKey: 'grade-event-idem-0002',
      store,
      receivedAt: RECEIVED_AT,
    });
    store.commitSpy.mockClear();

    const duplicate = await ingestGradeEvent({
      input: event,
      idempotencyKey: 'grade-event-idem-0002',
      store,
      receivedAt: '2026-08-25T12:00:02.000Z',
    });

    expect(duplicate.status).toBe('duplicate');
    expect(duplicate.snapshot?.sequence).toBe(1);
    expect(store.commitSpy).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key with a different payload', async () => {
    const store = new MemoryStore();
    await ingestGradeEvent({
      input: input(),
      idempotencyKey: 'grade-event-idem-0003',
      store,
      receivedAt: RECEIVED_AT,
    });

    await expect(
      ingestGradeEvent({
        input: input({ valueAfter: 8.5 }),
        idempotencyKey: 'grade-event-idem-0003',
        store,
      }),
    ).rejects.toBeInstanceOf(GradeEventConflictError);
  });

  it('keeps an older sequence auditable as stale without regressing the snapshot', async () => {
    const store = new MemoryStore();
    await ingestGradeEvent({
      input: input({ sequence: 2, valueAfter: 8 }),
      idempotencyKey: 'grade-event-idem-0004',
      store,
      receivedAt: RECEIVED_AT,
    });

    const stale = await ingestGradeEvent({
      input: input({
        eventId: '55555555-5555-4555-8555-555555555555',
        sequence: 1,
        valueAfter: 6,
      }),
      idempotencyKey: 'grade-event-idem-0005',
      store,
      receivedAt: '2026-08-25T12:00:03.000Z',
    });

    expect(stale.status).toBe('stale');
    expect(stale.snapshot).toMatchObject({ sequence: 2, value: 8 });
    expect(store.events.get('grade-event-idem-0005')?.status).toBe('stale');
  });

  it('tracks sequences independently for different fields of the same gradeKey', async () => {
    const store = new MemoryStore();
    await ingestGradeEvent({
      input: input({ field: 'NotaT1', sequence: 5, valueAfter: 9 }),
      idempotencyKey: 'grade-event-idem-0006',
      store,
      receivedAt: RECEIVED_AT,
    });

    const otherField = await ingestGradeEvent({
      input: input({
        eventId: '66666666-6666-4666-8666-666666666666',
        field: 'NotaT2',
        sequence: 1,
        valueAfter: 4,
      }),
      idempotencyKey: 'grade-event-idem-0007',
      store,
      receivedAt: '2026-08-25T12:00:04.000Z',
    });

    expect(otherField.status).toBe('applied');
    expect(otherField.snapshot).toMatchObject({ field: 'NotaT2', sequence: 1, value: 4 });
  });

  it('keeps zero as a valid value and rejects an absent grade carrying a value', async () => {
    const store = new MemoryStore();
    const zero = await ingestGradeEvent({
      input: input({ valueAfter: 0, isAbsent: false }),
      idempotencyKey: 'grade-event-idem-0008',
      store,
      receivedAt: RECEIVED_AT,
    });
    expect(zero.snapshot?.value).toBe(0);

    await expect(
      ingestGradeEvent({
        input: input({
          eventId: '77777777-7777-4777-8777-777777777777',
          valueAfter: 0,
          isAbsent: true,
        }),
        idempotencyKey: 'grade-event-idem-0009',
        store: new MemoryStore(),
      }),
    ).rejects.toThrow(/absent grade must have null valueAfter/iu);
  });

  it('honors a stale reclassification returned by the atomic store', async () => {
    const store = new MemoryStore();
    const commit = vi.spyOn(store, 'commit').mockImplementationOnce(async (command) => ({
      event: { ...command.event, status: 'stale' },
      snapshot: null,
    }));

    const result = await ingestGradeEvent({
      input: input(),
      idempotencyKey: 'grade-event-idem-0010',
      store,
      receivedAt: RECEIVED_AT,
    });

    expect(result.status).toBe('stale');
    expect(commit).toHaveBeenCalledOnce();
  });
});
