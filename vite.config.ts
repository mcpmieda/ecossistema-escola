import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { browserBoundaryV1 } from './build/browser-boundary-v1';

export default defineConfig({
  plugins: [react(), tailwindcss(), browserBoundaryV1('admin')],
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
