import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist'),
    emptyOutDir: false,
    sourcemap: false,
    target: 'es2022',
    minify: true,
    lib: {
      entry: path.resolve(
        import.meta.dirname,
        'infra/banco-notas/cloudflare/runtime-homologation-worker.ts',
      ),
      formats: ['es'],
      fileName: () => '_worker.js',
    },
  },
});
