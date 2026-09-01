import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  EnrollmentId,
  StudentId,
} from '../../../../shared/gradebook-contracts/entities';
import type { SourceFileManifestId } from '../../../../shared/gradebook-contracts/imports/import-ids-v1';
import type { AssessmentComponentId } from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import {
  createGradebookD1ReadAdapterV1,
  type D1ReadDatabaseV1,
  type D1ReadResultV1,
  type D1ReadStatementV1,
} from '../../../../server/gradebook/persistence/d1/read/d1-read-adapter-v1';
import {
  academicRecordStreamKeyV1,
  logicalSourceRecordAssociationStreamForV1,
} from '../../../../server/gradebook/application/import/import-reconciliation-v1';
import type {
  AcademicPersistenceContextV1,
  AcademicRecordStreamV1,
  LogicalSourceIdV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';

type ReadValue = string | number | null;
type Row = Record<string, unknown>;

class StaticStatement implements D1ReadStatementV1 {
  constructor(
    private readonly row: Row | null,
    private readonly values: readonly ReadValue[] = [],
  ) {}

  bind(...values: ReadValue[]): D1ReadStatementV1 {
    return new StaticStatement(this.row, values);
  }

  async first<Result extends Row>(): Promise<Result | null> {
    void this.values;
    return this.row as Result | null;
  }

  async all<Result extends Row>(): Promise<D1ReadResultV1<Result>> {
    void this.values;
    return { results: [] };
  }
}

class StaticDatabase implements D1ReadDatabaseV1 {
  readonly queries: string[] = [];

  constructor(private readonly row: Row | null) {}

  prepare(query: string): D1ReadStatementV1 {
    this.queries.push(query);
    return new StaticStatement(this.row);
  }
}

const academicYearId = 'academic-year:d1-association:2026' as AcademicYearId;
const context = { academicYearId } satisfies AcademicPersistenceContextV1;
const logicalSourceId = 'logical-source:d1-association:001' as LogicalSourceIdV1;
const sourceManifestId = 'manifest:d1-association:001' as SourceFileManifestId;
const stream = {
  kind: 'grade-entry',
  studentId: 'student:d1-association:001' as StudentId,
  enrollmentId: 'enrollment:d1-association:001' as EnrollmentId,
  assessmentComponentId:
    'assessment:d1-association:001' as AssessmentComponentId,
} satisfies AcademicRecordStreamV1;
const stableKey = academicRecordStreamKeyV1(stream);
const associationStream = logicalSourceRecordAssociationStreamForV1(
  logicalSourceId,
  stream,
);

function associationRow(overrides: Row = {}): Row {
  return {
    logical_source_id: logicalSourceId,
    association_record_kind: 'grade-entry',
    association_stream_key: stableKey,
    current_version: 2,
    current_state: 'active',
    persisted_version: 2,
    association_state: 'active',
    source_manifest_id: sourceManifestId,
    source_manifest_version: 3,
    recorded_at: '2026-08-31T18:00:00.000Z',
    linked_record_kind: 'grade-entry',
    linked_stream_key: stableKey,
    student_id: stream.studentId,
    enrollment_id: stream.enrollmentId,
    assessment_component_id: stream.assessmentComponentId,
    teaching_assignment_id: null,
    term: null,
    ...overrides,
  };
}

describe('D1 logical source record association read adapter v1', () => {
  it('reconstructs the official association contract from normalized columns', async () => {
    const database = new StaticDatabase(associationRow());
    const adapter = createGradebookD1ReadAdapterV1(database);

    await expect(
      adapter.logicalSourceRecords.getCurrent(context, associationStream),
    ).resolves.toEqual({
      value: {
        academicYearId,
        logicalSourceId,
        academicRecordStream: stream,
        stableKey,
        state: 'active',
        sourceManifestId,
        sourceManifestVersion: 3,
      },
      version: 2,
      recordedAt: '2026-08-31T18:00:00.000Z',
    });

    expect(database.queries).toHaveLength(1);
    expect(database.queries[0]).toContain('FROM logical_source_record_streams c');
    expect(database.queries[0]).toContain('LEFT JOIN logical_source_record_versions v');
    expect(database.queries[0]).toContain('LEFT JOIN academic_record_streams r');
    expect(database.queries[0]).not.toContain('json_extract');
    expect(database.queries[0]).not.toContain('file_name');
  });

  it('returns null for an absent association and rejects broken current-version pointers', async () => {
    const absent = createGradebookD1ReadAdapterV1(new StaticDatabase(null));
    await expect(
      absent.logicalSourceRecords.getCurrent(context, associationStream),
    ).resolves.toBeNull();

    const broken = createGradebookD1ReadAdapterV1(
      new StaticDatabase(associationRow({ persisted_version: 1 })),
    );
    await expect(
      broken.logicalSourceRecords.getCurrent(context, associationStream),
    ).rejects.toMatchObject({
      code: 'broken-reference',
      message: 'Uma referência acadêmica persistida está inconsistente.',
    });
  });

  it('rejects association rows whose logical source or stream does not match the request', async () => {
    const mismatched = createGradebookD1ReadAdapterV1(
      new StaticDatabase(
        associationRow({
          logical_source_id: 'logical-source:d1-association:other',
        }),
      ),
    );

    await expect(
      mismatched.logicalSourceRecords.getCurrent(context, associationStream),
    ).rejects.toMatchObject({
      code: 'incompatible-row',
      message: 'O registro acadêmico persistido possui formato incompatível.',
    });
  });
});
