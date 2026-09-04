import type {
  AcademicYearId,
  AcademicYearV1,
  ClassGroupId,
  ClassGroupV1,
  EnrollmentId,
  EnrollmentV1,
  EntityIdV1,
  StudentId,
  StudentStatusEventId,
  StudentStatusEventV1,
  StudentV1,
  SubjectId,
  SubjectV1,
  TeacherId,
  TeacherV1,
  TeachingAssignmentId,
  TeachingAssignmentV1,
} from '../../../../shared/gradebook-contracts/entities';
import type {
  AcademicTermV1,
  AnnualResultV1,
  AssessmentComponentId,
  AssessmentComponentV1,
  FinalRecoveryV1,
  GradeEntryV1,
  TermResultV1,
} from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import type { AssessmentComponentV2 } from '../../../../shared/gradebook-contracts/results/results-contract-v2';
import type { AssessmentComponentV3 } from '../../../../shared/gradebook-contracts/results/results-contract-v3';
import type {
  ImportBatchResultV1,
  SourceFileManifestV1,
} from '../../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  ImportBatchId,
  ImportFileId,
  SourceFileManifestId,
} from '../../../../shared/gradebook-contracts/imports/import-ids-v1';
import type {
  AuditOccurrenceId,
  AuditOccurrenceV1,
  ReconciliationResultId,
  ReconciliationResultV1,
} from '../../../../shared/gradebook-contracts/audit/audit-contract-v1';

export interface AcademicPersistenceContextV1 {
  readonly academicYearId: AcademicYearId;
}

export interface CursorPageRequestV1 {
  readonly limit: number;
  readonly cursor?: string | null;
}

export interface CursorPageV1<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export interface VersionExpectationV1 {
  /** `null` means the caller expects no prior persisted version. */
  readonly expectedVersion: number | null;
}

export interface VersionedRecordV1<T> {
  readonly value: T;
  readonly version: number;
  readonly recordedAt: string;
}

export type VersionedWriteResultV1<T> =
  | {
      readonly status: 'written';
      readonly record: VersionedRecordV1<T>;
    }
  | {
      readonly status: 'version-conflict';
      readonly currentVersion: number | null;
    };

export type PersistedAssessmentComponentV1 =
  AssessmentComponentV1 | AssessmentComponentV2 | AssessmentComponentV3;

export type AcademicEntityRecordV1 =
  | { readonly kind: 'academic-year'; readonly value: AcademicYearV1 }
  | { readonly kind: 'teacher'; readonly value: TeacherV1 }
  | { readonly kind: 'class-group'; readonly value: ClassGroupV1 }
  | { readonly kind: 'subject'; readonly value: SubjectV1 }
  | { readonly kind: 'teaching-assignment'; readonly value: TeachingAssignmentV1 }
  | { readonly kind: 'student'; readonly value: StudentV1 }
  | { readonly kind: 'enrollment'; readonly value: EnrollmentV1 }
  | { readonly kind: 'student-status-event'; readonly value: StudentStatusEventV1 }
  | { readonly kind: 'assessment-component'; readonly value: PersistedAssessmentComponentV1 };

export type AcademicEntityKindV1 = AcademicEntityRecordV1['kind'];

export type AcademicEntityReferenceV1 =
  | { readonly kind: 'academic-year'; readonly id: AcademicYearId }
  | { readonly kind: 'teacher'; readonly id: TeacherId }
  | { readonly kind: 'class-group'; readonly id: ClassGroupId }
  | { readonly kind: 'subject'; readonly id: SubjectId }
  | { readonly kind: 'teaching-assignment'; readonly id: TeachingAssignmentId }
  | { readonly kind: 'student'; readonly id: StudentId }
  | { readonly kind: 'enrollment'; readonly id: EnrollmentId }
  | { readonly kind: 'student-status-event'; readonly id: StudentStatusEventId }
  | { readonly kind: 'assessment-component'; readonly id: AssessmentComponentId };

export interface AcademicEntityRepositoryV1 {
  get(
    context: AcademicPersistenceContextV1,
    reference: AcademicEntityReferenceV1,
  ): Promise<VersionedRecordV1<AcademicEntityRecordV1> | null>;

  list(
    context: AcademicPersistenceContextV1,
    kind: AcademicEntityKindV1,
    page: CursorPageRequestV1,
  ): Promise<CursorPageV1<VersionedRecordV1<AcademicEntityRecordV1>>>;

  appendVersion(
    context: AcademicPersistenceContextV1,
    record: AcademicEntityRecordV1,
    expectation: VersionExpectationV1,
  ): Promise<VersionedWriteResultV1<AcademicEntityRecordV1>>;
}

export type LogicalSourceIdV1 = EntityIdV1<'LogicalSourceV1'>;

export type LogicalSourceRelationV1 =
  | { readonly state: 'unmatched' }
  | {
      readonly state: 'candidate';
      readonly candidateLogicalSourceIds: readonly LogicalSourceIdV1[];
    }
  | {
      readonly state: 'confirmed';
      readonly logicalSourceId: LogicalSourceIdV1;
    };

export interface SourceFileVersionV1 {
  readonly manifest: SourceFileManifestV1;
  readonly logicalSource: LogicalSourceRelationV1;
}

export interface ImportPersistenceRepositoryV1 {
  findSourceFileByHash(
    context: AcademicPersistenceContextV1,
    sha256: string,
  ): Promise<VersionedRecordV1<SourceFileVersionV1> | null>;

  getSourceFileVersion(
    context: AcademicPersistenceContextV1,
    manifestId: SourceFileManifestId,
  ): Promise<VersionedRecordV1<SourceFileVersionV1> | null>;

  listLogicalSourceVersions(
    context: AcademicPersistenceContextV1,
    logicalSourceId: LogicalSourceIdV1,
    page: CursorPageRequestV1,
  ): Promise<CursorPageV1<VersionedRecordV1<SourceFileVersionV1>>>;

  appendSourceFileVersion(
    context: AcademicPersistenceContextV1,
    sourceFileVersion: SourceFileVersionV1,
    expectation: VersionExpectationV1,
  ): Promise<VersionedWriteResultV1<SourceFileVersionV1>>;

  getImportBatch(
    context: AcademicPersistenceContextV1,
    importBatchId: ImportBatchId,
  ): Promise<VersionedRecordV1<ImportBatchResultV1> | null>;

  appendImportBatchVersion(
    context: AcademicPersistenceContextV1,
    batch: ImportBatchResultV1,
    expectation: VersionExpectationV1,
  ): Promise<VersionedWriteResultV1<ImportBatchResultV1>>;
}

export type AcademicRecordStreamV1 =
  | {
      readonly kind: 'grade-entry';
      readonly studentId: StudentId;
      readonly enrollmentId: EnrollmentId;
      readonly assessmentComponentId: AssessmentComponentId;
    }
  | {
      readonly kind: 'term-result';
      readonly studentId: StudentId;
      readonly enrollmentId: EnrollmentId;
      readonly teachingAssignmentId: TeachingAssignmentId;
      readonly term: AcademicTermV1;
    }
  | {
      readonly kind: 'final-recovery';
      readonly studentId: StudentId;
      readonly enrollmentId: EnrollmentId;
      readonly teachingAssignmentId: TeachingAssignmentId;
      readonly recoveredTerm: AcademicTermV1;
    }
  | {
      readonly kind: 'annual-result';
      readonly studentId: StudentId;
      readonly enrollmentId: EnrollmentId;
      readonly teachingAssignmentId: TeachingAssignmentId;
    };

export type AcademicRecordV1 =
  | { readonly kind: 'grade-entry'; readonly value: GradeEntryV1 }
  | { readonly kind: 'term-result'; readonly value: TermResultV1 }
  | { readonly kind: 'final-recovery'; readonly value: FinalRecoveryV1 }
  | { readonly kind: 'annual-result'; readonly value: AnnualResultV1 };

export interface AcademicRecordRepositoryV1 {
  getCurrent(
    context: AcademicPersistenceContextV1,
    stream: AcademicRecordStreamV1,
  ): Promise<VersionedRecordV1<AcademicRecordV1> | null>;

  listVersions(
    context: AcademicPersistenceContextV1,
    stream: AcademicRecordStreamV1,
    page: CursorPageRequestV1,
  ): Promise<CursorPageV1<VersionedRecordV1<AcademicRecordV1>>>;

  appendVersion(
    context: AcademicPersistenceContextV1,
    stream: AcademicRecordStreamV1,
    record: AcademicRecordV1,
    expectation: VersionExpectationV1,
  ): Promise<VersionedWriteResultV1<AcademicRecordV1>>;
}

export interface LogicalSourceRecordAssociationStreamV1 {
  readonly logicalSourceId: LogicalSourceIdV1;
  readonly academicRecordStream: AcademicRecordStreamV1;
  readonly stableKey: string;
}

export type LogicalSourceRecordAssociationStateV1 = 'active' | 'inactive';

export interface LogicalSourceRecordAssociationV1 {
  readonly academicYearId: AcademicYearId;
  readonly logicalSourceId: LogicalSourceIdV1;
  readonly academicRecordStream: AcademicRecordStreamV1;
  readonly stableKey: string;
  readonly state: LogicalSourceRecordAssociationStateV1;
  readonly sourceManifestId: SourceFileManifestId;
  readonly sourceManifestVersion: number;
}

export interface LogicalSourceRecordRepositoryV1 {
  getCurrent(
    context: AcademicPersistenceContextV1,
    stream: LogicalSourceRecordAssociationStreamV1,
  ): Promise<VersionedRecordV1<LogicalSourceRecordAssociationV1> | null>;

  listCurrentStreams(
    context: AcademicPersistenceContextV1,
    logicalSourceId: LogicalSourceIdV1,
  ): Promise<readonly AcademicRecordStreamV1[]>;

  listVersions(
    context: AcademicPersistenceContextV1,
    stream: LogicalSourceRecordAssociationStreamV1,
    page: CursorPageRequestV1,
  ): Promise<CursorPageV1<VersionedRecordV1<LogicalSourceRecordAssociationV1>>>;

  appendVersion(
    context: AcademicPersistenceContextV1,
    stream: LogicalSourceRecordAssociationStreamV1,
    association: LogicalSourceRecordAssociationV1,
    expectation: VersionExpectationV1,
  ): Promise<VersionedWriteResultV1<LogicalSourceRecordAssociationV1>>;
}

export type AuditRecordStreamV1 =
  | { readonly kind: 'occurrence'; readonly id: AuditOccurrenceId }
  | { readonly kind: 'reconciliation'; readonly id: ReconciliationResultId };

export type AuditRecordV1 =
  | { readonly kind: 'occurrence'; readonly value: AuditOccurrenceV1 }
  | { readonly kind: 'reconciliation'; readonly value: ReconciliationResultV1 };

export interface AuditPersistenceRepositoryV1 {
  getCurrent(
    context: AcademicPersistenceContextV1,
    stream: AuditRecordStreamV1,
  ): Promise<VersionedRecordV1<AuditRecordV1> | null>;

  listVersions(
    context: AcademicPersistenceContextV1,
    stream: AuditRecordStreamV1,
    page: CursorPageRequestV1,
  ): Promise<CursorPageV1<VersionedRecordV1<AuditRecordV1>>>;

  appendVersion(
    context: AcademicPersistenceContextV1,
    stream: AuditRecordStreamV1,
    record: AuditRecordV1,
    expectation: VersionExpectationV1,
  ): Promise<VersionedWriteResultV1<AuditRecordV1>>;
}

export interface PersistenceUnitOfWorkV1 {
  readonly entities: AcademicEntityRepositoryV1;
  readonly imports: ImportPersistenceRepositoryV1;
  readonly academicRecords: AcademicRecordRepositoryV1;
  readonly logicalSourceRecords: LogicalSourceRecordRepositoryV1;
  readonly audit: AuditPersistenceRepositoryV1;
}

export interface BatchPromotionRequestV1 {
  readonly importBatchId: ImportBatchId;
  /** Only files already approved by the review flow are promoted. */
  readonly approvedImportFileIds: readonly ImportFileId[];
  readonly expectedBatchVersion: number;
}

export interface BatchPromotionTransactionPortV1 {
  /**
   * Runs the promotion against one isolated unit of work. Implementations must
   * commit all writes only when `operation` resolves; rejection must leave no
   * partial writes committed.
   */
  runBatchPromotion<T>(
    context: AcademicPersistenceContextV1,
    request: BatchPromotionRequestV1,
    operation: (unitOfWork: PersistenceUnitOfWorkV1) => Promise<T>,
  ): Promise<T>;
}
