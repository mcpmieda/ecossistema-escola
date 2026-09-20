import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const map = readFileSync(join(root, 'docs/gradebook/CONTRACT_VERSION_MAP.md'), 'utf8');

describe('canonical Gradebook contract version map', () => {
  it('classifies the complete import transport family', () => {
    for (let version = 1; version <= 9; version += 1) {
      expect(map).toContain(`import-persistence-transport-v${version}.ts`);
    }
    expect(map).toContain('import-persistence-transport-v9.ts` | **CURRENT**');
    expect(map).toContain('import-persistence-transport-v7.ts` | HISTORICAL/MEMORY');
  });

  it('preserves the current nested import service chain', () => {
    expect(map).toContain('V11 → V10 → V9');
    expect(map).toContain('import-relational-service-v11.ts` | **CURRENT**');
    expect(map).toContain('import-relational-service-v10.ts` | COMPATIBILITY');
    expect(map).toContain('import-relational-service-v9.ts` | COMPATIBILITY/Core');
  });

  it('does not treat additive performance versions as replacements', () => {
    for (const contract of [
      'relational-performance-v2.ts',
      'performance-analysis-v3.ts',
      'performance-term-comparison-v4.ts',
      'performance-dashboard-v5.ts',
      'performance-analytics-v6.ts',
    ]) {
      expect(map).toContain(contract);
    }
    expect(map).toContain('capacidades aditivas');
  });

  it('declares Aprendizados as non-authoritative for runtime classification', () => {
    expect(map).toContain('excluem `Aprendizados/**` como autoridade operacional');
  });
});
