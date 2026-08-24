import { z } from 'zod';
import type { PlatformCapability } from '../../shared/platform-contract';
import type { RuntimeEnv } from '../env';
import { graphRequest } from '../graph/client';
import { resolveRegisteredModules } from '../modules/registry';
import { coreModules } from './manifest';

export const EXPECTED_PLATFORM_LISTS = [
  'PLATAFORMA_CONFIGURACOES',
  'PLATAFORMA_MODULOS',
  'PLATAFORMA_AUDITORIA',
  'PLATAFORMA_MIGRACOES',
] as const;

const listSchema = z.object({ id: z.string(), displayName: z.string() });
const graphItemSchema = z.object({
  id: z.string(),
  fields: z.record(z.string(), z.unknown()).optional(),
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

export function isFailureResult(value: string): boolean {
  const normalized = value
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');
  return /^(erro|error|falha|falhou|failed|failure)(?:\b|[:_-])/u.test(normalized);
}

function hasCapability(
  capabilities: readonly PlatformCapability[],
  capability: PlatformCapability,
): boolean {
  return capabilities.includes(capability);
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

export function buildPlatformSnapshot(
  source: SnapshotSource,
  capabilities: readonly PlatformCapability[],
) {
  const byName = new Map(source.lists.map((list) => [list.displayName, list.id]));

  const allRegisteredModules = resolveRegisteredModules(source.moduleItems, capabilities);

  const allConfigurations = source.configurationItems
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

  const allRecentAudit = source.auditItems
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

  const allMigrations = source.migrationItems
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

  const missingPlatformLists = EXPECTED_PLATFORM_LISTS.filter((name) => !byName.has(name));
  const foundationStatus =
    missingPlatformLists.length === 0 ? ('ok' as const) : ('degraded' as const);
  const recentAuditFailureCount = allRecentAudit.filter((entry) =>
    isFailureResult(entry.result),
  ).length;
  const healthContractsConfigured = allRegisteredModules.filter(
    (module) => module.healthEndpoint.trim().length > 0,
  ).length;
  const healthContractsMissing = allRegisteredModules.length - healthContractsConfigured;
  const operationalStatus =
    foundationStatus === 'degraded' || recentAuditFailureCount > 0
      ? ('attention' as const)
      : ('nominal' as const);

  return {
    version: '0.7.0-validation',
    releaseState: 'validation' as const,
    generatedAt: source.generatedAt ?? new Date().toISOString(),
    correlationId: source.correlationId,
    foundation: {
      status: foundationStatus,
      sharePointListCount: source.lists.length,
      expectedPlatformListsPresent: missingPlatformLists.length === 0,
      missingPlatformLists,
    },
    operational: hasCapability(capabilities, 'platform.health.read')
      ? {
          status: operationalStatus,
          recentAuditFailureCount,
          healthContractsConfigured,
          healthContractsMissing,
          lastAuditAt: allRecentAudit[0]?.occurredAt ?? '',
          recoveryStatus: 'not-verified' as const,
        }
      : null,
    coreModules: coreModules.filter((module) =>
      module.capabilities.every((capability) => hasCapability(capabilities, capability)),
    ),
    registeredModules: hasCapability(capabilities, 'platform.modules.read')
      ? allRegisteredModules
      : [],
    configurations: hasCapability(capabilities, 'platform.settings.read') ? allConfigurations : [],
    recentAudit: hasCapability(capabilities, 'platform.audit.read') ? allRecentAudit : [],
    migrations: hasCapability(capabilities, 'platform.settings.read') ? allMigrations : [],
  };
}

export async function getPlatformSnapshot(
  env: RuntimeEnv,
  capabilities: readonly PlatformCapability[],
): Promise<PlatformSnapshot> {
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
  const readsModules =
    hasCapability(capabilities, 'platform.modules.read') ||
    hasCapability(capabilities, 'platform.health.read');
  const readsAudit =
    hasCapability(capabilities, 'platform.audit.read') ||
    hasCapability(capabilities, 'platform.health.read');
  const readsSettings = hasCapability(capabilities, 'platform.settings.read');

  const [moduleItems, configurationItems, auditItems, migrationItems] = await Promise.all([
    readsModules
      ? readListItems(
          env,
          byName.get('PLATAFORMA_MODULOS'),
          'Chave,Nome,RotaBase,Versao,Status,Ordem,HealthEndpoint,AtualizadoEmUTC',
        )
      : Promise.resolve([]),
    readsSettings
      ? readListItems(
          env,
          byName.get('PLATAFORMA_CONFIGURACOES'),
          'Chave,Escopo,Versao,Ativo,VigenciaInicioUTC,VigenciaFimUTC,AtualizadoEmUTC',
        )
      : Promise.resolve([]),
    readsAudit
      ? readListItems(
          env,
          byName.get('PLATAFORMA_AUDITORIA'),
          'EventoId,DataHoraUTC,Modulo,Acao,EntidadeTipo,CorrelationId,Resultado',
        )
      : Promise.resolve([]),
    readsSettings
      ? readListItems(
          env,
          byName.get('PLATAFORMA_MIGRACOES'),
          'Versao,Modulo,AplicadaEmUTC,Resultado',
        )
      : Promise.resolve([]),
  ]);

  return buildPlatformSnapshot(
    {
      lists,
      moduleItems,
      configurationItems,
      auditItems,
      migrationItems,
      correlationId,
    },
    capabilities,
  );
}
