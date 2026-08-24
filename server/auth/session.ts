import { z } from 'zod';
import type { RuntimeEnv } from '../env';
import { readCookie } from './cookies';
import type { Role } from './roles';
import { unseal } from './sealed';

export const SESSION_COOKIE = '__Host-ecossistema_session';
export const AUTH_COOKIE = '__Host-ecossistema_auth';

export const sessionSchema = z.object({
  oid: z.string().uuid(),
  name: z.string().min(1).max(200),
  username: z.string().max(320).optional(),
  roles: z.array(z.enum(['ADMINISTRADOR', 'PROFESSOR', 'ALUNO', 'APOIO', 'VISITANTE'])),
  exp: z.number().int().positive(),
});
export type Session = z.infer<typeof sessionSchema> & { roles: Role[] };

export async function readSession(request: Request, env: RuntimeEnv): Promise<Session | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const value = await unseal<unknown>(token, env.SESSION_SECRET);
  const parsed = sessionSchema.safeParse(value);
  if (!parsed.success || parsed.data.exp <= Math.floor(Date.now() / 1000)) return null;
  return parsed.data;
}

export async function requireAuth(request: Request, env: RuntimeEnv): Promise<Session> {
  const session = await readSession(request, env);
  if (!session) throw new AuthenticationError();
  return session;
}

export class AuthenticationError extends Error {
  readonly status = 401;
  constructor() {
    super('Unauthorized');
  }
}
