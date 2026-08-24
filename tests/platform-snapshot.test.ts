import { describe, expect, it } from 'vitest';
import { PLATFORM_CAPABILITIES } from '../shared/platform-contract';
import { buildPlatformSnapshot, isFailureResult } from '../server/platform/snapshot';

const fullAccess = PLATFORM_CAPABILITIES;

describe('platform snapshot parsing', () => {
  it('classifies explicit failure results without treating benign text as a failure', () => {
    expect(isFailureResult('ERRO')).toBe(true);
    expect(isFailureResult('Falha: Graph indisponível')).toBe(true);
    expect(isFailureResult('failed_request')).toBe(true);
    expect(isFailureResult('sucesso')).toBe(false);
    expect(isFailureResult('sem erro')).toBe(false);
  });

  it('builds the validation read model without exposing protected or legacy authorization values', () => {
    const snapshot = buildPlatformSnapshot(
      {
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
              Chave: 'plataforma-base',
              Nome: 'Plataforma Base',
              RotaBase: '/',
              Versao: '1.0.0',
              Status: 'instalado',
              Ordem: 0,
              RolesJson: '["LEGACY_ROLE_MUST_NOT_LEAK"]',
              HealthEndpoint: '/api/health',
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
      },
      fullAccess,
    );
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.version).toBe('0.7.0-validation');
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
      key: 'plataforma-base',
      name: 'Plataforma Base',
      status: 'installed',
      contractVersion: 1,
      requiredCapabilities: ['platform.overview.read'],
      integrationState: 'ready',
      integrationIssues: [],
      available: true,
    });
    expect(snapshot.configurations[0]).toMatchObject({
      key: 'centro.validation',
      scope: 'global',
      active: true,
    });
    expect(snapshot.recentAudit[0]).toMatchObject({ eventId: 'evt-1', action: 'consulta' });
    expect(serialized).not.toContain('LEGACY_ROLE_MUST_NOT_LEAK');
    expect(serialized).not.toContain('RolesJson');
    expect(serialized).not.toContain('must-not-leak');
    expect(serialized).not.toContain('user-object-id-must-not-leak');
    expect(serialized).not.toContain('ValorJson');
    expect(serialized).not.toContain('DetalhesJson');
    expect(serialized).not.toContain('UsuarioObjectId');
  });

  it('reports degradation instead of returning a false healthy status', () => {
    const snapshot = buildPlatformSnapshot(
      {
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
      },
      fullAccess,
    );

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

  it('removes module-specific data when the corresponding capabilities are absent', () => {
    const snapshot = buildPlatformSnapshot(
      {
        lists: [
          { id: 'config-list', displayName: 'PLATAFORMA_CONFIGURACOES' },
          { id: 'modules-list', displayName: 'PLATAFORMA_MODULOS' },
          { id: 'audit-list', displayName: 'PLATAFORMA_AUDITORIA' },
          { id: 'migrations-list', displayName: 'PLATAFORMA_MIGRACOES' },
        ],
        moduleItems: [{ id: 'module-secret', fields: { Nome: 'Sistema restrito' } }],
        configurationItems: [{ id: 'config-secret', fields: { Chave: 'config.restrita' } }],
        auditItems: [{ id: 'audit-secret', fields: { Acao: 'auditoria-restrita' } }],
        migrationItems: [{ id: 'migration-secret', fields: { Modulo: 'migracao-restrita' } }],
        correlationId: 'snapshot-limited',
        generatedAt: '2026-08-24T20:00:00Z',
      },
      ['platform.snapshot.read', 'platform.overview.read'],
    );
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.coreModules.map((module) => module.route)).toEqual(['visao-geral']);
    expect(snapshot.operational).toBeNull();
    expect(snapshot.registeredModules).toEqual([]);
    expect(snapshot.configurations).toEqual([]);
    expect(snapshot.recentAudit).toEqual([]);
    expect(snapshot.migrations).toEqual([]);
    expect(serialized).not.toContain('Sistema restrito');
    expect(serialized).not.toContain('config.restrita');
    expect(serialized).not.toContain('auditoria-restrita');
    expect(serialized).not.toContain('migracao-restrita');
  });
});
