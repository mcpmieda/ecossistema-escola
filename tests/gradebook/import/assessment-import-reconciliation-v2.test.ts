import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  EnrollmentId,
  StudentId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import type {
  ImportBatchResultV1,
  SourceFileManifestV1,
} from '../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  ImportBatchId,
  ImportFileId,
  SourceFileManifestId,
} from '../../../shared/gradebook-contracts/imports/import-ids-v1';
import type { LogicalSourceIdV1 } from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import { materializeAssessmentDefinitionsV2 } from '../../../src/features/gradebook/import/assessment-definition-materializer-v2';
import {
  recognizeWorkbook,
  type GradeSheetRecognition,
} from '../../../src/features/gradebook/import/spreadsheet-recognizer';
import {
  planAssessmentImportReconciliationV2,
  type AssessmentImportChangePlanV2,
} from '../../../server/gradebook/application/import/assessment-import-reconciliation-v2';
import { executeImportChangePlan } from '../../../server/gradebook/application/import/execution/execute-import-change-plan-v1';
import { academicRecordStreamForV1 } from '../../../server/gradebook/application/import/import-reconciliation-v1';
import { MemoryPersistenceAdapter } from '../persistence/ports/memory-persistence-adapter';
import {
  SYNTHETIC_FILES,
  SYNTHETIC_TEACHER_WORKBOOK,
  createSyntheticFile,
  createSyntheticSheetJs,
} from '../fixtures/synthetic-teacher-workbooks';

const academicYearId = 'academic-year:assessment-reconciliation:2026' as AcademicYearId;
const teachingAssignmentId =
  'teaching-assignment:assessment-reconciliation:mathematics' as TeachingAssignmentId;
const logicalSourceId = 'logical-source:assessment-reconciliation:teacher-a' as LogicalSourceIdV1;

function recognizedSheet(hash: string, name = '6A1º'): GradeSheetRecognition {
  const result = recognizeWorkbook(
    createSyntheticFile(SYNTHETIC_FILES.xlsx),
    SYNTHETIC_TEACHER_WORKBOOK,
    createSyntheticSheetJs(),
    { fileSha256: hash },
  ).gradeSheets.find((candidate) => candidate.name === name);
  if (!result) throw new Error(`Guia sintética ausente: ${name}`);
  return result;
}

function materializationContext() {
  return {
    logicalSourceReference: logicalSourceId,
    academicYearId,
    teachingAssignmentId,
    term: 1 as const,
    students: [
      {
        row: 5,
        studentId: 'student:assessment-reconciliation:01' as StudentId,
        enrollmentId: 'enrollment:assessment-reconciliation:01' as EnrollmentId,
      },
    ],
  };
}

function manifest(hash: string): SourceFileManifestV1 {
  return {
    id: `source-file-manifest:${hash}` as SourceFileManifestId,
    fileName: `avaliacoes-${hash[0]}.xlsx`,
    extension: 'xlsx',
    reportedMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sizeBytes: 4096,
    lastModifiedAt: '2026-09-02T12:00:00.000Z',
    sha256: hash,
    sourceContractVersion: 2,
    parserVersion: 'synthetic-v2',
    readAt: '2026-09-02T12:00:00.000Z',
    confirmedAcademicYearId: academicYearId,
  };
}

function batch(index: number, sourceManifest: SourceFileManifestV1): ImportBatchResultV1 {
  const importFileId = `import-file:assessment-reconciliation:${index}` as ImportFileId;
  return {
    id: `import-batch:assessment-reconciliation:${index}` as ImportBatchId,
    status: 'approved',
    files: [
      {
        id: importFileId,
        sourceFile: {
          fileName: sourceManifest.fileName,
          extension: sourceManifest.extension,
          reportedMimeType: sourceManifest.reportedMimeType,
          sizeBytes: sourceManifest.sizeBytes,
          lastModifiedAt: sourceManifest.lastModifiedAt,
        },
        manifest: sourceManifest,
        status: 'approved',
        diagnosticIds: [],
      },
    ],
    diagnostics: [],
    receivedAt: sourceManifest.readAt,
    updatedAt: sourceManifest.readAt,
    summary: {
      totalFileCount: 1,
      processedFileCount: 1,
      approvedFileCount: 1,
      reviewRequiredFileCount: 0,
      rejectedFileCount: 0,
      failedFileCount: 0,
      informationCount: 0,
      warningCount: 0,
      blockingErrorCount: 0,
      criticalErrorCount: 0,
    },
  };
}

async function seedBatch(adapter: MemoryPersistenceAdapter, value: ImportBatchResultV1) {
  const result = await adapter.unitOfWork.imports.appendImportBatchVersion(
    { academicYearId },
    value,
    { expectedVersion: null },
  );
  expect(result.status).toBe('written');
}

async function plan(
  adapter: MemoryPersistenceAdapter,
  index: number,
  hash: string,
  sheet: GradeSheetRecognition,
): Promise<AssessmentImportChangePlanV2> {
  const sourceManifest = manifest(hash);
  const importBatch = batch(index, sourceManifest);
  await seedBatch(adapter, importBatch);
  const materialization = await materializeAssessmentDefinitionsV2(sheet, materializationContext());
  return planAssessmentImportReconciliationV2(
    {
      context: { academicYearId },
      batch: importBatch,
      expectedBatchVersion: 1,
      files: [
        {
          importFileId: importBatch.files[0]!.id,
          logicalSource: { state: 'confirmed', logicalSourceId },
          materialization,
        },
      ],
    },
    adapter.unitOfWork,
  );
}

describe('reconciliação transacional das avaliações V2', () => {
  it('faz leituras independentes em paralelo bounded sem alterar o plano determinístico', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const hash = '0'.repeat(64);
    const sourceManifest = manifest(hash);
    const importBatch = batch(1, sourceManifest);
    await seedBatch(adapter, importBatch);
    const materialization = await materializeAssessmentDefinitionsV2(
      recognizedSheet(hash),
      materializationContext(),
    );
    const activity = {
      components: 0,
      componentMaximum: 0,
      records: 0,
      recordMaximum: 0,
      associations: 0,
      associationMaximum: 0,
    };
    const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
    const repositories = {
      ...adapter.unitOfWork,
      entities: {
        ...adapter.unitOfWork.entities,
        get: async (...args: Parameters<typeof adapter.unitOfWork.entities.get>) => {
          activity.components += 1;
          activity.componentMaximum = Math.max(activity.componentMaximum, activity.components);
          await pause();
          try {
            return await adapter.unitOfWork.entities.get(...args);
          } finally {
            activity.components -= 1;
          }
        },
      },
      academicRecords: {
        ...adapter.unitOfWork.academicRecords,
        getCurrent: async (...args: Parameters<typeof adapter.unitOfWork.academicRecords.getCurrent>) => {
          activity.records += 1;
          activity.recordMaximum = Math.max(activity.recordMaximum, activity.records);
          await pause();
          try {
            return await adapter.unitOfWork.academicRecords.getCurrent(...args);
          } finally {
            activity.records -= 1;
          }
        },
      },
      logicalSourceRecords: {
        ...adapter.unitOfWork.logicalSourceRecords,
        getCurrent: async (
          ...args: Parameters<typeof adapter.unitOfWork.logicalSourceRecords.getCurrent>
        ) => {
          activity.associations += 1;
          activity.associationMaximum = Math.max(
            activity.associationMaximum,
            activity.associations,
          );
          await pause();
          try {
            return await adapter.unitOfWork.logicalSourceRecords.getCurrent(...args);
          } finally {
            activity.associations -= 1;
          }
        },
      },
    };

    const result = await planAssessmentImportReconciliationV2(
      {
        context: { academicYearId },
        batch: importBatch,
        expectedBatchVersion: 1,
        files: [
          {
            importFileId: importBatch.files[0]!.id,
            logicalSource: { state: 'confirmed', logicalSourceId },
            materialization,
          },
        ],
      },
      repositories,
    );

    expect(activity).toMatchObject({
      componentMaximum: 4,
      recordMaximum: 4,
      associationMaximum: 4,
    });
    expect(result.assessmentComponentPlanV2.counts).toEqual({
      unchanged: 0,
      new: 5,
      changed: 0,
      blocked: 7,
    });
    expect(result.counts).toMatchObject({ new: 4, changed: 0, blocked: 0 });
    const stableKeys = result.items.flatMap((item) =>
      item.stableKey === undefined ? [] : [item.stableKey],
    );
    expect(stableKeys).toEqual(
      [...stableKeys].sort((left, right) => left.localeCompare(right)),
    );
  });

  it('promove componentes e GradeEntry juntos, e reimportação idêntica não cria versão extra', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const hash = '1'.repeat(64);
    const first = await plan(adapter, 1, hash, recognizedSheet(hash));
    expect(first.assessmentComponentPlanV2.counts).toEqual({
      unchanged: 0,
      new: 5,
      changed: 0,
      blocked: 7,
    });
    expect(first.counts).toMatchObject({ new: 4, changed: 0, blocked: 0 });

    const execution = await executeImportChangePlan(first, adapter);
    expect(execution).toMatchObject({
      status: 'applied',
      transactionCommitted: true,
      plannedWrites: { academicEntityVersions: 5 },
      committedWrites: { academicEntityVersions: 5 },
    });
    expect(execution.appliedVersions.academicEntities).toHaveLength(5);

    const secondBatch = batch(2, manifest(hash));
    await seedBatch(adapter, secondBatch);
    const materialization = await materializeAssessmentDefinitionsV2(
      recognizedSheet(hash),
      materializationContext(),
    );
    const second = await planAssessmentImportReconciliationV2(
      {
        context: { academicYearId },
        batch: secondBatch,
        expectedBatchVersion: 1,
        files: [
          {
            importFileId: secondBatch.files[0]!.id,
            logicalSource: { state: 'confirmed', logicalSourceId },
            materialization,
          },
        ],
      },
      adapter.unitOfWork,
    );
    expect(second.assessmentComponentPlanV2.counts).toMatchObject({
      unchanged: 5,
      new: 0,
      changed: 0,
    });
    expect((await executeImportChangePlan(second, adapter)).status).toBe('no-changes');
    const component = materialization.components[0]!;
    expect(
      (
        await adapter.unitOfWork.entities.get(
          { academicYearId },
          { kind: 'assessment-component', id: component.value.id },
        )
      )?.version,
    ).toBe(1);
  });

  it('mudança real de nome/máximo versiona a mesma definição sem versionar notas iguais', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const firstHash = '2'.repeat(64);
    const firstPlan = await plan(adapter, 1, firstHash, recognizedSheet(firstHash));
    expect((await executeImportChangePlan(firstPlan, adapter)).status).toBe('applied');

    const secondHash = '3'.repeat(64);
    const original = recognizedSheet(secondHash);
    const changedAa = recognizedSheet(secondHash, '6A2º').assessmentDefinitions.find(
      (definition) => definition.sourceSlot === 'AA',
    )!;
    const changedSheet = {
      ...original,
      assessmentDefinitions: original.assessmentDefinitions.map((definition) =>
        definition.sourceSlot === 'AA' ? changedAa : definition,
      ),
    };
    const secondPlan = await plan(adapter, 2, secondHash, changedSheet);
    expect(secondPlan.assessmentComponentPlanV2.counts).toMatchObject({
      unchanged: 4,
      changed: 1,
    });
    expect(secondPlan.counts).toMatchObject({ unchanged: 4, changed: 0, new: 0 });
    const execution = await executeImportChangePlan(secondPlan, adapter);
    expect(execution.status).toBe('applied');

    const changed = secondPlan.assessmentComponentPlanV2.items.find(
      (item) => item.state === 'changed',
    );
    if (!changed || changed.state !== 'changed') throw new Error('Componente alterado ausente.');
    const persisted = await adapter.unitOfWork.entities.get(
      { academicYearId },
      { kind: 'assessment-component', id: changed.incomingRecord.value.id },
    );
    expect(persisted).toMatchObject({
      version: 2,
      value: { value: { name: 'Pesquisa sobre frações — versão revisada', maximum: 4 } },
    });
  });

  it('mudança só do aluno versiona seu GradeEntry sem recriar a definição', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const firstHash = '4'.repeat(64);
    const initial = await plan(adapter, 1, firstHash, recognizedSheet(firstHash));
    expect((await executeImportChangePlan(initial, adapter)).status).toBe('applied');

    const secondHash = '5'.repeat(64);
    const current = recognizedSheet(secondHash);
    const changedSheet: GradeSheetRecognition = {
      ...current,
      students: current.students.map((student) =>
        student.row === 5
          ? {
              ...student,
              quantitativeAssessments: [
                { source: 6, value: 6, kind: 'manual' },
                student.quantitativeAssessments[1],
              ],
            }
          : student,
      ),
    };
    const changed = await plan(adapter, 2, secondHash, changedSheet);
    expect(changed.assessmentComponentPlanV2.counts).toMatchObject({ unchanged: 5, changed: 0 });
    expect(changed.counts).toMatchObject({ unchanged: 3, changed: 1, new: 0 });
    expect((await executeImportChangePlan(changed, adapter)).status).toBe('applied');

    const changedEntry = changed.items.find((item) => item.state === 'changed');
    if (!changedEntry || changedEntry.state !== 'changed')
      throw new Error('GradeEntry alterado ausente.');
    const persisted = await adapter.unitOfWork.academicRecords.getCurrent(
      { academicYearId },
      academicRecordStreamForV1(changedEntry.incomingRecord),
    );
    if (persisted?.value.kind !== 'grade-entry') throw new Error('GradeEntry persistido ausente.');
    expect(persisted?.version).toBe(2);
    expect(persisted.value.value.value.imported.value).toEqual({ state: 'numeric', value: 6 });
  });

  it('slot omitido/ambíguo não apaga histórico e fica missing-from-new-source para revisão', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const firstHash = '6'.repeat(64);
    const initial = await plan(adapter, 1, firstHash, recognizedSheet(firstHash));
    expect((await executeImportChangePlan(initial, adapter)).status).toBe('applied');
    const initialS = initial.assessmentComponentPlanV2.items.find(
      (item) =>
        item.state === 'new' && item.incomingRecord.value.name === 'Avaliação quantitativa 2',
    );
    if (!initialS || initialS.state !== 'new') throw new Error('Componente S inicial ausente.');

    const secondHash = '7'.repeat(64);
    const source = recognizedSheet(secondHash);
    const ambiguousS = recognizedSheet(secondHash, '6A2º').assessmentDefinitions.find(
      (definition) => definition.sourceSlot === 'S',
    )!;
    const newSheet = {
      ...source,
      assessmentDefinitions: source.assessmentDefinitions.map((definition) =>
        definition.sourceSlot === 'S' ? ambiguousS : definition,
      ),
    };
    const changed = await plan(adapter, 2, secondHash, newSheet);
    expect(changed.status).toBe('review-required');
    expect(changed.counts['missing-from-new-source']).toBe(1);
    expect(changed.assessmentComponentPlanV2.items).toContainEqual(
      expect.objectContaining({ state: 'blocked', reason: 'maximum-ambiguous-marker' }),
    );
    expect((await executeImportChangePlan(changed, adapter)).status).toBe('no-changes');
    expect(
      (
        await adapter.unitOfWork.entities.get(
          { academicYearId },
          { kind: 'assessment-component', id: initialS.incomingRecord.value.id },
        )
      )?.version,
    ).toBe(1);
  });

  it('fecha a promoção sem órfãos quando o componente persistido é incompatível', async () => {
    const adapter = new MemoryPersistenceAdapter();
    const hash = '8'.repeat(64);
    const sourceManifest = manifest(hash);
    const importBatch = batch(1, sourceManifest);
    await seedBatch(adapter, importBatch);
    const materialization = await materializeAssessmentDefinitionsV2(
      recognizedSheet(hash),
      materializationContext(),
    );
    const firstComponent = materialization.components[0]!.value;
    await adapter.unitOfWork.entities.appendVersion(
      { academicYearId },
      {
        kind: 'assessment-component',
        value: { ...firstComponent, type: 'written' },
      },
      { expectedVersion: null },
    );
    const changePlan = await planAssessmentImportReconciliationV2(
      {
        context: { academicYearId },
        batch: importBatch,
        expectedBatchVersion: 1,
        files: [
          {
            importFileId: importBatch.files[0]!.id,
            logicalSource: { state: 'confirmed', logicalSourceId },
            materialization,
          },
        ],
      },
      adapter.unitOfWork,
    );

    expect(changePlan.assessmentComponentPlanV2.items).toContainEqual(
      expect.objectContaining({ state: 'blocked', reason: 'persisted-component-incompatible' }),
    );
    const execution = await executeImportChangePlan(changePlan, adapter);
    expect(execution).toMatchObject({
      status: 'applied',
      transactionStarted: true,
      transactionCommitted: true,
    });
    const dependentGradeEntry = materialization.gradeEntries.find(
      (entry) => entry.assessmentComponentId === firstComponent.id,
    )!;
    expect(
      await adapter.unitOfWork.academicRecords.getCurrent(
        { academicYearId },
        academicRecordStreamForV1({ kind: 'grade-entry', value: dependentGradeEntry }),
      ),
    ).toBeNull();
    expect(execution.appliedVersions.academicEntities).toHaveLength(4);
  });
});
