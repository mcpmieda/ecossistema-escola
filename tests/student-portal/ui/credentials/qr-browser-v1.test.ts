import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  copyQrImageV1,
  createQrDownloadsV1,
} from '../../../../src/features/student-portal-admin/credentials/qr-browser-v1';
import type { QrArtifactV1 } from '../../../../src/features/student-portal-admin/credentials/qr-values-v1';
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const artifact = (): QrArtifactV1 => ({
  blob: new Blob(['SYNTHETIC PNG'], { type: 'image/png' }),
  format: 'png',
  count: 1,
  pages: 1,
});
describe('QR-only clipboard and local download', () => {
  it('writes exactly one image/png item and never text, HTML or names', async () => {
    const write = vi.fn().mockResolvedValue(undefined),
      captured: Record<string, unknown>[] = [];
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal(
      'ClipboardItem',
      class {
        static supports() {
          return true;
        }
        constructor(input: Record<string, unknown>) {
          captured.push(input);
        }
      },
    );
    vi.stubGlobal('navigator', { clipboard: { write } });
    const value = artifact();
    expect(await copyQrImageV1(value)).toBe('copied');
    expect(write).toHaveBeenCalledTimes(1);
    expect(captured).toEqual([{ 'image/png': value.blob }]);
  });
  it('offers download when the browser lacks image clipboard or permission is denied', async () => {
    vi.stubGlobal('isSecureContext', false);
    expect(await copyQrImageV1(artifact())).toBe('download-required');
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('ClipboardItem', class {});
    vi.stubGlobal('navigator', {
      clipboard: { write: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    expect(await copyQrImageV1(artifact())).toBe('download-required');
    expect(await copyQrImageV1({ ...artifact(), format: 'pdf' })).toBe('download-required');
  });
  it('uses neutral filenames and revokes all object URLs on timer, clear, or failed download', () => {
    vi.useFakeTimers();
    const revoked: string[] = [],
      captured: string[] = [];
    vi.stubGlobal(
      'URL',
      class {
        static createObjectURL() {
          return 'blob:synthetic-' + captured.length;
        }
        static revokeObjectURL(url: string) {
          revoked.push(url);
        }
      },
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      captured.push(this.download);
    });
    const downloads = createQrDownloadsV1();
    downloads.download(artifact());
    expect(captured).toEqual(['portal-qr.png']);
    expect(document.querySelectorAll('a')).toHaveLength(0);
    vi.advanceTimersByTime(30_000);
    expect(revoked).toHaveLength(1);
    downloads.download({ ...artifact(), format: 'pdf' });
    downloads.clear();
    expect(captured[1]).toBe('portal-cartoes.pdf');
    expect(revoked).toHaveLength(2);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => downloads.download(artifact())).toThrow();
    expect(revoked).toHaveLength(3);
    expect(document.querySelectorAll('a')).toHaveLength(0);
    downloads.clear();
  });
});
