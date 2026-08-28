import type { PlatformCapability } from '../../shared/platform-contract';
import { AuthorizationError, type Role } from './roles';

export const capabilityGrantsByRole: Record<Role, readonly PlatformCapability[]> = {
  ADMINISTRADOR: [
    'platform.snapshot.read',
    'platform.overview.read',
    'platform.health.read',
    'publications.read',
    'pages.read',
    'platform.modules.read',
    'platform.audit.read',
    'platform.settings.read',
    'grades.read',
    'grades.analytics.read',
    'grades.sources.read',
    'grades.sources.manage',
    'grades.models.read',
    'grades.models.manage',
    'grades.import.run',
    'grades.council.read',
    'grades.council.manage',
    'grades.reports.read',
    'grades.reports.issue',
    'grades.audit.read',
    'grades.settings.read',
    'grades.settings.manage',
  ],
  PROFESSOR: [],
  ALUNO: [],
  APOIO: [],
  VISITANTE: [],
};

export function capabilitiesForRoles(roles: readonly Role[]): PlatformCapability[] {
  return [...new Set(roles.flatMap((role) => capabilityGrantsByRole[role]))];
}

export function hasCapability(
  capabilities: readonly PlatformCapability[],
  capability: PlatformCapability,
): boolean {
  return capabilities.includes(capability);
}

export function requireCapability(
  capabilities: readonly PlatformCapability[],
  capability: PlatformCapability,
): void {
  if (!hasCapability(capabilities, capability)) throw new AuthorizationError();
}
