import { describe, expect, it } from 'vitest';
import type { PlatformSnapshotContract } from '../shared/platform-contract';
import { buildSearchItems, filterSearchItems, normalizeSearch } from '../src/platform/search-model';

const snapshot = {
  version: '0.8.0-validation',
  releaseState: 'validation',
  generatedAt: '2026-08-24T19:00:00.000Z',
  correlationId: 'corr-search-test',
  foundation: {
    status: 'ok',
    sharePointListCount: 12,
    expectedPlatformListsPresent: true,
    missingPlatformLists: [],
  },
  operational: {
    status: 'nominal',
    recentAuditFailureCount: 0,
    healthContractsConfigured: 0,
    healthContractsMissing: 1,
    lastAuditAt: '2026-08-24T18:44:00.000Z',
    recoveryStatus: 'not-verified',
    recoveryVerifiedAt: '',
    recoveryEvidenceRef: '',
    recoveryScope: 'sharepoint-disposable-record-backup-restore-roundtrip',
  },
  coreModules: [
    {
      id: 'platform.settings',
      name: 'Configurações',
      description: 'Governança dos parâmetros da plataforma.',
      route: 'configuracoes',
      state: 'validation',
      requiredRole: 'ADMINISTRADOR',
      capabilities: ['platform.settings.read'],
    },
    {
      id: 'platform.audit',
      name: 'Auditoria',
      description: 'Rastreabilidade das operações administrativas.',
      route: 'auditoria',
      state: 'validation',
      requiredRole: 'ADMINISTRADOR',
      capabilities: ['platform.audit.read'],
    },
  ],
  registeredModules: [
    {
      id: 'module-1',
      key: 'banco-notas',
      name: 'Banco de Notas',
      baseRoute: '/banco-notas',
      version: '1.0.0',
      status: 'installed',
      order: 1,
      healthEndpoint: '/api/banco-notas/health',
      updatedAt: '2026-08-24T18:00:00.000Z',
      contractVersion: null,
      requiredCapabilities: [],
      integrationState: 'registry-only',
      integrationIssues: [],
      available: false,
    },
  ],
  configurations: [
    {
      id: 'config-1',
      key: 'PLATAFORMA.NAVEGACAO',
      scope: 'GLOBAL',
      version: '3',
      active: true,
      effectiveFrom: '',
      effectiveUntil: '',
      updatedAt: '2026-08-24T18:00:00.000Z',
    },
  ],
  recentAudit: [
    {
      id: 'audit-1',
      eventId: 'evt-1',
      occurredAt: '2026-08-24T18:44:00.000Z',
      module: 'Centro',
      action: 'SEGREDO_NAO_INDEXAR',
      entityType: 'SESSION',
      correlationId: 'corr-audit',
      result: 'OK',
    },
  ],
  migrations: [
    {
      id: 'migration-1',
      version: '0.2.0',
      module: 'SEGREDO_MIGRACAO_NAO_INDEXAR',
      appliedAt: '2026-08-24T17:00:00.000Z',
      result: 'OK',
    },
  ],
} satisfies PlatformSnapshotContract;

describe('platform search model', () => {
  it('normalizes accents and case for Portuguese search', () => {
    expect(normalizeSearch('Configurações')).toBe('configuracoes');
    expect(normalizeSearch('AUDITORIA')).toBe('auditoria');
  });

  it('indexes only core areas, registered systems and configuration metadata', () => {
    const items = buildSearchItems(snapshot);

    expect(items.map((item) => item.id)).toEqual([
      'core:platform.settings',
      'core:platform.audit',
      'system:module-1',
      'config:config-1',
    ]);
    expect(filterSearchItems(items, 'SEGREDO_NAO_INDEXAR')).toEqual([]);
    expect(filterSearchItems(items, 'SEGREDO_MIGRACAO_NAO_INDEXAR')).toEqual([]);
  });

  it('finds accent-insensitive matches and routes systems to the systems area', () => {
    const items = buildSearchItems(snapshot);

    expect(filterSearchItems(items, 'configuracoes')[0]?.href).toBe('#/configuracoes');
    const system = filterSearchItems(items, 'banco notas registry only')[0];
    expect(system?.label).toBe('Banco de Notas');
    expect(system?.href).toBe('#/sistemas');
  });

  it('enforces the result limit', () => {
    const items = buildSearchItems(snapshot);
    expect(filterSearchItems(items, '', 2)).toHaveLength(2);
    expect(filterSearchItems(items, '', 0)).toHaveLength(0);
  });
});
