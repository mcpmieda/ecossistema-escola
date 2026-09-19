import { describe, expect, it, vi } from 'vitest';
import {
  addRotationCertificate,
  finalizeRotation,
  MaintenanceRotationError,
  removeExactCertificate,
} from '../../scripts/entra/maintenance-rotate';

const TOKEN = 'synthetic-token';
const WEB_OBJECT_ID = '11111111-1111-4111-8111-111111111111';
const OLD_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OLD_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NEW_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function key(
  keyId: string,
  slot: 'A' | 'B',
  startDateTime: string,
  suffix: string,
) {
  return {
    keyId,
    type: 'AsymmetricX509Cert',
    usage: 'Verify',
    key: Buffer.from(`CERT-${suffix}`).toString('base64'),
    displayName: `automatic-web-slot-${slot}-${startDateTime}`,
    startDateTime,
    endDateTime: '2027-06-01T00:00:00.000Z',
    customKeyIdentifier: Buffer.from(`THUMB-${suffix}`).toString('base64'),
  };
}

function application(keys: unknown[]) {
  return {
    id: WEB_OBJECT_ID,
    appId: '78185e20-c824-4acc-9ccd-41b9f7509a6f',
    displayName: 'Ecossistema Escolar - Web',
    keyCredentials: keys,
    passwordCredentials: [],
  };
}

function statefulFetcher(initialKeys: ReturnType<typeof key>[]) {
  let keys = structuredClone(initialKeys);
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`);
    if (method === 'GET' && url.includes(`/applications/${WEB_OBJECT_ID}`)) {
      return Response.json(application(keys));
    }
    if (method === 'PATCH' && url.endsWith(`/applications/${WEB_OBJECT_ID}`)) {
      const body = JSON.parse(String(init?.body)) as { keyCredentials: ReturnType<typeof key>[] };
      keys = structuredClone(body.keyCredentials);
      return new Response(null, { status: 204 });
    }
    return new Response('unexpected', { status: 404 });
  });
  return { fetcher, keys: () => structuredClone(keys) };
}

describe('Maintenance certificate rotation', () => {
  it('adds only to the inactive slot while preserving both existing certificates', async () => {
    const state = statefulFetcher([
      key(OLD_A, 'A', '2026-08-24T16:00:05.533Z', 'old-a'),
      key(OLD_B, 'B', '2026-08-24T16:02:00.054Z', 'old-b'),
    ]);

    const result = await addRotationCertificate({
      accessToken: TOKEN,
      target: 'web',
      slot: 'A',
      objectId: WEB_OBJECT_ID,
      newKeyId: NEW_A,
      certificateDerBase64: Buffer.from('NEW-CERT').toString('base64'),
      displayName: 'automatic-web-slot-A-2026-09-19T13:00:00.000Z',
      startDateTime: '2026-09-19T13:00:00.000Z',
      endDateTime: '2027-03-18T13:00:00.000Z',
      fetcher: state.fetcher,
    });

    expect(result).toMatchObject({
      status: 'added',
      target: 'web',
      slot: 'A',
      previousActiveSlot: 'B',
      previousActiveKeyId: OLD_B,
      staleSameSlotKeyId: OLD_A,
      newKeyId: NEW_A,
    });
    expect(state.keys()).toHaveLength(3);
    expect(state.keys().map((value) => value.keyId).sort()).toEqual([OLD_A, OLD_B, NEW_A].sort());
  });

  it('fails closed if the requested slot is currently active', async () => {
    const state = statefulFetcher([
      key(OLD_A, 'A', '2026-08-24T16:00:05.533Z', 'old-a'),
      key(OLD_B, 'B', '2026-08-24T16:02:00.054Z', 'old-b'),
    ]);

    await expect(addRotationCertificate({
      accessToken: TOKEN,
      target: 'web',
      slot: 'B',
      objectId: WEB_OBJECT_ID,
      newKeyId: NEW_A,
      certificateDerBase64: Buffer.from('NEW-CERT').toString('base64'),
      displayName: 'automatic-web-slot-B-2026-09-19T13:00:00.000Z',
      startDateTime: '2026-09-19T13:00:00.000Z',
      endDateTime: '2027-03-18T13:00:00.000Z',
      fetcher: state.fetcher,
    })).rejects.toMatchObject({ stage: 'requested-slot-is-not-inactive' });
    expect(state.keys()).toHaveLength(2);
  });

  it('finalizes by removing only the older certificate from the rotated slot', async () => {
    const state = statefulFetcher([
      key(OLD_A, 'A', '2026-08-24T16:00:05.533Z', 'old-a'),
      key(OLD_B, 'B', '2026-08-24T16:02:00.054Z', 'old-b'),
      key(NEW_A, 'A', '2026-09-19T13:00:00.000Z', 'new-a'),
    ]);

    const result = await finalizeRotation({
      accessToken: TOKEN,
      target: 'web',
      slot: 'A',
      objectId: WEB_OBJECT_ID,
      fetcher: state.fetcher,
    });

    expect(result).toMatchObject({
      status: 'finalized',
      retainedNewKeyId: NEW_A,
      retainedRollbackSlot: 'B',
      retainedRollbackKeyId: OLD_B,
      removedStaleKeyId: OLD_A,
    });
    expect(state.keys().map((value) => value.keyId).sort()).toEqual([OLD_B, NEW_A].sort());
  });

  it('can remove the exact newly-added certificate during pre-secret rollback', async () => {
    const state = statefulFetcher([
      key(OLD_A, 'A', '2026-08-24T16:00:05.533Z', 'old-a'),
      key(OLD_B, 'B', '2026-08-24T16:02:00.054Z', 'old-b'),
      key(NEW_A, 'A', '2026-09-19T13:00:00.000Z', 'new-a'),
    ]);

    const result = await removeExactCertificate({
      accessToken: TOKEN,
      target: 'web',
      objectId: WEB_OBJECT_ID,
      keyId: NEW_A,
      fetcher: state.fetcher,
    });

    expect(result).toEqual({ status: 'removed', remainingCertificates: 2 });
    expect(state.keys().map((value) => value.keyId).sort()).toEqual([OLD_A, OLD_B].sort());
  });

  it('does not leak provider bodies through rotation errors', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response('provider-secret-MUST-NOT-LEAK', { status: 403 }),
    );
    try {
      await removeExactCertificate({
        accessToken: TOKEN,
        target: 'web',
        objectId: WEB_OBJECT_ID,
        keyId: NEW_A,
        fetcher,
      });
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(MaintenanceRotationError);
      expect(String(error)).not.toContain('MUST-NOT-LEAK');
      expect(String(error)).not.toContain(TOKEN);
    }
  });
});
