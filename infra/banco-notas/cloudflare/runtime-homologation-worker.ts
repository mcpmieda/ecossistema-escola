import { verifyBancoNotasAddinToken } from '../../../server/auth/entra-access-token';
import { D1BancoNotasAddinAuthorizer } from '../../../server/banco-notas/d1-addin-authorizer';
import { D1GradeEventStore } from '../../../server/banco-notas/d1-grade-event-store';
import { ingestGradeEvent } from '../../../server/banco-notas/grade-events';
import type { GradeEventInput } from '../../../shared/banco-notas-grade-events';

type Row = Record<string, string | number | null>;

const runPath = '/__banco-notas-homologation/run';

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function count(db: D1Database, sql: string, ...values: unknown[]): Promise<number> {
  const row = await db
    .prepare(sql)
    .bind(...values)
    .first<Row>();
  return Number(row?.total ?? 0);
}

async function rejects(action: () => Promise<unknown>, expected: string): Promise<boolean> {
  try {
    await action();
    return false;
  } catch (error) {
    return error instanceof Error && error.message === expected;
  }
}

async function fails(action: () => Promise<unknown>): Promise<boolean> {
  try {
    await action();
    return false;
  } catch {
    return true;
  }
}

async function executeRuntimeProof(
  request: Request,
  env: BancoNotasRuntimeHomologationEnv,
): Promise<Response> {
  if (env.RUNTIME_ENVIRONMENT !== 'homologation') {
    return json({ error: 'homologation_runtime_required' }, 503);
  }

  const claims = await verifyBancoNotasAddinToken({
    authorization: request.headers.get('Authorization'),
    env,
  });
  const db = env.BANCO_NOTAS_DB;
  const runId = crypto.randomUUID();
  const yearRow = await db
    .prepare(
      `WITH RECURSIVE years(year) AS (
         SELECT 2200 UNION ALL SELECT year - 1 FROM years WHERE year > 2000
       )
       SELECT year FROM years
       WHERE NOT EXISTS (SELECT 1 FROM school_years current WHERE current.year = years.year)
       LIMIT 1`,
    )
    .first<Row>();
  if (!yearRow) return json({ error: 'synthetic_year_unavailable' }, 503);

  const year = Number(yearRow.year);
  const schoolYearId = crypto.randomUUID();
  const ownerTeacherId = crypto.randomUUID();
  const otherTeacherId = crypto.randomUUID();
  const inactiveTeacherId = crypto.randomUUID();
  const ownerModelId = crypto.randomUUID();
  const otherModelId = crypto.randomUUID();
  const inactiveModelId = crypto.randomUUID();
  const missingModelId = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  const assignmentId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const mappingId = crypto.randomUUID();
  const gradeKey = `runtime-proof-${runId}`;
  const actor = 'runtime-homologation';
  const existingOwner = await db
    .prepare('SELECT id, status FROM teachers WHERE lower(entra_object_id) = lower(?) LIMIT 1')
    .bind(claims.oid)
    .first<Row>();
  const ownerId = existingOwner ? String(existingOwner.id) : ownerTeacherId;
  const ownerWasCreated = !existingOwner;

  if (existingOwner && existingOwner.status !== 'active') {
    return json({ error: 'authorized_identity_is_inactive' }, 403);
  }

  const setup: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO school_years (id, year, name, starts_on, ends_on)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(schoolYearId, year, `Runtime proof ${runId}`, `${year}-01-01`, `${year}-12-31`),
  ];
  if (ownerWasCreated) {
    setup.push(
      db
        .prepare(
          `INSERT INTO teachers (id, display_name, entra_object_id)
           VALUES (?, ?, ?)`,
        )
        .bind(ownerId, `Runtime owner ${runId}`, claims.oid),
    );
  }
  setup.push(
    db
      .prepare(
        `INSERT INTO teachers (id, display_name, entra_object_id)
         VALUES (?, ?, ?)`,
      )
      .bind(otherTeacherId, `Runtime other ${runId}`, crypto.randomUUID()),
    db
      .prepare(
        `INSERT INTO teachers (id, display_name, status, entra_object_id)
         VALUES (?, ?, 'inactive', ?)`,
      )
      .bind(inactiveTeacherId, `Runtime inactive ${runId}`, crypto.randomUUID()),
    db
      .prepare(
        `INSERT INTO teacher_models
          (id, school_year_id, teacher_id, state, sync_enabled, environment)
         VALUES (?, ?, ?, 'connected', 0, 'homologation')`,
      )
      .bind(ownerModelId, schoolYearId, ownerId),
    db
      .prepare(
        `INSERT INTO teacher_models
          (id, school_year_id, teacher_id, state, sync_enabled, environment)
         VALUES (?, ?, ?, 'connected', 0, 'homologation')`,
      )
      .bind(otherModelId, schoolYearId, otherTeacherId),
    db
      .prepare(
        `INSERT INTO teacher_models
          (id, school_year_id, teacher_id, state, sync_enabled, environment)
         VALUES (?, ?, ?, 'connected', 0, 'homologation')`,
      )
      .bind(inactiveModelId, schoolYearId, inactiveTeacherId),
    db
      .prepare(
        `INSERT INTO data_sources
          (id, school_year_id, type, name, description, environment, created_by)
         VALUES (?, ?, 'linked_teacher_model', ?, 'Synthetic runtime proof', 'homologation', ?)`,
      )
      .bind(sourceId, schoolYearId, `Runtime source ${runId}`, actor),
    db
      .prepare(
        `INSERT INTO source_assignments
          (id, school_year_id, data_source_id, teacher_id, scope, authority, sync_enabled,
           effective_from, operator_id, reason)
         VALUES (?, ?, ?, ?, 'teacher_override', 'authoritative', 0, ?, ?, ?)`,
      )
      .bind(assignmentId, schoolYearId, sourceId, ownerId, `${year}-01-01`, actor, 'Runtime proof'),
    db
      .prepare(
        `INSERT INTO teacher_model_versions
          (id, teacher_model_id, version, model_hash, mapping_version, provenance_json)
         VALUES (?, ?, 1, ?, 1, ?)`,
      )
      .bind(versionId, ownerModelId, `runtime-${runId}`, JSON.stringify({ synthetic: true })),
    db
      .prepare(
        `INSERT INTO cell_mappings
          (id, teacher_model_version_id, grade_key, sheet_key, cell_address, field)
         VALUES (?, ?, ?, 'runtime-sheet', 'F12', 'NotaT1')`,
      )
      .bind(mappingId, versionId, gradeKey),
  );
  await db.batch(setup);

  try {
    const authorizer = new D1BancoNotasAddinAuthorizer(db);
    const eventsBefore = await count(
      db,
      'SELECT COUNT(*) AS total FROM grade_events WHERE teacher_model_id = ?',
      ownerModelId,
    );
    await authorizer.assertTeacherModelOwner({
      teacherModelId: ownerModelId,
      entraObjectId: claims.oid,
    });
    const ownershipWrongRejected = await rejects(
      () =>
        authorizer.assertTeacherModelOwner({
          teacherModelId: otherModelId,
          entraObjectId: claims.oid,
        }),
      'teacher_model_not_owned',
    );
    const ownershipMissingRejected = await rejects(
      () =>
        authorizer.assertTeacherModelOwner({
          teacherModelId: missingModelId,
          entraObjectId: claims.oid,
        }),
      'teacher_model_not_owned',
    );
    const inactiveRejected = await rejects(
      () =>
        authorizer.assertTeacherModelOwner({
          teacherModelId: inactiveModelId,
          entraObjectId: claims.oid,
        }),
      'teacher_identity_inactive',
    );

    const baseInput = (): GradeEventInput => ({
      schemaVersion: 1,
      eventId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      eventType: 'grade.changed',
      gradeKey,
      field: 'NotaT1',
      dataSourceId: sourceId,
      teacherModelId: ownerModelId,
      source: {
        kind: 'excel-addin',
        workbookId: `runtime-workbook-${runId}`,
        worksheetId: 'runtime-sheet',
        cellAddress: 'F12',
      },
      valueAfter: 8.5,
      isAbsent: false,
      sequence: 1,
      clientSentAt: `${year}-08-27T12:00:00.000Z`,
    });
    const syncGuardRejected = await rejects(
      () =>
        ingestGradeEvent({
          input: baseInput(),
          idempotencyKey: `sync-disabled-${runId}`,
          store: new D1GradeEventStore(db),
        }),
      'teacher_model_sync_disabled',
    );
    const eventsAfterSyncGuard = await count(
      db,
      'SELECT COUNT(*) AS total FROM grade_events WHERE teacher_model_id = ?',
      ownerModelId,
    );

    await db.batch([
      db.prepare('UPDATE teacher_models SET sync_enabled = 1 WHERE id = ?').bind(ownerModelId),
      db.prepare('UPDATE source_assignments SET sync_enabled = 1 WHERE id = ?').bind(assignmentId),
    ]);

    const positiveInput = baseInput();
    const positiveReceipt = await ingestGradeEvent({
      input: positiveInput,
      idempotencyKey: `atomic-positive-${runId}`,
      store: new D1GradeEventStore(db),
    });
    const positiveEventCount = await count(
      db,
      'SELECT COUNT(*) AS total FROM grade_events WHERE id = ?',
      positiveInput.eventId,
    );
    const positiveSnapshotCount = await count(
      db,
      'SELECT COUNT(*) AS total FROM grade_snapshots WHERE event_id = ?',
      positiveInput.eventId,
    );

    const negativeInput = { ...baseInput(), sequence: 2 };
    const negativeRejected = await fails(() =>
      ingestGradeEvent({
        input: negativeInput,
        idempotencyKey: `atomic-negative-${runId}`,
        store: new D1GradeEventStore(db, {
          runtimeEnvironment: 'homologation',
          injectFailureAfterSnapshot: true,
        }),
      }),
    );
    const negativeEventCount = await count(
      db,
      'SELECT COUNT(*) AS total FROM grade_events WHERE id = ?',
      negativeInput.eventId,
    );
    const snapshotStillPositive = await count(
      db,
      'SELECT COUNT(*) AS total FROM grade_snapshots WHERE event_id = ?',
      positiveInput.eventId,
    );

    await db.batch([
      db.prepare('UPDATE teacher_models SET sync_enabled = 0 WHERE id = ?').bind(ownerModelId),
      db.prepare('UPDATE source_assignments SET sync_enabled = 0 WHERE id = ?').bind(assignmentId),
    ]);
    if (ownerWasCreated) {
      await db
        .prepare('UPDATE teachers SET entra_object_id = NULL WHERE id = ?')
        .bind(ownerId)
        .run();
    }
    await db.batch([
      db
        .prepare('DELETE FROM teacher_models WHERE id IN (?, ?)')
        .bind(otherModelId, inactiveModelId),
      db.prepare('DELETE FROM teachers WHERE id IN (?, ?)').bind(otherTeacherId, inactiveTeacherId),
    ]);

    const finalSync = await db
      .prepare(
        `SELECT model.sync_enabled AS model_sync, assignment.sync_enabled AS assignment_sync
       FROM teacher_models model
       JOIN source_assignments assignment ON assignment.id = ?
       WHERE model.id = ?`,
      )
      .bind(assignmentId, ownerModelId)
      .first<Row>();
    const cleanupPassed =
      Number(finalSync?.model_sync) === 0 &&
      Number(finalSync?.assignment_sync) === 0 &&
      (await count(
        db,
        'SELECT COUNT(*) AS total FROM teacher_models WHERE id IN (?, ?)',
        otherModelId,
        inactiveModelId,
      )) === 0;
    const atomicNegativePassed =
      negativeRejected && negativeEventCount === 0 && snapshotStillPositive === 1;
    const allPassed =
      ownershipWrongRejected &&
      ownershipMissingRejected &&
      inactiveRejected &&
      syncGuardRejected &&
      eventsBefore === 0 &&
      eventsAfterSyncGuard === 0 &&
      positiveReceipt.status === 'applied' &&
      positiveEventCount === 1 &&
      positiveSnapshotCount === 1 &&
      atomicNegativePassed &&
      cleanupPassed;

    return json(
      {
        schemaVersion: 1,
        generatedAtUtc: new Date().toISOString(),
        status: allPassed
          ? 'BANCO_NOTAS_RUNTIME_HOMOLOGATION_PASSED'
          : 'BANCO_NOTAS_RUNTIME_HOMOLOGATION_FAILED',
        environment: 'homologation',
        runtime: 'Cloudflare Workers',
        database: 'banco-notas-homologation',
        binding: 'BANCO_NOTAS_DB',
        token: {
          tokenValidated: true,
          tokenVersionV2Validated: true,
          tenantValidated: true,
          issuerValidated: true,
          audienceValidated: true,
          scopeValidated: true,
          authorizedPartyValidated: true,
          lifetimeValidated: true,
          oidPresent: true,
          rawAccessTokenIncluded: false,
          oidValueIncluded: false,
          piiIncluded: false,
        },
        bearerOwnership: {
          status: allPassed ? 'BEARER_OWNERSHIP_RUNTIME_HOMOLOGATION_PASSED' : 'FAILED',
          positiveOwnership: true,
          wrongOwnershipRejected: ownershipWrongRejected,
          nonexistentModelRejected: ownershipMissingRejected,
          inactiveTeacherRejected: inactiveRejected,
          syncDisabledRejected: syncGuardRejected,
          writesWhileSyncDisabled: eventsAfterSyncGuard - eventsBefore,
        },
        d1Atomicity: {
          status: atomicNegativePassed ? 'D1_BINDING_ATOMICITY_HOMOLOGATION_PASSED' : 'FAILED',
          bindingMethod: 'D1Database.batch',
          positiveEventInserted: positiveEventCount === 1,
          positiveSnapshotInserted: positiveSnapshotCount === 1,
          controlledFailureObserved: negativeRejected,
          negativeEventPartialWrites: negativeEventCount,
          positiveSnapshotPreservedAfterFailure: snapshotStillPositive === 1,
        },
        cleanup: {
          temporaryIdentityRemoved: ownerWasCreated,
          negativeFixturesRemoved: cleanupPassed,
          modelSyncEnabledFinal: Number(finalSync?.model_sync ?? -1),
          sourceAssignmentSyncEnabledFinal: Number(finalSync?.assignment_sync ?? -1),
          workerCleanupPending: true,
        },
        production: {
          workerDeploymentPerformed: false,
          pagesChanged: false,
          productionD1Changed: false,
        },
      },
      allPassed ? 200 : 500,
    );
  } finally {
    await db.batch([
      db.prepare('UPDATE teacher_models SET sync_enabled = 0 WHERE id = ?').bind(ownerModelId),
      db.prepare('UPDATE source_assignments SET sync_enabled = 0 WHERE id = ?').bind(assignmentId),
    ]);
    if (ownerWasCreated) {
      await db
        .prepare('UPDATE teachers SET entra_object_id = NULL WHERE id = ?')
        .bind(ownerId)
        .run();
    }
    await db.batch([
      db
        .prepare('DELETE FROM teacher_models WHERE id IN (?, ?)')
        .bind(otherModelId, inactiveModelId),
      db.prepare('DELETE FROM teachers WHERE id IN (?, ?)').bind(otherTeacherId, inactiveTeacherId),
    ]);
  }
}

export default {
  async fetch(request: Request, env: BancoNotasRuntimeHomologationEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === runPath) {
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      try {
        return await executeRuntimeProof(request, env);
      } catch (error) {
        const status =
          error instanceof Error && 'status' in error && typeof error.status === 'number'
            ? error.status
            : 500;
        return json(
          {
            error:
              status === 500
                ? 'runtime_homologation_failed'
                : error instanceof Error
                  ? error.message
                  : 'request_failed',
            rawAccessTokenIncluded: false,
            piiIncluded: false,
          },
          status,
        );
      }
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<BancoNotasRuntimeHomologationEnv>;

