import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Boletins PDF arquitetura V1', () => {
  const emission = source('server/gradebook/application/bulletins/bulletin-emission-service-v1.ts');
  const workspace = source('server/gradebook/application/bulletins/bulletin-workspace-service-v1.ts');
  const transport = source('shared/gradebook-contracts/bulletins/bulletin-transport-v1.ts');
  const page = source('src/features/gradebook/bulletins/bulletin-page.tsx');
  const renderer = source('src/features/gradebook/bulletins/pdf/bulletin-pdf-renderer-v1.ts');
  const presentation = source('src/features/gradebook/bulletins/bulletin-presentation-v1.ts');

  it('ancora PDF oficial em BulletinSnapshotV1 recebido da emissão existente', () => {
    expect(workspace).toContain('emission: await emission.emit(request.request, context)');
    expect(transport).toContain('readonly emission: BulletinEmissionResultV1');
    expect(page).toContain('setSnapshot(response.emission.snapshot)');
    expect(page).toContain("runPdfAction('download', snapshot)");
    expect(page).toContain("runPdfAction('print', snapshot)");
    expect(renderer).toContain('renderBulletinPdfV1(input: BulletinPdfInputV1)');
    expect(renderer).toContain('const lines = buildBulletinPdfLinesV1(input)');
  });

  it('mantém reimpressão histórica sem leitura/materialização acadêmica atual nem nova versão', () => {
    const reprintSection = emission.split('async reprint(request, authorization) {')[1]?.split('async emitBatch(request, context) {')[0] ?? '';

    expect(reprintSection).toContain('dependencies.snapshots.getHistorical');
    expect(reprintSection).toContain("source: 'historical-snapshot'");
    expect(reprintSection).toContain('snapshot: freezeBulletinSnapshotV1(historical)');
    expect(reprintSection).not.toContain('materializer.materialize');
    expect(reprintSection).not.toContain('academicRecords');
    expect(reprintSection).not.toContain('dependencies.now');
    expect(reprintSection).not.toContain('createSnapshotId');
    expect(reprintSection).not.toContain('snapshots.append');
    expect(page).toContain('setSnapshot(response.reprint.snapshot)');
  });

  it('não cria segundo bridge nem geração server-side para PDF', () => {
    expect(renderer).not.toContain('/api/gradebook/');
    expect(renderer).not.toContain('fetch(');
    expect(page).toContain("const result = action === 'download'");
    expect(transport).not.toContain("operation: 'pdf'");
  });

  it('compartilha os mesmos formatadores semânticos entre preview e PDF', () => {
    for (const helper of [
      'bulletinGradeValueLabelV1',
      'bulletinApplicabilityLabelV1',
      'bulletinCoverageLabelV1',
      'bulletinAcademicStateLabelV1',
      'bulletinFinalDecisionLabelV1',
      'bulletinPeriodLabelV1',
      'bulletinModelLabelV1',
    ]) {
      expect(presentation).toContain(`function ${helper}`);
      expect(page).toContain(helper);
      expect(renderer).toContain(helper);
    }

    for (const field of [
      'term.quantitative.original',
      'term.quantitative.parallelRecovery',
      'term.quantitative.parallelRecoveryApplicability',
      'term.quantitative.considered',
      'term.qualitativeOperational',
      'term.officialGrade',
      'term.percentage',
      'annualResult.originalTotal',
      'annualResult.postRecoveryTotal',
      'annualResult.academicState',
      'annualResult.finalDecision',
    ]) {
      expect(page).toContain(field);
      expect(renderer).toContain(field);
    }
  });

  it('preserva fallback: erro do renderer não destrói preview/modelo na tela', () => {
    const pdfActionSection = page.split('const runPdfAction = async')[1]?.split('return (')[0] ?? '';
    expect(pdfActionSection).toContain("setPdfState('error')");
    expect(pdfActionSection).toContain('O boletim canônico permanece legível na tela');
    expect(pdfActionSection).not.toContain('setPreviewModel(null)');
    expect(pdfActionSection).not.toContain('setSnapshot(null)');
  });
});
