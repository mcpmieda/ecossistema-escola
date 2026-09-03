import type { TeacherId } from '../../../../shared/gradebook-contracts/entities';
import type {
  ImportBatchResultV1,
  SourceFileManifestV1,
} from '../../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  ImportBatchId,
  ImportFileDiagnosticId,
  ImportFileId,
  SourceFileManifestId,
} from '../../../../shared/gradebook-contracts/imports/import-ids-v1';
import type {
  GradebookImportPersistenceIssueV2,
  GradebookImportPersistenceSummaryV2,
  GradebookImportPersistenceWriteCountsV2,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v2';
import {
  GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V4,
  type GradebookImportPersistenceRequestV4,
  type GradebookImportPersistenceResponseV4,
  type GradebookImportTermSheetObservationV4,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v4';
import type { GradebookImportAssessmentDefinitionV1 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v1';
import {
  SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2,
  SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2,
  classifySourceAssessmentMaximumConfigurationV2,
  classifySourceAssessmentNameV2,
  type SourceAssessmentDefinitionV2,
} from '../../../../shared/gradebook-contracts/source/source-contract-v2';
import type {
  AcademicPersistenceContextV1,
  LogicalSourceIdV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type {
  ImportBootstrapTransactionPortV2,
  PersistenceUnitOfWorkV2,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import {
  materializeAssessmentDefinitionsV2,
  type AssessmentDefinitionMaterializationV2,
} from '../../../../src/features/gradebook/import/assessment-definition-materializer-v2';
import type {
  GradeSheetRecognition,
  NoteValue,
  StudentRecognition,
} from '../../../../src/features/gradebook/import/spreadsheet-recognizer';
import { planAssessmentImportReconciliationV2 } from './assessment-import-reconciliation-v2';
import { createImportBootstrapEnvelopeV2 } from './import-bootstrap-v2';
import { executeImportBootstrapChangePlanV2 } from './execution/execute-import-change-plan-v1';
import { resolveLogicalSourceForImportV2 } from './logical-source-resolution-v2';
import {
  materializeGradebookImportOfficialRecordsV4,
  type GradebookImportOfficialRecordMaterializationV4,
} from './import-official-record-materializer-v4';
import type { GradebookImportAnnualStateSourceV1 } from '../../persistence/d1/imports/d1-import-annual-state-source-v1';

export interface GradebookImportPersistenceServiceDependenciesV4 {
  readonly unitOfWork: PersistenceUnitOfWorkV2;
  readonly transaction: ImportBootstrapTransactionPortV2;
  readonly annualStateSource: GradebookImportAnnualStateSourceV1;
  readonly now: () => string;
  readonly createId: (
    kind: 'logical-source' | 'manifest' | 'import-batch' | 'import-file',
  ) => string;
}

const ZERO_STATE_COUNTS = { unchanged: 0, new: 0, changed: 0, blocked: 0 } as const;
const ZERO_RECORD_COUNTS = {
  unchanged: 0,
  new: 0,
  changed: 0,
  missingFromNewSource: 0,
  blocked: 0,
} as const;

function writes(
  input: Omit<GradebookImportPersistenceWriteCountsV2, 'total'>,
): GradebookImportPersistenceWriteCountsV2 {
  return { ...input, total: Object.values(input).reduce((sum, value) => sum + value, 0) };
}

function emptySummary(): GradebookImportPersistenceSummaryV2 {
  const zero = writes({
    logicalSources: 0,
    sourceFileVersions: 0,
    importBatchVersions: 0,
    assessmentComponentVersions: 0,
    academicRecordVersions: 0,
    logicalSourceRecordAssociationVersions: 0,
  });
  return {
    assessmentDefinitions: { total: 0, resolved: 0, blocked: 0 },
    assessmentComponents: ZERO_STATE_COUNTS,
    academicRecords: ZERO_RECORD_COUNTS,
    plannedWrites: zero,
    committedWrites: zero,
  };
}

function issue(
  code: GradebookImportPersistenceIssueV2['code'],
): readonly [GradebookImportPersistenceIssueV2] {
  return [{ code, scope: 'file' }];
}

function reviewFromOfficialMaterialization(
  result: Extract<GradebookImportOfficialRecordMaterializationV4, { readonly status: 'review-required' }>,
): GradebookImportPersistenceResponseV4 {
  return {
    transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V4,
    state: 'review-required',
    summary: emptySummary(),
    issues: issue(
      result.reason === 'incompatible-reference'
        ? 'incompatible-reference'
        : 'invalid-academic-shape',
    ),
  };
}

function definition(
  input: GradebookImportAssessmentDefinitionV1,
  fileName: string,
  sha256: string,
  sheetName: string,
): SourceAssessmentDefinitionV2 {
  const quantitative = SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2.find(
    (slot) => slot.sourceSlot === input.sourceSlot,
  );
  const qualitative = SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2.find(
    (slot) => slot.sourceSlot === input.sourceSlot,
  );
  const slot = quantitative ?? qualitative;
  if (!slot) throw new TypeError('invalid-assessment-slot');
  const rawMaximum =
    input.maximumConfiguration.state === 'missing-field'
      ? undefined
      : input.maximumConfiguration.rawValue;
  const maximumConfiguration = classifySourceAssessmentMaximumConfigurationV2(rawMaximum, {
    fileName,
    fileSha256: sha256,
    sheetName,
    cellAddress: slot.maximumCell,
  });
  if (quantitative)
    return {
      contractVersion: 2,
      kind: 'quantitative-assessment',
      sourceSlot: quantitative.sourceSlot,
      order: quantitative.order,
      structuralLabel: quantitative.structuralLabel,
      maximumConfiguration,
    };
  if (!qualitative || !('name' in input)) throw new TypeError('invalid-assessment-definition');
  const rawName = input.name.state === 'missing-field' ? undefined : input.name.rawValue;
  return {
    contractVersion: 2,
    kind: 'qualitative-activity',
    sourceSlot: qualitative.sourceSlot,
    order: qualitative.order,
    maximumConfiguration,
    name: classifySourceAssessmentNameV2(rawName, {
      fileName,
      fileSha256: sha256,
      sheetName,
      cellAddress: qualitative.nameCell,
    }),
  };
}

function recognizedStudent(
  student: GradebookImportTermSheetObservationV4['students'][number],
): StudentRecognition {
  const values = new Map(
    student.assessmentValues.map((value) => [value.sourceSlot, value.value as NoteValue]),
  );
  return {
    row: student.sourceRow,
    number: '',
    name: '',
    status: '',
    quantitativeAssessments: [values.get('R') ?? null, values.get('S') ?? null],
    quantitativeTotal: null,
    parallel: null,
    qualitative: SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2.map(
      (slot) => values.get(slot.sourceSlot) ?? null,
    ),
    qualitativeTotal: null,
    official: null,
    annual: null,
    termResultObservations: student.aggregates,
    recovery: null,
  };
}

function recognizedSheet(
  sheet: GradebookImportTermSheetObservationV4,
  request: GradebookImportPersistenceRequestV4,
): GradeSheetRecognition {
  return {
    name: sheet.sourceSheetName,
    range: 'transport-v4',
    rows: sheet.students.length,
    columns: 0,
    className: sheet.recognizedContext.classGroupLabel,
    discipline: sheet.recognizedContext.subjectLabel,
    disciplineIndex: sheet.recognizedContext.disciplineIndex,
    stage: `trimester-${sheet.term}` as GradeSheetRecognition['stage'],
    declaredStage: '',
    declaredStudents: null,
    assessmentDefinitions: sheet.assessmentDefinitions.map((value) =>
      definition(value, request.manifest.fileName, request.manifest.sha256, sheet.sourceSheetName),
    ),
    students: sheet.students.map(recognizedStudent),
    formulas: 0,
    officialZeros: 0,
  };
}

function serverBatch(
  request: GradebookImportPersistenceRequestV4,
  teacherId: TeacherId,
  dependencies: GradebookImportPersistenceServiceDependenciesV4,
  knownManifest: SourceFileManifestV1 | null,
): { batch: ImportBatchResultV1; importFileId: ImportFileId } {
  const now = dependencies.now();
  const importBatchId = dependencies.createId('import-batch') as ImportBatchId;
  const importFileId = dependencies.createId('import-file') as ImportFileId;
  const manifest: SourceFileManifestV1 = knownManifest ?? {
    id: dependencies.createId('manifest') as SourceFileManifestId,
    ...request.manifest,
    ...(request.recognizedSuggestions.academicYear === null
      ? {}
      : { suggestedAcademicYear: request.recognizedSuggestions.academicYear }),
    confirmedAcademicYearId: request.confirmedContext.academicYearId,
    ...(request.recognizedSuggestions.teacherName === null
      ? {}
      : { suggestedTeacherName: request.recognizedSuggestions.teacherName }),
    confirmedTeacherId: teacherId,
  };
  const diagnostics = request.diagnostics.map((diagnostic, index) => ({
    id: `import-diagnostic:${importBatchId}:${index}` as ImportFileDiagnosticId,
    importBatchId,
    importFileId,
    sourceFileManifestId: manifest.id,
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.code,
    location:
      diagnostic.scope === 'file'
        ? ({ kind: 'file' } as const)
        : ({ kind: 'sheet', sheetName: diagnostic.sourceSheetName } as const),
  }));
  return {
    importFileId,
    batch: {
      id: importBatchId,
      status: 'approved',
      files: [
        {
          id: importFileId,
          sourceFile: {
            fileName: request.manifest.fileName,
            extension: request.manifest.extension,
            reportedMimeType: request.manifest.reportedMimeType,
            sizeBytes: request.manifest.sizeBytes,
            lastModifiedAt: request.manifest.lastModifiedAt,
          },
          manifest,
          status: 'approved',
          diagnosticIds: diagnostics.map(({ id }) => id),
        },
      ],
      diagnostics,
      summary: {
        totalFileCount: 1,
        processedFileCount: 1,
        approvedFileCount: 1,
        reviewRequiredFileCount: 0,
        rejectedFileCount: 0,
        failedFileCount: 0,
        informationCount: request.diagnostics.filter((value) => value.severity === 'information')
          .length,
        warningCount: request.diagnostics.filter((value) => value.severity === 'warning').length,
        blockingErrorCount: 0,
        criticalErrorCount: 0,
      },
      receivedAt: now,
      updatedAt: now,
    },
  };
}

function summarizePlan(
  plan: Awaited<ReturnType<typeof planAssessmentImportReconciliationV2>>,
  logicalSources: number,
): GradebookImportPersistenceSummaryV2 {
  const definitions = plan.assessmentComponentPlanV2.counts;
  const planned = writes({
    logicalSources,
    sourceFileVersions: plan.estimatedWrites.sourceFileVersions,
    importBatchVersions: 1,
    assessmentComponentVersions: plan.assessmentComponentPlanV2.plannedVersionWrites,
    academicRecordVersions: plan.estimatedWrites.academicRecordVersions,
    logicalSourceRecordAssociationVersions:
      plan.estimatedWrites.logicalSourceRecordAssociationVersions,
  });
  return {
    assessmentDefinitions: {
      total: definitions.unchanged + definitions.new + definitions.changed + definitions.blocked,
      resolved: definitions.unchanged + definitions.new + definitions.changed,
      blocked: definitions.blocked,
    },
    assessmentComponents: definitions,
    academicRecords: {
      unchanged: plan.counts.unchanged,
      new: plan.counts.new,
      changed: plan.counts.changed,
      missingFromNewSource: plan.counts['missing-from-new-source'],
      blocked: plan.counts.blocked,
    },
    plannedWrites: planned,
    committedWrites: writes({
      logicalSources: 0,
      sourceFileVersions: 0,
      importBatchVersions: 0,
      assessmentComponentVersions: 0,
      academicRecordVersions: 0,
      logicalSourceRecordAssociationVersions: 0,
    }),
  };
}

export function createGradebookImportPersistenceServiceV4(
  dependencies: GradebookImportPersistenceServiceDependenciesV4,
) {
  return {
    async execute(
      request: GradebookImportPersistenceRequestV4,
    ): Promise<GradebookImportPersistenceResponseV4> {
      try {
        const resolution = await resolveLogicalSourceForImportV2(request, {
          entities: dependencies.unitOfWork.entities,
          logicalSources: dependencies.unitOfWork.logicalSources,
          createLogicalSourceId: () => dependencies.createId('logical-source') as LogicalSourceIdV1,
          now: dependencies.now,
        });
        if (resolution.status === 'review-required') {
          const code =
            resolution.reason === 'ambiguous-logical-source'
              ? 'ambiguous-logical-source'
              : resolution.reason === 'incompatible-logical-source-context'
                ? 'incompatible-logical-source-context'
                : 'incompatible-reference';
          return {
            transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V4,
            state: 'review-required',
            summary: emptySummary(),
            issues: issue(code),
          };
        }

        const officialRecords = await materializeGradebookImportOfficialRecordsV4({
          request,
          unitOfWork: dependencies.unitOfWork,
          annualStateSource: dependencies.annualStateSource,
        });
        if (officialRecords.status !== 'ready') {
          return reviewFromOfficialMaterialization(officialRecords);
        }

        const knownSource = await dependencies.unitOfWork.imports.findSourceFileByHash(
          { academicYearId: request.confirmedContext.academicYearId },
          request.manifest.sha256,
        );
        const { batch, importFileId } = serverBatch(
          request,
          resolution.context.teacherId,
          dependencies,
          knownSource?.value.manifest ?? null,
        );
        const materializations: AssessmentDefinitionMaterializationV2[] = [];
        for (const sheet of request.sheets) {
          if (sheet.kind !== 'term') continue;
          materializations.push(
            await materializeAssessmentDefinitionsV2(recognizedSheet(sheet, request), {
              logicalSourceReference: resolution.source.id,
              academicYearId: request.confirmedContext.academicYearId,
              teachingAssignmentId: sheet.teachingAssignmentId,
              term: sheet.term,
              students: sheet.students.map((student) => ({
                row: student.sourceRow,
                studentId: student.confirmedStudent.studentId,
                enrollmentId: student.confirmedStudent.enrollmentId,
              })),
            }),
          );
        }
        const materialization: AssessmentDefinitionMaterializationV2 = {
          components: materializations.flatMap((value) => value.components),
          gradeEntries: materializations.flatMap((value) => value.gradeEntries),
          blockedDefinitions: materializations.flatMap((value) => value.blockedDefinitions),
        };
        const context = {
          academicYearId: request.confirmedContext.academicYearId,
        } satisfies AcademicPersistenceContextV1;
        const plan = await planAssessmentImportReconciliationV2(
          {
            context,
            batch,
            expectedBatchVersion: 1,
            files: [
              {
                importFileId,
                logicalSource: { state: 'confirmed', logicalSourceId: resolution.source.id },
                materialization,
                additionalRecords: officialRecords.records,
              },
            ],
          },
          {
            imports: dependencies.unitOfWork.imports,
            academicRecords: dependencies.unitOfWork.academicRecords,
            logicalSourceRecords: dependencies.unitOfWork.logicalSourceRecords,
            entities: dependencies.unitOfWork.entities,
          },
        );
        const summary = summarizePlan(plan, resolution.status === 'new-source' ? 1 : 0);
        if (plan.assessmentComponentPlanV2.counts.blocked > 0 || plan.counts.blocked > 0) {
          return {
            transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V4,
            state: 'blocked',
            summary,
            issues: issue('blocked-definition'),
          };
        }
        if (plan.counts['missing-from-new-source'] > 0 || plan.status === 'review-required') {
          return {
            transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V4,
            state: 'review-required',
            summary,
            issues: issue('missing-from-new-source'),
          };
        }
        const envelope = createImportBootstrapEnvelopeV2({ resolution, batch, plan });
        if (envelope.status !== 'ready') {
          return {
            transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V4,
            state: 'review-required',
            summary,
            issues: issue('planning-failed'),
          };
        }
        const result = await executeImportBootstrapChangePlanV2(
          plan,
          envelope.request,
          dependencies.transaction,
        );
        if (result.status === 'version-conflict') {
          return { transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V4, state: 'conflict' };
        }
        if (result.status === 'transaction-failed') {
          return { transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V4, state: 'unavailable' };
        }
        if (result.status === 'rejected-invalid-plan') {
          return {
            transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V4,
            state: 'blocked',
            summary,
            issues: issue('planning-failed'),
          };
        }
        if (result.status !== 'applied') {
          return { transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V4, state: 'unavailable' };
        }
        const committedWrites = writes({
          logicalSources: result.logicalSourceVersions,
          sourceFileVersions: result.committedWrites.sourceFileVersions,
          importBatchVersions: result.importBatchVersions,
          assessmentComponentVersions: result.committedWrites.academicEntityVersions ?? 0,
          academicRecordVersions: result.committedWrites.academicRecordVersions,
          logicalSourceRecordAssociationVersions:
            result.committedWrites.logicalSourceRecordAssociationVersions,
        });
        const finalSummary = { ...summary, committedWrites };
        const academicWrites =
          committedWrites.assessmentComponentVersions +
          committedWrites.academicRecordVersions +
          committedWrites.logicalSourceRecordAssociationVersions;
        return {
          transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V4,
          state: academicWrites > 0 ? 'applied' : 'no-changes',
          summary: finalSummary,
        };
      } catch {
        return {
          transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V4,
          state: 'unavailable',
        };
      }
    },
  };
}
