import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
function luminance(hex: string) {
  const channels = hex
    .match(/[a-f0-9]{2}/giu)!
    .map((pair) => parseInt(pair, 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
it('keeps actual Portal action tokens above the WCAG normal-text floor at rest and hover', () => {
  const css = readFileSync('src/features/student-portal/shared/accessibility-v1.css', 'utf8');
  const tokens = new Map(
    [...css.matchAll(/--([a-z-]+):\s*(#[a-f0-9]{6})/giu)].map((m) => [m[1]!, m[2]!]),
  );
  for (const kind of ['accent', 'danger']) {
    for (const background of [kind, kind + '-hover']) {
      const fg = luminance(tokens.get(kind + '-foreground')!);
      const bg = luminance(tokens.get(background)!);
      expect((Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  }
});
