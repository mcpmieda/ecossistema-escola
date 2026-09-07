import { SNAPSHOT_ASSESSMENT_RULE_V5 } from '../../../../shared/gradebook-contracts/source/source-values-contract-v5';
import type { GradeEntryV1 } from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import type { GradebookImportPersistenceRequestV4 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v4';
import type { AcademicRecordStreamV1 } from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type {
  AssessmentDefinitionMaterializationAcceptedV2,
  AssessmentImportReconciliationRepositoriesV2,
} from './assessment-import-reconciliation-v2';
import { academicRecordStreamKeyV1 } from './import-reconciliation-v1';

/** An explicitly present student/slot with a blank value replaces its old grade by
 * an absent VERSION. Missing students/components still require ordinary review.
 * New blank cells do not produce thousands of unnecessary academic streams. */
export async function materializeSnapshotAbsencesV5(
  request: GradebookImportPersistenceRequestV4,
  materialization: AssessmentDefinitionMaterializationAcceptedV2,
  repository: AssessmentImportReconciliationRepositoriesV2['academicRecords'],
): Promise<readonly GradeEntryV1[]> {
  const incoming = new Set(
    materialization.gradeEntries.map((grade) =>
      academicRecordStreamKeyV1({
        kind: 'grade-entry',
        studentId: grade.studentId,
        enrollmentId: grade.enrollmentId,
        assessmentComponentId: grade.assessmentComponentId,
      }),
    ),
  );
  const candidates: {
    stream: Extract<AcademicRecordStreamV1, { kind: 'grade-entry' }>;
    sheet: string;
    address: string;
  }[] = [];
  for (const sheet of request.sheets) {
    if (sheet.kind !== 'term') continue;
    const components = materialization.components.filter(
      ({ value }) =>
        value.teachingAssignmentId === sheet.teachingAssignmentId && value.term === sheet.term,
    );
    for (const component of components)
      for (const student of sheet.students) {
        const stream = {
          kind: 'grade-entry' as const,
          studentId: student.confirmedStudent.studentId,
          enrollmentId: student.confirmedStudent.enrollmentId,
          assessmentComponentId: component.value.id,
        };
        if (!incoming.has(academicRecordStreamKeyV1(stream)))
          candidates.push({
            stream,
            sheet: sheet.sourceSheetName,
            address: `${component.sourceDefinition.sourceSlot}${student.sourceRow}`,
          });
      }
  }
  const context = { academicYearId: request.confirmedContext.academicYearId };
  const absent: GradeEntryV1[] = [];
  // Bound both the number of async calls and the bulk request. The D1 adapter also bounds bytes.
  for (let start = 0; start < candidates.length; start += 500) {
    const chunk = candidates.slice(start, start + 500);
    const stored = repository.getCurrentMany
      ? await repository.getCurrentMany(
          context,
          chunk.map(({ stream }) => stream),
        )
      : await (async () => {
          const results = [];
          for (const item of chunk) results.push(await repository.getCurrent(context, item.stream));
          return results;
        })();
    if (stored.length !== chunk.length) throw new Error('snapshot-absence-read-incompatible');
    for (const [index, record] of stored.entries()) {
      if (!record) continue;
      const expected = chunk[index]!;
      if (record.value.kind !== 'grade-entry')
        throw new Error('snapshot-absence-reference-incompatible');
      const old = record.value.value;
      if (
        old.studentId !== expected.stream.studentId ||
        old.enrollmentId !== expected.stream.enrollmentId ||
        old.assessmentComponentId !== expected.stream.assessmentComponentId ||
        old.academicYearId !== context.academicYearId
      )
        throw new Error('snapshot-absence-reference-incompatible');
      absent.push({
        ...old,
        value: {
          imported: {
            value: { state: 'absent' },
            evidence: [
              {
                classification: 'snapshot-value',
                rawValue: null,
                provenance: {
                  fileName: request.manifest.fileName,
                  fileSha256: request.manifest.sha256,
                  sheetName: expected.sheet,
                  cellAddress: expected.address,
                },
              },
            ],
          },
          calculated: { value: { state: 'absent' } },
        },
        authorityMode: 'imported-source',
        ruleVersion: SNAPSHOT_ASSESSMENT_RULE_V5,
      });
    }
  }
  return absent;
}
