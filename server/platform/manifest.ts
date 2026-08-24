import { z } from 'zod';

export const platformRouteSchema = z.enum([
  'visao-geral',
  'publicacoes',
  'paginas',
  'sistemas',
  'auditoria',
  'configuracoes',
]);

export type PlatformRoute = z.infer<typeof platformRouteSchema>;

const moduleStateSchema = z.enum(['validation', 'planned']);

export const coreModuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  route: platformRouteSchema,
  state: moduleStateSchema,
  requiredRole: z.literal('ADMINISTRADOR'),
  capabilities: z.array(z.string().min(1)).min(1),
});

export type CoreModule = z.infer<typeof coreModuleSchema>;

export const coreModules = z
  .array(coreModuleSchema)
  .parse([
    {
      id: 'core.overview',
      name: 'Visão geral',
      description: 'Resumo operacional, integrações e próximos pontos de atenção.',
      route: 'visao-geral',
      state: 'validation',
      requiredRole: 'ADMINISTRADOR',
      capabilities: ['platform.overview.read'],
    },
    {
      id: 'content.publications',
      name: 'Publicações',
      description: 'Conteúdo institucional com revisão, programação, histórico e rollback.',
      route: 'publicacoes',
      state: 'planned',
      requiredRole: 'ADMINISTRADOR',
      capabilities: ['publications.read'],
    },
    {
      id: 'content.pages',
      name: 'Páginas',
      description: 'Edição controlada e versionada das páginas institucionais.',
      route: 'paginas',
      state: 'planned',
      requiredRole: 'ADMINISTRADOR',
      capabilities: ['pages.read'],
    },
    {
      id: 'platform.systems',
      name: 'Sistemas',
      description: 'Catálogo dos módulos do núcleo e dos sistemas registrados no SharePoint.',
      route: 'sistemas',
      state: 'validation',
      requiredRole: 'ADMINISTRADOR',
      capabilities: ['platform.modules.read'],
    },
    {
      id: 'platform.audit',
      name: 'Auditoria',
      description: 'Consulta autorizada da trilha administrativa já preparada na fundação.',
      route: 'auditoria',
      state: 'validation',
      requiredRole: 'ADMINISTRADOR',
      capabilities: ['platform.audit.read'],
    },
    {
      id: 'platform.settings',
      name: 'Configurações',
      description: 'Leitura segura das chaves e metadados de configuração da plataforma.',
      route: 'configuracoes',
      state: 'validation',
      requiredRole: 'ADMINISTRADOR',
      capabilities: ['platform.settings.read'],
    },
  ] satisfies CoreModule[]);

export const platformRoutes = coreModules.map((module) => module.route);

export function normalizePlatformRoute(value: string): PlatformRoute {
  return platformRouteSchema.catch('visao-geral').parse(value);
}
