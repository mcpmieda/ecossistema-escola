import {
  gradeEventInputSchema,
  type GradeEventInput,
  type GradeEventReceipt,
  type GradeEventStore,
  type GradeSnapshot,
  type StoredGradeEvent,
} from '../../shared/banco-notas-grade-events';

export class GradeEventConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GradeEventConflictError';
  }
}

export class GradeEventForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GradeEventForbiddenError';
  }
}

export function validateIdempotencyKey(value: string | null): string {
  if (!value || value.length < 16 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/u.test(value)) {
    throw new Error('invalid_idempotency_key');
  }
  return value;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

export async function gradeEventPayloadHash(input: GradeEventInput): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(input));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function gradeEventReceipt(
  event: StoredGradeEvent,
  status: GradeEventReceipt['status'],
  snapshot?: GradeSnapshot | null,
): GradeEventReceipt {
  return {
    schemaVersion: 1,
    eventId: event.eventId,
    correlationId: event.correlationId,
    idempotencyKey: event.idempotencyKey,
    status,
    receivedAt: event.receivedAt,
    ...(snapshot ? { snapshot } : {}),
  };
}

export async function getGradeEventReceipt(args: {
  eventId: string;
  store: GradeEventStore;
}): Promise<GradeEventReceipt | null> {
  const event = await args.store.findByEventId(args.eventId);
  if (!event) return null;
  return gradeEventReceipt(
    event,
    event.status,
    await args.store.getSnapshot(event.gradeKey, event.field),
  );
}

export async function ingestGradeEvent(args: {
  input: unknown;
  idempotencyKey: string | null;
  store: GradeEventStore;
  receivedAt?: string;
}): Promise<GradeEventReceipt> {
  const input = gradeEventInputSchema.parse(args.input);
  const idempotencyKey = validateIdempotencyKey(args.idempotencyKey);
  const payloadHash = await gradeEventPayloadHash(input);
  const duplicate = await args.store.findByIdempotencyKey(idempotencyKey);

  if (duplicate) {
    if (duplicate.payloadHash !== payloadHash) {
      throw new GradeEventConflictError('idempotency_payload_conflict');
    }
    return gradeEventReceipt(
      duplicate,
      'duplicate',
      await args.store.getSnapshot(duplicate.gradeKey, duplicate.field),
    );
  }

  await args.store.assertIngestionAllowed(input);
  const current = await args.store.getSnapshot(input.gradeKey, input.field);
  const isStale = current !== null && input.sequence <= current.sequence;
  const receivedAt = args.receivedAt ?? new Date().toISOString();
  const event: StoredGradeEvent = {
    eventId: input.eventId,
    correlationId: input.correlationId,
    idempotencyKey,
    payloadHash,
    eventType: input.eventType,
    gradeKey: input.gradeKey,
    field: input.field,
    sourceId: input.dataSourceId,
    teacherModelId: input.teacherModelId,
    sequence: input.sequence,
    valueAfter: input.valueAfter,
    isAbsent: input.isAbsent,
    status: isStale ? 'stale' : 'applied',
    clientSentAt: input.clientSentAt,
    receivedAt,
  };
  const snapshot: GradeSnapshot | null = isStale
    ? null
    : {
        gradeKey: input.gradeKey,
        field: input.field,
        value: input.valueAfter,
        isAbsent: input.isAbsent,
        sequence: input.sequence,
        lastEventId: input.eventId,
        sourceId: input.dataSourceId,
        updatedAt: receivedAt,
      };
  const provenanceJson = JSON.stringify({
    source: input.source,
    sourceRevision: input.sourceRevision ?? null,
    derivedValues: input.derivedValues ?? null,
  });
  const committed = await args.store.commit(
    event.status === 'stale' ? { event, snapshot: null } : { event, snapshot },
    provenanceJson,
  );
  const committedSnapshot =
    committed.snapshot ?? (await args.store.getSnapshot(input.gradeKey, input.field));
  return gradeEventReceipt(
    committed.event,
    committed.event.status === 'stale' ? 'stale' : 'applied',
    committedSnapshot,
  );
}
