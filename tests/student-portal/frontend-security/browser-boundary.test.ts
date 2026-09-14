// @vitest-environment node
import { build } from 'vite';
import { expect, it } from 'vitest';
import { browserBoundaryV1 } from '../../../build/browser-boundary-v1';

function bundle(surface: 'student' | 'admin', dependency: string) {
  const modules: Record<string, string> = {
    '/synthetic/entry.js': "export const load = () => import('/synthetic/bridge.js');",
    '/synthetic/bridge.js': `export { value } from ${JSON.stringify(dependency)};`,
    [dependency]: 'export const value = "SYNTHETIC_BOUNDARY_SENTINEL";',
  };
  return build({
    configFile: false,
    envFile: false,
    publicDir: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'synthetic-boundary-fixture',
        resolveId(id) {
          return Object.hasOwn(modules, id) ? id : null;
        },
        load(id) {
          return modules[id] ?? null;
        },
      },
      browserBoundaryV1(surface),
    ],
    build: { write: false, minify: false, rollupOptions: { input: '/synthetic/entry.js' } },
  });
}

it.each(['student', 'admin'] as const)(
  'rejects server dependencies reached through a lazy import and re-export in the %s build',
  async (surface) => {
    for (const path of [
      'server/private.js',
      'workers/private.js',
      'functions/private.js',
      'node_modules/postgres/index.js',
    ])
      await expect(bundle(surface, '/synthetic/' + path)).rejects.toThrow(
        'Forbidden server or restricted module',
      );
  },
);

it('keeps administrative and academic browser modules out of the student bundle', async () => {
  for (const path of [
    'src/auth/login.js',
    'src/features/student-portal-admin/page.js',
    'src/features/gradebook/page.js',
    'node_modules/@azure/auth/index.js',
  ])
    await expect(bundle('student', '/synthetic/' + path)).rejects.toThrow(
      'Forbidden server or restricted module',
    );
});

it('allows public contracts and administrative presentation in their intended browser builds', async () => {
  await expect(
    bundle('student', '/synthetic/shared/student-portal-contracts/response.js'),
  ).resolves.toBeDefined();
  await expect(
    bundle('admin', '/synthetic/src/features/student-portal-admin/page.js'),
  ).resolves.toBeDefined();
});
