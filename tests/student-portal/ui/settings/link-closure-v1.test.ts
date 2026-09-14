import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkClosureV1 } from '../../../../src/features/student-portal-admin/settings/link-closure-v1';
import { createPortalAdminClientV1 } from '../../../../src/features/student-portal-admin/shared/admin-client-v1';
import { SYNTHETIC_ID_V1 } from '../../../../shared/student-portal-contracts/fixtures-v1';
import type {
  AdminCommandV1,
  AdminQueryV1,
} from '../../../../shared/student-portal-contracts/admin-v1';
const token = 'synthetic_preview_751_'.repeat(3);
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
const base = { contractVersion: 1, requestId: SYNTHETIC_ID_V1 } as const;
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function fixture(count = 2, lifetime = 300_000, failFirst = false) {
  const queries: AdminQueryV1[] = [],
    writes: AdminCommandV1[] = [],
    bodies: string[] = [];
  const onClosed = vi.fn(),
    onBusyChange = vi.fn();
  const client = createPortalAdminClientV1({
    fetch: async (path, init) => {
      if (path.endsWith('/query')) {
        queries.push(JSON.parse(String(init.body)));
        return json({
          ...base,
          state: 'links-preview',
          count,
          version: 9,
          expiresAt: new Date(Date.now() + lifetime).toISOString(),
          previewToken: token,
        });
      }
      bodies.push(String(init.body));
      writes.push(JSON.parse(String(init.body)));
      if (failFirst && writes.length <= 2) throw new Error('synthetic response lost');
      return json({ ...base, state: 'committed', version: 10, operationId: SYNTHETIC_ID_V1 });
    },
  });
  render(createElement(LinkClosureV1, { client, disabled: false, onClosed, onBusyChange }));
  return { queries, writes, bodies, onClosed, onBusyChange };
}
async function confirm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByRole('textbox', { name: 'Digite ENCERRAR VÍNCULOS 2026 para confirmar' }),
    'ENCERRAR VÍNCULOS 2026',
  );
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Encerrar os vínculos de 2026' }));
}
describe('separate link closure risk area', () => {
  it('requires a current counted preview and specific confirmation, without putting the token in the DOM', async () => {
    const user = userEvent.setup(),
      mock = fixture();
    expect(mock.queries).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Preparar prévia de encerramento' }));
    await screen.findByText('2 vínculos');
    expect(mock.queries[0]).toMatchObject({
      operation: 'links-preview',
      scope: { kind: 'school', academicYear: 2026 },
    });
    expect(document.body.innerHTML).not.toContain(token);
    expect(
      (screen.getByRole('button', { name: 'Encerrar os vínculos de 2026' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await confirm(user);
    await vi.waitFor(() => expect(mock.onClosed).toHaveBeenCalledOnce());
    expect(mock.writes[0]).toMatchObject({
      operation: 'links-close',
      academicYear: 2026,
      expectedVersion: 9,
      expectedCount: 2,
      confirmed: true,
      previewToken: token,
    });
    expect(mock.writes[0]).not.toHaveProperty('scope');
    expect(document.body.innerHTML).not.toContain(token);
  });
  it('does not close an empty preview', async () => {
    const user = userEvent.setup(),
      mock = fixture(0);
    await user.click(screen.getByRole('button', { name: 'Preparar prévia de encerramento' }));
    await screen.findByText('Não há vínculos atuais para encerrar.');
    expect(screen.queryByRole('button', { name: 'Encerrar os vínculos de 2026' })).toBeNull();
    expect(mock.writes).toHaveLength(0);
  });
  it('expires the proof and requires a fresh preview', async () => {
    const user = userEvent.setup(),
      mock = fixture(2, 300);
    await user.click(screen.getByRole('button', { name: 'Preparar prévia de encerramento' }));
    await screen.findByText('A prévia expirou. Prepare uma nova antes de confirmar.');
    expect(screen.queryByRole('button', { name: 'Encerrar os vínculos de 2026' })).toBeNull();
    expect(mock.writes).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Preparar prévia de encerramento' }));
    await vi.waitFor(() => expect(mock.queries).toHaveLength(2));
  });
  it('retries an uncertain closure with the same counted proof and idempotency key', async () => {
    const user = userEvent.setup(),
      mock = fixture(2, 300_000, true);
    await user.click(screen.getByRole('button', { name: 'Preparar prévia de encerramento' }));
    await screen.findByText('2 vínculos');
    await confirm(user);
    await screen.findByText(
      'O resultado do encerramento ainda não foi confirmado. Repetir mantém exatamente a mesma operação.',
    );
    await user.click(screen.getByRole('button', { name: 'Repetir o mesmo encerramento' }));
    await vi.waitFor(() => expect(mock.onClosed).toHaveBeenCalledOnce());
    expect(new Set(mock.bodies).size).toBe(1);
    expect(mock.writes).toHaveLength(3);
  });
});
