import path from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { browserBoundaryV1 } from './build/browser-boundary-v1';
import { SHEETJS_INTEGRITY_V1 } from './src/features/gradebook/import/sheetjs-source-v1';

// Static adaptation only: verified official full bytes plus exports, no runtime code evaluation.
function sheetJsWorkerLibraryV1(standalone = false): Plugin {
  const id = 'virtual:gradebook-sheetjs-worker-v1';
  const readVerifiedBytes = () => {
    const bytes = readFileSync(
      path.resolve(import.meta.dirname, 'public/vendor/sheetjs/0.20.3/xlsx.full.min.js.txt'),
    );
    if ('sha384-' + createHash('sha384').update(bytes).digest('base64') !== SHEETJS_INTEGRITY_V1)
      throw new Error('SheetJS worker integrity mismatch');
    return bytes;
  };
  return {
    name: 'gradebook-sheetjs-worker-v1',
    resolveId(source) {
      if (source === id) return '\0' + id;
    },
    load(source) {
      if (source !== '\0' + id) return;
      const bytes = readVerifiedBytes();
      return (
        'const module = undefined, exports = undefined, define = undefined;\nconst sheetJsEvaluationStartedAt = performance.now();\n' +
        new TextDecoder().decode(bytes) +
        '\nexport const libraryEvaluationMs = performance.now() - sheetJsEvaluationStartedAt;\nexport default XLSX;\n'
      );
    },
    configureServer(server) {
      if (!standalone) return;
      server.middlewares.use('/vendor/sheetjs/0.20.3/xlsx.full.min.js', (_request, response) => {
        response.setHeader('content-type', 'text/javascript; charset=utf-8');
        response.end(readVerifiedBytes());
      });
    },
    generateBundle() {
      if (standalone)
        this.emitFile({
          type: 'asset',
          fileName: 'vendor/sheetjs/0.20.3/xlsx.full.min.js',
          source: readVerifiedBytes(),
        });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), browserBoundaryV1('admin'), sheetJsWorkerLibraryV1(true)],
  worker: { format: 'es', plugins: () => [sheetJsWorkerLibraryV1()] },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        // Portal do Aluno demo with invented data, reached from the Painel do Aluno.
        portalDemo: path.resolve(import.meta.dirname, 'portal-demo.html'),
      },
    },
    sourcemap: false,
    target: 'es2022',
  },
});
