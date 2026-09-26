// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { PhotoAdminClientErrorV1 } from '../../../src/features/student-photos/admin-client-v1';
import { readCurrentPhotoV1 } from '../../../src/features/student-photos/catalog-client-v1';
import type { PhotoAdminSubjectV1 } from '../../../shared/student-photos/admin-http-v1';
import type { QrAccessCardInputV1 } from '../../../src/features/student-portal-admin/credentials/qr-access-card-render-v1';
import {
  QR_ACCESS_CARD_PDF_LAYOUT_V1,
  renderQrAccessCardsPdfV1,
} from '../../../src/features/student-portal-admin/credentials/qr-access-card-pdf-v1';
import type { QrArtifactV1 } from '../../../src/features/student-portal-admin/credentials/qr-values-v1';
import { qrPrintCardsV1 } from './fixtures-v1';

async function syntheticDependencies() {
  const bytes = await sharp({
    create: { width: 856, height: 540, channels: 4, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  const artifact = (): QrArtifactV1 => ({
    blob: new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
    format: 'png',
    count: 1,
    pages: 1,
  });
  return {
    renderQr: vi.fn(async (_qr: string, _signal: AbortSignal) => artifact()),
    readPhoto: vi.fn(
      async (_subject: PhotoAdminSubjectV1, _revision: string | null, _signal: AbortSignal) =>
        undefined,
    ),
    renderCard: vi.fn(
      async (_input: QrAccessCardInputV1, _signal: AbortSignal, _scale: 1 | 2 = 2) => artifact(),
    ),
  };
}

describe('complete QR access card PDF', () => {
  it('keeps the 95 × 59 mm cut size and makes a new A4 page after eight cards', async () => {
    const dependencies = await syntheticDependencies();
    const progress: number[] = [];
    const result = await renderQrAccessCardsPdfV1(
      qrPrintCardsV1(9),
      2026,
      new AbortController().signal,
      (completed) => progress.push(completed),
      dependencies,
    );
    expect(result).toMatchObject({ format: 'pdf', count: 9, pages: 2 });
    const pdf = await PDFDocument.load(await result.blob.arrayBuffer());
    expect(pdf.getPageCount()).toBe(2);
    expect(
      pdf
        .getPages()
        .every(
          (page) =>
            page.getWidth() === QR_ACCESS_CARD_PDF_LAYOUT_V1.pageWidth &&
            page.getHeight() === QR_ACCESS_CARD_PDF_LAYOUT_V1.pageHeight,
        ),
    ).toBe(true);
    expect((QR_ACCESS_CARD_PDF_LAYOUT_V1.cutWidth * 25.4) / 72).toBeCloseTo(95, 6);
    expect((QR_ACCESS_CARD_PDF_LAYOUT_V1.cutHeight * 25.4) / 72).toBeCloseTo(59, 6);
    expect(dependencies.readPhoto).toHaveBeenCalledTimes(9);
    expect(dependencies.readPhoto.mock.calls[0]?.[0]).toMatchObject({
      source: 'portal',
      academicYear: 2026,
    });
    expect(dependencies.renderCard).toHaveBeenCalledTimes(9);
    expect(dependencies.renderCard.mock.calls[0]?.[2]).toBe(1);
    expect(progress).toEqual(Array.from({ length: 10 }, (_, index) => index));
  });

  it('rejects an unsuitable card before requesting any photo', async () => {
    const dependencies = await syntheticDependencies();
    await expect(
      renderQrAccessCardsPdfV1(
        qrPrintCardsV1(1, 'qr-only'),
        2026,
        new AbortController().signal,
        undefined,
        dependencies,
      ),
    ).rejects.toThrow('invalid-cards');
    expect(dependencies.readPhoto).not.toHaveBeenCalled();
  });

  it('stops on cancellation without returning a partial PDF', async () => {
    const dependencies = await syntheticDependencies();
    const controller = new AbortController();
    await expect(
      renderQrAccessCardsPdfV1(
        qrPrintCardsV1(9),
        2026,
        controller.signal,
        (completed) => {
          if (completed === 2) controller.abort();
        },
        dependencies,
      ),
    ).rejects.toThrow();
    expect(dependencies.renderCard).toHaveBeenCalledTimes(2);
  });

  it('propagates photo authorization loss to the QR operation', async () => {
    const dependencies = await syntheticDependencies();
    dependencies.readPhoto.mockRejectedValueOnce(new PhotoAdminClientErrorV1('forbidden'));
    await expect(
      renderQrAccessCardsPdfV1(
        qrPrintCardsV1(1),
        2026,
        new AbortController().signal,
        undefined,
        dependencies,
      ),
    ).rejects.toMatchObject({ state: 'forbidden' });
    expect(dependencies.renderCard).not.toHaveBeenCalled();
  });

  it.each([401, 403])('keeps photo HTTP %i as an authorization error', async (status) => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status }));
    try {
      await expect(
        readCurrentPhotoV1(
          { source: 'portal', academicYear: 2026, accountIds: [qrPrintCardsV1(1)[0]!.accountId] },
          null,
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ code: status === 401 ? 'unauthenticated' : 'forbidden' });
    } finally {
      fetchMock.mockRestore();
    }
  });
});
