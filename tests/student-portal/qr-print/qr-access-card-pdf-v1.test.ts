// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PrintScaling,
  decodePDFRawStream,
  type PDFPage,
} from 'pdf-lib';
import sharp from 'sharp';
import { PhotoAdminClientErrorV1 } from '../../../src/features/student-photos/admin-client-v1';
import { readCurrentPhotoV1 } from '../../../src/features/student-photos/catalog-client-v1';
import type { PhotoAdminSubjectV1 } from '../../../shared/student-photos/admin-http-v1';
import type { QrAccessCardPrintInputV1 } from '../../../src/features/student-portal-admin/credentials/qr-access-card-render-v1';
import {
  QR_ACCESS_CARD_PDF_LAYOUT_V1,
  prefetchQrCardPhotosV1,
  prepareQrCardArtV1,
  qrAccessCardSlotV1,
  renderQrAccessCardsPdfV1,
} from '../../../src/features/student-portal-admin/credentials/qr-access-card-pdf-v1';
import { qrPrintCardsV1 } from './fixtures-v1';

const mm = (points: number) => (points * 25.4) / 72;
const cardFixtures = (count: number) =>
  qrPrintCardsV1(count).map((card) => {
    if (card.mode !== 'qr-name-class') throw new Error('complete cards need name and class');
    return card;
  });

async function syntheticDependencies() {
  const jpeg = await sharp({
    create: { width: 1284, height: 810, channels: 3, background: '#ffffff' },
  })
    .jpeg()
    .toBuffer();
  const photo = new Blob([new Uint8Array(jpeg)], { type: 'image/webp' });
  return {
    photo,
    readPhoto: vi.fn(
      async (
        _subject: PhotoAdminSubjectV1,
        _revision: string | null,
        _signal: AbortSignal,
      ): Promise<Blob | undefined> => undefined,
    ),
    renderCard: vi.fn(
      async (_input: QrAccessCardPrintInputV1, _signal: AbortSignal) =>
        new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }),
    ),
    wait: vi.fn(async (_milliseconds: number, _signal: AbortSignal) => {}),
  };
}

function pageContent(page: PDFPage) {
  const contents = page.node.get(PDFName.of('Contents'));
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const stream = page.doc.context.lookup(ref);
      return stream instanceof PDFRawStream
        ? new TextDecoder().decode(decodePDFRawStream(stream).decode())
        : '';
    })
    .join('\n');
}

describe('complete QR access card PDF', () => {
  it('keeps the 95 × 59 mm card size and makes a new A4 page after eight cards', async () => {
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
    expect(mm(QR_ACCESS_CARD_PDF_LAYOUT_V1.cardWidth)).toBeCloseTo(95, 6);
    expect(mm(QR_ACCESS_CARD_PDF_LAYOUT_V1.cardHeight)).toBeCloseTo(59, 6);
    expect(dependencies.readPhoto).toHaveBeenCalledTimes(9);
    expect(dependencies.readPhoto.mock.calls[0]?.[0]).toMatchObject({
      source: 'portal',
      academicYear: 2026,
    });
    expect(dependencies.renderCard).toHaveBeenCalledTimes(9);
    expect(progress).toEqual(Array.from({ length: 10 }, (_, index) => index));
  });

  it('asks viewers to print at 100% and centres the grid away from printer margins', async () => {
    const dependencies = await syntheticDependencies();
    const result = await renderQrAccessCardsPdfV1(
      qrPrintCardsV1(1),
      2026,
      new AbortController().signal,
      undefined,
      dependencies,
    );
    const pdf = await PDFDocument.load(await result.blob.arrayBuffer());
    expect(pdf.catalog.getViewerPreferences()?.getPrintScaling()).toBe(PrintScaling.None);

    const layout = QR_ACCESS_CARD_PDF_LAYOUT_V1;
    const first = qrAccessCardSlotV1(0);
    const last = qrAccessCardSlotV1(7);
    // pdf-lib's A4 is 595.28 × 841.89 pt, so margins match to a hundredth of a millimetre.
    expect(mm(first.x)).toBeCloseTo(5, 2);
    expect(mm(layout.pageHeight - first.y - layout.cardHeight)).toBeCloseTo(23, 2);
    expect(mm(layout.pageWidth - last.x - layout.cardWidth)).toBeCloseTo(5, 2);
    expect(mm(last.y)).toBeCloseTo(23, 2);
  });

  it('draws the QR as vector paths over JPEG art, with no dashed cut guide', async () => {
    const dependencies = await syntheticDependencies();
    const result = await renderQrAccessCardsPdfV1(
      qrPrintCardsV1(8),
      2026,
      new AbortController().signal,
      undefined,
      dependencies,
    );
    // The bitmap never carries the QR; the PDF draws it from the card's credential.
    for (const [input] of dependencies.renderCard.mock.calls)
      expect(input).not.toHaveProperty('qr');
    const pdf = await PDFDocument.load(await result.blob.arrayBuffer());
    const content = pageContent(pdf.getPage(0));
    expect(content.match(/ Do\b/gu)).toHaveLength(8);
    expect(content).not.toMatch(/\[[\d.\s]+\]\s+[\d.]+\s+d\b/u);
    expect(result.blob.size).toBeLessThan(1_000_000);
  });

  it('prints without a photo after a missing or repeatedly unavailable portrait', async () => {
    const dependencies = await syntheticDependencies();
    const [first] = qrPrintCardsV1(1);
    let firstAttempts = 0;
    dependencies.readPhoto.mockImplementation(async (subject) => {
      if (
        'accountIds' in subject &&
        subject.accountIds[0] === first!.accountId &&
        ++firstAttempts > 1
      )
        return dependencies.photo;
      throw new PhotoAdminClientErrorV1('unavailable');
    });
    const result = await renderQrAccessCardsPdfV1(
      qrPrintCardsV1(2),
      2026,
      new AbortController().signal,
      undefined,
      dependencies,
    );
    expect(result).toMatchObject({ count: 2, pages: 1 });
    expect(dependencies.renderCard.mock.calls[0]?.[0].photo).toBe(dependencies.photo);
    expect(dependencies.renderCard.mock.calls[1]?.[0].photo).toBeUndefined();
    // One retry for the first card, then two retries before the second gives up.
    expect(dependencies.readPhoto).toHaveBeenCalledTimes(5);
    expect(dependencies.wait).toHaveBeenCalledTimes(3);
  });

  it('re-renders without the portrait when the photo cannot be decoded', async () => {
    const dependencies = await syntheticDependencies();
    dependencies.readPhoto.mockResolvedValue(dependencies.photo);
    dependencies.renderCard.mockRejectedValueOnce(new Error('render-unavailable'));
    const result = await renderQrAccessCardsPdfV1(
      qrPrintCardsV1(1),
      2026,
      new AbortController().signal,
      undefined,
      dependencies,
    );
    expect(result.count).toBe(1);
    expect(dependencies.renderCard).toHaveBeenCalledTimes(2);
    expect(dependencies.renderCard.mock.calls[1]?.[0]).not.toHaveProperty('photo');
  });

  it('downloads a few portraits ahead without flooding the photo service', async () => {
    const dependencies = await syntheticDependencies();
    let active = 0,
      peak = 0;
    dependencies.readPhoto.mockImplementation(async () => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return undefined;
    });
    await renderQrAccessCardsPdfV1(
      qrPrintCardsV1(24),
      2026,
      new AbortController().signal,
      undefined,
      dependencies,
    );
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(10);
    expect(dependencies.readPhoto).toHaveBeenCalledTimes(24);
  });

  it('paints card art at click time and reuses it once the credentials arrive', async () => {
    const dependencies = await syntheticDependencies();
    dependencies.readPhoto.mockResolvedValue(dependencies.photo);
    const cards = cardFixtures(3);
    // The batch starts from the list rows, before the server returns the cards.
    const prepared = prepareQrCardArtV1(
      cards.map(({ accountId, name, classLabel }) => ({
        accountId: accountId.toUpperCase(),
        name,
        classLabel,
      })),
      2026,
      new AbortController().signal,
      dependencies,
    );
    await vi.waitFor(() => expect(dependencies.renderCard).toHaveBeenCalledTimes(3));
    await renderQrAccessCardsPdfV1(
      cards,
      2026,
      new AbortController().signal,
      undefined,
      dependencies,
      prepared,
    );
    expect(dependencies.readPhoto).toHaveBeenCalledTimes(3);
    expect(dependencies.renderCard).toHaveBeenCalledTimes(3);
    for (const [input] of dependencies.renderCard.mock.calls)
      expect(input.photo).toBe(dependencies.photo);
  });

  it('repaints a card when the server name or class differs from the list row', async () => {
    const dependencies = await syntheticDependencies();
    const cards = cardFixtures(2);
    const prepared = prepareQrCardArtV1(
      cards.map(({ accountId, name }) => ({ accountId, name, classLabel: 'OLD CLASS' })),
      2026,
      new AbortController().signal,
      dependencies,
    );
    await renderQrAccessCardsPdfV1(
      cards,
      2026,
      new AbortController().signal,
      undefined,
      dependencies,
      prepared,
    );
    const classes = dependencies.renderCard.mock.calls.map(([input]) => input.classLabel);
    expect(classes.filter((label) => label === 'OLD CLASS')).toHaveLength(2);
    expect(classes.filter((label) => label !== 'OLD CLASS')).toEqual(
      cards.map((card) => card.classLabel),
    );
  });

  it('settles queued portraits after a stop so no card waits forever', async () => {
    const dependencies = await syntheticDependencies();
    dependencies.readPhoto.mockImplementation(
      (_subject, _revision, signal) =>
        new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
        ),
    );
    const controller = new AbortController();
    const photoFor = prefetchQrCardPhotosV1(
      qrPrintCardsV1(14).map((card) => card.accountId),
      2026,
      controller.signal,
      dependencies,
    );
    expect(dependencies.readPhoto).toHaveBeenCalledTimes(10);
    controller.abort();
    const results = await Promise.allSettled(
      qrPrintCardsV1(14).map((card) => photoFor(card.accountId)),
    );
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(dependencies.readPhoto).toHaveBeenCalledTimes(10);
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
    let paintedAtAbort = 0;
    await expect(
      renderQrAccessCardsPdfV1(
        qrPrintCardsV1(9),
        2026,
        controller.signal,
        (completed) => {
          if (completed !== 2) return;
          paintedAtAbort = dependencies.renderCard.mock.calls.length;
          controller.abort();
        },
        dependencies,
      ),
    ).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Art paints ahead of the PDF, but nothing new starts once the batch is stopped.
    expect(dependencies.renderCard.mock.calls.length).toBeLessThanOrEqual(paintedAtAbort + 1);
    expect(dependencies.renderCard.mock.calls.length).toBeLessThan(9);
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
    expect(dependencies.wait).not.toHaveBeenCalled();
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
