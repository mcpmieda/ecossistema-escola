import { describe, expect, it } from 'vitest';
import { resolveRegisteredModules } from '../server/modules/registry';

const platformBaseRegistryItem = {
  id: 'module-base',
  fields: {
    Chave: 'plataforma-base',
    Nome: 'Plataforma Base',
    RotaBase: '/',
    Versao: '1.0.0',
    Status: 'instalado',
    Ordem: 0,
    HealthEndpoint: '/api/health',
    AtualizadoEmUTC: '2026-08-24T21:00:00Z',
  },
};

describe('module registry integration resolution', () => {
  it('marks a matching registered contract as ready and available when its capability is granted', () => {
    const [module] = resolveRegisteredModules([platformBaseRegistryItem], [
      'platform.overview.read',
    ]);

    expect(module).toMatchObject({
      key: 'plataforma-base',
      status: 'installed',
      contractVersion: 1,
      requiredCapabilities: ['platform.overview.read'],
      integrationState: 'ready',
      integrationIssues: [],
      available: true,
    });
  });

  it('keeps a valid contract unavailable when its required capability is absent', () => {
    const [module] = resolveRegisteredModules([platformBaseRegistryItem], []);

    expect(module.integrationState).toBe('ready');
    expect(module.available).toBe(false);
  });

  it('does not treat legacy RolesJson as authorization or integration evidence', () => {
    const [module] = resolveRegisteredModules(
      [
        {
          id: 'module-legacy',
          fields: {
            Chave: 'banco-notas',
            Nome: 'Banco de Notas',
            RotaBase: '/banco-notas',
            Versao: '1.0.0',
            Status: 'instalado',
            Ordem: 1,
            RolesJson: '["ADMINISTRADOR"]',
            HealthEndpoint: '/api/banco-notas/health',
          },
        },
      ],
      ['platform.modules.read', 'platform.overview.read'],
    );
    const serialized = JSON.stringify(module);

    expect(module).toMatchObject({
      key: 'banco-notas',
      integrationState: 'registry-only',
      contractVersion: null,
      requiredCapabilities: [],
      available: false,
    });
    expect(serialized).not.toContain('RolesJson');
    expect(serialized).not.toContain('ADMINISTRADOR');
  });

  it('fails closed when registry metadata diverges from the versioned contract', () => {
    const [module] = resolveRegisteredModules(
      [
        {
          ...platformBaseRegistryItem,
          fields: { ...platformBaseRegistryItem.fields, Versao: '2.0.0' },
        },
      ],
      ['platform.overview.read'],
    );

    expect(module.integrationState).toBe('contract-mismatch');
    expect(module.integrationIssues).toEqual(['version']);
    expect(module.available).toBe(false);
  });

  it.each([
    ['desabilitado', 'disabled'],
    ['depreciado', 'deprecated'],
    ['VALIDACAO', 'invalid-registry'],
  ] as const)('normalizes registry state %s to %s', (status, expected) => {
    const [module] = resolveRegisteredModules(
      [
        {
          ...platformBaseRegistryItem,
          fields: { ...platformBaseRegistryItem.fields, Status: status },
        },
      ],
      ['platform.overview.read'],
    );

    expect(module.integrationState).toBe(expected);
    expect(module.available).toBe(false);
  });

  it('sorts registry items deterministically by order and then name', () => {
    const modules = resolveRegisteredModules(
      [
        { id: 'b', fields: { Chave: 'b', Nome: 'Beta', Status: 'instalado', Ordem: 2 } },
        { id: 'a', fields: { Chave: 'a', Nome: 'Alfa', Status: 'instalado', Ordem: 2 } },
        { id: 'z', fields: { Chave: 'z', Nome: 'Zero', Status: 'instalado', Ordem: 1 } },
      ],
      [],
    );

    expect(modules.map((module) => module.name)).toEqual(['Zero', 'Alfa', 'Beta']);
  });
});
