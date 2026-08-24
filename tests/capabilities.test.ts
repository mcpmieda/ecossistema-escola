import { describe, expect, it } from 'vitest';
import { PLATFORM_CAPABILITIES } from '../shared/platform-contract';
import {
  capabilitiesForRoles,
  capabilityGrantsByRole,
  hasCapability,
  requireCapability,
} from '../server/auth/capabilities';
import { AuthorizationError } from '../server/auth/roles';
import { coreModules } from '../server/platform/manifest';

describe('platform capability authorization', () => {
  it('grants every current platform capability explicitly to ADMINISTRADOR', () => {
    expect(capabilityGrantsByRole.ADMINISTRADOR).toEqual(PLATFORM_CAPABILITIES);
    expect(capabilitiesForRoles(['ADMINISTRADOR'])).toEqual(PLATFORM_CAPABILITIES);
  });

  it.each(['PROFESSOR', 'ALUNO', 'APOIO', 'VISITANTE'] as const)(
    'keeps %s outside the validation platform capability set',
    (role) => {
      expect(capabilitiesForRoles([role])).toEqual([]);
    },
  );

  it('deduplicates grants when roles repeat', () => {
    expect(capabilitiesForRoles(['ADMINISTRADOR', 'ADMINISTRADOR'])).toEqual(
      PLATFORM_CAPABILITIES,
    );
  });

  it('fails closed when a required capability is missing', () => {
    expect(hasCapability(['platform.overview.read'], 'platform.overview.read')).toBe(true);
    expect(() => requireCapability([], 'platform.snapshot.read')).toThrow(AuthorizationError);
    expect(() => requireCapability(['platform.snapshot.read'], 'platform.snapshot.read')).not.toThrow();
  });

  it('keeps manifest requirements covered by the required role policy', () => {
    for (const module of coreModules) {
      const grants = capabilityGrantsByRole[module.requiredRole];
      for (const capability of module.capabilities) {
        expect(grants).toContain(capability);
      }
    }
  });
});
