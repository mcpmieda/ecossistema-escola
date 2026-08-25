import { z } from 'zod';
import { PLATFORM_CAPABILITIES, type PlatformCapability } from '../../shared/platform-contract';

export const MODULE_CONTRACT_VERSION = 1 as const;

const capabilitySchema = z.enum(PLATFORM_CAPABILITIES);
const sameOriginPathSchema = z
  .string()
  .min(1)
  .regex(/^\/(?!\/)/u, 'must be a same-origin absolute path')
  .refine((value) => !value.includes('\\'), 'must not contain backslashes');

export const moduleContract = z.object({
  contractVersion: z.literal(MODULE_CONTRACT_VERSION),
  key: z.string().regex(/^[a-z][a-z0-9-]*$/u),
  name: z.string().min(1).max(100),
  baseRoute: sameOriginPathSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/u),
  status: z.enum(['installed', 'disabled', 'deprecated']),
  order: z.number().int().nonnegative(),
  requiredCapabilities: z
    .array(capabilitySchema)
    .min(1)
    .refine((values) => new Set(values).size === values.length, 'capabilities must be unique'),
  healthEndpoint: sameOriginPathSchema.refine(
    (value) => value.startsWith('/api/'),
    'health endpoint must be under /api/',
  ),
});

export type ModuleContract = z.infer<typeof moduleContract> & {
  requiredCapabilities: PlatformCapability[];
};

export const platformBaseModule: ModuleContract = moduleContract.parse({
  contractVersion: MODULE_CONTRACT_VERSION,
  key: 'plataforma-base',
  name: 'Plataforma Base',
  baseRoute: '/',
  version: '1.0.0',
  status: 'installed',
  order: 0,
  requiredCapabilities: ['platform.overview.read'],
  healthEndpoint: '/api/health',
});

export const bancoNotasModule: ModuleContract = moduleContract.parse({
  contractVersion: MODULE_CONTRACT_VERSION,
  key: 'banco-de-notas',
  name: 'Banco de Notas',
  baseRoute: '/banco-de-notas',
  version: '0.1.0',
  status: 'installed',
  order: 10,
  requiredCapabilities: ['grades.read'],
  healthEndpoint: '/api/banco-notas/health',
});

export const integratedModuleContracts: ModuleContract[] = z
  .array(moduleContract)
  .parse([platformBaseModule, bancoNotasModule]);

export function moduleContractForKey(key: string): ModuleContract | undefined {
  return integratedModuleContracts.find((contract) => contract.key === key);
}
