import { describe, expect, it } from 'vitest';
import { buildPlatformSnapshot, parseRolesJson } from '../server/platform/snapshot';

describe('platform snapshot parsing', () => {
  it('accepts a valid role allowlist', () => {
    expect(parseRolesJson('["ADMINISTRADOR","PROFESSOR"]')).toEqual(['ADMINISTRADOR', 'PROFESSOR']);
  });

  it('fails closed for malformed or unexpected role data', () => {
    expect(parseRolesJson('{')).toEqual([]);
    expect(parseRolesJson('{"role":"ADMINISTRADOR"}')).toEqual([]);
    expect(parseRolesJson(undefined)).toEqual([]);
  });

  it('builds the validation read model without exposing protected values', () => {
    const snapshot = buildPlatformSnapshot({
      lists: [
        { id: 'config-list', displayName: 'PLATAFORMA_CONFIGURACOES' },
        { id: 'modules-list', displayName: 'PLATAFORMA_MODULOS' },
        { id: 'audit-list', displayName: 'PLATAFORMA_AUDITORIA' },
        { id: 'migrations-list', displayName: 'PLATAFORMA_MIGRACOES' },
      ],
      moduleItems: [
        {
          id: 'module-1',
          fields: {
            Chave: 'notas',
            Nome: 'Banco de Notas',
            RotaBase: '/notas',
            Versao: '1.0',
            Status: 'instalado',
            Ordem: 2,
            RolesJson: '["ADMINISTRADOR"]',
            HealthEndpoint: '/health',
          },
        },
      ],
      configurationItems: [
        {
          id: 'config-1',
          fields: {
            Chave: 'centro.validation',
            Escopo: 'global',
            Versao: '1',
            Ativo: true,
            ValorJson: '{"secretLikeValue":"must-not-leak"}',
            AtualizadoPorObjectId: 'user-object-id-must-not-leak',
          },
        },
      ],
      auditItems: [
        {
          id: 'audit-1',
          fields: {
            EventoId: 'evt-1',
            DataHoraUTC: '2026-08-24T17:00:00Z',
            Modulo: 'plataforma',
            Acao: 'consulta',
            EntidadeTipo: 'Modulo',
            CorrelationId: 'corr-1',
            Resultado: 'sucesso',
            UsuarioObjectId: 'user-object-id-must-not-leak',
            DetalhesJson: '{"internal":"must-not-leak"}',
          },
        },
      ],
      migrationItems: [],
      correlationId: 'snapshot-correlation',
      generatedAt: '2026-08-24T18:00:00Z',
    });
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.releaseState).toBe('validation');
    expect(snapshot.foundation).toEqual({
      status: 'ok',
      sharePointListCount: 4,
      expectedPlatformListsPresent: true,
    });
    expect(snapshot.registeredModules[0]).toMatchObject({
      key: 'notas',
      name: 'Banco de Notas',
      roles: ['ADMINISTRADOR'],
    });
    expect(snapshot.configurations[0]).toMatchObject({
      key: 'centro.validation',
      scope: 'global',
      active: true,
    });
    expect(snapshot.recentAudit[0]).toMatchObject({ eventId: 'evt-1', action: 'consulta' });
    expect(serialized).not.toContain('must-not-leak');
    expect(serialized).not.toContain('user-object-id-must-not-leak');
    expect(serialized).not.toContain('ValorJson');
    expect(serialized).not.toContain('DetalhesJson');
    expect(serialized).not.toContain('UsuarioObjectId');
  });
});
