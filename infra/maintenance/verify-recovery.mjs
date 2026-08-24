const required = ['ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_URL'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const origin = 'https://admin.escolaieda.com';
const audience = `${origin}/api/maintenance/recovery/verify`;
const expectedMarker = 'Centro v0.8 em validação controlada';

async function githubOidcToken() {
  const url = new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
  url.searchParams.set('audience', audience);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`GitHub OIDC token request failed (${response.status})`);
  const body = await response.json();
  if (!body.value) throw new Error('GitHub OIDC response did not contain a token');
  return body.value;
}

async function waitForDeployedCandidate() {
  for (let attempt = 1; attempt <= 36; attempt += 1) {
    const htmlResponse = await fetch(`${origin}/`, { signal: AbortSignal.timeout(20_000) });
    if (htmlResponse.ok) {
      const html = await htmlResponse.text();
      const asset = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/u)?.[0];
      if (asset) {
        const bundleResponse = await fetch(`${origin}${asset}`, { signal: AbortSignal.timeout(20_000) });
        if (bundleResponse.ok && (await bundleResponse.text()).includes(expectedMarker)) return asset;
      }
    }
    if (attempt < 36) await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error('Deployed v0.8 candidate was not observed before recovery verification');
}

const asset = await waitForDeployedCandidate();
const token = await githubOidcToken();
const response = await fetch(audience, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(45_000),
});
const text = await response.text();
if (!response.ok) throw new Error(`Recovery verification endpoint failed (${response.status}): ${text.slice(0, 500)}`);
const result = JSON.parse(text);
if (
  result.status !== 'verified' ||
  result.restoreMatched !== true ||
  result.cleanup !== 'deleted' ||
  result.backupChecksum !== result.restoredChecksum
) {
  throw new Error('Recovery verification response did not satisfy the restore contract');
}

console.log(
  JSON.stringify({
    status: result.status,
    scope: result.scope,
    verifiedAt: result.verifiedAt,
    correlationId: result.correlationId,
    backupChecksum: result.backupChecksum,
    restoredChecksum: result.restoredChecksum,
    restoreMatched: result.restoreMatched,
    cleanup: result.cleanup,
    deployedAsset: asset,
    sourceCommit: process.env.GITHUB_SHA ?? '',
  }),
);
