import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  BulletinPdfActionErrorV1,
  bulletinPdfFilenameV1,
  loadBulletinPdfRendererV1,
} from '../../../src/features/gradebook/bulletins/pdf/bulletin-pdf-actions-v1';
import { bulletinSnapshotFixtureV1 } from './bulletin-pdf-fixtures-v1';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Boletins PDF client V1', () => {
  it('sanitiza filename contra CRLF, separadores e caracteres inválidos sem expor IDs opacos', () => {
    const snapshot = bulletinSnapshotFixtureV1();
    const model = {
      ...snapshot.model,
      student: {
        ...snapshot.model.student,
        displayName: '../João\r\nContent-Disposition: attachment',
      },
      classGroup: {
        ...snapshot.model.classGroup,
        code: '6/A\\B:*?"<>|',
      },
    };
    const filename = bulletinPdfFilenameV1({ ...snapshot, model });

    expect(filename).toMatch(/^boletim-/u);
    expect(filename).toMatch(/-v3\.pdf$/u);
    expect(filename).not.toMatch(/[\r\n\\/:*?"<>|]/u);
    expect(filename).not.toContain(snapshot.snapshotId);
    expect(filename).not.toContain(snapshot.model.student.id);
    expect(filename).not.toContain(snapshot.model.student.enrollmentId);
  });

  it('carrega o renderer somente por importer assíncrono e falha fechado quando indisponível', async () => {
    const render = vi.fn(async () => ({
      blob: new Blob(['synthetic'], { type: 'application/pdf' }),
      byteLength: 9,
      pageCount: 1,
    }));
    const renderer = await loadBulletinPdfRendererV1(async () => ({ renderBulletinPdfV1: render }));
    await renderer.renderBulletinPdfV1({ snapshot: bulletinSnapshotFixtureV1() });
    expect(render).toHaveBeenCalledTimes(1);

    await expect(
      loadBulletinPdfRendererV1(async () => {
        throw new Error('synthetic-module-unavailable');
      }),
    ).rejects.toMatchObject({ code: 'renderer-unavailable' } satisfies Partial<BulletinPdfActionErrorV1>);
  });

  it('mantém renderer fora do import estático da página e limpa URLs/estado temporário', () => {
    const actions = source('src/features/gradebook/bulletins/pdf/bulletin-pdf-actions-v1.ts');
    const page = source('src/features/gradebook/bulletins/bulletin-page.tsx');

    expect(actions).toContain("await import('./bulletin-pdf-renderer-v1')");
    expect(actions).toContain('URL.createObjectURL');
    expect(actions).toContain('URL.revokeObjectURL');
    expect(actions).toContain('frame.remove()');
    expect(page).not.toContain("from './pdf/bulletin-pdf-renderer-v1'");
    expect(page).toContain('Baixar PDF oficial');
    expect(page).toContain('Imprimir PDF oficial');
    expect(page).toContain('PDF indisponível. O boletim canônico permanece legível na tela');
  });

  it('não persiste snapshot/modelo no browser e não cria resposta HTTP/Content-Disposition de PDF', () => {
    const actions = source('src/features/gradebook/bulletins/pdf/bulletin-pdf-actions-v1.ts');
    const renderer = source('src/features/gradebook/bulletins/pdf/bulletin-pdf-renderer-v1.ts');
    const combined = `${actions}\n${renderer}`;

    for (const forbidden of [
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'caches.open',
      'Content-Disposition',
      'new Response(',
    ]) {
      expect(combined).not.toContain(forbidden);
    }
    expect(actions).toContain('anchor.download = filename');
  });

  it('explicita limite de um documento por vez e ausência de fan-out PDF no lote', () => {
    const renderer = source('src/features/gradebook/bulletins/pdf/bulletin-pdf-renderer-v1.ts');
    const page = source('src/features/gradebook/bulletins/bulletin-page.tsx');

    expect(renderer).toContain('concurrentDocuments: 1');
    expect(renderer).toContain('maxPages: 24');
    expect(renderer).toContain('maxOutputBytes: 12 * 1024 * 1024');
    expect(page).toContain('PDF em lote não é disparado');
    expect(page).toContain('limitada a um snapshot por vez');
  });
});
