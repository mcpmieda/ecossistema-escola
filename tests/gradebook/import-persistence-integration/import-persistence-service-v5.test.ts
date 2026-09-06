import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AcademicYearId, SchoolId } from '../../../shared/gradebook-contracts/entities';
import type { GradebookImportResultCellObservationV4 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v4';
import {
  isGradebookImportPersistenceResponseV5,
  type GradebookImportPersistenceRequestV5,
} from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v5';
import {
  SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2,
  SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2,
} from '../../../shared/gradebook-contracts/source/source-contract-v2';
import { createGradebookImportPersistenceServiceV5 } from '../../../server/gradebook/application/import/import-persistence-service-v5';
import { createGradebookD1PersistenceUnitOfWorkV2 } from '../../../server/gradebook/persistence/d1/composition/d1-persistence-unit-of-work-v1';
import { createGradebookD1ImportAnnualStateSourceV1 } from '../../../server/gradebook/persistence/d1/imports/d1-import-annual-state-source-v1';
import { GradebookD1ImportBootstrapTransactionV2 } from '../../../server/gradebook/persistence/d1/transaction/d1-import-bootstrap-transaction-v2';
import { ACADEMIC_CONTEXT_2026_IDENTITY_V1 } from '../../../src/gradebook-domain/context/academic-context-2026-v1';
import type {
  AcademicEntityRecordV1,
  AcademicPersistenceContextV1,
  VersionedRecordV1,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  academicYearId,
  instant,
  openMigratedDatabase,
  type SqliteD1Database,
} from '../persistence/d1-transaction/d1-write-test-support';

const schoolId = 'school:v5-first-bootstrap' as SchoolId;
let database: SqliteD1Database;

beforeEach(async () => {
  database = await openMigratedDatabase();
  const unit = createGradebookD1PersistenceUnitOfWorkV2(database, { now: () => instant });
  expect(
    (
      await unit.entities.appendVersion(
        { academicYearId },
        {
          kind: 'academic-year',
          value: {
            id: academicYearId as AcademicYearId,
            schoolId,
            year: 2026,
            status: 'active',
            startsOn: '2026-02-01',
            endsOn: '2026-12-20',
            activeEvaluationProfileId: ACADEMIC_CONTEXT_2026_IDENTITY_V1.evaluationProfileId,
            configurationVersion: String(ACADEMIC_CONTEXT_2026_IDENTITY_V1.configurationVersion),
          },
        },
        { expectedVersion: null },
      )
    ).status,
  ).toBe('written');
});

afterEach(() => database.raw.close());

function positive(value: number): GradebookImportResultCellObservationV4 {
  return { classification: 'manual-positive-number', rawValue: value };
}

const empty = { classification: 'empty', rawValue: '' } as const;

function definitions() {
  return [
    ...SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2.map((slot) => ({
      sourceSlot: slot.sourceSlot,
      maximumConfiguration: { state: 'numeric' as const, rawValue: 10 },
    })),
    ...SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2.map((slot) => ({
      sourceSlot: slot.sourceSlot,
      maximumConfiguration: { state: 'numeric' as const, rawValue: 1 },
      name: { state: 'text' as const, rawValue: `Atividade sintética ${slot.sourceSlot}` },
    })),
  ];
}

function termSheet(
  term: 1 | 2 | 3,
  quantitative: number,
  qualitative: number,
  official: number,
  annual: number,
): GradebookImportPersistenceRequestV5['sheets'][number] {
  return {
    kind: 'term',
    sourceSheetName: `6S${term}ºD1`,
    term,
    recognizedContext: {
      classGroupLabel: '6º ANO SINTÉTICO',
      subjectLabel: 'Componente Sintético',
      disciplineIndex: 'D1',
    },
    assessmentDefinitions: definitions(),
    students: [
      {
        sourceRow: 5,
        sourceStudent: { position: 1, label: 'Estudante Sintético' },
        assessmentValues: [{ sourceSlot: 'R', value: { kind: 'manual', source: 5, value: 5 } }],
        aggregates: {
          quantitativeTotal: positive(quantitative),
          parallelAssessment: empty,
          qualitativeTotal: positive(qualitative),
          officialTermGrade: positive(official),
          annualAccumulatedTotal: positive(annual),
        },
      },
    ],
  };
}

function request(hash = 'a'): GradebookImportPersistenceRequestV5 {
  return {
    transportVersion: 5,
    operation: 'persist-recognized-file',
    manifest: {
      fileName: 'fixture-v5-primeiro-bootstrap.xlsb',
      extension: 'xlsb',
      reportedMimeType: null,
      sizeBytes: 256,
      lastModifiedAt: null,
      sha256: hash.repeat(64),
      sourceContractVersion: 2,
      parserVersion: 'synthetic-v5-first-bootstrap',
      readAt: instant,
    },
    recognizedSuggestions: { academicYear: 2026, teacherName: 'Docente Sintético' },
    confirmedContext: { academicYearId },
    sourceResolution: { mode: 'resolve-or-create' },
    sheets: [
      termSheet(1, 10, 10, 20, 20),
      termSheet(2, 10, 10, 20, 40),
      termSheet(3, 12, 13, 25, 65),
      {
        kind: 'recovery',
        sourceSheetName: '6SRECD1',
        recognizedContext: {
          classGroupLabel: '6º ANO SINTÉTICO',
          subjectLabel: 'Componente Sintético',
          disciplineIndex: 'D1',
        },
        students: [
          {
            sourceRow: 5,
            sourceStudent: { position: 1, label: 'Estudante Sintético' },
            recovery: {
              trimester1: empty,
              trimester2: empty,
              trimester3: empty,
              totalAfterRecovery: empty,
              originalTrimester1: positive(20),
              originalTrimester2: positive(20),
              originalTrimester3: positive(25),
              originalAnnual: positive(65),
              applicabilityTrimester1: { classification: 'numeric', rawValue: 0 },
              applicabilityTrimester2: { classification: 'numeric', rawValue: 0 },
              applicabilityTrimester3: { classification: 'numeric', rawValue: 0 },
            },
          },
        ],
      },
    ],
    diagnostics: [],
  };
}

function service() {
  let sequence = 0;
  const unitOfWork = createGradebookD1PersistenceUnitOfWorkV2(database, { now: () => instant });
  return createGradebookImportPersistenceServiceV5({
    unitOfWork,
    transaction: new GradebookD1ImportBootstrapTransactionV2(database, { now: () => instant }),
    annualStateSource: createGradebookD1ImportAnnualStateSourceV1(database),
    now: () => instant,
    createId: (kind) => `${kind}:v5-first-bootstrap:${++sequence}`,
  });
}

function count(table: string, where = ''): number {
  return (
    database.raw.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get() as { count: number }
  ).count;
}

describe('Import persistence service V5 first bootstrap', () => {
  it('bootstraps catalog and persists T1/T2/T3/REC atomically from only the academic year', async () => {
    const persistence = service();
    const first = await persistence.execute(request());

    expect(isGradebookImportPersistenceResponseV5(first)).toBe(true);
    expect(first).toMatchObject({
      transportVersion: 5,
      state: 'applied',
      summary: { committedWrites: { total: expect.any(Number) } },
    });
    expect(count('academic_record_streams', "WHERE record_kind='grade-entry'")).toBe(3);
    expect(count('academic_record_streams', "WHERE record_kind='term-result'")).toBe(3);
    expect(count('academic_record_streams', "WHERE record_kind='final-recovery'")).toBe(3);
    expect(count('academic_record_streams', "WHERE record_kind='annual-result'")).toBe(1);
    expect(count('academic_entity_streams', "WHERE entity_kind='teacher'")).toBe(1);
    expect(count('academic_entity_streams', "WHERE entity_kind='class-group'")).toBe(1);
    expect(count('academic_entity_streams', "WHERE entity_kind='subject'")).toBe(1);
    expect(count('academic_entity_streams', "WHERE entity_kind='teaching-assignment'")).toBe(1);
    expect(count('academic_entity_streams', "WHERE entity_kind='student'")).toBe(1);
    expect(count('academic_entity_streams', "WHERE entity_kind='enrollment'")).toBe(1);

    const second = await persistence.execute(request());
    expect(isGradebookImportPersistenceResponseV5(second)).toBe(true);
    expect(second).toMatchObject({ transportVersion: 5, state: 'no-changes' });
    expect(count('academic_record_streams', "WHERE record_kind='grade-entry'")).toBe(3);
    expect(count('academic_record_streams', "WHERE record_kind='term-result'")).toBe(3);
    expect(count('academic_record_streams', "WHERE record_kind='final-recovery'")).toBe(3);
    expect(count('academic_record_streams', "WHERE record_kind='annual-result'")).toBe(1);
  });

  it('starts the source hash read before catalog bootstrap completes without changing review precedence', async () => {
    let resolveBootstrap!: (value: {
      readonly academicYear: null;
      readonly catalog: readonly VersionedRecordV1<AcademicEntityRecordV1>[];
    }) => void;
    const bootstrapPending = new Promise<{
      readonly academicYear: null;
      readonly catalog: readonly VersionedRecordV1<AcademicEntityRecordV1>[];
    }>((resolve) => {
      resolveBootstrap = resolve;
    });
    let sourceHashCalls = 0;
    let markSourceStarted!: () => void;
    const sourceStarted = new Promise<void>((resolve) => {
      markSourceStarted = resolve;
    });

    const dependencies = {
      unitOfWork: {
        entities: {
          async get() {
            return null;
          },
          async list() {
            return { items: [], nextCursor: null };
          },
          async appendVersion() {
            throw new Error('unexpected-write');
          },
          getImportCatalogBootstrapSnapshot() {
            return bootstrapPending;
          },
        },
        imports: {
          async findSourceFileByHash() {
            sourceHashCalls += 1;
            markSourceStarted();
            throw new Error('synthetic-early-source-failure');
          },
        },
        logicalSources: {
          async get() {
            return null;
          },
          async listByContext() {
            return { items: [], nextCursor: null };
          },
          async createInitial() {
            throw new Error('unexpected-write');
          },
        },
      },
      transaction: {},
      annualStateSource: {},
      now: () => instant,
      createId: () => 'unused',
    } as unknown as Parameters<typeof createGradebookImportPersistenceServiceV5>[0];

    const persistence = createGradebookImportPersistenceServiceV5(dependencies);
    const pending = persistence.execute(request());

    await sourceStarted;
    expect(sourceHashCalls).toBe(1);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    resolveBootstrap({ academicYear: null, catalog: [] });
    await expect(pending).resolves.toMatchObject({
      transportVersion: 5,
      state: 'review-required',
    });
    expect(sourceHashCalls).toBe(1);
  });

  it('preserves the D1 catalog bootstrap snapshot and reuses one source hash read on an idempotent reimport', async () => {
    const first = await service().execute(request());
    expect(first).toMatchObject({ transportVersion: 5, state: 'applied' });

    const unitOfWork = createGradebookD1PersistenceUnitOfWorkV2(database, { now: () => instant });
    type SnapshotEntities = typeof unitOfWork.entities & {
      readonly getImportCatalogSnapshot?: (
        context: AcademicPersistenceContextV1,
      ) => Promise<readonly VersionedRecordV1<AcademicEntityRecordV1>[] | null>;
      readonly getImportCatalogBootstrapSnapshot?: (
        context: AcademicPersistenceContextV1,
      ) => Promise<{
        readonly academicYear: VersionedRecordV1<AcademicEntityRecordV1> | null;
        readonly catalog: readonly VersionedRecordV1<AcademicEntityRecordV1>[] | null;
      }>;
    };
    const baseEntities = unitOfWork.entities as SnapshotEntities;
    expect(typeof baseEntities.getImportCatalogSnapshot).toBe('function');
    expect(typeof baseEntities.getImportCatalogBootstrapSnapshot).toBe('function');
    const getImportCatalogSnapshot = baseEntities.getImportCatalogSnapshot!;
    const getImportCatalogBootstrapSnapshot = baseEntities.getImportCatalogBootstrapSnapshot!;
    const findSourceFileByHash = unitOfWork.imports.findSourceFileByHash;
    let bootstrapSnapshotCalls = 0;
    let catalogSnapshotCalls = 0;
    let catalogListCalls = 0;
    let sourceHashCalls = 0;
    const catalogKinds = new Set<string>([
      'teacher',
      'class-group',
      'subject',
      'teaching-assignment',
      'student',
      'enrollment',
    ]);
    const entities: SnapshotEntities = {
      ...baseEntities,
      async getImportCatalogBootstrapSnapshot(context) {
        bootstrapSnapshotCalls += 1;
        return getImportCatalogBootstrapSnapshot(context);
      },
      async getImportCatalogSnapshot(context) {
        catalogSnapshotCalls += 1;
        return getImportCatalogSnapshot(context);
      },
      async list(context, kind, page) {
        if (catalogKinds.has(kind)) catalogListCalls += 1;
        return baseEntities.list(context, kind, page);
      },
    };
    const imports = {
      ...unitOfWork.imports,
      async findSourceFileByHash(
        context: Parameters<typeof findSourceFileByHash>[0],
        sha256: Parameters<typeof findSourceFileByHash>[1],
      ) {
        sourceHashCalls += 1;
        return findSourceFileByHash(context, sha256);
      },
    };
    let sequence = 0;
    const persistence = createGradebookImportPersistenceServiceV5({
      unitOfWork: { ...unitOfWork, entities, imports },
      transaction: new GradebookD1ImportBootstrapTransactionV2(database, { now: () => instant }),
      annualStateSource: createGradebookD1ImportAnnualStateSourceV1(database),
      now: () => instant,
      createId: (kind) => `${kind}:v5-snapshot:${++sequence}`,
    });

    const second = await persistence.execute(request());

    expect(second).toMatchObject({ transportVersion: 5, state: 'no-changes' });
    expect(bootstrapSnapshotCalls).toBe(1);
    expect(catalogSnapshotCalls).toBe(0);
    expect(catalogListCalls).toBe(0);
    expect(sourceHashCalls).toBe(1);
  });
});
