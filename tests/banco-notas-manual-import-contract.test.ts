import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const app = readFileSync(join(root, 'src/banco-notas/BancoNotasApp.tsx'), 'utf8');
const page = readFileSync(join(root, 'src/banco-notas/ImportacoesPage.tsx'), 'utf8');
const api = readFileSync(join(root, 'server/banco-notas/api.ts'), 'utf8');
const service = readFileSync(join(root, 'server/banco-notas/manual-import.ts'), 'utf8');
const openapi = readFileSync(join(root, 'api/banco-notas-import-analysis-v1.openapi.yaml'), 'utf8');
const decision = readFileSync(
  join(root, 'docs/banco-notas/DECISAO_UPLOAD_MANUAL_V1_2026-08-30.md'),
  'utf8',
);

describe('Banco de Notas Upload Manual V1 contract', () => {
  it('exposes a canonical HeroUI import route and no raw HTML form controls', () => {
    expect(app).toContain("['/importacoes', 'Importações', Upload]");
    expect(app).toContain('<Route path="importacoes" element={<ImportacoesPage />} />');
    expect(page).toContain("from '@heroui/react'");
    expect(page).toContain('Cópia da planilha (.xlsx)');
    expect(page).not.toMatch(/<(?:input|select|option)\b/u);
  });

  it('keeps XLSB conversion explicit and the original workbook untouched', () => {
    expect(page).toContain('Salvar uma cópia');
    expect(page).toContain('não altera o arquivo original');
    expect(decision).toContain('O arquivo original não é alterado pelo Banco.');
    expect(decision).toContain('Pasta de Trabalho do Excel (*.xlsx)');
  });

  it('requires server-side authorization, hashing and position identity', () => {
    expect(api).toContain("requireCapability(capabilities, 'grades.import.run')");
    expect(service).toContain("crypto.subtle.digest('SHA-256'");
    expect(service).toContain('manual_import_student_position_required');
    expect(service).toContain("uploadMode: 'manual-xlsx-v1'");
  });

  it('documents the single-operation binary boundary and no XLSB body', () => {
    expect(openapi).toContain('/v1/manual-imports:');
    expect(openapi).toContain('uploadManualTeacherWorkbook');
    const manualPath = openapi.slice(
      openapi.indexOf('/v1/manual-imports:'),
      openapi.indexOf('/v1/import-analysis-profiles:'),
    );
    expect(manualPath).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(manualPath).not.toContain('application/vnd.ms-excel.sheet.binary.macroenabled.12');
  });
});
