import { describe, expect, it } from 'vitest';
import {
  capabilitiesForRoles,
  hasCapability,
  requireCapability,
} from '../server/auth/capabilities';
import { AuthorizationError } from '../server/auth/roles';

describe('platform capabilities', () => {
  it('grants the validation center capabilities to ADMINISTRADOR', () => {
    const resolved = capabilitiesForRoles(['ADMINISTRADOR']);
    expect(resolved).toContain('platform.validation.access');
    expect(resolved).toContain('platform.overview.read');
    expect(resolved).toContain('platform.modules.read');
    expect(resolved).toContain('platform.audit.read');
  });

  it.each(['PROFESSOR', 'ALUNO', 'APOIO', 'VISITANTE'] as const)(
    'does not grant validation access to %s',
    (role) => {
      expect(hasCapability(capabilitiesForRoles([role]), 'platform.validation.access')).toBe(false);
    },
  );

  it('denies a missing capability on the server', () => {
    expect(() => requireCapability([], 'platform.overview.read')).toThrow(AuthorizationError);
  });
});
