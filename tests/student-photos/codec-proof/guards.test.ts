import { afterEach, expect, it, vi } from 'vitest';
import { StudentWebpCodecV1, type WebpPhotoQualityV1, type WebpPhotoVariantV1 } from '../../../server/student-photos/webp-codec-v1';

// Deliberately no codec exports. These tests prove admission/guards only;
// the separate source-built Workerd proof must exercise actual pixel decoding.
const emptyModule = new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0]));
const signal = () => new AbortController().signal;
function plausibleHeader(width = 3, height = 4): Uint8Array {
  const bytes = new Uint8Array(30), view = new DataView(bytes.buffer), encoder = new TextEncoder();
  bytes.set(encoder.encode('RIFF'), 0); view.setUint32(4, 22, true);
  bytes.set(encoder.encode('WEBPVP8 '), 8); view.setUint32(16, 10, true);
  bytes.set([0x9d,1,0x2a], 23); view.setUint16(26, width, true); view.setUint16(28, height, true);
  return bytes;
}
afterEach(() => vi.restoreAllMocks());

it('rejects invalid quality, variant and byte budgets before creating WASM state', async () => {
  const instantiate = vi.spyOn(WebAssembly, 'instantiate'), codec = new StudentWebpCodecV1(emptyModule);
  for (const quality of [0, 79, 93, 100, Number.NaN])
    await expect(codec.normalize(plausibleHeader(), 'portrait', quality as WebpPhotoQualityV1, signal())).rejects.toMatchObject({ code: 'input' });
  await expect(codec.normalize(plausibleHeader(), 'other' as WebpPhotoVariantV1, 92, signal())).rejects.toMatchObject({ code: 'input' });
  for (const [variant, length] of [['portrait', 131073], ['avatar', 65537]] as const)
    await expect(codec.normalize(new Uint8Array(length), variant, 92, signal())).rejects.toMatchObject({ code: 'input' });
  expect(instantiate).not.toHaveBeenCalled();
});

it('rejects geometry and trailing bytes without a decoder, and releases the admission guard', async () => {
  const instantiate = vi.spyOn(WebAssembly, 'instantiate'), codec = new StudentWebpCodecV1(emptyModule);
  for (const [variant, width, height] of [['portrait', 3, 5], ['portrait', 903, 1204], ['avatar', 321, 321]] as const)
    await expect(codec.normalize(plausibleHeader(width, height), variant, 92, signal())).rejects.toMatchObject({ code: 'dimensions' });
  const trailing = new Uint8Array(32); trailing.set(plausibleHeader());
  await expect(codec.normalize(trailing, 'portrait', 92, signal())).rejects.toMatchObject({ code: 'input' });
  expect(instantiate).not.toHaveBeenCalled();
  await expect(codec.normalize(plausibleHeader(), 'portrait', 92, signal())).rejects.toMatchObject({ code: 'unavailable' });
  expect(instantiate).toHaveBeenCalledTimes(1);
});

it('rejects extra private chunks before allocating the decoder', async () => {
  const instantiate = vi.spyOn(WebAssembly, 'instantiate'), codec = new StudentWebpCodecV1(emptyModule);
  const bytes = new Uint8Array(40), view = new DataView(bytes.buffer);
  bytes.set(plausibleHeader()); view.setUint32(4, 32, true);
  bytes.set(new TextEncoder().encode('EXIF'), 30); view.setUint32(34, 2, true);
  await expect(codec.normalize(bytes, 'portrait', 92, signal())).rejects.toMatchObject({ code: 'metadata' });
  expect(instantiate).not.toHaveBeenCalled();
});

it('does no WASM work for an already cancelled operation', async () => {
  const instantiate = vi.spyOn(WebAssembly, 'instantiate'), codec = new StudentWebpCodecV1(emptyModule);
  const controller = new AbortController(); controller.abort();
  await expect(codec.normalize(plausibleHeader(), 'portrait', 92, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(instantiate).not.toHaveBeenCalled();
});

it('admits only one overlapping initialization and permits a fresh attempt after failure', async () => {
  const instantiate = vi.spyOn(WebAssembly, 'instantiate'), codec = new StudentWebpCodecV1(emptyModule);
  const results = await Promise.allSettled([
    codec.normalize(plausibleHeader(), 'portrait', 92, signal()),
    codec.normalize(plausibleHeader(), 'portrait', 92, signal()),
  ]);
  expect(results.every(result => result.status === 'rejected')).toBe(true);
  expect(instantiate).toHaveBeenCalledTimes(1);
  await expect(codec.normalize(plausibleHeader(), 'portrait', 92, signal())).rejects.toMatchObject({ code: 'unavailable' });
  expect(instantiate).toHaveBeenCalledTimes(2);
});

it('cancels during async initialization without leaving admission reserved', async () => {
  const instantiate = vi.spyOn(WebAssembly, 'instantiate'), codec = new StudentWebpCodecV1(emptyModule);
  const controller = new AbortController();
  const pending = codec.normalize(plausibleHeader(), 'portrait', 92, controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await expect(codec.normalize(plausibleHeader(), 'portrait', 92, signal())).rejects.toMatchObject({ code: 'unavailable' });
  expect(instantiate).toHaveBeenCalledTimes(2);
});
