import { z } from 'zod';

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

export type RuntimeEnv = Cloudflare.Env & RuntimeSecrets & { BANCO_NOTAS_DB?: D1Database };

const envSchema = z.object({
  TENANT_ID: z.string().uuid(),
  WEB_CLIENT_ID: z.string().uuid(),
  GRAPH_CLIENT_ID: z.string().uuid(),
  SHAREPOINT_SITE_ID: z.string().min(20),
  GROUP_ADMIN_ID: z.string().uuid(),
  GROUP_PROFESSOR_ID: z.string().uuid(),
  GROUP_ALUNO_ID: z.string().uuid(),
  GROUP_APOIO_ID: z.string().uuid(),
  GROUP_VISITANTE_ID: z.string().uuid(),
  OFFICIAL_ORIGIN: z.literal('https://admin.escolaieda.com'),
  WEB_PRIVATE_KEY_PKCS8: z.string().min(256).optional(),
  WEB_CERT_THUMBPRINT: z.string().min(20).optional(),
  WEB_CREDENTIAL_A: z.string().min(256).optional(),
  WEB_CREDENTIAL_B: z.string().min(256).optional(),
  GRAPH_PRIVATE_KEY_PKCS8: z.string().min(256).optional(),
  GRAPH_CERT_THUMBPRINT: z.string().min(20).optional(),
  GRAPH_CREDENTIAL_A: z.string().min(256).optional(),
  GRAPH_CREDENTIAL_B: z.string().min(256).optional(),
  SESSION_SECRET: z.string().min(43),
  BANCO_NOTAS_DB: z.custom<D1Database>().optional(),
});

export function validateEnv(env: RuntimeEnv): RuntimeEnv {
  return envSchema.parse(env) as RuntimeEnv;
}
