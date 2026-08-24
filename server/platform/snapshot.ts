import { z } from 'zod';
import type { RuntimeEnv } from '../env';
import { graphRequest } from '../graph/client';
import { coreModules } from './manifest';

const listSchema = z.object({ id: z.string(), displayName: z.string() });
const graphItemSchema = z.object({ id: z.string(), fields: z.record(z.string(), z.unknown()).optional() });

const moduleFieldsSchema = z.object({
  Chave: z.string().optional(),
  Nome: z.string().optional(),
  RotaBase: z.string().optional(),
  Versao: z.string().optional(),
  Status: z.string().optional(),
  Ordem: z.union([z.number(), z.string()]).optional(),
  RolesJson: z.string().optional(),
  HealthEndpoint: z.string().optional(),
  AtualizadoEmUTC: z.string().optional(),
});

const configurationFieldsSchema = z.object({
  Chave: z.string().optional(),
  Escopo: z.string().optional(),
  Versao: z.string().optional(),
  Ativo: z.boolean().optional(),
  VigenciaInicioUTC: z.string().optional(),
  VigenciaFimUTC: z.string().optional(),
  AtualizadoEmUTC: z.string().optional(),
});

const auditFieldsSchema = z.object({
  EventoId: z.string().optional(),
  DataHoraUTC: z.string().optional(),
  Modulo: z.string().optional(),
  Acao: z.string().optional(),
  EntidadeTipo: z.string().optional(),
  CorrelationId: z.string().optional(),
  Resultado: z.string().optional(),
});

const migrationFieldsSchema = z.object({
  Versao: z.string().optional(),
  Modulo: z.string().optional(),
  AplicadaEmUTC: z.string().optional(),
  Resultado: z.string().optional(),
});

export type PlatformSnapshot = Awaited<ReturnType<typeof getPlatformSnapshot>>;

export function parseRolesJson(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = z.array(z.string()).safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function numberOrZero(value: string | number | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function readListItems(
  env: RuntimeEnv,
  listId: string | undefined,
  selectedFields: string,
): Promise<Array<{ id: string; fields: Record<string, unknown> }>> {
  if (!listId) return [];
  const response = await graphRequest<{ value: unknown[] }>({
    env,
    path: `/sites/${env.SHAREPOINT_SITE_ID}/lists/${listId}/items?$expand=fields($select=${selectedFields})&$top=100`,
  });
  return response.data.value
    .map((item) => graphItemSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => ({ id: result.data.id, fields: result.data.fields ?? {} }));
}

export async function getPlatformSnapshot(env: RuntimeEnv) {
  const correlationId = crypto.randomUUID();
  const listsResponse = await graphRequest<{ value: unknown[] }>({
    env,
    path: `/sites/${env.SHAREPOINT_SITE_ID}/lists?$select=id,displayName&$top=50`,
    correlationId,
  });

  const lists = listsResponse.data.value
    .map((value) => listSchema.safeParse(value))
    .filter((result) => result.success)
    .map((result) => result.data);
  const byName = new Map(lists.map((list) => [list.displayName, list.id]));

  const [moduleItems, configurationItems, auditItems, migrationItems] = await Promise.all([
    readListItems(
      env,
      byName.get('PLATAFORMA_MODULOS'),
      'Chave,Nome,RotaBase,Versao,Status,Ordem,RolesJson,HealthEndpoint,AtualizadoEmUTC',
    ),
    readListItems(
      env,
      byName.get('PLATAFORMA_CONFIGURACOES'),
      'Chave,Escopo,Versao,Ativo,VigenciaInicioUTC,VigenciaFimUTC,AtualizadoEmUTC',
    ),
    readListItems(
      env,
      byName.get('PLATAFORMA_AUDITORIA'),
      'EventoId,DataHoraUTC,Modulo,Acao,EntidadeTipo,CorrelationId,Resultado',
    ),
    readListItems(
      env,
      byName.get('PLATAFORMA_MIGRACOES'),
      'Versao,Modulo,AplicadaEmUTC,Resultado',
    ),
  ]);

  const registeredModules = moduleItems
    .map((item) => ({ item, parsed: moduleFieldsSchema.safeParse(item.fields) }))
    .filter((entry) => entry.parsed.success)
    .map(({ item, parsed }) => ({
      id: item.id,
      key: parsed.data.Chave ?? item.id,
      name: parsed.data.Nome ?? parsed.data.Chave ?? 'Módulo sem nome',
      baseRoute: parsed.data.RotaBase ?? '',
      version: parsed.data.Versao ?? '',
      status: parsed.data.Status ?? 'instalado',
      order: numberOrZero(parsed.data.Ordem),
      roles: parseRolesJson(parsed.data.RolesJson),
      healthEndpoint: parsed.data.HealthEndpoint ?? '',
      updatedAt: parsed.data.AtualizadoEmUTC ?? '',
    }))
    .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name, 'pt-BR'));

  const configurations = configurationItems
    .map((item) => ({ item, parsed: configurationFieldsSchema.safeParse(item.fields) }))
    .filter((entry) => entry.parsed.success)
    .map(({ item, parsed }) => ({
      id: item.id,
      key: parsed.data.Chave ?? item.id,
      scope: parsed.data.Escopo ?? 'global',
      version: parsed.data.Versao ?? '',
      active: parsed.data.Ativo ?? false,
      effectiveFrom: parsed.data.VigenciaInicioUTC ?? '',
      effectiveUntil: parsed.data.VigenciaFimUTC ?? '',
      updatedAt: parsed.data.AtualizadoEmUTC ?? '',
    }))
    .sort((left, right) => left.key.localeCompare(right.key, 'pt-BR'));

  const recentAudit = auditItems
    .map((item) => ({ item, parsed: auditFieldsSchema.safeParse(item.fields) }))
    .filter((entry) => entry.parsed.success)
    .map(({ item, parsed }) => ({
      id: item.id,
      eventId: parsed.data.EventoId ?? item.id,
      occurredAt: parsed.data.DataHoraUTC ?? '',
      module: parsed.data.Modulo ?? 'plataforma',
      action: parsed.data.Acao ?? 'evento',
      entityType: parsed.data.EntidadeTipo ?? '',
      correlationId: parsed.data.CorrelationId ?? '',
      result: parsed.data.Resultado ?? '',
    }))
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 20);

  const migrations = migrationItems
    .map((item) => ({ item, parsed: migrationFieldsSchema.safeParse(item.fields) }))
    .filter((entry) => entry.parsed.success)
    .map(({ item, parsed }) => ({
      id: item.id,
      version: parsed.data.Versao ?? '',
      module: parsed.data.Modulo ?? 'plataforma',
      appliedAt: parsed.data.AplicadaEmUTC ?? '',
      result: parsed.data.Resultado ?? '',
    }))
    .sort((left, right) => right.appliedAt.localeCompare(left.appliedAt));

  return {
    version: '0.2.0-validation',
    releaseState: 'validation' as const,
    generatedAt: new Date().toISOString(),
    correlationId,
    foundation: {
      status: 'ok' as const,
      sharePointListCount: lists.length,
      expectedPlatformListsPresent: [
        'PLATAFORMA_CONFIGURACOES',
        'PLATAFORMA_MODULOS',
        'PLATAFORMA_AUDITORIA',
        'PLATAFORMA_MIGRACOES',
      ].every((name) => byName.has(name)),
    },
    coreModules,
    registeredModules,
    configurations,
    recentAudit,
    migrations,
  };
}
