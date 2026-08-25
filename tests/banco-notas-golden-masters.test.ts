import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const forbiddenGoldenMasters = new Set([
  'notas nina 2026.xlsb',
  'notas alanna 2026.xlsb',
  'modelo_professor_nina_2026_homologado.xlsx',
]);
const productionRoots = ['src', 'server', 'functions', 'shared', 'infra', 'migrations', 'public'];

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

function filesBelow(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path).flatMap((entry) => {
    const candidate = join(path, entry);
    return statSync(candidate).isDirectory() ? filesBelow(candidate) : [candidate];
  });
}

describe('Banco de Notas private golden-master isolation', () => {
  it('does not track private golden masters or any XLSB workbook', () => {
    const tracked = trackedFiles();

    expect(tracked.filter((path) => path.toLowerCase().endsWith('.xlsb'))).toEqual([]);
    expect(
      tracked.filter((path) => forbiddenGoldenMasters.has(basename(path).toLowerCase())),
    ).toEqual([]);
  });

  it('keeps professor-specific golden-master names out of production surfaces', () => {
    const violations = productionRoots
      .flatMap((path) => filesBelow(join(root, path)))
      .filter((path) => /\.(?:[cm]?[jt]sx?|json|sql|ya?ml|toml|css|html|xml|ps1)$/iu.test(path))
      .filter((path) =>
        /(?:^|[^\p{L}])(?:nina|alanna)(?:$|[^\p{L}])/iu.test(readFileSync(path, 'utf8')),
      )
      .map((path) => relative(root, path));

    expect(violations).toEqual([]);
  });

  it('records the generic-model decision in the durable handoff', () => {
    const handoff = readFileSync(join(root, 'docs/BANCO_NOTAS_HANDOFF.md'), 'utf8');
    const decision = readFileSync(
      join(root, 'docs/BANCO_NOTAS_MODELO_GENERICO_E_GOLDEN_MASTERS.md'),
      'utf8',
    );

    expect(handoff).toContain('modelo genérico limpo');
    expect(handoff).toContain('golden masters privados externos');
    expect(decision).toContain('não são templates oficiais');
    expect(decision).toContain('SyncEnabled=false');
  });
});
