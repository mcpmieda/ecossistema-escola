// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { canvasBlobSyncV1 } from '../../../src/features/student-portal-admin/credentials/canvas-encode-v1';

const canvasReturning = (url: string) => ({ toDataURL: () => url }) as unknown as HTMLCanvasElement;

describe('synchronous QR canvas encoding', () => {
  it('returns the encoded bytes with the requested type', async () => {
    const blob = canvasBlobSyncV1(
      canvasReturning(
        `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff]).toString('base64')}`,
      ),
      'image/jpeg',
      0.9,
    );
    expect(blob.type).toBe('image/jpeg');
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([0xff, 0xd8, 0xff]);
  });

  it('refuses a silent PNG fallback instead of mislabelling it as JPEG', () => {
    expect(() =>
      canvasBlobSyncV1(canvasReturning('data:image/png;base64,iVBORw0KGgo='), 'image/jpeg'),
    ).toThrow('render-unavailable');
  });

  it('keeps QR artifacts off toBlob, which the admin app delivers about 1 s late', () => {
    const folder = 'src/features/student-portal-admin/credentials';
    const offenders = readdirSync(folder)
      .filter((file) => /\.tsx?$/u.test(file))
      .filter((file) =>
        /\.(toBlob|convertToBlob)\(/u.test(readFileSync(path.join(folder, file), 'utf8')),
      );
    expect(offenders).toEqual([]);
  });
});
