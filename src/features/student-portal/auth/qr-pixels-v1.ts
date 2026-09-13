import jsQR from 'jsqr';

/** Local fallback. Bounded frame; erase each decoded region to reject ambiguous images. */
export function decodeQrPixelsV1(
  bytes: Uint8ClampedArray,
  width: number,
  height: number,
): string[] {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 2048 * 2048 ||
    bytes.length !== width * height * 4
  )
    throw new Error('invalid-frame');
  const found: { data: string; x: number; y: number; size: number }[] = [];
  const tileWidth = Math.ceil(width * 0.6),
    tileHeight = Math.ceil(height * 0.6);
  // Multiple finder patterns can confuse a whole-frame decode. Overlapping tiles disambiguate.
  const regions = [
    { x: 0, y: 0, width, height },
    ...[0, height - tileHeight].flatMap((y) =>
      [0, width - tileWidth].map((x) => ({ x, y, width: tileWidth, height: tileHeight })),
    ),
  ];
  for (const region of regions) {
    const pixels = new Uint8ClampedArray(region.width * region.height * 4);
    for (let row = 0; row < region.height; row++)
      pixels.set(
        bytes.subarray(
          ((region.y + row) * width + region.x) * 4,
          ((region.y + row) * width + region.x + region.width) * 4,
        ),
        row * region.width * 4,
      );
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const code = jsQR(pixels, region.width, region.height, { inversionAttempts: 'attemptBoth' });
      if (!code) break;
      const corners = [
        code.location.topLeftCorner,
        code.location.topRightCorner,
        code.location.bottomLeftCorner,
        code.location.bottomRightCorner,
      ];
      const left = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))) - 2);
      const right = Math.min(region.width, Math.ceil(Math.max(...corners.map((p) => p.x))) + 2);
      const top = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y))) - 2);
      const bottom = Math.min(region.height, Math.ceil(Math.max(...corners.map((p) => p.y))) + 2);
      const x = region.x + (left + right) / 2,
        y = region.y + (top + bottom) / 2;
      const size = Math.max(right - left, bottom - top);
      if (
        !found.some(
          (previous) =>
            Math.hypot(previous.x - x, previous.y - y) < Math.min(previous.size, size) * 0.3,
        )
      ) {
        found.push({ data: code.data, x, y, size });
        if (found.length > 1) return found.map((item) => item.data);
      }
      for (let y = top; y < bottom; y++)
        pixels.fill(255, (y * region.width + left) * 4, (y * region.width + right) * 4);
    }
  }
  return found.map((item) => item.data);
}
