import type { Capability } from '../auth/capabilities';
import type { Role } from '../auth/roles';
import type { RuntimeEnv } from '../env';
import { getGraphToken, graphRequest } from '../graph/client';

type RawFields = Record<string, unknown>;
type RawListItem = { fields?: RawFields };
type ListDescriptor = { id: string; displayName: string };
type BatchResponse = {
  responses: Array<{
    id: string;
    status: number;
    body?: { value?: RawListItem[] };
  }>;
};

export type AdministrationCenterBootstrap = {
  candidate: {
    name: 'Centro de Administração';
    version: '0.1.0';
    state: 'validation';
  };
  identity: {
    name: string;
    roles: Role[];
    capabilities: Capability[];
  };
  summary: {
    registeredModules: number;
    activeConfigurations: number;
    recentEvents: number;
  };
  modules: Array<{
    key: string;
    name: string;
    route: string;
    version: string;
    status: 'installed' | 'disabled' | 'deprecated';
    order: number;
    roles: Role[];
    healthEndpoint: string;
    updatedAt: string | null;
  }>;
  activity: Array<{
    timestamp: string;
    module: string;
    action: string;
    result: 'success' | 'failure' | 'denied' | 'unknown';
  }>;
  platform: {
    status: 'ok' | 'degraded';
    dataSource: 'SharePoint CENTROADMIN';
    listCount: number;
    warnings: string[];
    generatedAt: string;
  };
};

export type AdministrationCenterSource = {
  identity: { name: string; roles: Role[] };
  capabilities: Capability[];
  listCount: number;
  moduleItems: RawListItem[];
  configurationItems: RawListItem[];
  auditItems: RawListItem[];
  warnings?: string[];
};

const institutionalRoles = new Set<Role>([
  'ADMINISTRADOR',
  'PROFESSOR',
  'ALUNO',
  'APOIO',
  'VISITANTE',
]);

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function enabled(value: unknown): boolean {
  return value === true || value === 1 || value === 'true';
}

function parseRoles(value: unknown): Role[] {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (candidate): candidate is Role =>
      typeof candidate === 'string' && institutionalRoles.has(candidate as Role),
  );
}

function normalizeModuleStatus(value: unknown): 'installed' | 'disabled' | 'deprecated' {
  switch (value) {
    case 'desabilitado':
    case 'disabled':
      return 'disabled';
    case 'depreciado':
    case 'deprecated':
      return 'deprecated';
    default:
      return 'installed';
  }
}

function normalizeAuditResult(value: unknown): 'success' | 'failure' | 'denied' | 'unknown' {
  switch (value) {
    case 'sucesso':
    case 'success':
      return 'success';
    case 'falha':
    case 'failure':
      return 'failure';
    case 'negado':
    case 'denied':
      return 'denied';
    default:
      return 'unknown';
  }
}

function timestampValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function buildAdministrationCenterBootstrap(
  source: AdministrationCenterSource,
): AdministrationCenterBootstrap {
  const roleSet = new Set(source.identity.roles);
  const modules = source.moduleItems
    .map((item) => {
      const fields = item.fields ?? {};
      const roles = parseRoles(fields.RolesJson);
      return {
        key: text(fields.Chave, text(fields.Title, 'modulo-sem-chave')),
        name: text(fields.Nome, text(fields.Title, 'Módulo')),
        route: text(fields.RotaBase, '/'),
        version: text(fields.Versao, '0.0.0'),
        status: normalizeModuleStatus(fields.Status),
        order: number(fields.Ordem),
        roles,
        healthEndpoint: text(fields.HealthEndpoint, '/api/health'),
        updatedAt: text(fields.AtualizadoEmUTC) || null,
      };
    })
    .filter((module) => module.roles.some((role) => roleSet.has(role)))
    .sort(
      (left, right) => left.order - right.order || left.name.localeCompare(right.name, 'pt-BR'),
    );

  const activeConfigurations = source.configurationItems.reduce(
    (total, item) => total + (enabled(item.fields?.Ativo) ? 1 : 0),
    0,
  );

  const activity = source.auditItems
    .map((item) => {
      const fields = item.fields ?? {};
      return {
        timestamp: text(fields.DataHoraUTC),
        module: text(fields.Modulo, 'plataforma'),
        action: text(fields.Acao, 'evento'),
        result: normalizeAuditResult(fields.Resultado),
      };
    })
    .filter((event) => event.timestamp.length > 0)
    .sort((left, right) => timestampValue(right.timestamp) - timestampValue(left.timestamp))
    .slice(0, 8);

  const warnings = source.warnings ?? [];
  return {
    candidate: {
      name: 'Centro de Administração',
      version: '0.1.0',
      state: 'validation',
    },
    identity: {
      name: source.identity.name,
      roles: source.identity.roles,
      capabilities: source.capabilities,
    },
    summary: {
      registeredModules: modules.length,
      activeConfigurations,
      recentEvents: activity.length,
    },
    modules,
    activity,
    platform: {
      status: warnings.length === 0 ? 'ok' : 'degraded',
      dataSource: 'SharePoint CENTROADMIN',
      listCount: source.listCount,
      warnings,
      generatedAt: new Date().toISOString(),
    },
  };
}

function batchItems(batch: BatchResponse, id: string): { items: RawListItem[]; ok: boolean } {
  const response = batch.responses.find((candidate) => candidate.id === id);
  if (!response || response.status < 200 || response.status >= 300) return { items: [], ok: false };
  return { items: Array.isArray(response.body?.value) ? response.body.value : [], ok: true };
}

function listId(lists: readonly ListDescriptor[], name: string): string | null {
  return lists.find((list) => list.displayName === name)?.id ?? null;
}

export async function loadAdministrationCenterBootstrap(
  env: RuntimeEnv,
  identity: { name: string; roles: Role[] },
  userCapabilities: Capability[],
): Promise<AdministrationCenterBootstrap> {
  const token = await getGraphToken(env);
  const listResult = await graphRequest<{ value: ListDescriptor[] }>({
    env,
    token,
    path: `/sites/${env.SHAREPOINT_SITE_ID}/lists?$select=id,displayName&$top=200`,
  });
  const lists = listResult.data.value;
  const moduleListId = listId(lists, 'PLATAFORMA_MODULOS');
  const configurationListId = listId(lists, 'PLATAFORMA_CONFIGURACOES');
  const auditListId = listId(lists, 'PLATAFORMA_AUDITORIA');
  const warnings: string[] = [];
  const requests: Array<{ id: string; method: 'GET'; url: string }> = [];

  if (moduleListId) {
    requests.push({
      id: 'modules',
      method: 'GET',
      url: `/sites/${env.SHAREPOINT_SITE_ID}/lists/${moduleListId}/items?$expand=fields($select=Title,Chave,Nome,RotaBase,Versao,Status,Ordem,RolesJson,HealthEndpoint,AtualizadoEmUTC)&$top=100`,
    });
  } else {
    warnings.push('module-registry-unavailable');
  }

  if (configurationListId) {
    requests.push({
      id: 'configurations',
      method: 'GET',
      url: `/sites/${env.SHAREPOINT_SITE_ID}/lists/${configurationListId}/items?$expand=fields($select=Chave,Ativo)&$top=200`,
    });
  } else {
    warnings.push('configuration-registry-unavailable');
  }

  if (auditListId) {
    requests.push({
      id: 'audit',
      method: 'GET',
      url: `/sites/${env.SHAREPOINT_SITE_ID}/lists/${auditListId}/items?$expand=fields($select=DataHoraUTC,Modulo,Acao,Resultado)&$top=50`,
    });
  } else {
    warnings.push('audit-registry-unavailable');
  }

  let batch: BatchResponse = { responses: [] };
  if (requests.length > 0) {
    batch = (
      await graphRequest<BatchResponse>({
        env,
        token,
        path: '/$batch',
        method: 'POST',
        body: { requests },
      })
    ).data;
  }

  const moduleSource = batchItems(batch, 'modules');
  const configurationSource = batchItems(batch, 'configurations');
  const auditSource = batchItems(batch, 'audit');
  if (moduleListId && !moduleSource.ok) warnings.push('module-registry-read-failed');
  if (configurationListId && !configurationSource.ok)
    warnings.push('configuration-registry-read-failed');
  if (auditListId && !auditSource.ok) warnings.push('audit-registry-read-failed');

  return buildAdministrationCenterBootstrap({
    identity,
    capabilities: userCapabilities,
    listCount: lists.length,
    moduleItems: moduleSource.items,
    configurationItems: configurationSource.items,
    auditItems: auditSource.items,
    warnings,
  });
}
