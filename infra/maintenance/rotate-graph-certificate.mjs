import { X509Certificate, createHash, createPrivateKey, randomUUID, sign } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const required = [
  'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
  'ACTIONS_ID_TOKEN_REQUEST_URL',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
  'ENTRA_MAINTENANCE_CLIENT_ID',
  'ENTRA_TENANT_ID',
  'GRAPH_APPLICATION_OBJECT_ID',
  'GRAPH_CLIENT_ID',
  'SHAREPOINT_SITE_ID',
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const tenantId = process.env.ENTRA_TENANT_ID;
const maintenanceClientId = process.env.ENTRA_MAINTENANCE_CLIENT_ID;
const graphApplicationObjectId = process.env.GRAPH_APPLICATION_OBJECT_ID;
const graphClientId = process.env.GRAPH_CLIENT_ID;
const siteId = process.env.SHAREPOINT_SITE_ID;
const projectName = 'ecossistema-escola';
const officialOrigin = 'https://admin.escolaieda.com';
const maintenanceAudience = `${officialOrigin}/api/maintenance/rotation/validate`;
const forceRotation = process.env.FORCE_ROTATION === 'true';
const simulateFailure = process.env.SIMULATE_FAILURE === 'true';
const rotationPrefix = 'automatic-graph-slot-';
const audit = {
  startedAt: new Date().toISOString(),
  mode: simulateFailure ? 'failure-test' : 'rotation',
};

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

async function githubOidcToken(audience) {
  const url = new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
  url.searchParams.set('audience', audience);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
  });
  if (!response.ok) throw new Error(`GitHub OIDC token request failed (${response.status})`);
  const body = await response.json();
  if (!body.value) throw new Error('GitHub OIDC response did not contain a token');
  return body.value;
}

async function exchangeGitHubToken() {
  const assertion = await githubOidcToken('api://AzureADTokenExchange');
  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: maintenanceClientId,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      `Entra workload token exchange failed (${response.status}): ${body.error ?? 'unknown'}: ${body.error_description ?? 'no description'}`,
    );
  }
  return body.access_token;
}

async function graph(token, method, path, body) {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok)
    throw new Error(`Microsoft Graph ${method} ${path} failed (${response.status})`);
  return text ? JSON.parse(text) : null;
}

function newClientAssertion(privateKeyPem, thumbprint) {
  const now = Math.floor(Date.now() / 1000);
  const endpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const encodedHeader = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', x5t: thumbprint }));
  const encodedPayload = base64url(
    JSON.stringify({
      aud: endpoint,
      iss: graphClientId,
      sub: graphClientId,
      jti: randomUUID(),
      nbf: now - 30,
      exp: now + 300,
    }),
  );
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const signature = sign('RSA-SHA256', Buffer.from(unsigned), createPrivateKey(privateKeyPem));
  return `${unsigned}.${base64url(signature)}`;
}

async function validateCandidate(privateKeyPem, thumbprint) {
  const endpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  let tokenResponse;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    tokenResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: graphClientId,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: newClientAssertion(privateKeyPem, thumbprint),
      }),
    });
    if (tokenResponse.ok) break;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  if (!tokenResponse?.ok)
    throw new Error(`New certificate did not authenticate (${tokenResponse?.status})`);
  const token = (await tokenResponse.json()).access_token;
  const centro = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/lists?$select=id&$top=20`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!centro.ok) throw new Error(`CENTROADMIN validation failed (${centro.status})`);
  const other = await fetch('https://graph.microsoft.com/v1.0/sites/eduieda.sharepoint.com:/', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (other.status !== 403)
    throw new Error(`Sites.Selected negative test expected 403, got ${other.status}`);
  return { listCount: (await centro.json()).value.length, otherSiteStatus: other.status };
}

function putPagesSecret(name, value) {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(
    executable,
    ['wrangler', 'pages', 'secret', 'put', name, '--project-name', projectName],
    {
      input: value,
      encoding: 'utf8',
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  if (result.status !== 0) throw new Error(`Cloudflare rejected secret ${name}: ${result.stderr}`);
}

async function validateCloudflareSlot(slot) {
  const oidc = await githubOidcToken(maintenanceAudience);
  const response = await fetch(`${maintenanceAudience}?slot=${slot}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${oidc}` },
  });
  if (!response.ok) throw new Error(`Cloudflare runtime validation failed (${response.status})`);
  return response.json();
}

function keyCreatedAt(key) {
  const match = key.displayName?.match(/^automatic-graph-slot-[AB]-(.+)$/u);
  return match ? Date.parse(match[1]) : Number.NaN;
}

const directory = await mkdtemp(join(tmpdir(), 'ecossistema-rotation-'));
let maintenanceToken;
let candidateKeyId;
let candidateInstalled = false;
try {
  maintenanceToken = await exchangeGitHubToken();
  const application = await graph(
    maintenanceToken,
    'GET',
    `/applications/${graphApplicationObjectId}?$select=id,keyCredentials`,
  );
  const existing = application.keyCredentials ?? [];
  const managed = existing
    .filter((key) => key.displayName?.startsWith(rotationPrefix))
    .sort((left, right) => keyCreatedAt(right) - keyCreatedAt(left));
  const newestExpiry = managed[0]?.endDateTime ? Date.parse(managed[0].endDateTime) : 0;
  const daysRemaining = (newestExpiry - Date.now()) / 86_400_000;
  if (!forceRotation && !simulateFailure && managed.length > 0 && daysRemaining > 60) {
    audit.status = 'not-due';
    audit.daysRemaining = Math.floor(daysRemaining);
    console.log(JSON.stringify(audit));
    process.exit(0);
  }

  const previousSlot = managed[0]?.displayName?.startsWith(`${rotationPrefix}A-`)
    ? 'A'
    : managed[0]
      ? 'B'
      : 'LEGACY';
  const candidateSlot = previousSlot === 'A' ? 'B' : 'A';
  const createdAt = new Date().toISOString();
  const privateKeyPath = join(directory, 'private.pem');
  const certificatePath = join(directory, 'certificate.pem');
  const openssl = spawnSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-sha256',
      '-nodes',
      '-keyout',
      privateKeyPath,
      '-out',
      certificatePath,
      '-subj',
      `/CN=Ecossistema Escolar Graph ${candidateSlot}`,
      '-days',
      '180',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (openssl.status !== 0) throw new Error(`Certificate generation failed: ${openssl.stderr}`);
  const privateKeyPem = await readFile(privateKeyPath, 'utf8');
  const certificatePem = await readFile(certificatePath, 'utf8');
  const certificate = new X509Certificate(certificatePem);
  const certificateDer = certificate.raw;
  const thumbprint = createHash('sha1').update(certificateDer).digest('base64url');
  candidateKeyId = randomUUID();
  const keyCredential = {
    customKeyIdentifier: createHash('sha1').update(certificateDer).digest('base64'),
    displayName: `${rotationPrefix}${candidateSlot}-${createdAt}`,
    endDateTime: new Date(certificate.validTo).toISOString(),
    key: certificateDer.toString('base64'),
    keyId: candidateKeyId,
    startDateTime: new Date(certificate.validFrom).toISOString(),
    type: 'AsymmetricX509Cert',
    usage: 'Verify',
  };

  await graph(maintenanceToken, 'PATCH', `/applications/${graphApplicationObjectId}`, {
    keyCredentials: [...existing, keyCredential],
  });
  candidateInstalled = true;

  if (simulateFailure) throw new Error('SIMULATED_FAILURE_BEFORE_CLOUDFLARE');

  const direct = await validateCandidate(privateKeyPem, thumbprint);
  const serialized = JSON.stringify({
    privateKeyPkcs8: privateKeyPem,
    certificateThumbprint: thumbprint,
    keyId: candidateKeyId,
    createdAt,
  });
  putPagesSecret(`GRAPH_CREDENTIAL_${candidateSlot}`, serialized);
  const runtime = await validateCloudflareSlot(candidateSlot);

  const refreshed = await graph(
    maintenanceToken,
    'GET',
    `/applications/${graphApplicationObjectId}?$select=keyCredentials`,
  );
  const byNewest = refreshed.keyCredentials
    .filter((key) => key.keyId !== candidateKeyId)
    .sort((left, right) => Date.parse(right.startDateTime) - Date.parse(left.startDateTime));
  const retainedPrevious = managed[0]?.keyId ?? byNewest[0]?.keyId;
  const retainedIds = new Set([candidateKeyId, retainedPrevious].filter(Boolean));
  const retained = refreshed.keyCredentials.filter((key) => retainedIds.has(key.keyId));
  const removed = refreshed.keyCredentials.filter((key) => !retainedIds.has(key.keyId));
  if (removed.length > 0) {
    await graph(maintenanceToken, 'PATCH', `/applications/${graphApplicationObjectId}`, {
      keyCredentials: retained,
    });
  }
  audit.status = 'rotated';
  audit.slot = candidateSlot;
  audit.directValidation = direct;
  audit.runtimeCorrelationId = runtime.correlationId;
  audit.removedPreviousCredentials = removed.length;
  audit.completedAt = new Date().toISOString();
  console.log(JSON.stringify(audit));
} catch (error) {
  if (candidateInstalled && maintenanceToken && candidateKeyId) {
    try {
      const current = await graph(
        maintenanceToken,
        'GET',
        `/applications/${graphApplicationObjectId}?$select=keyCredentials`,
      );
      const withoutCandidate = current.keyCredentials.filter((key) => key.keyId !== candidateKeyId);
      if (withoutCandidate.length === 0) {
        throw new Error('Refusing to remove the only credential', { cause: error });
      }
      await graph(maintenanceToken, 'PATCH', `/applications/${graphApplicationObjectId}`, {
        keyCredentials: withoutCandidate,
      });
      audit.candidateCleaned = true;
      audit.functionalCredentialPreserved = true;
    } catch (cleanupError) {
      audit.cleanupError = cleanupError instanceof Error ? cleanupError.message : 'unknown';
    }
  }
  audit.status =
    simulateFailure && audit.functionalCredentialPreserved ? 'simulated-failure-safe' : 'failed';
  audit.error = error instanceof Error ? error.message : 'unknown';
  audit.completedAt = new Date().toISOString();
  console.log(JSON.stringify(audit));
  if (!simulateFailure || !audit.functionalCredentialPreserved) process.exitCode = 1;
} finally {
  await writeFile(join(directory, 'destroyed.txt'), 'ephemeral credentials removed');
  await rm(directory, { recursive: true, force: true });
}
