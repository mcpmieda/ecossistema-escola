import type { RuntimeEnv } from '../../../env';
import { createGradebookPostgresDatabaseV1, type GradebookPostgresFailureDiagnosticV1,
  type GradebookPostgresDatabaseV1 } from './postgres-database-v1';

export type GradebookStorageProviderV1 = 'd1' | 'postgres';
type HyperdriveBindingV1 = { readonly connectionString: string };
type OfficialGradebookDatabaseDependenciesV1 = {
  readonly createPostgresDatabase?: (connectionString: string) => Promise<GradebookPostgresDatabaseV1>;
};
function requireHyperdriveConnectionString(env: RuntimeEnv): string {
  const binding = env.PROD_DB as Partial<HyperdriveBindingV1> | undefined;
  if (!binding || typeof binding.connectionString !== 'string' || binding.connectionString === '')
    throw new Error('gradebook-official-postgres-binding-missing');
  return binding.connectionString;
}
export const GRADEBOOK_POSTGRES_FAILURE_HEADER_V1 = 'X-Gradebook-Postgres-Failure';
function withProviderHeader(response: Response, provider: GradebookStorageProviderV1,
  diagnostic: GradebookPostgresFailureDiagnosticV1 | null = null): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Gradebook-Storage-Provider', provider);
  if (diagnostic !== null) headers.set(GRADEBOOK_POSTGRES_FAILURE_HEADER_V1, JSON.stringify(diagnostic));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Production has one physical authority. Local legacy fixtures may still explicitly use D1.
 * A missing variable or failed PostgreSQL connection must never select old academic data.
 */
export async function withOfficialGradebookDatabaseV1(env: RuntimeEnv,
  operation: (executionEnv: RuntimeEnv) => Promise<Response | null>,
  dependencies: OfficialGradebookDatabaseDependenciesV1 = {}): Promise<Response | null> {
  const production = (env.RUNTIME_ENVIRONMENT ?? 'production') === 'production';
  const provider = env.GRADEBOOK_STORAGE_PROVIDER ?? (production ? undefined : 'd1');
  if ((production && provider !== 'postgres') || (provider !== 'd1' && provider !== 'postgres')) {
    return Response.json({ state: 'unavailable', error: 'Academic PostgreSQL configuration required' },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Gradebook-Storage-Provider': 'unconfigured' } });
  }
  if (provider === 'd1') {
    const response = await operation(env);
    return response ? withProviderHeader(response, provider) : null;
  }
  const createPostgresDatabase = dependencies.createPostgresDatabase ?? ((value) => createGradebookPostgresDatabaseV1(value));
  const database = await createPostgresDatabase(requireHyperdriveConnectionString(env));
  try {
    const response = await operation({ ...env, GRADEBOOK_D1: database });
    const diagnostic = response !== null && response.status >= 500 ? database.lastFailure() : null;
    return response ? withProviderHeader(response, provider, diagnostic) : null;
  } finally { await database.close(); }
}
