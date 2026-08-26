const required = [
  'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
  'ACTIONS_ID_TOKEN_REQUEST_URL',
  'ENTRA_OPERATIONS_CLIENT_ID',
  'ENTRA_TENANT_ID',
  'SHAREPOINT_SITE_ID',
  'M365_OPERATION',
];

for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const tenantId = process.env.ENTRA_TENANT_ID;
const clientId = process.env.ENTRA_OPERATIONS_CLIENT_ID;
const siteId = process.env.SHAREPOINT_SITE_ID;
const operation = process.env.M365_OPERATION;
const allowedOperations = new Set(['identity-check', 'sharepoint-health', 'banco-notas-readiness']);

if (!allowedOperations.has(operation)) {
  throw new Error(`Unsupported M365 operation: ${operation}`);
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
      client_id: clientId,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
    }),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      `Entra workload token exchange failed (${response.status}): ${body.error ?? 'unknown'}`,
    );
  }

  if (!body.access_token) throw new Error('Entra token response did not contain access_token');
  return body.access_token;
}

function tokenClaims(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return {};
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

async function graph(token, path) {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Microsoft Graph GET failed (${response.status})`);
  return text ? JSON.parse(text) : null;
}

const token = await exchangeGitHubToken();
const claims = tokenClaims(token);
const roles = Array.isArray(claims.roles) ? [...claims.roles].sort() : [];

if (
  claims.aud !== '00000003-0000-0000-c000-000000000000' &&
  claims.aud !== 'https://graph.microsoft.com'
) {
  throw new Error('Unexpected Microsoft Graph token audience');
}

if (!roles.includes('Sites.Selected')) {
  throw new Error('Operational identity token does not contain Sites.Selected');
}

const audit = {
  operation,
  startedAt: new Date().toISOString(),
  authentication: 'github-oidc-entra-workload-federation',
  tokenAudienceValid: true,
  sitesSelected: true,
};

if (operation === 'identity-check') {
  audit.siteProbe = 'not-requested';
}

if (operation === 'sharepoint-health' || operation === 'banco-notas-readiness') {
  const encodedSiteId = encodeURIComponent(siteId);
  const site = await graph(token, `/sites/${encodedSiteId}?$select=id,displayName,webUrl`);
  const lists = await graph(token, `/sites/${encodedSiteId}/lists?$select=id,displayName&$top=200`);
  const drives = await graph(
    token,
    `/sites/${encodedSiteId}/drives?$select=id,name,driveType&$top=200`,
  );

  audit.siteAccess = Boolean(site?.id);
  audit.listCount = Array.isArray(lists?.value) ? lists.value.length : 0;
  audit.driveCount = Array.isArray(drives?.value) ? drives.value.length : 0;
}

if (operation === 'banco-notas-readiness') {
  audit.bancoNotasStorageBoundary = 'sharepoint-onedrive-files-only';
  audit.structuredTransactionalSource = 'd1';
  audit.syncActivation = 'not-performed';
  audit.writeOperation = false;
}

audit.completedAt = new Date().toISOString();
audit.status = 'success';

console.log(JSON.stringify(audit));
