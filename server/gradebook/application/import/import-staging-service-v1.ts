import type { GradebookImportPersistenceResponseV6 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import type {
  GradebookImportCourseV6,
  GradebookImportPersistenceRequestV6,
  GradebookImportRosterV6,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import type {
  AcademicRecordStreamV1,
  VersionedRecordV1,
  AcademicRecordV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import type { PersistenceUnitOfWorkV2 } from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v2';
import type { GradebookImportAnnualStateSourceV1 } from '../../persistence/d1/imports/d1-import-annual-state-source-v1';
import {
  GradebookD1ImportStagingRepositoryV1,
  type GradebookImportStageSessionV1,
} from '../../persistence/d1/imports/d1-import-staging-repository-v1';
import { academicRecordStreamKeyV1 } from './import-reconciliation-v1';
import { createGradebookImportPersistenceServiceV6 } from './import-persistence-service-v6';
import { createGradebookImportStagingBoundedCatalogV1 } from './import-staging-bounded-catalog-v1';
import {
  GradebookImportStagingCaptureTransactionV1,
  type StagedImportCaptureV1,
} from './import-staging-capture-v1';

export const GRADEBOOK_IMPORT_STAGE_MAX_POSITIONS_V1 = 8;
export const GRADEBOOK_IMPORT_STAGE_SESSION_TTL_MS_V1 = 2 * 60 * 60 * 1000;

export interface GradebookImportStageChunkDescriptorV1 {
  readonly index: number;
  readonly courseIndex: number;
  readonly classGroupLabel: string;
  readonly subjectLabel: string;
  readonly disciplineIndex: `D${number}`;
  readonly positions: readonly number[];
}

interface GradebookImportStageMetadataV1 {
  readonly version: 1;
  readonly fixedNow: string;
  readonly header: ReturnType<typeof requestHeader>;
  readonly rosters: readonly GradebookImportRosterV6[];
  readonly chunks: readonly GradebookImportStageChunkDescriptorV1[];
}

export interface GradebookImportStageBeginResultV1 {
  readonly state: 'ready';
  readonly sessionId: string;
  readonly chunkCount: number;
}

export type GradebookImportStagePrepareResultV1 =
  | {
      readonly state: 'prepared' | 'already-prepared';
      readonly sessionId: string;
      readonly chunkIndex: number;
      readonly preparedCount: number;
      readonly expectedChunkCount: number;
    }
  | {
      readonly state: 'conflict' | 'invalid-session' | 'expired';
    }
  | {
      readonly state: 'rejected';
      readonly response: GradebookImportPersistenceResponseV6;
    };

interface BulkAcademicRecordRepositoryV1 {
  readonly getCurrentMany?: (
    context: Parameters<PersistenceUnitOfWorkV2['academicRecords']['getCurrent']>[0],
    streams: readonly AcademicRecordStreamV1[],
  ) => Promise<readonly (VersionedRecordV1<AcademicRecordV1> | null)[]>;
}

function requestHeader(request: GradebookImportPersistenceRequestV6) {
  return {
    manifest: request.manifest,
    recognizedSuggestions: request.recognizedSuggestions,
    confirmedContext: request.confirmedContext,
    sourceResolution: request.sourceResolution,
  } as const;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function classKey(value: string): string {
  return value.trim().toUpperCase();
}

function orderedPositions(course: GradebookImportCourseV6): readonly number[] {
  const terms = course.terms.map((term) => term.rows.map((row) => row[0]));
  const first = terms[0] ?? [];
  if (first.length === 0 || terms.some((positions) => !sameJson(positions, first))) {
    throw new TypeError('staged-import-divergent-term-coverage');
  }
  if (new Set(first).size !== first.length) throw new TypeError('staged-import-duplicate-position');
  const recoveryPositions = course.recovery?.rows.map((row) => row[0]) ?? [];
  const allowed = new Set(first);
  if (recoveryPositions.some((position) => !allowed.has(position))) {
    throw new TypeError('staged-import-recovery-outside-term-coverage');
  }
  return first;
}

export function deriveGradebookImportStageChunksV1(
  request: GradebookImportPersistenceRequestV6,
): readonly GradebookImportStageChunkDescriptorV1[] {
  const result: GradebookImportStageChunkDescriptorV1[] = [];
  for (const [courseIndex, course] of request.courses.entries()) {
    const positions = orderedPositions(course);
    for (let offset = 0; offset < positions.length; offset += GRADEBOOK_IMPORT_STAGE_MAX_POSITIONS_V1) {
      result.push({
        index: result.length,
        courseIndex,
        classGroupLabel: course.classGroupLabel,
        subjectLabel: course.subjectLabel,
        disciplineIndex: course.disciplineIndex,
        positions: positions.slice(offset, offset + GRADEBOOK_IMPORT_STAGE_MAX_POSITIONS_V1),
      });
    }
  }
  if (result.length === 0 || result.length > 512) throw new TypeError('staged-import-chunk-count-invalid');
  return result;
}

function metadata(value: string): GradebookImportStageMetadataV1 {
  const parsed: unknown = JSON.parse(value);
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    !('version' in parsed) ||
    parsed.version !== 1 ||
    !('fixedNow' in parsed) ||
    typeof parsed.fixedNow !== 'string' ||
    !('header' in parsed) ||
    !('rosters' in parsed) ||
    !Array.isArray(parsed.rosters) ||
    !('chunks' in parsed) ||
    !Array.isArray(parsed.chunks)
  ) {
    throw new TypeError('staged-import-metadata-invalid');
  }
  return parsed as GradebookImportStageMetadataV1;
}

function rosterForClass(
  rosters: readonly GradebookImportRosterV6[],
  classGroupLabel: string,
): GradebookImportRosterV6 {
  const normalized = classKey(classGroupLabel);
  const roster = rosters.find((candidate) => classKey(candidate.classGroupLabel) === normalized);
  if (!roster) throw new TypeError('staged-import-roster-missing');
  return roster;
}

function rosterForCourse(
  request: GradebookImportPersistenceRequestV6,
  course: GradebookImportCourseV6,
): GradebookImportRosterV6 {
  return rosterForClass(request.rosters, course.classGroupLabel);
}

function validateChunkAgainstDescriptor(
  request: GradebookImportPersistenceRequestV6,
  descriptor: GradebookImportStageChunkDescriptorV1,
  stage: GradebookImportStageMetadataV1,
): { readonly course: GradebookImportCourseV6; readonly roster: GradebookImportRosterV6 } {
  if (request.courses.length !== 1 || request.rosters.length !== 1) {
    throw new TypeError('staged-import-chunk-shape-invalid');
  }
  const course = request.courses[0]!;
  if (
    course.classGroupLabel !== descriptor.classGroupLabel ||
    course.subjectLabel !== descriptor.subjectLabel ||
    course.disciplineIndex !== descriptor.disciplineIndex
  ) {
    throw new TypeError('staged-import-chunk-course-mismatch');
  }
  const positions = orderedPositions(course);
  if (!sameJson(positions, descriptor.positions)) {
    throw new TypeError('staged-import-chunk-coverage-mismatch');
  }
  const roster = rosterForCourse(request, course);
  const canonicalRoster = rosterForClass(stage.rosters, descriptor.classGroupLabel);
  if (!sameJson(roster, canonicalRoster)) {
    throw new TypeError('staged-import-chunk-roster-mismatch');
  }
  return { course, roster };
}

function reducedPlanningRequest(
  request: GradebookImportPersistenceRequestV6,
  course: GradebookImportCourseV6,
  roster: GradebookImportRosterV6,
  positions: readonly number[],
): GradebookImportPersistenceRequestV6 {
  const selected = new Set(positions);
  return {
    ...request,
    rosters: [
      {
        classGroupLabel: roster.classGroupLabel,
        students: roster.students.filter((student) => selected.has(student[0])),
      },
    ],
    courses: [course],
  };
}

async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(digest, (entry) => entry.toString(16).padStart(2, '0')).join('');
}

function trackingUnitOfWork(base: PersistenceUnitOfWorkV2) {
  const incomingKeys = new Set<string>();
  let knownIdenticalContent = false;
  const baseRecords = base.academicRecords as PersistenceUnitOfWorkV2['academicRecords'] &
    BulkAcademicRecordRepositoryV1;
  const academicRecords = Object.assign(
    {},
    baseRecords,
    {
      getCurrent: async (
        context: Parameters<typeof baseRecords.getCurrent>[0],
        stream: Parameters<typeof baseRecords.getCurrent>[1],
      ) => {
        incomingKeys.add(academicRecordStreamKeyV1(stream));
        return baseRecords.getCurrent(context, stream);
      },
    },
    baseRecords.getCurrentMany
      ? {
          getCurrentMany: async (
            context: Parameters<NonNullable<typeof baseRecords.getCurrentMany>>[0],
            streams: Parameters<NonNullable<typeof baseRecords.getCurrentMany>>[1],
          ) => {
            streams.forEach((stream) => incomingKeys.add(academicRecordStreamKeyV1(stream)));
            return baseRecords.getCurrentMany!(context, streams);
          },
        }
      : {},
  );

  const unitOfWork: PersistenceUnitOfWorkV2 = {
    ...base,
    imports: {
      ...base.imports,
      findSourceFileByHash: async (context, hash) => {
        const found = await base.imports.findSourceFileByHash(context, hash);
        if (found) knownIdenticalContent = true;
        return found;
      },
    },
    academicRecords,
    logicalSourceRecords: {
      ...base.logicalSourceRecords,
      // A chunk is intentionally not the whole logical source. Missing-source detection is delayed
      // until finalize, after every staged incoming stable key is available.
      listCurrentStreams: async () => [],
    },
  };
  return {
    unitOfWork,
    incomingKeys,
    knownIdenticalContent: () => knownIdenticalContent,
  };
}

function deterministicId(sessionId: string, kind: string): string {
  return `${kind}:stage:${sessionId}`;
}

function successfulForStaging(response: GradebookImportPersistenceResponseV6): boolean {
  return response.state === 'applied' || response.state === 'no-changes';
}

export class GradebookImportStagingServiceV1 {
  constructor(
    private readonly repository: GradebookD1ImportStagingRepositoryV1,
    private readonly unitOfWork: PersistenceUnitOfWorkV2,
    private readonly annualStateSource: GradebookImportAnnualStateSourceV1,
  ) {}

  async begin(
    request: GradebookImportPersistenceRequestV6,
    now = new Date().toISOString(),
  ): Promise<GradebookImportStageBeginResultV1> {
    const chunks = deriveGradebookImportStageChunksV1(request);
    const sessionId = `gradebook-import-stage:${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.parse(now) + GRADEBOOK_IMPORT_STAGE_SESSION_TTL_MS_V1).toISOString();
    const value: GradebookImportStageMetadataV1 = {
      version: 1,
      fixedNow: now,
      header: requestHeader(request),
      rosters: request.rosters,
      chunks,
    };
    await this.repository.begin({
      sessionId,
      academicYearId: request.confirmedContext.academicYearId,
      sourceSha256: request.manifest.sha256,
      expectedChunkCount: chunks.length,
      metadataJson: JSON.stringify(value),
      createdAt: now,
      expiresAt,
    });
    return { state: 'ready', sessionId, chunkCount: chunks.length };
  }

  async prepare(
    sessionId: string,
    chunkIndex: number,
    request: GradebookImportPersistenceRequestV6,
  ): Promise<GradebookImportStagePrepareResultV1> {
    const session = await this.repository.getSession(sessionId);
    if (!session || session.state !== 'preparing') return { state: 'invalid-session' };
    if (Date.parse(session.expiresAt) <= Date.now()) return { state: 'expired' };
    const stage = metadata(session.metadataJson);
    if (!sameJson(stage.header, requestHeader(request))) return { state: 'conflict' };
    const descriptor = stage.chunks[chunkIndex];
    if (!descriptor || descriptor.index !== chunkIndex) return { state: 'conflict' };

    let selected: ReturnType<typeof validateChunkAgainstDescriptor>;
    try {
      selected = validateChunkAgainstDescriptor(request, descriptor, stage);
    } catch {
      return { state: 'conflict' };
    }
    const serializedRequest = JSON.stringify(request);
    const chunkHash = await sha256(serializedRequest);
    const known = await this.repository.getChunk(sessionId, chunkIndex);
    if (known) {
      if (known.chunkHash !== chunkHash) return { state: 'conflict' };
      return {
        state: 'already-prepared',
        sessionId,
        chunkIndex,
        preparedCount: await this.repository.preparedChunkCount(sessionId),
        expectedChunkCount: session.expectedChunkCount,
      };
    }

    const internalRequest = reducedPlanningRequest(
      request,
      selected.course,
      selected.roster,
      descriptor.positions,
    );
    const boundedUnitOfWork = await createGradebookImportStagingBoundedCatalogV1(
      this.unitOfWork,
      internalRequest,
    );
    const tracked = trackingUnitOfWork(boundedUnitOfWork);
    const capture = new GradebookImportStagingCaptureTransactionV1(
      tracked.unitOfWork,
      () => stage.fixedNow,
    );
    const response = await createGradebookImportPersistenceServiceV6({
      unitOfWork: tracked.unitOfWork,
      transaction: capture,
      annualStateSource: this.annualStateSource,
      now: () => stage.fixedNow,
      createId: (kind) => deterministicId(sessionId, kind),
    }).execute(internalRequest);
    if (!successfulForStaging(response)) return { state: 'rejected', response };

    let captured: StagedImportCaptureV1 | null = null;
    try {
      captured = capture.takeCapture();
    } catch {
      if (!tracked.knownIdenticalContent() || response.state !== 'no-changes') {
        return {
          state: 'rejected',
          response: { transportVersion: 6, state: 'unavailable' },
        };
      }
    }

    const payload = {
      knownIdenticalContent: tracked.knownIdenticalContent(),
      writes: captured?.payload ?? { entities: [], academicRecords: [], associations: [] },
    } as const;
    const metaWriteJson = JSON.stringify(captured?.meta ?? null);
    const store = await this.repository.storeChunk({
      session,
      chunkIndex,
      chunkHash,
      payloadJson: JSON.stringify(payload),
      incomingKeysJson: JSON.stringify([...tracked.incomingKeys].sort()),
      metaWriteJson,
      entityWriteCount: payload.writes.entities.length,
      academicRecordWriteCount: payload.writes.academicRecords.length,
      associationWriteCount: payload.writes.associations.length,
      createdAt: stage.fixedNow,
    });
    if (store === 'conflict') return { state: 'conflict' };
    return {
      state: store === 'already-present' ? 'already-prepared' : 'prepared',
      sessionId,
      chunkIndex,
      preparedCount: await this.repository.preparedChunkCount(sessionId),
      expectedChunkCount: session.expectedChunkCount,
    };
  }
}

export function gradebookImportStageSessionContextV1(
  session: GradebookImportStageSessionV1,
): { readonly academicYearId: GradebookImportPersistenceRequestV6['confirmedContext']['academicYearId'] } {
  return { academicYearId: session.academicYearId };
}
