import { describe, expect, it } from 'vitest';
import { PLATFORM_ROUTES, normalizePlatformRoute } from '../shared/platform-contract';
import { coreModuleSchema, coreModules } from '../server/platform/manifest';

describe('Centro de Administração module contract', () => {
  it('declares one stable module per platform route', () => {
    expect(coreModules).toHaveLength(PLATFORM_ROUTES.length);
    expect(new Set(coreModules.map((module) => module.id)).size).toBe(coreModules.length);
    expect(new Set(coreModules.map((module) => module.route))).toEqual(new Set(PLATFORM_ROUTES));
  });

  it('keeps the production platform restricted to administrators', () => {
    expect(coreModules.every((module) => module.requiredRole === 'ADMINISTRADOR')).toBe(true);
  });

  it('requires explicit capabilities in every module manifest', () => {
    expect(coreModules.every((module) => module.capabilities.length > 0)).toBe(true);
    for (const module of coreModules) expect(coreModuleSchema.parse(module)).toEqual(module);
  });

  it('keeps future content domains planned and the released administrative core ready', () => {
    const states = new Map(coreModules.map((module) => [module.route, module.state]));
    expect(states.get('publicacoes')).toBe('planned');
    expect(states.get('paginas')).toBe('planned');
    expect(states.get('visao-geral')).toBe('ready');
    expect(states.get('operacao')).toBe('ready');
    expect(states.get('sistemas')).toBe('ready');
    expect(states.get('auditoria')).toBe('ready');
    expect(states.get('configuracoes')).toBe('ready');
  });

  it('gives the operational area an explicit read capability', () => {
    const operation = coreModules.find((module) => module.route === 'operacao');
    expect(operation?.capabilities).toContain('platform.health.read');
  });

  it('restores known routes and falls back safely', () => {
    expect(normalizePlatformRoute('operacao')).toBe('operacao');
    expect(normalizePlatformRoute('auditoria')).toBe('auditoria');
    expect(normalizePlatformRoute('rota-inexistente')).toBe('visao-geral');
  });
});
