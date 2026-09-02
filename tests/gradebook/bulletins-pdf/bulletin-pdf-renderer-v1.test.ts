import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SubjectId, TeachingAssignmentId } from '../../../shared/gradebook-contracts/entities';
import {
  BULLETIN_PDF_LIMITS_V1,
  BulletinPdfRendererErrorV1,
  assembleBulletinRasterPdfV1,
  buildBulletinPdfLinesV1,
  inspectBulletinPdfInputV1,
} from '../../../src/features/gradebook/bulletins/pdf/bulletin-pdf-renderer-v1';
import {
  bulletinSnapshotFixtureV1,
  compositionBulletinModelV1,
  detailedBulletinModelV1,
  syntheticBulletinModelV1,
} from './bulletin-pdf-fixtures-v1';

function renderedText(model = compositionBulletinModelV1()): string {
  return buildBulletinPdfLinesV1({ snapshot: bulletinSnapshotFixtureV1(model) })
    .flatMap((line) => (line.kind === 'text' ? [line.text] : []))
    .join('\n');
}

describe('Boletins PDF renderer V1', () => {
  it('deriva synthetic, composition e detailed exclusivamente do modelo/snapshot canônico', () => {
    for (const model of [syntheticBulletinModelV1(), compositionBulletinModelV1(), detailedBulletinModelV1()]) {
      const snapshot = bulletinSnapshotFixtureV1(model);
      const readiness = inspectBulletinPdfInputV1({ snapshot });
      const text = renderedText(model);

      expect(readiness).toEqual({ status: 'ready' });
      expect(text).toContain('Álvaro José Çã — София');
      expect(text).toContain(`Boletim escolar — ${model.modelKind === 'synthetic' ? 'Sintético' : model.modelKind === 'composition' ? 'Composição' : 'Detalhado'}`);
      expect(text).toContain('Snapshot: bulletin-snapshot:synthetic:unicode · versão 3 · modelVersion 1');
      expect(text).toContain('Autoridade acadêmica: imported-source');
    }
  });

  it('preserva official-zero, legacy-zero, absent, not-applicable, insufficient-data e imported/calculated sem reinterpretar', () => {
    const syntheticText = renderedText(syntheticBulletinModelV1());
    const compositionText = renderedText(compositionBulletinModelV1());

    expect(syntheticText).toContain('Importado: 0 — zero oficial · Calculado: 0 — zero legado');
    expect(syntheticText).toContain('Importado: Ausente · Calculado: Dados insuficientes — synthetic-unresolved');
    expect(compositionText).toContain('Importado: Não aplicável — synthetic-not-applicable · Calculado: Não aplicável — synthetic-not-applicable');
    expect(compositionText).toContain('Aplicabilidade da recuperação paralela — Importado: Não aplicável — synthetic-threshold-not-met · Calculado: Dados insuficientes — synthetic-applicability-unresolved');
    expect(compositionText).toContain('Cobertura: insufficient-data · 1/2 itens resolvidos · motivos: synthetic-missing-result');
  });

  it('preserva composição completa, avaliações detalhadas e resultado anual sem recriar regra acadêmica', () => {
    const compositionText = renderedText(compositionBulletinModelV1());
    const detailedText = renderedText(detailedBulletinModelV1());

    for (const label of [
      'Quantitativo original',
      'Recuperação paralela',
      'Quantitativo considerado',
      'Qualitativo operacional',
      'Nota oficial',
      'Percentual',
      'Total original',
      'Total pós-recuperação',
      'Estado acadêmico — Importado: eligible-for-council · Calculado: approved-after-recovery',
      'Decisão final — Registrada · approved · class-council · approved-by-council',
    ]) {
      expect(compositionText).toContain(label);
    }
    expect(detailedText).toContain('Avaliações');
    expect(detailedText).toContain('Avaliação — Funções e proporções');
    expect(detailedText).toContain('Aplicabilidade: Não aplicável — synthetic-not-applicable');
  });

  it('mantém Unicode/acentuação visível e usa a Geist já empacotada sem fonte remota ou do sistema', () => {
    const text = renderedText(detailedBulletinModelV1());
    const source = readFileSync(
      join(process.cwd(), 'src/features/gradebook/bulletins/pdf/bulletin-pdf-renderer-v1.ts'),
      'utf8',
    );

    expect(text).toContain('Álvaro José Çã — София');
    expect(text).toContain('Matemática — Álgebra e Razão');
    expect(source).toContain("const PDF_FONT_FAMILY = 'Geist Variable'");
    expect(source).toContain('document.fonts.load');
    expect(source).not.toContain('http://');
    expect(source).not.toContain('https://');
  });

  it('gera envelope PDF raster sem metadata acadêmica oculta', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const bytes = assembleBulletinRasterPdfV1([
      { jpeg, widthPixels: 1191, heightPixels: 1684 },
      { jpeg, widthPixels: 1191, heightPixels: 1684 },
    ]);
    const binary = Buffer.from(bytes).toString('latin1');

    expect(binary.startsWith('%PDF-1.4')).toBe(true);
    expect(binary).toContain('/Type /Catalog');
    expect(binary).toContain('/Count 2');
    expect(binary).toContain('/DCTDecode');
    expect(binary.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(binary).not.toContain('/Info');
    expect(binary).not.toContain('issuer:synthetic:server');
    expect(binary).not.toContain('data:synthetic:pdf:v1');
    expect(binary).not.toContain('student:synthetic:unicode');
  });

  it('falha fechado para snapshot incoerente e bounds antes da renderização', () => {
    const invalid = { ...bulletinSnapshotFixtureV1(), snapshotVersion: 0 };
    expect(inspectBulletinPdfInputV1({ snapshot: invalid })).toEqual({
      status: 'invalid-input',
      reason: 'canonical-snapshot-required',
    });

    const base = syntheticBulletinModelV1();
    if (base.modelKind !== 'synthetic') throw new Error('unexpected fixture');
    const firstSubject = base.subjects[0];
    if (firstSubject === undefined) throw new Error('missing fixture subject');
    const oversizedModel = {
      ...base,
      subjects: Array.from({ length: BULLETIN_PDF_LIMITS_V1.maxSubjects + 1 }, (_, index) => ({
        ...firstSubject,
        subject: {
          ...firstSubject.subject,
          id: `subject:synthetic:${index}` as SubjectId,
          teachingAssignmentId: `assignment:synthetic:${index}` as TeachingAssignmentId,
          displayName: `Componente sintético ${index}`,
        },
      })),
    };
    expect(inspectBulletinPdfInputV1({ snapshot: bulletinSnapshotFixtureV1(oversizedModel) })).toEqual({
      status: 'bounds-exceeded',
      reason: 'subject-limit',
    });

    expect(() => assembleBulletinRasterPdfV1(
      Array.from({ length: BULLETIN_PDF_LIMITS_V1.maxPages + 1 }, () => ({
        jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
        widthPixels: 1191,
        heightPixels: 1684,
      })),
    )).toThrowError(BulletinPdfRendererErrorV1);
  });

  it('não contém motor acadêmico, leitura HTTP ou persistência de dados no renderer', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/features/gradebook/bulletins/pdf/bulletin-pdf-renderer-v1.ts'),
      'utf8',
    );

    for (const forbidden of [
      'resolveNativeAnnualOutcome(',
      'resolveNativeFinalRecovery(',
      'roundAcademicGrade(',
      'composeNativeTerm',
      'maximum *',
      'fetch(',
      '/api/gradebook/',
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'caches.open',
    ]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).toContain('buildBulletinPdfLinesV1(input: BulletinPdfInputV1)');
    expect(source).toContain('const { snapshot } = input');
  });
});
