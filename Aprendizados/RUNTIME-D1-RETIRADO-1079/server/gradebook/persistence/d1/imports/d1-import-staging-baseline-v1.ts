import type { D1ReadDatabaseV1 } from '../read/d1-read-adapter-v1';

type Row = Record<string, unknown>;

export interface GradebookImportStagingBaselineCountsV1 {
  readonly logicalSources: number;
  readonly sourceFiles: number;
  readonly importBatches: number;
  readonly teachers: number;
  readonly classGroups: number;
  readonly subjects: number;
  readonly teachingAssignments: number;
  readonly students: number;
  readonly enrollments: number;
  readonly studentStatusEvents: number;
  readonly assessmentComponents: number;
  readonly gradeEntries: number;
  readonly termResults: number;
  readonly finalRecoveries: number;
  readonly annualResults: number;
  readonly associations: number;
  readonly stageSessions: number;
  readonly stageChunks: number;
}

export interface GradebookImportStagingBaselineV1 {
  readonly counts: GradebookImportStagingBaselineCountsV1;
  readonly officialPersistenceTotal: number;
  readonly requiresReview: boolean;
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('staging-baseline-row-invalid');
  }
  return value;
}

export async function inspectGradebookImportStagingBaselineV1(
  database: D1ReadDatabaseV1,
): Promise<GradebookImportStagingBaselineV1> {
  const row = await database
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM logical_sources) AS logical_sources,
         (SELECT COUNT(*) FROM source_file_streams) AS source_files,
         (SELECT COUNT(*) FROM import_batch_streams) AS import_batches,
         (SELECT COUNT(*) FROM academic_entity_streams WHERE entity_kind = 'teacher') AS teachers,
         (SELECT COUNT(*) FROM academic_entity_streams WHERE entity_kind = 'class-group') AS class_groups,
         (SELECT COUNT(*) FROM academic_entity_streams WHERE entity_kind = 'subject') AS subjects,
         (SELECT COUNT(*) FROM academic_entity_streams WHERE entity_kind = 'teaching-assignment') AS teaching_assignments,
         (SELECT COUNT(*) FROM academic_entity_streams WHERE entity_kind = 'student') AS students,
         (SELECT COUNT(*) FROM academic_entity_streams WHERE entity_kind = 'enrollment') AS enrollments,
         (SELECT COUNT(*) FROM academic_entity_streams WHERE entity_kind = 'student-status-event') AS student_status_events,
         (SELECT COUNT(*) FROM academic_entity_streams WHERE entity_kind = 'assessment-component') AS assessment_components,
         (SELECT COUNT(*) FROM academic_record_streams WHERE record_kind = 'grade-entry') AS grade_entries,
         (SELECT COUNT(*) FROM academic_record_streams WHERE record_kind = 'term-result') AS term_results,
         (SELECT COUNT(*) FROM academic_record_streams WHERE record_kind = 'final-recovery') AS final_recoveries,
         (SELECT COUNT(*) FROM academic_record_streams WHERE record_kind = 'annual-result') AS annual_results,
         (SELECT COUNT(*) FROM logical_source_record_streams) AS associations,
         (SELECT COUNT(*) FROM gradebook_import_stage_sessions) AS stage_sessions,
         (SELECT COUNT(*) FROM gradebook_import_stage_chunks) AS stage_chunks`,
    )
    .first<Row>();
  if (!row) throw new Error('staging-baseline-read-failed');

  const counts: GradebookImportStagingBaselineCountsV1 = {
    logicalSources: count(row.logical_sources),
    sourceFiles: count(row.source_files),
    importBatches: count(row.import_batches),
    teachers: count(row.teachers),
    classGroups: count(row.class_groups),
    subjects: count(row.subjects),
    teachingAssignments: count(row.teaching_assignments),
    students: count(row.students),
    enrollments: count(row.enrollments),
    studentStatusEvents: count(row.student_status_events),
    assessmentComponents: count(row.assessment_components),
    gradeEntries: count(row.grade_entries),
    termResults: count(row.term_results),
    finalRecoveries: count(row.final_recoveries),
    annualResults: count(row.annual_results),
    associations: count(row.associations),
    stageSessions: count(row.stage_sessions),
    stageChunks: count(row.stage_chunks),
  };
  const officialPersistenceTotal =
    counts.logicalSources +
    counts.sourceFiles +
    counts.importBatches +
    counts.teachers +
    counts.classGroups +
    counts.subjects +
    counts.teachingAssignments +
    counts.students +
    counts.enrollments +
    counts.studentStatusEvents +
    counts.assessmentComponents +
    counts.gradeEntries +
    counts.termResults +
    counts.finalRecoveries +
    counts.annualResults +
    counts.associations;

  return {
    counts,
    officialPersistenceTotal,
    requiresReview: counts.stageSessions === 0 && officialPersistenceTotal > 0,
  };
}
