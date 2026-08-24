import type { RuntimeEnv } from '../env';
import { graphRequest } from './client';

export async function sharePointHealth(
  env: RuntimeEnv,
): Promise<{ status: 'ok'; listCount: number; correlationId: string }> {
  const result = await graphRequest<{ value: Array<{ id: string }> }>({
    env,
    path: `/sites/${env.SHAREPOINT_SITE_ID}/lists?$select=id&$top=20`,
  });
  return { status: 'ok', listCount: result.data.value.length, correlationId: result.correlationId };
}

export async function controlledMigrationWrite(
  env: RuntimeEnv,
  fields: Record<string, string>,
): Promise<unknown> {
  const lists = await graphRequest<{ value: Array<{ id: string; displayName: string }> }>({
    env,
    path: `/sites/${env.SHAREPOINT_SITE_ID}/lists?$filter=displayName%20eq%20'PLATAFORMA_MIGRACOES'&$select=id,displayName`,
  });
  const list = lists.data.value[0];
  if (!list) throw new Error('Migration list not found');
  return (
    await graphRequest<unknown>({
      env,
      path: `/sites/${env.SHAREPOINT_SITE_ID}/lists/${list.id}/items`,
      method: 'POST',
      body: { fields },
    })
  ).data;
}
