import { describe, expect, it } from 'vitest';
import { capabilitiesForRoles } from '../server/auth/capabilities';
import { buildAdministrationCenterBootstrap } from '../server/platform/admin-overview';

const identity = { name: 'Administrador Teste', roles: ['ADMINISTRADOR'] as const };

describe('administration center read model', () => {
  it('builds the dashboard from institutional records and filters modules by role', () => {
    const result = buildAdministrationCenterBootstrap({
      identity: { name: identity.name, roles: [...identity.roles] },
      capabilities: capabilitiesForRoles(identity.roles),
      listCount: 10,
      moduleItems: [
        {
          fields: {
            Chave: 'plataforma-base',
            Nome: 'Plataforma Base',
            RotaBase: '/',
            Versao: '1.0.0',
            Status: 'instalado',
            Ordem: 0,
            RolesJson: '["ADMINISTRADOR","PROFESSOR"]',
            HealthEndpoint: '/api/health',
          },
        },
        {
          fields: {
            Chave: 'somente-professor',
            Nome: 'Somente Professor',
            RotaBase: '/professor',
            Versao: '1.0.0',
            Status: 'instalado',
            Ordem: 1,
            RolesJson: '["PROFESSOR"]',
            HealthEndpoint: '/api/professor/health',
          },
        },
      ],
      configurationItems: [
        { fields: { Chave: 'feature.x', Ativo: true } },
        { fields: { Chave: 'feature.y', Ativo: false } },
      ],
      auditItems: [
        {
          fields: {
            DataHoraUTC: '2026-08-24T13:00:00Z',
            Modulo: 'plataforma-base',
            Acao: 'primeiro',
            Resultado: 'sucesso',
          },
        },
        {
          fields: {
            DataHoraUTC: '2026-08-24T14:00:00Z',
            Modulo: 'plataforma-base',
            Acao: 'segundo',
            Resultado: 'negado',
          },
        },
      ],
    });

    expect(result.summary.registeredModules).toBe(1);
    expect(result.summary.activeConfigurations).toBe(1);
    expect(result.modules.map((module) => module.key)).toEqual(['plataforma-base']);
    expect(result.activity.map((event) => event.action)).toEqual(['segundo', 'primeiro']);
    expect(result.activity[0]?.result).toBe('denied');
    expect(result.platform.status).toBe('ok');
  });

  it('reports degradation without fabricating unavailable data', () => {
    const result = buildAdministrationCenterBootstrap({
      identity: { name: identity.name, roles: [...identity.roles] },
      capabilities: capabilitiesForRoles(identity.roles),
      listCount: 7,
      moduleItems: [],
      configurationItems: [],
      auditItems: [],
      warnings: ['audit-registry-read-failed'],
    });

    expect(result.platform.status).toBe('degraded');
    expect(result.summary).toEqual({
      registeredModules: 0,
      activeConfigurations: 0,
      recentEvents: 0,
    });
    expect(result.platform.warnings).toEqual(['audit-registry-read-failed']);
  });

  it('ignores malformed module permissions instead of widening access', () => {
    const result = buildAdministrationCenterBootstrap({
      identity: { name: identity.name, roles: [...identity.roles] },
      capabilities: capabilitiesForRoles(identity.roles),
      listCount: 10,
      moduleItems: [
        {
          fields: {
            Chave: 'malformado',
            Nome: 'Módulo Malformado',
            RolesJson: 'not-json',
          },
        },
      ],
      configurationItems: [],
      auditItems: [],
    });

    expect(result.modules).toEqual([]);
  });
});
