import { z, ZodError } from 'zod';
import {
  gradeFieldSchema,
  type GradeEventStore,
} from '../../shared/banco-notas-grade-events';
import { HttpError, readBoundedJson } from '../http/security';
import {
  getGradeEventReceipt,
  GradeEventConflictError,
  GradeEventForbiddenError,
  ingestGradeEvent,
} from './grade-events';

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(value, { status, headers });
}

function parse<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof ZodError) {
      throw new HttpError(400, error.issues[0]?.message ?? 'Invalid input');
    }
    throw error;
  }
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, 'Invalid path encoding');
  }
}

async function gradeEventOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof GradeEventConflictError) {
      throw new HttpError(409, error.message);
    }
    if (error instanceof GradeEventForbiddenError) {
      throw new HttpError(403, error.message);
    }
    if (error instanceof ZodError) {
      throw new HttpError(400, error.issues[0]?.message ?? 'Invalid grade event');
    }
    if (error instanceof Error && error.message === 'invalid_idempotency_key') {
      throw new HttpError(400, 'Invalid Idempotency-Key');
    }
    throw error;
  }
}

export async function routeGradeEventsApi(args: {
  request: Request;
  store: GradeEventStore;
}): Promise<Response> {
  const { request, store } = args;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/banco-notas/u, '') || '/';

  if (path === '/v1/grade-events') {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const input = await readBoundedJson(request);
    const receipt = await gradeEventOperation(() =>
      ingestGradeEvent({
        input,
        idempotencyKey: request.headers.get('Idempotency-Key'),
        store,
      }),
    );
    return json(receipt, receipt.status === 'duplicate' ? 200 : 202);
  }

  const eventMatch = path.match(/^\/v1\/grade-events\/([0-9a-f-]+)$/iu);
  if (eventMatch?.[1]) {
    if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed');
    const eventId = parse(() => z.string().uuid().parse(eventMatch[1]));
    const receipt = await getGradeEventReceipt({ eventId, store });
    if (!receipt) throw new HttpError(404, 'Grade event not found');
    return json(receipt);
  }

  const snapshotMatch = path.match(/^\/v1\/grade-snapshots\/([^/]+)$/u);
  if (snapshotMatch?.[1]) {
    if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed');
    const gradeKey = parse(() =>
      z.string().min(7).max(180).parse(decodePathSegment(snapshotMatch[1]!)),
    );
    const field = parse(() => gradeFieldSchema.parse(url.searchParams.get('field')));
    const snapshot = await store.getSnapshot(gradeKey, field);
    if (!snapshot) throw new HttpError(404, 'Grade snapshot not found');
    return json(snapshot, 200, { ETag: `"${snapshot.sequence}-${snapshot.lastEventId}"` });
  }

  throw new HttpError(404, 'Not found');
}
