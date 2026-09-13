import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

function studentBoundary(): Plugin {
  return {
    name: 'student-browser-boundary',
    moduleParsed(info) {
      const id = info.id.replaceAll('\\', '/');
      if (/\/(?:server|functions|workers)\//u.test(id) || /\/node_modules\/(?:@azure\/|postgres\/)/u.test(id)
        || /\/src\/(?:auth|features\/(?:gradebook|student-portal-admin))\//u.test(id))
        this.error('Forbidden server, ADM or academic module in student bundle');
    },
  };
}

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'src/student-portal'),
  publicDir: false,
  plugins: [react(), tailwindcss(), studentBoundary()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { host: '127.0.0.1', port: 4174, strictPort: true },
  build: {
    outDir: path.resolve(import.meta.dirname, 'node_modules/.cache/student-portal-ui'),
    emptyOutDir: true, sourcemap: false, target: 'es2022',
  },
});
