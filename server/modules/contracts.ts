import { z } from 'zod';

export const moduleContract = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]*$/u),
  name: z.string().min(1).max(100),
  baseRoute: z.string().startsWith('/'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/u),
  status: z.enum(['installed', 'disabled', 'deprecated']),
  order: z.number().int().nonnegative(),
  roles: z.array(z.enum(['ADMINISTRADOR', 'PROFESSOR', 'ALUNO', 'APOIO', 'VISITANTE'])).min(1),
  healthEndpoint: z.string().startsWith('/api/'),
});

export const platformBaseModule = moduleContract.parse({
  key: 'plataforma-base',
  name: 'Plataforma Base',
  baseRoute: '/',
  version: '1.0.0',
  status: 'installed',
  order: 0,
  roles: ['ADMINISTRADOR', 'PROFESSOR', 'ALUNO', 'APOIO', 'VISITANTE'],
  healthEndpoint: '/api/health',
});
