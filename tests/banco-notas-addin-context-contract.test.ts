// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('Banco de Notas cotidiano add-in published contracts', () => {
  it('documents the read-only bearer endpoint, ownership outcomes and minimized DTO', () => {
    const contract = readFileSync(
      join(root, 'api/banco-notas-addin-context-v1.openapi.yaml'),
      'utf8',
    );
    expect(contract).toContain('/v1/addin/context:');
    expect(contract).toContain('delegatedBearer');
    expect(contract).toContain("'403'");
    expect(contract).toContain('knownAbsent');
    expect(contract).toContain('baselineEventId');
    expect(contract).toContain('baselineSequence');
    expect(contract).toContain('sync_disabled_by_administration');
    expect(contract).not.toMatch(/teacherModelId|entraObjectId|tenantId|driveItemId/iu);
  });

  it('keeps the operational document explicit about governed writes and staged rollout', () => {
    const document = readFileSync(join(root, 'docs/BANCO_NOTAS_ADDIN_COTIDIANO_V1.md'), 'utf8');
    expect(document).toContain('Analisar novamente');
    expect(document).toContain('Sincronizar alterações');
    expect(document).toContain('piloto elegível');
    expect(document).toContain('sync_enabled=0');
    expect(document).toContain('endpoint legado de grade-events continua desconectado');
  });
});
