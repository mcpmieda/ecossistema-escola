import { describe, expect, it } from 'vitest';
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_ROUTES,
  normalizePlatformRoute,
} from '../shared/platform-contract';
import { capabilityGrantsByRole } from '../server/auth/capabilities';
import { coreModuleSchema, coreModules } from '../server/platform/manifest';
import { withNotesModule } from '../src/platform/notes-module';

const navigableModules = withNotesModule(coreModules);

describe('Centro de Administração module contract', () => {
  it('declares one stable navigable module per platform route', () => {
    expect(navigableModules).toHaveLength(PLATFORM_ROUTES.length);
    expect(new Set(navigableModules.map((module) => module.id)).size).toBe(
      navigableModules.length,
    );
    expect(new Set(navigableModules.map((module) => module.route))).toEqual(
      new Set(PLATFORM_ROUTES),
    );
  });

  it('keeps the production platform restricted to administrators', () => {
    expect(navigableModules.every((module) => module.requiredRole === 'ADMINISTRADOR')).toBe(true);
  });

  it('requires explicit capabilities in every server module manifest', () => {
    expect(coreModules.every((module) => module.capabilities.length > 0)).toBe(true);
    for (const module of coreModules) expect(coreModuleSchema.parse(module)).toEqual(module);
  });

  it('reserves gradebook persistence administration for administrators', () => {
    expect(PLATFORM_CAPABILITIES).toContain('gradebook.persistence.admin');
    expect(capabilityGrantsByRole.ADMINISTRADOR).toContain('gradebook.persistence.admin');
    for (const role of ['PROFESSOR', 'ALUNO', 'APOIO', 'VISITANTE'] as const) {
      expect(capabilityGrantsByRole[role]).not.toContain('gradebook.persistence.admin');
    }
  });

  it('keeps future content domains planned and the released administrative core ready', () => {
    const states = new Map(navigableModules.map((module) => [module.route, module.state]));
    expect(states.get('publicacoes')).toBe('planned');
    expect(states.get('paginas')).toBe('planned');
    expect(states.get('visao-geral')).toBe('ready');
    expect(states.get('operacao')).toBe('ready');
    expect(states.get('sistemas')).toBe('ready');
    expect(states.get('auditoria')).toBe('ready');
    expect(states.get('configuracoes')).toBe('ready');
    expect(states.get('banco-de-notas')).toBe('ready');
  });

  it('gives the operational area an explicit read capability', () => {
    const operation = coreModules.find((module) => module.route === 'operacao');
    expect(operation?.capabilities).toContain('platform.health.read');
  });

  it('restores known routes and falls back safely', () => {
    expect(normalizePlatformRoute('operacao')).toBe('operacao');
    expect(normalizePlatformRoute('auditoria')).toBe('auditoria');
    expect(normalizePlatformRoute('banco-de-notas')).toBe('banco-de-notas');
    expect(normalizePlatformRoute('rota-inexistente')).toBe('visao-geral');
  });
});
