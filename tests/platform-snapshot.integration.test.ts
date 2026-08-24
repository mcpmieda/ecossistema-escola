import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testEnv } from './fixtures';

const mocks = vi.hoisted(() => ({ graphRequest: vi.fn() }));

vi.mock('../server/graph/client', () => ({ graphRequest: mocks.graphRequest }));

import { getPlatformSnapshot } from '../server/platform/snapshot';

describe('platform snapshot composition', () => {
  beforeEach(() => mocks.graphRequest.mockReset());

  it('composes the validation read model without exposing protected values', async () => {
    mocks.graphRequest.mockImplementation(async ({ path }: { path: string }) => {
      if (path.includes('/lists?$select=id,displayName')) {
        return {
          data: {
            value: [
              { id: 'config-list', displayName: 'PLATAFORMA_CONFIGURACOES' },
              { id: 'modules-list', displayName: 'PLATAFORMA_MODULOS' },
              { id: 'audit-list', displayName: 'PLATAFORMA_AUDITORIA' },
              { id: 'migrations-list', displayName: 'PLATAFORMA_MIGRACOES' },
            ],
          },
          etag: null,
          correlationId: 'root-correlation',
        };
      }
      if (path.includes('/lists/modules-list/items')) {
        return {
          data: {
            value: [
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
          },
          etag: null,
          correlationId: 'modules-correlation',
        };
      }
      if (path.includes('/lists/config-list/items')) {
        return {
          data: {
            value: [
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
          },
          etag: null,
          correlationId: 'config-correlation',
        };
      }
      if (path.includes('/lists/audit-list/items')) {
        return {
          data: {
            value: [
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
          },
          etag: null,
          correlationId: 'audit-correlation',
        };
      }
      if (path.includes('/lists/migrations-list/items')) {
        return {
          data: { value: [] },
          etag: null,
          correlationId: 'migration-correlation',
        };
      }
      throw new Error(`Unexpected Graph path: ${path}`);
    });

    const snapshot = await getPlatformSnapshot(testEnv);
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
