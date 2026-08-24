import { z } from 'zod';
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_ROUTES,
  type CoreModuleContract,
} from '../../shared/platform-contract';

const platformRouteSchema = z.enum(PLATFORM_ROUTES);
const platformCapabilitySchema = z.enum(PLATFORM_CAPABILITIES);
const moduleStateSchema = z.enum(['validation', 'planned']);

export const coreModuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  route: platformRouteSchema,
  state: moduleStateSchema,
  requiredRole: z.literal('ADMINISTRADOR'),
  capabilities: z.array(platformCapabilitySchema).min(1),
});

export const coreModules: CoreModuleContract[] = z.array(coreModuleSchema).parse([
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
    id: 'platform.operations',
    name: 'Operação',
    description: 'Saúde observável, degradação e lacunas de recuperação do núcleo.',
    route: 'operacao',
    state: 'validation',
    requiredRole: 'ADMINISTRADOR',
    capabilities: ['platform.health.read'],
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
]);
