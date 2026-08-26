const required = [
  'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
  'ACTIONS_ID_TOKEN_REQUEST_URL',
  'ENTRA_MAINTENANCE_CLIENT_ID',
  'ENTRA_TENANT_ID',
];

for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const tenantId = process.env.ENTRA_TENANT_ID;
const maintenanceClientId = process.env.ENTRA_MAINTENANCE_CLIENT_ID;
const displayName = 'Ecossistema Escola - GitHub M365 Operations';
const graphResourceAppId = '00000003-0000-0000-c000-000000000000';
const sitesSelectedRoleId = '883ea226-0bf2-4a8f-9f9d-92c9162a727d';
const federatedCredentialName = 'github-m365-operations-production';
const issuer = 'https://token.actions.githubusercontent.com';
const subject = 'repo:mcpmieda/ecossistema-escola:environment:production';
const audience = 'api://AzureADTokenExchange';

async function githubOidcToken(targetAudience) {
  const url = new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
  url.searchParams.set('audience', targetAudience);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
  });

  if (!response.ok) throw new Error(`GitHub OIDC token request failed (${response.status})`);
  const body = await response.json();
  if (!body.value) throw new Error('GitHub OIDC response did not contain a token');
  return body.value;
}

async function exchangeGitHubToken() {
  const assertion = await githubOidcToken(audience);
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
      `Entra workload token exchange failed (${response.status}): ${body.error ?? 'unknown'}`,
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
  if (!response.ok) throw new Error(`Microsoft Graph ${method} ${path} failed (${response.status})`);
  return text ? JSON.parse(text) : null;
}

function hasSitesSelected(application) {
  return (application.requiredResourceAccess ?? []).some(
    (resource) =>
      resource.resourceAppId === graphResourceAppId &&
      (resource.resourceAccess ?? []).some(
        (permission) => permission.id === sitesSelectedRoleId && permission.type === 'Role',
      ),
  );
}

const token = await exchangeGitHubToken();
const filter = encodeURIComponent(`displayName eq '${displayName}'`);
const applications = await graph(token, 'GET', `/applications?$filter=${filter}&$select=id,appId,displayName,requiredResourceAccess`);

if ((applications.value ?? []).length > 1) {
  throw new Error(`More than one application exists with displayName ${displayName}`);
}

let application = applications.value?.[0];
let applicationCreated = false;

if (!application) {
  application = await graph(token, 'POST', '/applications', {
    displayName,
    signInAudience: 'AzureADMyOrg',
    requiredResourceAccess: [
      {
        resourceAppId: graphResourceAppId,
        resourceAccess: [{ id: sitesSelectedRoleId, type: 'Role' }],
      },
    ],
  });
  applicationCreated = true;
} else if (!hasSitesSelected(application)) {
  await graph(token, 'PATCH', `/applications/${application.id}`, {
    requiredResourceAccess: [
      {
        resourceAppId: graphResourceAppId,
        resourceAccess: [{ id: sitesSelectedRoleId, type: 'Role' }],
      },
    ],
  });
  application = await graph(
    token,
    'GET',
    `/applications/${application.id}?$select=id,appId,displayName,requiredResourceAccess`,
  );
}

const servicePrincipals = await graph(
  token,
  'GET',
  `/servicePrincipals?$filter=${encodeURIComponent(`appId eq '${application.appId}'`)}&$select=id,appId,displayName`,
);

if ((servicePrincipals.value ?? []).length > 1) {
  throw new Error(`More than one service principal exists for appId ${application.appId}`);
}

let servicePrincipal = servicePrincipals.value?.[0];
let servicePrincipalCreated = false;

if (!servicePrincipal) {
  servicePrincipal = await graph(token, 'POST', '/servicePrincipals', { appId: application.appId });
  servicePrincipalCreated = true;
}

const credentials = await graph(
  token,
  'GET',
  `/applications/${application.id}/federatedIdentityCredentials?$select=id,name,issuer,subject,audiences`,
);

const existingCredential = (credentials.value ?? []).find(
  (credential) => credential.name === federatedCredentialName,
);

let federatedCredentialCreated = false;

if (existingCredential) {
  const exact =
    existingCredential.issuer === issuer &&
    existingCredential.subject === subject &&
    Array.isArray(existingCredential.audiences) &&
    existingCredential.audiences.length === 1 &&
    existingCredential.audiences[0] === audience;

  if (!exact) {
    throw new Error(`Federated credential ${federatedCredentialName} exists with unexpected trust values`);
  }
} else {
  await graph(token, 'POST', `/applications/${application.id}/federatedIdentityCredentials`, {
    name: federatedCredentialName,
    issuer,
    subject,
    audiences: [audience],
    description: 'GitHub Actions production environment for M365 Control Plane operations',
  });
  federatedCredentialCreated = true;
}

const result = {
  status: 'bootstrap-ready',
  applicationCreated,
  servicePrincipalCreated,
  federatedCredentialCreated,
  applicationClientId: application.appId,
  applicationObjectId: application.id,
  servicePrincipalObjectId: servicePrincipal.id,
  requestedPermission: 'Sites.Selected',
  requestedPermissionId: sitesSelectedRoleId,
  federatedSubject: subject,
  adminConsentRequired: true,
  selectedSiteGrantRequired: true,
};

console.log(JSON.stringify(result));
