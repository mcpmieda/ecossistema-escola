import { decodeQrPixelsV1, sharpenQrPixelsV1 } from './qr-pixels-v1';

// Dedicated worker only; it never has a network endpoint or identity lookup.
self.onmessage = (
  event: MessageEvent<{
    pixels: Uint8ClampedArray;
    width: number;
    height: number;
    sharpen?: boolean;
  }>,
) => {
  try {
    const { pixels, width, height, sharpen } = event.data;
    const frame =
      sharpen === true && width * height <= 2048 * 2048
        ? sharpenQrPixelsV1(pixels, width, height)
        : pixels;
    self.postMessage({ codes: decodeQrPixelsV1(frame, width, height) });
  } catch {
    self.postMessage({ error: true });
  }
};
