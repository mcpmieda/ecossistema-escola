export const PLATFORM_ROUTES = [
  'visao-geral',
  'publicacoes',
  'paginas',
  'sistemas',
  'auditoria',
  'configuracoes',
] as const;

export type PlatformRoute = (typeof PLATFORM_ROUTES)[number];
export type ModuleState = 'validation' | 'planned';

export type CoreModuleContract = {
  id: string;
  name: string;
  description: string;
  route: PlatformRoute;
  state: ModuleState;
  requiredRole: 'ADMINISTRADOR';
  capabilities: string[];
};

export type RegisteredModule = {
  id: string;
  key: string;
  name: string;
  baseRoute: string;
  version: string;
  status: string;
  order: number;
  roles: string[];
  healthEndpoint: string;
  updatedAt: string;
};

export type PlatformConfiguration = {
  id: string;
  key: string;
  scope: string;
  version: string;
  active: boolean;
  effectiveFrom: string;
  effectiveUntil: string;
  updatedAt: string;
};

export type AuditEntry = {
  id: string;
  eventId: string;
  occurredAt: string;
  module: string;
  action: string;
  entityType: string;
  correlationId: string;
  result: string;
};

export type MigrationEntry = {
  id: string;
  version: string;
  module: string;
  appliedAt: string;
  result: string;
};

export type PlatformSnapshotContract = {
  version: string;
  releaseState: 'validation';
  generatedAt: string;
  correlationId: string;
  foundation: {
    status: 'ok';
    sharePointListCount: number;
    expectedPlatformListsPresent: boolean;
  };
  coreModules: CoreModuleContract[];
  registeredModules: RegisteredModule[];
  configurations: PlatformConfiguration[];
  recentAudit: AuditEntry[];
  migrations: MigrationEntry[];
};

export function isPlatformRoute(value: string): value is PlatformRoute {
  return (PLATFORM_ROUTES as readonly string[]).includes(value);
}

export function normalizePlatformRoute(value: string): PlatformRoute {
  return isPlatformRoute(value) ? value : 'visao-geral';
}
