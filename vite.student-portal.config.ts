import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { browserBoundaryV1 } from './build/browser-boundary-v1.ts';

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'src/student-portal'),
  publicDir: false,
  plugins: [react(), tailwindcss(), browserBoundaryV1('student')],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { host: '127.0.0.1', port: 4174, strictPort: true },
  build: {
    outDir: path.resolve(import.meta.dirname, 'node_modules/.cache/student-portal-ui'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
  },
});
