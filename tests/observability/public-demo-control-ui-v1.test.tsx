import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PublicDemoControlV1 } from '../../src/features/student-portal-admin/settings/public-demo-control-v1';
const reply = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('does not optimistically activate and disables the button until confirmation', async () => {
  let resolve!: (response: Response) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(reply({ enabled: false, revision: 0 }))
    .mockImplementationOnce(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
  vi.stubGlobal('fetch', fetcher);
  render(<PublicDemoControlV1 canWrite />);
  const button = await screen.findByRole('button', { name: 'Ativar demonstração' });
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
  fireEvent.click(button);
  expect(button.hasAttribute('disabled')).toBe(true);
  expect(screen.getByText('Estado confirmado: Desativada')).toBeTruthy();
  await act(async () => resolve(reply({ ok: true, state: { enabled: true, revision: 1 } })));
  expect(await screen.findByText('Estado confirmado: Ativada')).toBeTruthy();
});
it('read-only UI cannot write', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValueOnce(reply({ enabled: true, revision: 1 })),
  );
  const mounted = render(<PublicDemoControlV1 canWrite />);
  await screen.findByText('Estado confirmado: Ativada');
  expect(
    screen.getByRole('button', { name: 'Desativar demonstração' }).hasAttribute('disabled'),
  ).toBe(false);
  mounted.rerender(<PublicDemoControlV1 canWrite={false} />);
  expect(
    screen.getByRole('button', { name: 'Desativar demonstração' }).hasAttribute('disabled'),
  ).toBe(true);
});
