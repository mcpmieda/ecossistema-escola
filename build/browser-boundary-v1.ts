import type { Plugin } from 'vite';

/** Fail the browser build on server imports, including indirect/dynamic dependencies. */
export function browserBoundaryV1(surface: 'student' | 'admin'): Plugin {
  return {
    name: `${surface}-browser-boundary`,
    moduleParsed(info) {
      const id = info.id.replaceAll('\\', '/');
      const server =
        /\/(?:server|functions|workers)\//u.test(id) || /\/node_modules\/postgres\//u.test(id);
      const administrative =
        /\/node_modules\/@azure\//u.test(id) ||
        /\/src\/(?:auth|features\/(?:gradebook|student-portal-admin))\//u.test(id);
      if (server || (surface === 'student' && administrative))
        this.error(`Forbidden server or restricted module in ${surface} browser bundle`);
    },
  };
}
