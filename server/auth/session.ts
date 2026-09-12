import { z } from 'zod';
import type { RuntimeEnv } from '../env';
import { readCookie } from './cookies';
import type { Role } from './roles';
import { unseal } from './sealed';
import {
  DEFAULT_SESSION_DURATION_HOURS,
  isSessionDurationHours,
  type SessionDurationHours,
} from './session-policy';

export const SESSION_COOKIE = '__Host-ecossistema_session';
export const AUTH_COOKIE = '__Host-ecossistema_auth';

export const sessionSchema = z.object({
  oid: z.string().uuid(),
  name: z.string().min(1).max(200),
  username: z.string().max(320).optional(),
  roles: z.array(z.enum(['ADMINISTRADOR', 'PROFESSOR', 'ALUNO', 'APOIO', 'VISITANTE'])),
  authenticatedAt: z.number().int().positive().optional(),
  durationHours: z.number().int().refine(isSessionDurationHours).optional(),
  exp: z.number().int().positive(),
});
export type Session = z.infer<typeof sessionSchema> & { roles: Role[] };

type SessionIdentity = Pick<Session, 'oid' | 'name' | 'username' | 'roles'>;

export function createApplicationSession(
  identity: SessionIdentity,
  durationHours: SessionDurationHours = DEFAULT_SESSION_DURATION_HOURS,
  authenticatedAt = Math.floor(Date.now() / 1000),
): Session {
  return {
    ...identity,
    authenticatedAt,
    durationHours,
    exp: authenticatedAt + durationHours * 60 * 60,
  };
}

export function reconfigureApplicationSession(
  session: Session,
  durationHours: SessionDurationHours,
  now = Math.floor(Date.now() / 1000),
): Session | null {
  const authenticatedAt = session.authenticatedAt ?? now;
  const updated = createApplicationSession(session, durationHours, authenticatedAt);
  return updated.exp > now ? updated : null;
}

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
