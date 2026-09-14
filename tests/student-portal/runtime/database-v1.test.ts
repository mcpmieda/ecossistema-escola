import { describe, expect, it, vi } from 'vitest';
import {
  withPortalSqlV1,
  type PortalSqlClientFactoryV1,
} from '../../../server/student-portal/runtime/database-v1';
import type { StudentPortalPostgresSqlV1 } from '../../../server/student-portal/persistence/postgres-persistence-v1';

type TestClientV1 = ReturnType<typeof testClientV1>;

function testClientV1(identity: () => Promise<unknown>) {
  return {
    unsafe: vi.fn(identity),
    begin: vi.fn(),
    end: vi.fn(async () => undefined),
  } as unknown as StudentPortalPostgresSqlV1 & {
    unsafe: ReturnType<typeof vi.fn>;
    begin: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
}

function factoryV1(
  ...clients: TestClientV1[]
): PortalSqlClientFactoryV1 & ReturnType<typeof vi.fn> {
  return vi.fn(() => {
    const client = clients.shift();
    if (!client) throw new Error('no-client');
    return client;
  }) as unknown as PortalSqlClientFactoryV1 & ReturnType<typeof vi.fn>;
}

describe('withPortalSqlV1', () => {
  it('opens a fresh client after a transient establishment failure and runs the operation once', async () => {
    const first = testClientV1(async () => {
      throw new Error('pool-busy');
    });
    const second = testClientV1(async () => [{ role: 'student_portal_app' }]);
    const createClient = factoryV1(first, second);
    const operation = vi.fn(async () => 'ok');

    await expect(
      withPortalSqlV1({ connectionString: 'postgres://redacted' }, operation, createClient),
    ).resolves.toBe('ok');

    expect(createClient).toHaveBeenCalledTimes(2);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(first.end).toHaveBeenCalledTimes(1);
    expect(second.end).toHaveBeenCalledTimes(1);
  });

  it('does not retry a failure from the caller operation', async () => {
    const client = testClientV1(async () => [{ role: 'student_portal_app' }]);
    const createClient = factoryV1(client);
    const operation = vi.fn(async () => {
      throw new Error('write-failed');
    });

    await expect(
      withPortalSqlV1({ connectionString: 'postgres://redacted' }, operation, createClient),
    ).rejects.toThrow('student-portal-database-unavailable');

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it('stops after one bounded connection recovery', async () => {
    const first = testClientV1(async () => {
      throw new Error('pool-busy');
    });
    const second = testClientV1(async () => {
      throw new Error('origin-busy');
    });
    const createClient = factoryV1(first, second);
    const operation = vi.fn(async () => 'should-not-run');

    await expect(
      withPortalSqlV1({ connectionString: 'postgres://redacted' }, operation, createClient),
    ).rejects.toThrow('student-portal-database-unavailable');

    expect(createClient).toHaveBeenCalledTimes(2);
    expect(operation).not.toHaveBeenCalled();
    expect(first.end).toHaveBeenCalledTimes(1);
    expect(second.end).toHaveBeenCalledTimes(1);
  });

  it('fails closed on a wrong role without retrying or running the operation', async () => {
    const client = testClientV1(async () => [{ role: 'postgres' }]);
    const createClient = factoryV1(client);
    const operation = vi.fn(async () => 'should-not-run');

    await expect(
      withPortalSqlV1({ connectionString: 'postgres://redacted' }, operation, createClient),
    ).rejects.toThrow('student-portal-database-unavailable');

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(operation).not.toHaveBeenCalled();
    expect(client.end).toHaveBeenCalledTimes(1);
  });
});
