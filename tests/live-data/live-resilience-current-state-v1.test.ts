import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('current live resilience documentation', () => {
  it('marks both #839 delivery documents as historical checkpoints', () => {
    expect(read('docs/gradebook/ADMIN_LIVE_CONSUMERS_839.md')).toContain(
      'Checkpoint histórico da #839',
    );
    expect(read('docs/student-portal/LIVE_DELIVERY_RESILIENCE_839.md')).toContain(
      'Checkpoint histórico da #839',
    );
  });

  it('keeps synthetic evidence separate from external homologation', () => {
    const current = read('docs/gradebook/LIVE_RESILIENCE_CURRENT_970.md');
    for (const evidence of [
      'live-coverage-839.test.ts',
      'live-delivery-839.postgres.ts',
      'live-ordering-839.workerd.ts',
      'administrative-live-resilience-839.test.tsx',
      'draft-and-cadence-839.test.tsx',
      'live-refresh-scope-839.test.tsx',
      'read-resilience-839.test.ts',
    ]) {
      expect(current).toContain(evidence);
    }
    expect(current).toContain('O que ainda NÃO está homologado');
    expect(current).toContain('duas sessões autenticadas reais');
    expect(current).toContain('#968/P-12');
  });

  it('preserves CAS, draft and fallback invariants', () => {
    const current = read('docs/gradebook/LIVE_RESILIENCE_CURRENT_970.md');
    expect(current).toContain('CAS/`expectedVersion`');
    expect(current).toContain('um evento live não altera draft');
    expect(current).toContain('uma conexão live não elimina fallback de leitura');
    expect(current).toContain('não há polling zero prometido');
  });
});
