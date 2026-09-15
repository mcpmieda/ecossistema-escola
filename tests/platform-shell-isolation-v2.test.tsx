import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { PLATFORM_CAPABILITIES } from '../shared/platform-contract';
import { buildPlatformSnapshot } from '../server/platform/snapshot';

const { mounts } = vi.hoisted(() => ({ mounts: vi.fn() }));
// Render the actual Center/authentication/navigation, replacing only the child workspace.
vi.mock('../src/platform/pages', async () => {
  const React = await import('react');
  return {
    LoadingWorkspace: () => <p>Carregando área</p>,
    PageContent: function PageContent({ route }: { route: string }) {
      const [value, setValue] = React.useState('');
      React.useEffect(() => { mounts(route); }, [route]);
      return <input aria-label={`workspace-${route}`} value={value} onChange={(event) => setValue(event.target.value)} />;
    },
  };
});
const snapshot = () => buildPlatformSnapshot({ lists: [], moduleItems: [], configurationItems: [], auditItems: [], migrationItems: [], correlationId: 'synthetic' }, PLATFORM_CAPABILITIES);
beforeEach(() => {
  mounts.mockClear();
  window.history.replaceState(null, '', '/#/banco-de-notas');
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); };

it.each([503, 401])('handles external status %i without remounting work or substituting permissions', async (status) => {
  let resolve!: (response: Response) => void;
  const waiting = new Promise<Response>((done) => { resolve = done; });
  const fetcher = vi.fn<typeof fetch>(async (path) => {
    if (path === '/api/me') return Response.json({ authenticated: true, name: 'SYNTHETIC ADMIN', capabilities: PLATFORM_CAPABILITIES });
    if (path === '/api/platform/bootstrap') return Response.json(snapshot());
    if (path === '/api/platform/snapshot-v2') return waiting;
    throw new Error('Unexpected synthetic request');
  });
  vi.stubGlobal('fetch', fetcher);
  render(<App />);
  const input = await screen.findByRole('textbox', { name: 'workspace-banco-de-notas' });
  await userEvent.type(input, 'unsaved local work');
  expect(mounts).toHaveBeenCalledTimes(1);
  await act(async () => { resolve(Response.json({}, { status })); await flush(); });
  if (status === 503) {
    expect(screen.getByRole('textbox', { name: 'workspace-banco-de-notas' })).toBe(input);
    expect((input as HTMLInputElement).value).toBe('unsaved local work');
    expect(mounts).toHaveBeenCalledTimes(1);
  } else {
    expect(screen.queryByRole('textbox', { name: 'workspace-banco-de-notas' })).toBeNull();
    expect(screen.getByText(/Sua autorização precisa ser verificada novamente/u)).toBeTruthy();
  }
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it('limits a partial outage to pages that actually need the unavailable source', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (path) => {
    if (path === '/api/me') return Response.json({ authenticated: true, capabilities: PLATFORM_CAPABILITIES });
    return Response.json(path === '/api/platform/bootstrap' ? snapshot() : { ...snapshot(), unavailableSections: ['audit'], retryAfterSeconds: 90 });
  }));
  render(<App />);
  expect(await screen.findByRole('textbox', { name: 'workspace-banco-de-notas' })).toBeTruthy();
  await act(async () => {
    window.location.hash = '#/auditoria'; window.dispatchEvent(new Event('hashchange')); await flush();
  });
  expect(await screen.findByText('Informações desta área temporariamente indisponíveis')).toBeTruthy();
  expect(screen.queryByRole('textbox', { name: 'workspace-auditoria' })).toBeNull();
  await act(async () => {
    window.location.hash = '#/configuracoes'; window.dispatchEvent(new Event('hashchange')); await flush();
  });
  expect(await screen.findByRole('textbox', { name: 'workspace-configuracoes' })).toBeTruthy();
});
