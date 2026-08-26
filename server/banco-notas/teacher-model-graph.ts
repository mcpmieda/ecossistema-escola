import { z } from 'zod';

const recipientSchema = z
  .object({
    entraObjectId: z.string().uuid(),
    upn: z.string().email(),
  })
  .strict();

const storedModelSchema = z
  .object({
    teacherModelId: z.string().uuid(),
    fileName: z
      .string()
      .min(1)
      .max(180)
      .regex(/\.xlsx$/iu),
    modelHash: z.string().regex(/^[a-f0-9]{64}$/u),
    definitionVersion: z.string().min(1).max(40),
    mappingVersion: z.number().int().min(1),
    content: z.instanceof(Uint8Array),
  })
  .strict();

export type TeacherModelGraphGateway = {
  store(input: {
    fileName: string;
    content: Uint8Array;
    correlationId: string;
  }): Promise<{ driveItemId: string; etag: string }>;
  share(input: {
    driveItemId: string;
    recipientEntraObjectId: string;
    recipientUpn: string;
    correlationId: string;
    requireSignIn: true;
  }): Promise<{ permissionId: string }>;
  metadata(input: {
    driveItemId: string;
    correlationId: string;
  }): Promise<{ etag: string; size: number; sha256?: string }>;
  revokeShare(input: {
    driveItemId: string;
    permissionId: string;
    correlationId: string;
  }): Promise<void>;
  remove(input: { driveItemId: string; correlationId: string }): Promise<void>;
};

export type TeacherModelCompensation = {
  shareRevoked: boolean;
  storedFileRemoved: boolean;
  errors: string[];
};

export type TeacherModelShareAudit = {
  record(input: {
    teacherModelId: string;
    recipientEntraObjectId: string;
    recipientUpn: string;
    driveItemId?: string;
    result: 'succeeded' | 'failed';
    correlationId: string;
    safeError?: string;
    compensation?: TeacherModelCompensation;
  }): Promise<void>;
};

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 180) : 'unknown_error';
}

export async function storeShareAndVerifyTeacherModel(args: {
  model: z.input<typeof storedModelSchema>;
  recipient: z.input<typeof recipientSchema>;
  gateway: TeacherModelGraphGateway;
  audit: TeacherModelShareAudit;
  correlationId?: string;
}): Promise<{
  driveItemId: string;
  permissionId: string;
  etag: string;
  correlationId: string;
}> {
  const model = storedModelSchema.parse(args.model);
  const recipient = recipientSchema.parse(args.recipient);
  const correlationId = args.correlationId ?? crypto.randomUUID();
  let driveItemId: string | undefined;
  let permissionId: string | undefined;
  try {
    const stored = await args.gateway.store({
      fileName: model.fileName,
      content: model.content,
      correlationId,
    });
    driveItemId = stored.driveItemId;
    const shared = await args.gateway.share({
      driveItemId,
      recipientEntraObjectId: recipient.entraObjectId,
      recipientUpn: recipient.upn,
      correlationId,
      requireSignIn: true,
    });
    permissionId = shared.permissionId;
    const metadata = await args.gateway.metadata({ driveItemId, correlationId });
    if (metadata.size !== model.content.byteLength) throw new Error('stored_model_size_mismatch');
    if (metadata.sha256 && metadata.sha256 !== model.modelHash) {
      throw new Error('stored_model_hash_mismatch');
    }
    await args.audit.record({
      teacherModelId: model.teacherModelId,
      recipientEntraObjectId: recipient.entraObjectId,
      recipientUpn: recipient.upn,
      driveItemId,
      result: 'succeeded',
      correlationId,
    });
    return {
      driveItemId,
      permissionId,
      etag: metadata.etag,
      correlationId,
    };
  } catch (error) {
    const compensation: TeacherModelCompensation = {
      shareRevoked: false,
      storedFileRemoved: false,
      errors: [],
    };
    if (driveItemId && permissionId) {
      try {
        await args.gateway.revokeShare({ driveItemId, permissionId, correlationId });
        compensation.shareRevoked = true;
      } catch (compensationError) {
        compensation.errors.push(`revoke:${safeError(compensationError)}`);
      }
    }
    if (driveItemId) {
      try {
        await args.gateway.remove({ driveItemId, correlationId });
        compensation.storedFileRemoved = true;
      } catch (compensationError) {
        compensation.errors.push(`remove:${safeError(compensationError)}`);
      }
    }
    const originalError = safeError(error);
    await args.audit.record({
      teacherModelId: model.teacherModelId,
      recipientEntraObjectId: recipient.entraObjectId,
      recipientUpn: recipient.upn,
      driveItemId,
      result: 'failed',
      correlationId,
      safeError: originalError,
      compensation,
    });
    if (compensation.errors.length > 0) {
      throw new Error(`teacher_model_compensation_failed:${originalError}`, { cause: error });
    }
    throw error;
  }
}
