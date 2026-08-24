export type Role = 'ADMINISTRADOR' | 'PROFESSOR' | 'ALUNO' | 'APOIO' | 'VISITANTE';

export type Identity = {
  authenticated: boolean;
  name?: string;
  roles?: Role[];
};

export type AdministrationCenterBootstrap = {
  candidate: {
    name: string;
    version: string;
    state: 'validation';
  };
  identity: {
    name: string;
    roles: Role[];
    capabilities: string[];
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
    dataSource: string;
    listCount: number;
    warnings: string[];
    generatedAt: string;
  };
};

export type ApiFailure = {
  error?: string;
  correlationId?: string;
};
