import {
  GRADEBOOK_IMPORT_KNOWN_CONTENT_VERSION_V1,
  isGradebookImportKnownContentRequestV1,
  type GradebookImportKnownContentObservationV1,
  type GradebookImportKnownContentResponseV1,
} from '../../../shared/gradebook-contracts/imports/import-known-content-transport-v1';
import { AuthenticationError, requireAuth } from '../../auth/session';
import { AuthorizationError } from '../../auth/roles';
import type { RuntimeEnv } from '../../env';
import {
  enforceOfficialOrigin,
  enforceWriteOrigin,
  HttpError,
  readBoundedJson,
} from '../../http/security';
import { authorizeGradebookD1RuntimeV1 } from '../persistence/d1/runtime/d1-runtime-authorization-v1';
import type { D1ReadDatabaseV1 } from '../persistence/d1/read/d1-read-adapter-v1';

export const GRADEBOOK_IMPORT_KNOWN_CONTENT_ROUTE_V1 = '/api/gradebook/import-known-content';
const MAX_BODY_BYTES_V1 = 131_072;

type RowV1 = Record<string, unknown>;

function response(value: GradebookImportKnownContentResponseV1, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, private' },
  });
}

function key(
  item: Pick<GradebookImportKnownContentObservationV1, 'academicYearId' | 'sha256'>,
): string {
  return `${item.academicYearId}\u0000${item.sha256}`;
}

function stringOrNull(value: unknown): string | null | undefined {
  return value === null ? null : typeof value === 'string' ? value : undefined;
}

function exact(item: GradebookImportKnownContentObservationV1, row: RowV1 | undefined): boolean {
  return (
    row !== undefined &&
    Number(row.is_current_authority) === 1 &&
    row.logical_source_state === 'confirmed' &&
    row.file_name === item.fileName &&
    row.extension === item.extension &&
    stringOrNull(row.reported_mime_type) === item.reportedMimeType &&
    Number(row.size_bytes) === item.sizeBytes &&
    stringOrNull(row.last_modified_at) === item.lastModifiedAt &&
    row.sha256 === item.sha256 &&
    Number(row.source_contract_version) === item.sourceContractVersion &&
    row.parser_version === item.parserVersion
  );
}

export async function handleGradebookImportKnownContentRequestV1(
  request: Request,
  env: RuntimeEnv,
): Promise<Response | null> {
  if (new URL(request.url).pathname !== GRADEBOOK_IMPORT_KNOWN_CONTENT_ROUTE_V1) return null;
  enforceOfficialOrigin(request, env);
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  enforceWriteOrigin(request, env);
  try {
    authorizeGradebookD1RuntimeV1(await requireAuth(request, env));
  } catch (cause) {
    if (cause instanceof AuthenticationError || cause instanceof AuthorizationError) {
      return response({ transportVersion: 1, state: 'not-authorized' }, 401);
    }
    return response({ transportVersion: 1, state: 'unavailable' }, 503);
  }
  let payload: unknown;
  try {
    payload = await readBoundedJson(request, MAX_BODY_BYTES_V1);
  } catch {
    return response({ transportVersion: 1, state: 'invalid-request' }, 400);
  }
  if (!isGradebookImportKnownContentRequestV1(payload)) {
    return response({ transportVersion: 1, state: 'invalid-request' }, 400);
  }
  try {
    const predicates = payload.items.map(() => '(s.academic_year_id = ? AND s.current_sha256 = ?)');
    const parameters = payload.items.flatMap((item) => [item.academicYearId, item.sha256]);
    const rows = await (env.GRADEBOOK_D1 as D1ReadDatabaseV1)
      .prepare(
        `WITH candidate AS MATERIALIZED (
           SELECT s.academic_year_id, s.current_sha256, v.manifest_id,
                  v.confirmed_logical_source_id, v.file_name, v.extension,
                  v.reported_mime_type, v.size_bytes, v.last_modified_at, v.sha256,
                  v.source_contract_version, v.parser_version, v.logical_source_state
           FROM source_file_streams s
           JOIN source_file_versions v
             ON v.academic_year_id = s.academic_year_id
            AND v.manifest_id = s.manifest_id
            AND v.version = s.current_version
           WHERE ${predicates.join(' OR ')}
         ),
         current_authority AS MATERIALIZED (
           SELECT current_stream.academic_year_id,
                  current_stream.logical_source_id,
                  current_stream.record_kind,
                  current_stream.stream_key,
                  current_version.source_manifest_id
           FROM logical_source_record_streams current_stream
           JOIN logical_source_record_versions current_version
             ON current_version.academic_year_id = current_stream.academic_year_id
            AND current_version.logical_source_id = current_stream.logical_source_id
            AND current_version.record_kind = current_stream.record_kind
            AND current_version.stream_key = current_stream.stream_key
            AND current_version.version = current_stream.current_version
           WHERE current_stream.current_state = 'active'
         ),
         authority AS (
           SELECT candidate.academic_year_id, candidate.current_sha256,
                  candidate.file_name, candidate.extension,
                  candidate.reported_mime_type, candidate.size_bytes,
                  candidate.last_modified_at, candidate.sha256,
                  candidate.source_contract_version, candidate.parser_version,
                  candidate.logical_source_state,
                  SUM(CASE WHEN historical.association_state = 'active' THEN 1 ELSE 0 END)
                    AS expected_active,
                  SUM(
                    CASE
                      WHEN historical.association_state = 'active'
                       AND current_authority.source_manifest_id = candidate.manifest_id
                      THEN 1 ELSE 0
                    END
                  ) AS current_active
           FROM candidate
           LEFT JOIN logical_source_record_versions historical
             ON historical.academic_year_id = candidate.academic_year_id
            AND historical.logical_source_id = candidate.confirmed_logical_source_id
            AND historical.source_manifest_id = candidate.manifest_id
           LEFT JOIN current_authority
             ON current_authority.academic_year_id = historical.academic_year_id
            AND current_authority.logical_source_id = historical.logical_source_id
            AND current_authority.record_kind = historical.record_kind
            AND current_authority.stream_key = historical.stream_key
           GROUP BY candidate.academic_year_id, candidate.current_sha256,
                    candidate.manifest_id, candidate.file_name, candidate.extension,
                    candidate.reported_mime_type, candidate.size_bytes,
                    candidate.last_modified_at, candidate.sha256,
                    candidate.source_contract_version, candidate.parser_version,
                    candidate.logical_source_state
         )
         SELECT academic_year_id, current_sha256, file_name, extension,
                reported_mime_type, size_bytes, last_modified_at, sha256,
                source_contract_version, parser_version, logical_source_state,
                CASE WHEN expected_active = current_active THEN 1 ELSE 0 END
                  AS is_current_authority
         FROM authority`,
      )
      .bind(...parameters)
      .all<RowV1>();
    const byKey = new Map(
      rows.results.map((row) => [
        key({ academicYearId: String(row.academic_year_id), sha256: String(row.current_sha256) }),
        row,
      ]),
    );
    return response({
      transportVersion: GRADEBOOK_IMPORT_KNOWN_CONTENT_VERSION_V1,
      state: 'ready',
      known: payload.items.map((item) => exact(item, byKey.get(key(item)))),
    });
  } catch {
    return response({ transportVersion: 1, state: 'unavailable' }, 503);
  }
}
