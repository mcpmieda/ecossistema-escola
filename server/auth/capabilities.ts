import { AuthorizationError, type Role } from './roles';

export const capabilities = [
  'platform.validation.access',
  'platform.overview.read',
  'platform.modules.read',
  'platform.audit.read',
] as const;

export type Capability = (typeof capabilities)[number];

const roleCapabilities: Record<Role, readonly Capability[]> = {
  ADMINISTRADOR: capabilities,
  PROFESSOR: [],
  ALUNO: [],
  APOIO: [],
  VISITANTE: [],
};

export function capabilitiesForRoles(userRoles: readonly Role[]): Capability[] {
  return [...new Set(userRoles.flatMap((role) => roleCapabilities[role]))];
}

export function hasCapability(
  userCapabilities: readonly Capability[],
  capability: Capability,
): boolean {
  return userCapabilities.includes(capability);
}

export function requireCapability(
  userCapabilities: readonly Capability[],
  capability: Capability,
): void {
  if (!hasCapability(userCapabilities, capability)) throw new AuthorizationError();
}
