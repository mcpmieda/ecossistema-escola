import { z } from 'zod';
import type { RuntimeEnv } from '../env';
import { graphRequest } from '../graph/client';
import { coreModules } from './manifest';

const listSchema = z.object({ id: z.string(), displayName: z.string() });
const graphItemSchema = z.object({
  id: z.string(),
  fields: z.record(z.string(), z.unknown()).optional(),
});

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

type PlatformList = z.infer<typeof listSchema>;
type PlatformItem = { id: string; fields: Record<string, unknown> };

type SnapshotSource = {
  lists: PlatformList[];
  moduleItems: PlatformItem[];
  configurationItems: PlatformItem[];
  auditItems: PlatformItem[];
  migrationItems: PlatformItem[];
  correlationId: string;
  generatedAt?: string;
};

export type PlatformSnapshot = ReturnType<typeof buildPlatformSnapshot>;

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
): Promise<PlatformItem[]> {
  if (!listId) return [];
  const response = await graphRequest<{ value: unknown[] }>({
    env,
    path: `/sites/${env.SHAREPOINT_SITE_ID}/lists/${listId}/items?$expand=fields($select=${selectedFields})&$top=100`,
  });
  return response.data.value.flatMap((item) => {
    const parsed = graphItemSchema.safeParse(item);
    if (!parsed.success) return [];
    return [{ id: parsed.data.id, fields: parsed.data.fields ?? {} }];
  });
}

export function buildPlatformSnapshot(source: SnapshotSource) {
  const byName = new Map(source.lists.map((list) => [list.displayName, list.id]));

  const registeredModules = source.moduleItems
    .flatMap((item) => {
      const parsed = moduleFieldsSchema.safeParse(item.fields);
      if (!parsed.success) return [];
      const fields = parsed.data;
      return [
        {
          id: item.id,
          key: fields.Chave ?? item.id,
          name: fields.Nome ?? fields.Chave ?? 'Módulo sem nome',
          baseRoute: fields.RotaBase ?? '',
          version: fields.Versao ?? '',
          status: fields.Status ?? 'instalado',
          order: numberOrZero(fields.Ordem),
          roles: parseRolesJson(fields.RolesJson),
          healthEndpoint: fields.HealthEndpoint ?? '',
          updatedAt: fields.AtualizadoEmUTC ?? '',
        },
      ];
    })
    .sort(
      (left, right) => left.order - right.order || left.name.localeCompare(right.name, 'pt-BR'),
    );

  const configurations = source.configurationItems
    .flatMap((item) => {
      const parsed = configurationFieldsSchema.safeParse(item.fields);
      if (!parsed.success) return [];
      const fields = parsed.data;
      return [
        {
          id: item.id,
          key: fields.Chave ?? item.id,
          scope: fields.Escopo ?? 'global',
          version: fields.Versao ?? '',
          active: fields.Ativo ?? false,
          effectiveFrom: fields.VigenciaInicioUTC ?? '',
          effectiveUntil: fields.VigenciaFimUTC ?? '',
          updatedAt: fields.AtualizadoEmUTC ?? '',
        },
      ];
    })
    .sort((left, right) => left.key.localeCompare(right.key, 'pt-BR'));

  const recentAudit = source.auditItems
    .flatMap((item) => {
      const parsed = auditFieldsSchema.safeParse(item.fields);
      if (!parsed.success) return [];
      const fields = parsed.data;
      return [
        {
          id: item.id,
          eventId: fields.EventoId ?? item.id,
          occurredAt: fields.DataHoraUTC ?? '',
          module: fields.Modulo ?? 'plataforma',
          action: fields.Acao ?? 'evento',
          entityType: fields.EntidadeTipo ?? '',
          correlationId: fields.CorrelationId ?? '',
          result: fields.Resultado ?? '',
        },
      ];
    })
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 20);

  const migrations = source.migrationItems
    .flatMap((item) => {
      const parsed = migrationFieldsSchema.safeParse(item.fields);
      if (!parsed.success) return [];
      const fields = parsed.data;
      return [
        {
          id: item.id,
          version: fields.Versao ?? '',
          module: fields.Modulo ?? 'plataforma',
          appliedAt: fields.AplicadaEmUTC ?? '',
          result: fields.Resultado ?? '',
        },
      ];
    })
    .sort((left, right) => right.appliedAt.localeCompare(left.appliedAt));

  return {
    version: '0.2.0-validation',
    releaseState: 'validation' as const,
    generatedAt: source.generatedAt ?? new Date().toISOString(),
    correlationId: source.correlationId,
    foundation: {
      status: 'ok' as const,
      sharePointListCount: source.lists.length,
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

export async function getPlatformSnapshot(env: RuntimeEnv): Promise<PlatformSnapshot> {
  const correlationId = crypto.randomUUID();
  const listsResponse = await graphRequest<{ value: unknown[] }>({
    env,
    path: `/sites/${env.SHAREPOINT_SITE_ID}/lists?$select=id,displayName&$top=50`,
    correlationId,
  });

  const lists = listsResponse.data.value.flatMap((value) => {
    const parsed = listSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
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
    readListItems(env, byName.get('PLATAFORMA_MIGRACOES'), 'Versao,Modulo,AplicadaEmUTC,Resultado'),
  ]);

  return buildPlatformSnapshot({
    lists,
    moduleItems,
    configurationItems,
    auditItems,
    migrationItems,
    correlationId,
  });
}
