import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAccountQrHandoffV1 } from '../../../src/features/student-portal-admin/shared/qr-handoff-v1';
import type { AccountQrResultV1 } from '../../../src/features/student-portal-admin/accounts/account-mutation-v1';
import type { QrArtifactV1 } from '../../../src/features/student-portal-admin/credentials/qr-values-v1';
import { qrPrintCardsV1, qrPrintIdV1 } from '../qr-print/fixtures-v1';
import { setupOperationsDomV1 } from '../ui/overview/dom-v1';

const renderer = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('../../../src/features/student-portal-admin/credentials/qr-artifacts-v1', () => ({
  renderQrPngV1: renderer.render,
}));
const artifact = (): QrArtifactV1 => ({
  blob: new Blob(['SYNTHETIC PNG'], { type: 'image/png' }),
  format: 'png',
  count: 1,
  pages: 1,
});
const result: AccountQrResultV1 = {
  contractVersion: 1,
  requestId: qrPrintIdV1(9),
  state: 'qr',
  version: 1,
  cards: qrPrintCardsV1(1, 'qr-only'),
};
let handoff: ReturnType<typeof useAccountQrHandoffV1>;
function Mounted() {
  handoff = useAccountQrHandoffV1();
  return handoff.dialog;
}
beforeEach(() => {
  setupOperationsDomV1();
  renderer.render.mockReset().mockResolvedValue(artifact());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('offers the committed bitmap with an accessible modal and no raw QR or automatic download', async () => {
  const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  render(<Mounted />);
  await act(() => handoff.accept(result, new AbortController().signal));
  expect(await screen.findByRole('dialog', { name: 'Novo QR disponível' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Copiar imagem' })).toBeTruthy();
  expect(document.body.innerHTML).not.toContain(result.cards[0]!.qr);
  expect(document.body.innerHTML).not.toContain(result.cards[0]!.accountId);
  expect(clicked).not.toHaveBeenCalled();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Fechar' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
it('revokes a downloaded object URL when the owning account context is cleared', async () => {
  const create = vi.fn().mockReturnValue('blob:synthetic-758');
  const revoke = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = create;
      static override revokeObjectURL = revoke;
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  render(<Mounted />);
  await act(() => handoff.accept(result, new AbortController().signal));
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Baixar imagem' }));
  expect(create).toHaveBeenCalledOnce();
  void act(() => handoff.clear());
  expect(revoke).toHaveBeenCalledWith('blob:synthetic-758');
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('discards a late bitmap after navigation clears the owner instead of reopening a private modal', async () => {
  let resolve!: (value: QrArtifactV1) => void;
  renderer.render.mockReturnValue(
    new Promise<QrArtifactV1>((done) => {
      resolve = done;
    }),
  );
  render(<Mounted />);
  const pending = handoff
    .accept(result, new AbortController().signal)
    .catch((error: unknown) => error);
  await waitFor(() => expect(renderer.render).toHaveBeenCalledOnce());
  void act(() => handoff.clear());
  let rejected: unknown;
  await act(async () => {
    resolve(artifact());
    rejected = await pending;
  });
  expect(rejected).toMatchObject({ name: 'AbortError' });
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('expires the private artifact after five minutes and refuses a cancelled renderer', async () => {
  render(<Mounted />);
  vi.useFakeTimers();
  await act(() => handoff.accept(result, new AbortController().signal));
  expect(screen.getByRole('dialog')).toBeTruthy();
  await act(async () => {
    vi.advanceTimersByTime(300_000);
  });
  expect(screen.queryByRole('dialog')).toBeNull();
  vi.useRealTimers();
  const controller = new AbortController();
  controller.abort();
  await expect(handoff.accept(result, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(screen.queryByRole('dialog')).toBeNull();
});
