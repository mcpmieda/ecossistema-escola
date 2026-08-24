import { describe, expect, it } from 'vitest';
import { automationContract } from '../server/automations/contracts';
import { featureFlag } from '../server/modules/feature-flags';
import {
  integratedModuleContracts,
  moduleContract,
  moduleContractForKey,
  platformBaseModule,
} from '../server/modules/contracts';

const automation = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Teste',
  version: '1.0.0',
  allowlistVersion: '1',
  enabled: false,
  dryRun: true,
  trigger: { type: 'manual' },
  conditions: [],
  actions: [{ type: 'audit.write', event: 'test' }],
  idempotencyKey: 'test-key-123',
};

describe('extension contracts', () => {
  it('validates the versioned plataforma-base integration contract', () => {
    const parsed = moduleContract.parse(platformBaseModule);
    expect(parsed).toMatchObject({
      contractVersion: 1,
      key: 'plataforma-base',
      requiredCapabilities: ['platform.overview.read'],
    });
  });

  it('keeps integrated module keys unique and addressable', () => {
    expect(new Set(integratedModuleContracts.map((contract) => contract.key)).size).toBe(
      integratedModuleContracts.length,
    );
    expect(moduleContractForKey('plataforma-base')).toEqual(platformBaseModule);
    expect(moduleContractForKey('nao-registrado')).toBeUndefined();
  });

  it.each(['relative', '//evil.test/path', '/\\evil.test'])('rejects unsafe module routes: %s', (route) => {
    expect(() => moduleContract.parse({ ...platformBaseModule, baseRoute: route })).toThrow();
  });

  it('rejects duplicated required capabilities', () => {
    expect(() =>
      moduleContract.parse({
        ...platformBaseModule,
        requiredCapabilities: ['platform.overview.read', 'platform.overview.read'],
      }),
    ).toThrow();
  });

  it('rejects health endpoints outside the same-origin API namespace', () => {
    expect(() =>
      moduleContract.parse({ ...platformBaseModule, healthEndpoint: '/health' }),
    ).toThrow();
  });

  it('resolves an active feature flag', () =>
    expect(featureFlag([{ key: 'feature.base.demo', active: true }], 'base', 'demo')).toBe(true));
  it('uses the safe feature-flag fallback', () =>
    expect(featureFlag([{ key: 'invalid', active: true }], 'base', 'demo')).toBe(false));
  it('accepts a dry-run allowlisted automation', () =>
    expect(automationContract.parse(automation).dryRun).toBe(true));
  it('rejects an action outside the allowlist', () =>
    expect(() =>
      automationContract.parse({ ...automation, actions: [{ type: 'shell.exec', command: 'x' }] }),
    ).toThrow());
  it('rejects arbitrary recipients', () =>
    expect(() =>
      automationContract.parse({
        ...automation,
        actions: [
          { type: 'email.notify', template: 'credential-expiry', recipientGroup: 'internet' },
        ],
      }),
    ).toThrow());
  it('defaults new automations to disabled and dry-run', () => {
    const parsed = automationContract.parse({
      ...automation,
      enabled: undefined,
      dryRun: undefined,
    });
    expect(parsed.enabled).toBe(false);
    expect(parsed.dryRun).toBe(true);
  });
});
