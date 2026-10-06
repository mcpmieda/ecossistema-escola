import { pathToFileURL } from 'node:url';

const OWNER = 'mcpmieda/ecossistema-escola:public-demo-v1';
const WORKER = 'portal-aluno-demo-publica';

/** GET only. Refuse name collisions and inconclusive authorization/provider responses. */
export async function checkPublicDemoNameV1(
  account: string,
  token: string,
  request = fetch,
): Promise<void> {
  if (!/^[a-f0-9]{32}$/u.test(account) || !token) throw new Error('Missing deployment credentials');
  const base = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts`;
  const inventory = await request(base, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!inventory.ok) throw new Error('Cannot verify public demo Worker inventory');
  const listed = (await inventory.json()) as { success?: boolean; result?: Array<{ id?: string }> };
  if (
    listed.success !== true ||
    !Array.isArray(listed.result) ||
    listed.result.some((item) => typeof item.id !== 'string')
  )
    throw new Error('Invalid public demo Worker inventory');
  if (!listed.result.some((item) => item.id === WORKER)) return;
  const response = await request(`${base}/${WORKER}/settings`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('Cannot verify public demo Worker ownership');
  const body = (await response.json()) as {
    success?: boolean;
    result?: { bindings?: Array<{ name?: string; type?: string; text?: string }> };
  };
  const bindings = body.result?.bindings;
  if (
    body.success !== true ||
    !Array.isArray(bindings) ||
    !bindings.some(
      (b) => b.name === 'DEMO_DEPLOYMENT_OWNER' && b.type === 'plain_text' && b.text === OWNER,
    ) ||
    bindings.some(
      (b) =>
        !['ASSETS', 'DEMO_STATE', 'DEMO_ADMIN_TENANT_ID', 'DEMO_DEPLOYMENT_OWNER'].includes(
          b.name ?? '',
        ),
    )
  )
    throw new Error('Refusing to overwrite an unrelated public demo Worker');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await checkPublicDemoNameV1(
      process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
      process.env.CLOUDFLARE_API_TOKEN ?? '',
    );
    console.log('Public demo Worker name ownership verified.');
  } catch {
    console.error('Public demo deployment preflight failed; no Worker was modified.');
    process.exitCode = 1;
  }
}
