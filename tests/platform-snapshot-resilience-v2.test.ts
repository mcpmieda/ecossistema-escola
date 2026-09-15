import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLATFORM_CAPABILITIES } from '../shared/platform-contract';
import { platformSnapshotSchemaV2, platformRouteUnavailableV2, platformRouteNeedsMicrosoftV2, PLATFORM_SOURCE_SECTIONS_V2 } from '../shared/platform-snapshot-v2';
import { buildPlatformSnapshot, EXPECTED_PLATFORM_LISTS, getPlatformSnapshotV2, type PlatformSnapshotDependenciesV2 } from '../server/platform/snapshot';
import { GraphError } from '../server/graph/client';
import { onRequest as bootstrap } from '../functions/api/platform/bootstrap';
import { onRequest as auxiliary } from '../functions/api/platform/snapshot-v2';
import { SESSION_COOKIE } from '../server/auth/session';
import { seal } from '../server/auth/sealed';
import { testEnv } from './fixtures';

const lists = EXPECTED_PLATFORM_LISTS.map((displayName, index) => ({ id: String(index), displayName }));
function dependencies(fail?: string) {
  const token = vi.fn(async () => 'synthetic-private-token');
  const pages = vi.fn<PlatformSnapshotDependenciesV2['pages']>(async (_env, path, supplied) => {
    expect(supplied).toBe('synthetic-private-token');
    if (path.includes('?$select=id,displayName')) return lists;
    const item = lists.find((list) => path.includes(`/lists/${list.id}/items`));
    if (item?.displayName === fail) throw new GraphError(429, 'synthetic', 90);
    if (item?.displayName === 'PLATAFORMA_CONFIGURACOES')
      return [{ id: 'config', fields: { Chave: 'SYNTHETIC CONFIG', Ativo: true, Versao: '1' } }];
    return [];
  });
  return { token, pages };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('section-aware Microsoft snapshot', () => {
  it('does not let an audit failure discard healthy settings, modules or native application access', async () => {
    const source = dependencies('PLATAFORMA_AUDITORIA');
    const snapshot = await getPlatformSnapshotV2(testEnv, PLATFORM_CAPABILITIES, source);
    expect(snapshot.unavailableSections).toEqual(['audit']);
    expect(snapshot.retryAfterSeconds).toBe(90);
    expect(snapshot.configurations[0]).toMatchObject({ key: 'SYNTHETIC CONFIG', active: true });
    expect(platformSnapshotSchemaV2.safeParse(snapshot).success).toBe(true);
    expect(platformRouteUnavailableV2('auditoria', snapshot)).toBe(true);
    expect(platformRouteUnavailableV2('configuracoes', snapshot)).toBe(false);
    expect(platformRouteUnavailableV2('sistemas', snapshot)).toBe(false);
    expect(platformRouteUnavailableV2('banco-de-notas', snapshot)).toBe(false);
    expect(platformRouteUnavailableV2('painel-do-aluno', snapshot)).toBe(false);
    expect(source.token).toHaveBeenCalledOnce();
    expect(source.pages).toHaveBeenCalledTimes(5);
  });
  it('identifies a root outage explicitly and does not include raw provider errors or credentials', async () => {
    const source = dependencies();
    source.token.mockRejectedValue(new Error('synthetic-sensitive-provider-error'));
    const snapshot = await getPlatformSnapshotV2(testEnv, PLATFORM_CAPABILITIES, source);
    expect(snapshot.unavailableSections).toEqual([...PLATFORM_SOURCE_SECTIONS_V2]);
    expect(snapshot.retryAfterSeconds).toBe(30);
    expect(platformRouteUnavailableV2('sistemas', snapshot)).toBe(true);
    expect(snapshot.coreModules.length).toBeGreaterThan(0);
    expect(JSON.stringify(snapshot)).not.toContain('synthetic-sensitive');
    expect(source.pages).not.toHaveBeenCalled();
  });
  it('does not request sources without the current capability and never calls Microsoft before authorization', async () => {
    const source = dependencies();
    await expect(getPlatformSnapshotV2(testEnv, [], source)).rejects.toThrow();
    expect(source.token).not.toHaveBeenCalled();
    const snapshot = await getPlatformSnapshotV2(testEnv, ['platform.snapshot.read'], source);
    expect(source.token).toHaveBeenCalledOnce(); expect(source.pages).toHaveBeenCalledOnce();
    expect(snapshot.configurations).toEqual([]); expect(snapshot.recentAudit).toEqual([]);
  });
  it('distinguishes missing lists from an unreadable list catalogue', async () => {
    const source = dependencies();
    source.pages.mockResolvedValue([]);
    const snapshot = await getPlatformSnapshotV2(testEnv, PLATFORM_CAPABILITIES, source);
    expect(snapshot.unavailableSections).toEqual([]);
    expect(snapshot.foundation).toMatchObject({ status: 'degraded', missingPlatformLists: EXPECTED_PLATFORM_LISTS });
  });
  it('rejects malformed nested data before rendering and keeps static planned pages independent', () => {
    const snapshot = buildPlatformSnapshot({ lists: [], moduleItems: [], configurationItems: [], auditItems: [], migrationItems: [], correlationId: 'synthetic' }, PLATFORM_CAPABILITIES);
    expect(platformSnapshotSchemaV2.safeParse({ ...snapshot, configurations: [{}] }).success).toBe(false);
    expect(platformSnapshotSchemaV2.safeParse({ ...snapshot, unavailableSections: ['untrusted'] }).success).toBe(false);
    expect(platformRouteNeedsMicrosoftV2('publicacoes')).toBe(false);
    expect(platformRouteNeedsMicrosoftV2('paginas')).toBe(false);
    expect(platformRouteNeedsMicrosoftV2('auditoria')).toBe(true);
  });
});

async function request(path: string, roles?: string[], origin = testEnv.OFFICIAL_ORIGIN) {
  const headers = new Headers();
  if (roles) headers.set('Cookie', `${SESSION_COOKIE}=${await seal({
    oid: '11111111-1111-4111-8111-111111111111', name: 'SYNTHETIC USER', username: 'synthetic@example.invalid',
    roles, exp: Math.floor(Date.now() / 1000) + 600,
  }, testEnv.SESSION_SECRET)}`);
  return new Request(`${origin}${path}`, { headers });
}
describe('native bootstrap HTTP boundaries', () => {
  it('opens only the authorized native catalogue with zero Microsoft or database requests', async () => {
    const network = vi.fn(async () => { throw new Error('External access is not allowed in bootstrap'); });
    vi.stubGlobal('fetch', network);
    const response = await bootstrap({ env: testEnv, request: await request('/api/platform/bootstrap', ['ADMINISTRADOR']) } as never);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    const body = await response.json();
    expect(body.auxiliaryState).toBe('not-loaded');
    expect(body.coreModules.length).toBeGreaterThan(0);
    expect(platformSnapshotSchemaV2.safeParse(body).success).toBe(true);
    expect(network).not.toHaveBeenCalled();
  });
  it.each([bootstrap, auxiliary])('rejects anonymous, wrong-role and cross-origin requests before external reads', async (handler) => {
    const network = vi.fn(); vi.stubGlobal('fetch', network);
    expect((await handler({ env: testEnv, request: await request('/api/platform/bootstrap') } as never)).status).toBe(401);
    expect((await handler({ env: testEnv, request: await request('/api/platform/bootstrap', ['PROFESSOR']) } as never)).status).toBe(403);
    expect((await handler({ env: testEnv, request: await request('/api/platform/bootstrap', ['ADMINISTRADOR'], 'https://untrusted.invalid') } as never)).status).toBe(403);
    expect(network).not.toHaveBeenCalled();
  });
});
