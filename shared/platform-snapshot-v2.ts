import { z } from 'zod';
import {
  PLATFORM_CAPABILITIES, PLATFORM_ROUTES, MODULE_REGISTRY_STATUSES,
  MODULE_INTEGRATION_STATES, MODULE_INTEGRATION_ISSUES,
  type PlatformRoute, type PlatformSnapshotContract,
} from './platform-contract';

export const PLATFORM_SOURCE_SECTIONS_V2 = ['lists', 'modules', 'configurations', 'audit', 'migrations'] as const;
export type PlatformSourceSectionV2 = (typeof PLATFORM_SOURCE_SECTIONS_V2)[number];
const text = z.string();
const count = z.number().int().nonnegative().safe();
const capabilities = z.array(z.enum(PLATFORM_CAPABILITIES));

/** Validate the complete shape used by the rendered Center, not only its top-level arrays.
 * Unavailable sections are explicit: an outage must not appear as zero records or absent settings.
 */
export const platformSnapshotSchemaV2 = z.object({
  version: text,
  releaseState: z.literal('production'),
  generatedAt: text,
  correlationId: text,
  foundation: z.object({
    status: z.enum(['ok', 'degraded']), sharePointListCount: count,
    expectedPlatformListsPresent: z.boolean(), missingPlatformLists: z.array(text),
  }),
  operational: z.object({
    status: z.enum(['nominal', 'attention']), recentAuditFailureCount: count,
    healthContractsConfigured: count, healthContractsMissing: count, lastAuditAt: text,
    recoveryStatus: z.enum(['not-verified', 'verified']), recoveryVerifiedAt: text,
    recoveryEvidenceRef: text, recoveryScope: text,
  }).nullable(),
  coreModules: z.array(z.object({
    id: text, name: text, description: text, route: z.enum(PLATFORM_ROUTES),
    state: z.enum(['ready', 'planned']), requiredRole: z.literal('ADMINISTRADOR'), capabilities,
  })),
  registeredModules: z.array(z.object({
    id: text, key: text, name: text, baseRoute: text, version: text,
    status: z.enum(MODULE_REGISTRY_STATUSES), order: z.number().finite(), healthEndpoint: text,
    updatedAt: text, contractVersion: z.number().int().nullable(), requiredCapabilities: capabilities,
    integrationState: z.enum(MODULE_INTEGRATION_STATES),
    integrationIssues: z.array(z.enum(MODULE_INTEGRATION_ISSUES)), available: z.boolean(),
  })),
  configurations: z.array(z.object({
    id: text, key: text, scope: text, version: text, active: z.boolean(),
    effectiveFrom: text, effectiveUntil: text, updatedAt: text,
  })),
  recentAudit: z.array(z.object({
    id: text, eventId: text, occurredAt: text, module: text, action: text,
    entityType: text, correlationId: text, result: text,
  })),
  migrations: z.array(z.object({ id: text, version: text, module: text, appliedAt: text, result: text })),
  unavailableSections: z.array(z.enum(PLATFORM_SOURCE_SECTIONS_V2)).optional(),
  retryAfterSeconds: count.optional(),
});
export type PlatformSnapshotV2 = PlatformSnapshotContract & {
  unavailableSections?: PlatformSourceSectionV2[];
  retryAfterSeconds?: number;
};

const dependencies: Record<PlatformRoute, readonly PlatformSourceSectionV2[]> = {
  'banco-de-notas': [], 'painel-do-aluno': [], publicacoes: [], paginas: [],
  'visao-geral': ['lists', 'modules', 'configurations'],
  operacao: ['lists', 'modules', 'audit'],
  sistemas: ['lists', 'modules'], auditoria: ['lists', 'audit'],
  configuracoes: ['lists', 'configurations', 'migrations'],
};
export const platformRouteNeedsMicrosoftV2 = (route: PlatformRoute): boolean => dependencies[route].length > 0;
export function platformRouteUnavailableV2(route: PlatformRoute, snapshot: PlatformSnapshotV2): boolean {
  return dependencies[route].some((section) => snapshot.unavailableSections?.includes(section));
}
