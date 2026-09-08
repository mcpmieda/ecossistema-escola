import type { RuntimeEnv } from '../../../env';
import {
  createGradebookPostgresDatabaseV1,
  type GradebookPostgresDatabaseV1,
} from './postgres-database-v1';

export type GradebookStorageProviderV1 = 'd1' | 'postgres';

type HyperdriveBindingV1 = {
  readonly connectionString: string;
};

type OfficialGradebookDatabaseDependenciesV1 = {
  readonly createPostgresDatabase?: (
    connectionString: string,
  ) => Promise<GradebookPostgresDatabaseV1>;
};

function requireHyperdriveConnectionString(env: RuntimeEnv): string {
  const binding = env.PROD_DB as Partial<HyperdriveBindingV1> | undefined;
  if (!binding || typeof binding.connectionString !== 'string' || binding.connectionString === '') {
    throw new Error('gradebook-official-postgres-binding-missing');
  }
  return binding.connectionString;
}

function withProviderHeader(response: Response, provider: GradebookStorageProviderV1): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Gradebook-Storage-Provider', provider);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Runs one official gradebook request against the selected physical provider.
 * Switching the production variable back to `d1` is the bounded rollback gate;
 * no dual write exists and the inactive database is never inspected here.
 */
export async function withOfficialGradebookDatabaseV1(
  env: RuntimeEnv,
  operation: (executionEnv: RuntimeEnv) => Promise<Response | null>,
  dependencies: OfficialGradebookDatabaseDependenciesV1 = {},
): Promise<Response | null> {
  const provider = env.GRADEBOOK_STORAGE_PROVIDER ?? 'd1';
  if (provider === 'd1') {
    const response = await operation(env);
    return response ? withProviderHeader(response, provider) : null;
  }

  const createPostgresDatabase =
    dependencies.createPostgresDatabase ?? ((value) => createGradebookPostgresDatabaseV1(value));
  const database = await createPostgresDatabase(requireHyperdriveConnectionString(env));
  try {
    const response = await operation({ ...env, GRADEBOOK_D1: database });
    return response ? withProviderHeader(response, provider) : null;
  } finally {
    await database.close();
  }
}
