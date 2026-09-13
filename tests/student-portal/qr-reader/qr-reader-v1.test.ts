import { describe, expect, it, vi } from 'vitest';
import QRCode from 'qrcode';
import { SYNTHETIC_QR_V1 } from '../../../shared/student-portal-contracts/fixtures-v1';
import {
  consumeStudentQrLocationV1,
  selectStudentQrV1,
  validateQrImageFileV1,
  validateStudentQrV1,
} from '../../../src/features/student-portal/auth/qr-input-v1';
import { decodeQrPixelsV1 } from '../../../src/features/student-portal/auth/qr-pixels-v1';

function stamp(pixels: Uint8ClampedArray, width: number, x: number, y: number, value: string) {
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' }),
    scale = 4;
  for (let row = 0; row < qr.modules.size; row++)
    for (let column = 0; column < qr.modules.size; column++)
      if (qr.modules.get(row, column))
        for (let a = 0; a < scale; a++)
          for (let b = 0; b < scale; b++) {
            const at = ((y + row * scale + a) * width + x + column * scale + b) * 4;
            pixels[at] = pixels[at + 1] = pixels[at + 2] = 0;
          }
}
describe('local credential URL and image decoder', () => {
  it('scrubs access history before accepting or rejecting the credential', () => {
    const history = { replaceState: vi.fn() };
    expect(
      consumeStudentQrLocationV1(
        { href: SYNTHETIC_QR_V1, pathname: '/access', hash: new URL(SYNTHETIC_QR_V1).hash },
        history,
      ),
    ).toBe(SYNTHETIC_QR_V1);
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/access');
    history.replaceState.mockClear();
    expect(() =>
      consumeStudentQrLocationV1(
        { href: 'https://aluno.escolaieda.com/access#bad', pathname: '/access', hash: '#bad' },
        history,
      ),
    ).toThrow('invalid');
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/access');
  });
  it.each([
    SYNTHETIC_QR_V1.replace('aluno.escolaieda.com', 'foreign.invalid'),
    SYNTHETIC_QR_V1.replace('/access#', '/access/?x=#'),
    SYNTHETIC_QR_V1.replace('/access#', '/access?redirect=https://foreign.invalid#'),
    SYNTHETIC_QR_V1.replace('https:', 'http:'),
    SYNTHETIC_QR_V1.replace('https://', 'https://user@'),
    SYNTHETIC_QR_V1.replace('#v1.', '#v2.'),
    SYNTHETIC_QR_V1.slice(0, -1),
    'javascript:alert(1)',
  ])('rejects invalid or external input without navigating: %s', (value) => {
    expect(() => validateStudentQrV1(value)).toThrow('invalid');
  });
  it('leaves an unrelated route alone and accepts no empty/ambiguous image', () => {
    const history = { replaceState: vi.fn() };
    expect(
      consumeStudentQrLocationV1(
        { href: 'https://aluno.escolaieda.com/#section', pathname: '/', hash: '#section' },
        history,
      ),
    ).toBeNull();
    expect(history.replaceState).not.toHaveBeenCalled();
    expect(() => selectStudentQrV1([])).toThrow('absent');
    expect(() => selectStudentQrV1([SYNTHETIC_QR_V1, SYNTHETIC_QR_V1])).toThrow('multiple');
  });
  it('decodes a synthetic QR inside a larger image and detects ambiguity', () => {
    const width = 1200,
      height = 900,
      pixels = new Uint8ClampedArray(width * height * 4).fill(255);
    stamp(pixels, width, 95, 220, SYNTHETIC_QR_V1);
    expect(decodeQrPixelsV1(pixels, width, height)).toEqual([SYNTHETIC_QR_V1]);
    stamp(pixels, width, 700, 220, SYNTHETIC_QR_V1);
    expect(decodeQrPixelsV1(pixels, width, height)).toHaveLength(2);
    expect(() => selectStudentQrV1(decodeQrPixelsV1(pixels, width, height))).toThrow('multiple');
  });
  it('bounds files and decoded frames, rejects SVG and absence', () => {
    expect(() => validateQrImageFileV1({ size: 10 * 1024 * 1024 + 1, type: 'image/png' })).toThrow(
      'large',
    );
    expect(() => validateQrImageFileV1({ size: 20, type: 'image/svg+xml' })).toThrow('unsupported');
    expect(() => decodeQrPixelsV1(new Uint8ClampedArray(4), 4000, 4000)).toThrow('invalid-frame');
    expect(decodeQrPixelsV1(new Uint8ClampedArray(100 * 100 * 4).fill(255), 100, 100)).toEqual([]);
  });
});
