import process from 'node:process';
import { pathToFileURL } from 'node:url';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type GraphFetcher = typeof fetch;

type KeyCredential = {
  keyId?: string;
  type?: string;
  usage?: string;
  displayName?: string | null;
  startDateTime?: string | null;
  endDateTime?: string | null;
  customKeyIdentifier?: string | null;
};

type PasswordCredential = {
  keyId?: string;
  displayName?: string | null;
  startDateTime?: string | null;
  endDateTime?: string | null;
};

type RequiredResourceAccess = {
  resourceAppId?: string;
  resourceAccess?: Array<{ id?: string; type?: string }>;
};

type ApplicationResponse = {
  id?: string;
  appId?: string;
  displayName?: string;
  signInAudience?: string;
  web?: { redirectUris?: string[] };
  spa?: { redirectUris?: string[] };
  publicClient?: { redirectUris?: string[] };
  keyCredentials?: KeyCredential[];
  passwordCredentials?: PasswordCredential[];
  requiredResourceAccess?: RequiredResourceAccess[];
};

type ServicePrincipalResponse = {
  id?: string;
  appId?: string;
  displayName?: string;
  accountEnabled?: boolean;
  servicePrincipalType?: string;
};

type Collection<T> = { value?: T[] };

export type EntraApplicationAudit = {
  id: string;
  appId: string;
  displayName: string;
  signInAudience: string | null;
  redirectUris: {
    web: string[];
    spa: string[];
    publicClient: string[];
  };
  keyCredentials: Array<{
    keyId: string | null;
    type: string | null;
    usage: string | null;
    displayName: string | null;
    startDateTime: string | null;
    endDateTime: string | null;
    customKeyIdentifier: string | null;
  }>;
  passwordCredentials: Array<{
    keyId: string | null;
    displayName: string | null;
    startDateTime: string | null;
    endDateTime: string | null;
  }>;
  requiredResourceAccess: Array<{
    resourceAppId: string;
    resourceAccess: Array<{ id: string; type: string }>;
  }>;
  servicePrincipal: {
    id: string;
    appId: string;
    displayName: string;
    accountEnabled: boolean | null;
    servicePrincipalType: string | null;
  } | null;
};

export type EntraOperationsAudit = {
  generatedAt: string;
  applications: {
    web: EntraApplicationAudit;
    graph: EntraApplicationAudit;
  };
};

export class EntraOperationsAuditError extends Error {
  readonly stage: string;
  readonly status?: number;

  constructor(stage: string, status?: number) {
    super(status ? `Entra operations audit failed at ${stage} (${status})` : `Entra operations audit failed at ${stage}`);
    this.name = 'EntraOperationsAuditError';
    this.stage = stage;
    this.status = status;
  }
}

function requiredUuid(value: string, name: string): string {
  const normalized = value.trim();
  if (!UUID.test(normalized)) throw new EntraOperationsAuditError(`invalid-${name}`);
  return normalized;
}

async function graphJson<T>(
  fetcher: GraphFetcher,
  token: string,
  path: string,
  stage: string,
): Promise<T> {
  const response = await fetcher(`${GRAPH_BASE}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new EntraOperationsAuditError(stage, response.status);
  try {
    return (await response.json()) as T;
  } catch {
    throw new EntraOperationsAuditError(`${stage}-invalid-json`);
  }
}

function sanitizeApplication(
  app: ApplicationResponse,
  servicePrincipal: ServicePrincipalResponse | null,
): EntraApplicationAudit {
  if (!app.id || !app.appId || !app.displayName) throw new EntraOperationsAuditError('invalid-application-response');
  return {
    id: app.id,
    appId: app.appId,
    displayName: app.displayName,
    signInAudience: app.signInAudience ?? null,
    redirectUris: {
      web: [...(app.web?.redirectUris ?? [])],
      spa: [...(app.spa?.redirectUris ?? [])],
      publicClient: [...(app.publicClient?.redirectUris ?? [])],
    },
    keyCredentials: (app.keyCredentials ?? []).map((credential) => ({
      keyId: credential.keyId ?? null,
      type: credential.type ?? null,
      usage: credential.usage ?? null,
      displayName: credential.displayName ?? null,
      startDateTime: credential.startDateTime ?? null,
      endDateTime: credential.endDateTime ?? null,
      customKeyIdentifier: credential.customKeyIdentifier ?? null,
    })),
    passwordCredentials: (app.passwordCredentials ?? []).map((credential) => ({
      keyId: credential.keyId ?? null,
      displayName: credential.displayName ?? null,
      startDateTime: credential.startDateTime ?? null,
      endDateTime: credential.endDateTime ?? null,
    })),
    requiredResourceAccess: (app.requiredResourceAccess ?? []).flatMap((entry) =>
      entry.resourceAppId
        ? [{
            resourceAppId: entry.resourceAppId,
            resourceAccess: (entry.resourceAccess ?? []).flatMap((permission) =>
              permission.id && permission.type ? [{ id: permission.id, type: permission.type }] : [],
            ),
          }]
        : [],
    ),
    servicePrincipal:
      servicePrincipal?.id && servicePrincipal.appId && servicePrincipal.displayName
        ? {
            id: servicePrincipal.id,
            appId: servicePrincipal.appId,
            displayName: servicePrincipal.displayName,
            accountEnabled:
              typeof servicePrincipal.accountEnabled === 'boolean' ? servicePrincipal.accountEnabled : null,
            servicePrincipalType: servicePrincipal.servicePrincipalType ?? null,
          }
        : null,
  };
}

async function readExactApplication(
  fetcher: GraphFetcher,
  token: string,
  objectId: string,
  label: 'web' | 'graph',
): Promise<EntraApplicationAudit> {
  const select = [
    'id',
    'appId',
    'displayName',
    'signInAudience',
    'web',
    'spa',
    'publicClient',
    'keyCredentials',
    'passwordCredentials',
    'requiredResourceAccess',
  ].join(',');
  const app = await graphJson<ApplicationResponse>(
    fetcher,
    token,
    `/applications/${encodeURIComponent(objectId)}?$select=${encodeURIComponent(select)}`,
    `${label}-application`,
  );
  if (!app.appId) throw new EntraOperationsAuditError(`${label}-application-invalid`);

  const spSelect = 'id,appId,displayName,accountEnabled,servicePrincipalType';
  const filter = `appId eq '${app.appId.replaceAll("'", "''")}'`;
  const principals = await graphJson<Collection<ServicePrincipalResponse>>(
    fetcher,
    token,
    `/servicePrincipals?$filter=${encodeURIComponent(filter)}&$select=${encodeURIComponent(spSelect)}&$top=2`,
    `${label}-service-principal`,
  );
  const values = principals.value ?? [];
  if (values.length > 1) throw new EntraOperationsAuditError(`${label}-service-principal-ambiguous`);
  return sanitizeApplication(app, values[0] ?? null);
}

export async function auditEntraOperations(input: {
  accessToken: string;
  webApplicationObjectId: string;
  graphApplicationObjectId: string;
  fetcher?: GraphFetcher;
  now?: () => Date;
}): Promise<EntraOperationsAudit> {
  const accessToken = input.accessToken.trim();
  if (!accessToken) throw new EntraOperationsAuditError('missing-access-token');
  const webObjectId = requiredUuid(input.webApplicationObjectId, 'web-object-id');
  const graphObjectId = requiredUuid(input.graphApplicationObjectId, 'graph-object-id');
  if (webObjectId === graphObjectId) throw new EntraOperationsAuditError('duplicate-object-id');

  const fetcher = input.fetcher ?? fetch;
  const [web, graph] = await Promise.all([
    readExactApplication(fetcher, accessToken, webObjectId, 'web'),
    readExactApplication(fetcher, accessToken, graphObjectId, 'graph'),
  ]);

  return {
    generatedAt: (input.now ?? (() => new Date()))().toISOString(),
    applications: { web, graph },
  };
}

async function main(): Promise<void> {
  const accessToken = process.env.GRAPH_ACCESS_TOKEN ?? '';
  const webApplicationObjectId = process.env.WEB_APPLICATION_OBJECT_ID ?? '';
  const graphApplicationObjectId = process.env.GRAPH_APPLICATION_OBJECT_ID ?? '';
  const result = await auditEntraOperations({
    accessToken,
    webApplicationObjectId,
    graphApplicationObjectId,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const safe =
      error instanceof EntraOperationsAuditError
        ? error.message
        : 'Entra operations audit failed unexpectedly';
    console.error(safe);
    process.exitCode = 1;
  });
}
