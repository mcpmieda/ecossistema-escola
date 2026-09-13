import { decodeQrPixelsV1 } from './qr-pixels-v1';

// Dedicated worker only; it never has a network endpoint or identity lookup.
self.onmessage = (
  event: MessageEvent<{ pixels: Uint8ClampedArray; width: number; height: number }>,
) => {
  try {
    const { pixels, width, height } = event.data;
    self.postMessage({ codes: decodeQrPixelsV1(pixels, width, height) });
  } catch {
    self.postMessage({ error: true });
  }
};
