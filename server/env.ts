import { z } from 'zod';

export const RUNTIME_ENVIRONMENTS = ['local', 'preview', 'production'] as const;
export type RuntimeEnvironment = (typeof RUNTIME_ENVIRONMENTS)[number];

export type RuntimeSecrets = {
  WEB_PRIVATE_KEY_PKCS8?: string;
  WEB_CERT_THUMBPRINT?: string;
  WEB_CREDENTIAL_A?: string;
  WEB_CREDENTIAL_B?: string;
  GRAPH_PRIVATE_KEY_PKCS8?: string;
  GRAPH_CERT_THUMBPRINT?: string;
  GRAPH_CREDENTIAL_A?: string;
  GRAPH_CREDENTIAL_B?: string;
  SESSION_SECRET: string;
};

export type RuntimeEnv = Omit<
  Cloudflare.Env,
  'GRADEBOOK_D1' | 'OFFICIAL_ORIGIN' | 'RUNTIME_ENVIRONMENT'
> &
  RuntimeSecrets & {
    OFFICIAL_ORIGIN: string;
    RUNTIME_ENVIRONMENT?: RuntimeEnvironment;
    GRADEBOOK_D1?: unknown;
  };

const PRODUCTION_ORIGIN = 'https://admin.escolaieda.com';

const envSchema = z
  .object({
    RUNTIME_ENVIRONMENT: z.enum(RUNTIME_ENVIRONMENTS).default('production'),
    TENANT_ID: z.string().uuid(),
    WEB_CLIENT_ID: z.string().uuid(),
    GRAPH_CLIENT_ID: z.string().uuid(),
    SHAREPOINT_SITE_ID: z.string().min(20),
    GROUP_ADMIN_ID: z.string().uuid(),
    GROUP_PROFESSOR_ID: z.string().uuid(),
    GROUP_ALUNO_ID: z.string().uuid(),
    GROUP_APOIO_ID: z.string().uuid(),
    GROUP_VISITANTE_ID: z.string().uuid(),
    OFFICIAL_ORIGIN: z.string().url(),
    WEB_PRIVATE_KEY_PKCS8: z.string().min(256).optional(),
    WEB_CERT_THUMBPRINT: z.string().min(20).optional(),
    WEB_CREDENTIAL_A: z.string().min(256).optional(),
    WEB_CREDENTIAL_B: z.string().min(256).optional(),
    GRAPH_PRIVATE_KEY_PKCS8: z.string().min(256).optional(),
    GRAPH_CERT_THUMBPRINT: z.string().min(20).optional(),
    GRAPH_CREDENTIAL_A: z.string().min(256).optional(),
    GRAPH_CREDENTIAL_B: z.string().min(256).optional(),
    SESSION_SECRET: z.string().min(43),
    GRADEBOOK_D1: z.unknown().optional(),
  })
  .superRefine((value, context) => {
    let origin: URL;
    try {
      origin = new URL(value.OFFICIAL_ORIGIN);
    } catch {
      context.addIssue({
        code: 'custom',
        path: ['OFFICIAL_ORIGIN'],
        message: 'OFFICIAL_ORIGIN is invalid.',
      });
      return;
    }

    if (origin.origin !== value.OFFICIAL_ORIGIN) {
      context.addIssue({
        code: 'custom',
        path: ['OFFICIAL_ORIGIN'],
        message: 'OFFICIAL_ORIGIN must contain only an origin.',
      });
      return;
    }

    if (value.RUNTIME_ENVIRONMENT === 'production' && origin.origin !== PRODUCTION_ORIGIN) {
      context.addIssue({
        code: 'custom',
        path: ['OFFICIAL_ORIGIN'],
        message: 'Production origin is invalid.',
      });
      return;
    }

    if (
      value.RUNTIME_ENVIRONMENT === 'local' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['OFFICIAL_ORIGIN'],
        message: 'Local origin is invalid.',
      });
      return;
    }

    if (
      value.RUNTIME_ENVIRONMENT === 'preview' &&
      (origin.protocol !== 'https:' ||
        !origin.hostname.endsWith('.pages.dev') ||
        origin.hostname === 'pages.dev')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['OFFICIAL_ORIGIN'],
        message: 'Preview origin is invalid.',
      });
    }
  });

export class RuntimeEnvironmentValidationError extends Error {
  constructor() {
    super('Runtime environment is invalid.');
    this.name = 'RuntimeEnvironmentValidationError';
  }
}

export function validateEnv(env: RuntimeEnv): RuntimeEnv {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) throw new RuntimeEnvironmentValidationError();
  return parsed.data as RuntimeEnv;
}
