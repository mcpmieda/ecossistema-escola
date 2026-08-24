import { z } from 'zod';

export type RuntimeSecrets = {
  WEB_PRIVATE_KEY_PKCS8: string;
  WEB_CERT_THUMBPRINT: string;
  GRAPH_PRIVATE_KEY_PKCS8: string;
  GRAPH_CERT_THUMBPRINT: string;
  SESSION_SECRET: string;
};

export type RuntimeEnv = Cloudflare.Env & RuntimeSecrets;

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
  WEB_PRIVATE_KEY_PKCS8: z.string().min(256),
  WEB_CERT_THUMBPRINT: z.string().min(20),
  GRAPH_PRIVATE_KEY_PKCS8: z.string().min(256),
  GRAPH_CERT_THUMBPRINT: z.string().min(20),
  SESSION_SECRET: z.string().min(43),
});

export function validateEnv(env: RuntimeEnv): RuntimeEnv {
  return envSchema.parse(env) as RuntimeEnv;
}
