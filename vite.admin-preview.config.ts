import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { browserBoundaryV1 } from './build/browser-boundary-v1';

/** Serves only locally stored, git-ignored preview photos to the existing avatar URL. */
function localPreviewPhotos(): Plugin {
  return {
    name: 'local-preview-photos',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        if (url.pathname !== '/api/student-photos/admin/image') return next();
        const match = /^75600000-0000-4000-8000-(\d{12})$/u.exec(
          url.searchParams.get('reference') ?? '',
        );
        const index = Number(match?.[1]);
        if (
          url.searchParams.get('source') !== 'portal' ||
          !Number.isInteger(index) ||
          index < 1 ||
          index > 384
        ) {
          response.writeHead(404).end();
          return;
        }
        const file = path.resolve(
          import.meta.dirname,
          `src/student-portal-admin-preview/local-photos/${index}.webp`,
        );
        if (!existsSync(file)) {
          response.writeHead(404).end();
          return;
        }
        response.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store' });
        response.end(readFileSync(file));
      });
    },
  };
}

export default defineConfig({
  plugins: [localPreviewPhotos(), react(), tailwindcss(), browserBoundaryV1('admin')],
  server: { host: '127.0.0.1', port: 4175, strictPort: true },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
});
