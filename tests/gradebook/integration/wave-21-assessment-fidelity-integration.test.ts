import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type {
  AcademicYearId,
  EnrollmentId,
  StudentId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import {
  NATIVE_TERM_COMPOSITION_PROFILE_2026_V1,
  composeNativeTermResult,
} from '../../../src/gradebook-domain/calculations/term/compose-native-term-result';
import { materializeAssessmentDefinitionsV2 } from '../../../src/features/gradebook/import/assessment-definition-materializer-v2';
import { recognizeWorkbook } from '../../../src/features/gradebook/import/spreadsheet-recognizer';
import {
  evaluateGradebookProductionReadinessPreparationV1,
  GRADEBOOK_PRODUCTION_HARD_STOPS_V1,
  GRADEBOOK_READINESS_PREPARATION_EVIDENCE_V1,
} from '../../../server/gradebook/readiness/production-readiness-v1';
import {
  SYNTHETIC_FILES,
  SYNTHETIC_TEACHER_WORKBOOK,
  createSyntheticFile,
  createSyntheticSheetJs,
} from '../fixtures/synthetic-teacher-workbooks';

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('integração final da onda 21 — fidelidade das avaliações trimestrais', () => {
  it('reconhece cabeçalhos V2 separados dos alunos e materializa os slots corretos', async () => {
    const fileSha256 = '9'.repeat(64);
    const gradeSheet = recognizeWorkbook(
      createSyntheticFile(SYNTHETIC_FILES.xlsx),
      SYNTHETIC_TEACHER_WORKBOOK,
      createSyntheticSheetJs(),
      { fileSha256 },
    ).gradeSheets.find(({ name }) => name === '6A1º');
    if (!gradeSheet) throw new Error('Guia sintética regular ausente.');

    expect(gradeSheet.students[0]?.row).toBe(5);
    expect(gradeSheet.assessmentDefinitions.map(({ sourceSlot }) => sourceSlot)).toEqual([
      'R',
      'S',
      'AA',
      'AB',
      'AC',
      'AD',
      'AE',
      'AF',
      'AG',
      'AH',
      'AI',
      'AJ',
    ]);
    expect(gradeSheet.students.some(({ name }) => name.includes('Pesquisa sobre frações'))).toBe(
      false,
    );

    const materialized = await materializeAssessmentDefinitionsV2(gradeSheet, {
      logicalSourceReference: 'logical-source:wave-21:teacher-a',
      academicYearId: 'academic-year:wave-21:2026' as AcademicYearId,
      teachingAssignmentId: 'teaching-assignment:wave-21:math' as TeachingAssignmentId,
      term: 1,
      students: [
        {
          row: 5,
          studentId: 'student:wave-21:01' as StudentId,
          enrollmentId: 'enrollment:wave-21:01' as EnrollmentId,
        },
      ],
    });

    expect(
      materialized.components.map(({ value }) => [value.type, value.name, value.maximum]),
    ).toEqual([
      ['quantitative-assessment', 'Avaliação quantitativa 1', 8],
      ['quantitative-assessment', 'Avaliação quantitativa 2', 5.5],
      ['qualitative-activity', 'Pesquisa sobre frações', 3],
      ['qualitative-activity', 'Seminário', 4],
      ['qualitative-activity', 'Leitura e síntese', 2.5],
    ]);
    expect(JSON.stringify(materialized)).not.toContain('simulation');
    expect(
      materialized.blockedDefinitions.every(
        ({ gradeEntriesMaterialized }) => gradeEntriesMaterialized === 0,
      ),
    ).toBe(true);
    expect(
      materialized.gradeEntries.map(
        ({ assessmentComponentId, value }) =>
          `${assessmentComponentId}:${value.imported.evidence[0]?.provenance.cellAddress}`,
      ),
    ).toEqual(
      expect.arrayContaining([expect.stringContaining(':R5'), expect.stringContaining(':S5')]),
    );
  });

  it('mantém agregados e o motor 2026 independentes do enriquecimento granular', () => {
    const profile = NATIVE_TERM_COMPOSITION_PROFILE_2026_V1;
    const result = composeNativeTermResult(
      {
        term: 1,
        quantitativeConsidered: { state: 'numeric', value: 10 },
        qualitativeOperational: { state: 'numeric', value: 12.37 },
      },
      profile,
    );

    expect(profile.termMaximums).toEqual({ 1: 30, 2: 30, 3: 40 });
    expect(profile.quantitativeWeight).toBe(0.45);
    expect(profile.qualitativeWeight).toBe(0.55);
    expect(result.nativeGrade).toEqual({ state: 'numeric', value: 22.5 });

    const recognizer = source('src/features/gradebook/import/spreadsheet-recognizer.ts');
    expect(recognizer).toContain(
      'quantitativeTotal: readGrades ? readNote(sheet, `T${row}`) : null',
    );
    expect(recognizer).toContain(
      'qualitativeTotal: readGrades ? readNote(sheet, `AK${row}`) : null',
    );
    expect(recognizer).toContain('official: readGrades ? readNote(sheet, `AM${row}`) : null');
    expect(recognizer).toContain('annual: readGrades ? readNote(sheet, `AN${row}`) : null');
    expect(recognizer).not.toContain('simulation:');
  });

  it('reutiliza o planejador, executor, CAS e transação oficiais sem pipeline concorrente', () => {
    const reconciliation = source(
      'server/gradebook/application/import/assessment-import-reconciliation-v2.ts',
    );
    const executor = source(
      'server/gradebook/application/import/execution/execute-import-change-plan-v1.ts',
    );

    expect(reconciliation).toContain('planImportReconciliation(');
    expect(reconciliation).toContain('planningRepositoriesWithBulkPrefetch(recordsInput, repositories)');
    expect(executor).toContain('runBatchPromotion(');
    expect(executor).toContain('unitOfWork.entities.appendVersion(');
    expect(executor).toContain('unitOfWork.academicRecords.appendVersion(');
    expect(executor).toContain('expectedVersion: item.expectedVersion');
    expect(reconciliation).not.toContain('delete');
  });

  it('preserva Desempenho, relatórios e boletins V1 com componentes V2', () => {
    const performanceContract = source(
      'shared/gradebook-contracts/performance/class-performance-read-model-v1.ts',
    );
    const performanceSource = source(
      'server/gradebook/persistence/d1/performance/d1-class-performance-source-v1.ts',
    );
    const performanceTests = source(
      'tests/gradebook/performance-source/d1-class-performance-source-v1.test.ts',
    );
    const bulletinContract = source('shared/gradebook-contracts/bulletins/bulletin-contract-v1.ts');
    const bulletinTests = source('tests/gradebook/bulletins/bulletin-emission-service-v1.test.ts');
    const reportsContract = source(
      'shared/gradebook-contracts/reports/institutional-reports-contract-v1.ts',
    );

    expect(performanceContract).toContain('AssessmentComponentTypeV1 | AssessmentComponentTypeV2');
    expect(performanceSource).toContain('resolvePerformanceComparisonProjectionV2');
    expect(performanceSource).not.toContain('tolerance');
    expect(performanceTests).toContain('expect(small.count).toBe(6)');
    expect(performanceTests).toContain('expect(large.count).toBe(6)');
    expect(bulletinContract).toContain('AssessmentComponentTypeV1 | AssessmentComponentTypeV2');
    expect(bulletinTests).toContain("source: 'historical-snapshot'");
    expect(bulletinTests).toContain('expect(fixture.calls).toEqual(callsBeforeReprint)');
    expect(reportsContract).toContain('ClassPerformanceReadModelV1');
  });

  it('preserva readiness histórico e reconhece o catálogo local atual 0001–0005', () => {
    const migrations = readdirSync(join(root, 'migrations/gradebook')).sort();
    expect(migrations).toEqual([
      '0001_gradebook_context_entities_imports_v1.sql',
      '0002_gradebook_records_audit_v1.sql',
      '0003_logical_source_record_catalog_v1.sql',
      '0004_bulletin_council_durability_v1.sql',
      '0005_council_session_durability_v2.sql',
    ]);

    const readiness = evaluateGradebookProductionReadinessPreparationV1({
      authorityMode: 'imported-source',
      productionAcademicRuntimeEnabled: false,
      productionD1BindingPresent: false,
      remoteMigrationsApplied: false,
      realPilotExecuted: false,
      completedEvidence: GRADEBOOK_READINESS_PREPARATION_EVIDENCE_V1,
    });
    expect(readiness.status).toBe('prepared-for-manual-authorization');
    expect(readiness.hardStops).toEqual(GRADEBOOK_PRODUCTION_HARD_STOPS_V1);
    expect(readiness.hardStops).toHaveLength(5);
  });
});
