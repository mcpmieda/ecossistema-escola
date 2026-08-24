import { describe, expect, it } from 'vitest';
import { automationContract } from '../server/automations/contracts';
import { featureFlag } from '../server/modules/feature-flags';
import { moduleContract, platformBaseModule } from '../server/modules/contracts';

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
  it('validates plataforma-base', () =>
    expect(moduleContract.parse(platformBaseModule).key).toBe('plataforma-base'));
  it('rejects an invalid module route', () =>
    expect(() => moduleContract.parse({ ...platformBaseModule, baseRoute: 'relative' })).toThrow());
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
