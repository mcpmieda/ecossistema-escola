import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { browserBoundaryV1 } from './build/browser-boundary-v1.ts';
import { publicDemoBoundaryV1 } from './build/public-demo-boundary-v1.ts';

// Review-stage offline bundle. The revocable serving/control service is a separate approval.
const headers = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self' 'sha256-38RhXrc7EdReTKsOm23ZPOCUgniTUUcjky8QOOrQx6o='; img-src 'self' data:; font-src 'self'; connect-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'",
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};
const outputHeaders: Plugin = {
  name: 'public-demo-headers',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: '_headers',
      source:
        '/*\n' +
        Object.entries(headers)
          .map(([key, value]) => `  ${key}: ${value}`)
          .join('\n') +
        '\n',
    });
  },
};

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'src/public-portal-demo'),
  publicDir: false,
  envDir: false,
  plugins: [
    react(),
    tailwindcss(),
    browserBoundaryV1('student'),
    publicDemoBoundaryV1(import.meta.dirname),
    outputHeaders,
  ],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { host: '127.0.0.1', port: 4186, strictPort: true },
  preview: { host: '127.0.0.1', port: 4186, strictPort: true, headers },
  build: {
    outDir: path.resolve(import.meta.dirname, 'node_modules/.cache/public-portal-demo'),
    emptyOutDir: true,
    sourcemap: false,
    assetsInlineLimit: 0,
    target: 'es2022',
  },
});
