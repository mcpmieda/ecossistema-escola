import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const addinRoot = path.resolve(import.meta.dirname, 'addin/banco-notas');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: addinRoot,
  publicDir: path.resolve(addinRoot, 'public'),
  base: '/banco-de-notas/addin/',
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/banco-de-notas/addin'),
    emptyOutDir: false,
    sourcemap: false,
    target: 'es2022',
    rollupOptions: {
      input: {
        taskpane: path.resolve(addinRoot, 'taskpane.html'),
        auth: path.resolve(addinRoot, 'auth.html'),
      },
    },
  },
});
