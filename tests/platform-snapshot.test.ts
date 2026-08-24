import { describe, expect, it } from 'vitest';
import {
  buildPlatformSnapshot,
  isFailureResult,
  parseRolesJson,
} from '../server/platform/snapshot';

describe('platform snapshot parsing', () => {
  it('accepts a valid role allowlist', () => {
    expect(parseRolesJson('["ADMINISTRADOR","PROFESSOR"]')).toEqual(['ADMINISTRADOR', 'PROFESSOR']);
  });

  it('fails closed for malformed or unexpected role data', () => {
    expect(parseRolesJson('{')).toEqual([]);
    expect(parseRolesJson('{"role":"ADMINISTRADOR"}')).toEqual([]);
    expect(parseRolesJson(undefined)).toEqual([]);
  });

  it('classifies explicit failure results without treating benign text as a failure', () => {
    expect(isFailureResult('ERRO')).toBe(true);
    expect(isFailureResult('Falha: Graph indisponível')).toBe(true);
    expect(isFailureResult('failed_request')).toBe(true);
    expect(isFailureResult('sucesso')).toBe(false);
    expect(isFailureResult('sem erro')).toBe(false);
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

    expect(snapshot.version).toBe('0.5.0-validation');
    expect(snapshot.releaseState).toBe('validation');
    expect(snapshot.foundation).toEqual({
      status: 'ok',
      sharePointListCount: 4,
      expectedPlatformListsPresent: true,
      missingPlatformLists: [],
    });
    expect(snapshot.operational).toEqual({
      status: 'nominal',
      recentAuditFailureCount: 0,
      healthContractsConfigured: 1,
      healthContractsMissing: 0,
      lastAuditAt: '2026-08-24T17:00:00Z',
      recoveryStatus: 'not-verified',
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

  it('reports degradation instead of returning a false healthy status', () => {
    const snapshot = buildPlatformSnapshot({
      lists: [
        { id: 'config-list', displayName: 'PLATAFORMA_CONFIGURACOES' },
        { id: 'modules-list', displayName: 'PLATAFORMA_MODULOS' },
        { id: 'audit-list', displayName: 'PLATAFORMA_AUDITORIA' },
      ],
      moduleItems: [
        {
          id: 'module-1',
          fields: {
            Chave: 'notas',
            Nome: 'Banco de Notas',
            Status: 'VALIDACAO',
          },
        },
      ],
      configurationItems: [],
      auditItems: [
        {
          id: 'audit-error',
          fields: {
            EventoId: 'evt-error',
            DataHoraUTC: '2026-08-24T19:00:00Z',
            Modulo: 'plataforma',
            Acao: 'leitura',
            Resultado: 'ERRO: dependência indisponível',
          },
        },
      ],
      migrationItems: [],
      correlationId: 'snapshot-degraded',
      generatedAt: '2026-08-24T19:05:00Z',
    });

    expect(snapshot.foundation.status).toBe('degraded');
    expect(snapshot.foundation.expectedPlatformListsPresent).toBe(false);
    expect(snapshot.foundation.missingPlatformLists).toEqual(['PLATAFORMA_MIGRACOES']);
    expect(snapshot.operational).toMatchObject({
      status: 'attention',
      recentAuditFailureCount: 1,
      healthContractsConfigured: 0,
      healthContractsMissing: 1,
      recoveryStatus: 'not-verified',
    });
  });
});
