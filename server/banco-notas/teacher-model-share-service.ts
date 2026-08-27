import {
  storeShareAndVerifyTeacherModel,
  type TeacherModelDownloadedWorkbookVerifier,
  type TeacherModelGraphGateway,
  type TeacherModelShareAudit,
} from './teacher-model-graph';
import {
  D1TeacherModelRepository,
  type TeacherModelShareRecord,
} from './d1-teacher-model-repository';

export type ShareTeacherModelInput = {
  teacherModelId: string;
  fileName: string;
  modelHash: string;
  definitionVersion: string;
  mappingVersion: number;
  content: Uint8Array;
  recipientUpn: string;
  actor: string;
};

function assertCandidateMatchesReadyModel(
  input: ShareTeacherModelInput,
  ready: {
    modelHash: string;
    definitionVersion: string;
    mappingVersion: number;
  },
): void {
  if (input.modelHash !== ready.modelHash) throw new Error('teacher_model_share_hash_mismatch');
  if (input.definitionVersion !== ready.definitionVersion) {
    throw new Error('teacher_model_share_definition_version_mismatch');
  }
  if (input.mappingVersion !== ready.mappingVersion) {
    throw new Error('teacher_model_share_mapping_version_mismatch');
  }
}

function stableBytes(content: Uint8Array): Uint8Array<ArrayBuffer> {
  const stable = new Uint8Array(new ArrayBuffer(content.byteLength));
  stable.set(content);
  return stable;
}

export async function shareTeacherModel(args: {
  input: ShareTeacherModelInput;
  repository: D1TeacherModelRepository;
  gateway: TeacherModelGraphGateway;
  verifyDownloadedWorkbook: TeacherModelDownloadedWorkbookVerifier;
}): Promise<{
  driveItemId: string;
  permissionId: string;
  etag: string;
  correlationId: string;
  contentIntegrity: 'exact' | 'sharepoint_normalized';
}> {
  const ready = await args.repository.prepareShare(args.input.teacherModelId, args.input.actor);
  assertCandidateMatchesReadyModel(args.input, ready);
  const content = stableBytes(args.input.content);

  const correlationId = crypto.randomUUID();
  const baseShareRecord: Omit<TeacherModelShareRecord, 'driveItemId' | 'safeError' | 'details'> = {
    teacherModelId: ready.teacherModelId,
    recipientEntraObjectId: ready.teacherEntraObjectId,
    recipientUpn: args.input.recipientUpn,
    correlationId,
    actor: args.input.actor,
  };

  await args.repository.recordShareRequested(baseShareRecord);

  const audit: TeacherModelShareAudit = {
    record: async (event) => {
      if (event.result === 'succeeded') {
        if (!event.driveItemId) throw new Error('teacher_model_drive_item_required');
        await args.repository.recordShareSucceeded({
          ...baseShareRecord,
          driveItemId: event.driveItemId,
        });
        return;
      }

      await args.repository.recordShareFailed({
        ...baseShareRecord,
        driveItemId: event.driveItemId,
        safeError: event.safeError,
        details: event.compensation
          ? {
              compensation: event.compensation,
            }
          : undefined,
      });
    },
  };

  return storeShareAndVerifyTeacherModel({
    model: {
      teacherModelId: ready.teacherModelId,
      fileName: args.input.fileName,
      modelHash: args.input.modelHash,
      definitionVersion: args.input.definitionVersion,
      mappingVersion: args.input.mappingVersion,
      content,
    },
    recipient: {
      entraObjectId: ready.teacherEntraObjectId,
      upn: args.input.recipientUpn,
    },
    gateway: args.gateway,
    audit,
    verifyDownloadedWorkbook: args.verifyDownloadedWorkbook,
    correlationId,
  });
}
