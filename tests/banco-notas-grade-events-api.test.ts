import { describe, expect, it } from 'vitest';
import type {
  GradeEventCommit,
  GradeEventInput,
  GradeEventStore,
  GradeField,
  GradeSnapshot,
  StoredGradeEvent,
} from '../shared/banco-notas-grade-events';
import { routeGradeEventsApi } from '../server/banco-notas/grade-events-api';
import {
  gradeEventPayloadHash,
  GradeEventForbiddenError,
} from '../server/banco-notas/grade-events';

const input: GradeEventInput = {
  schemaVersion: 1,
  eventId: '11111111-1111-4111-8111-111111111111',
  correlationId: '22222222-2222-4222-8222-222222222222',
  eventType: 'grade.changed',
  gradeKey: '2026|T01|M|aluno-sintetico-001',
  field: 'NotaT1',
  dataSourceId: '33333333-3333-4333-8333-333333333333',
  teacherModelId: '44444444-4444-4444-8444-444444444444',
  source: {
    kind: 'excel-addin',
    workbookId: 'workbook-sintetico',
    worksheetId: 'worksheet-sintetica',
    cellAddress: 'F12',
  },
  valueAfter: 8.5,
  isAbsent: false,
  sequence: 4,
  clientSentAt: '2026-08-25T20:00:00-03:00',
};

const snapshot: GradeSnapshot = {
  gradeKey: input.gradeKey,
  field: input.field,
  value: input.valueAfter,
  isAbsent: false,
  sequence: input.sequence,
  lastEventId: input.eventId,
  sourceId: input.dataSourceId,
  updatedAt: '2026-08-25T23:00:01.000Z',
};

async function storedEvent(): Promise<StoredGradeEvent> {
  return {
    eventId: input.eventId,
    correlationId: input.correlationId,
    idempotencyKey: 'event-111111111111',
    payloadHash: await gradeEventPayloadHash(input),
    eventType: input.eventType,
    gradeKey: input.gradeKey,
    field: input.field,
    sourceId: input.dataSourceId,
    teacherModelId: input.teacherModelId,
    sequence: input.sequence,
    valueAfter: input.valueAfter,
    isAbsent: input.isAbsent,
    status: 'applied',
    clientSentAt: input.clientSentAt,
    receivedAt: snapshot.updatedAt,
  };
}

function store(args: {
  event?: StoredGradeEvent | null;
  snapshot?: GradeSnapshot | null;
  forbidden?: boolean;
}): GradeEventStore {
  return {
    async findByIdempotencyKey() {
      return args.event ?? null;
    },
    async findByEventId(eventId: string) {
      return args.event?.eventId === eventId ? args.event : null;
    },
    async getSnapshot(_gradeKey: string, _field: GradeField) {
      return args.snapshot ?? null;
    },
    async assertIngestionAllowed() {
      if (args.forbidden) throw new GradeEventForbiddenError('teacher_model_sync_disabled');
    },
    async commit(command: GradeEventCommit) {
      return command;
    },
  };
}

describe('Banco de Notas grade-events API preparation', () => {
  it('returns an auditable event receipt by event id', async () => {
    const event = await storedEvent();
    const response = await routeGradeEventsApi({
      request: new Request(`https://admin.escolaieda.com/api/banco-notas/v1/grade-events/${event.eventId}`),
      store: store({ event, snapshot }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      eventId: event.eventId,
      status: 'applied',
      snapshot: { field: 'NotaT1', sequence: 4 },
    });
  });

  it('requires field to address a snapshot and emits a deterministic ETag', async () => {
    const gradeKey = encodeURIComponent(input.gradeKey);
    const response = await routeGradeEventsApi({
      request: new Request(
        `https://admin.escolaieda.com/api/banco-notas/v1/grade-snapshots/${gradeKey}?field=NotaT1`,
      ),
      store: store({ snapshot }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('ETag')).toBe(`"${snapshot.sequence}-${snapshot.lastEventId}"`);

    await expect(
      routeGradeEventsApi({
        request: new Request(
          `https://admin.escolaieda.com/api/banco-notas/v1/grade-snapshots/${gradeKey}`,
        ),
        store: store({ snapshot }),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('maps a disabled or unauthorized linked model to forbidden before commit', async () => {
    await expect(
      routeGradeEventsApi({
        request: new Request('https://admin.escolaieda.com/api/banco-notas/v1/grade-events', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'event-222222222222',
          },
          body: JSON.stringify({ ...input, eventId: '55555555-5555-4555-8555-555555555555' }),
        }),
        store: store({ forbidden: true }),
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
