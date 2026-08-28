import { describe, expect, it } from 'vitest';
import { capabilityGrantsByRole, capabilitiesForRoles } from '../server/auth/capabilities';
import { bancoNotasModule } from '../server/modules/contracts';

const bancoCapabilities = [
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
] as const;

describe('Banco de Notas module integration', () => {
  it('publishes the definitive path-based module contract', () => {
    expect(bancoNotasModule).toMatchObject({
      key: 'banco-de-notas',
      baseRoute: '/banco-de-notas',
      healthEndpoint: '/api/banco-notas/health',
      version: '0.1.0',
      status: 'installed',
    });
  });
  it('grants all declared Banco capabilities only to the administrator in Phase 1', () => {
    expect(capabilityGrantsByRole.ADMINISTRADOR).toEqual(
      expect.arrayContaining([...bancoCapabilities]),
    );
    for (const role of ['PROFESSOR', 'ALUNO', 'APOIO', 'VISITANTE'] as const) {
      expect(capabilitiesForRoles([role])).not.toEqual(
        expect.arrayContaining([...bancoCapabilities]),
      );
    }
  });
});
