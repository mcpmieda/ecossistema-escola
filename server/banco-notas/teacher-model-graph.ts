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
  }): Promise<void>;
};

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
      permissionId: shared.permissionId,
      etag: metadata.etag,
      correlationId,
    };
  } catch (error) {
    await args.audit.record({
      teacherModelId: model.teacherModelId,
      recipientEntraObjectId: recipient.entraObjectId,
      recipientUpn: recipient.upn,
      driveItemId,
      result: 'failed',
      correlationId,
      safeError: error instanceof Error ? error.message.slice(0, 180) : 'unknown_error',
    });
    throw error;
  }
}
