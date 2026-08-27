import { z } from 'zod';
import type { RuntimeEnv } from '../env';
import {
  getGraphToken,
  graphContentRequest,
  graphRequest,
  type GraphDependencies,
} from '../graph/client';
import type { TeacherModelGraphGateway } from './teacher-model-graph';

const targetSchema = z
  .object({
    driveId: z.string().trim().min(1).max(512),
    parentItemId: z.string().trim().min(1).max(512),
  })
  .strict();

const uploadResponseSchema = z
  .object({
    id: z.string().min(1),
    eTag: z.string().min(1).optional(),
  })
  .passthrough();

const metadataResponseSchema = z
  .object({
    id: z.string().min(1),
    eTag: z.string().min(1),
    size: z.number().int().min(0),
  })
  .passthrough();

const inviteResponseSchema = z
  .object({
    value: z.array(
      z
        .object({
          id: z.string().min(1),
          grantedToV2: z
            .object({
              user: z
                .object({
                  id: z.string().min(1).optional(),
                })
                .passthrough()
                .optional(),
            })
            .passthrough()
            .optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type TeacherModelGraphTarget = z.infer<typeof targetSchema>;

export type TeacherModelGraphGatewayDependencies = {
  graph?: GraphDependencies;
  tokenProvider?: () => Promise<string>;
};

function graphSegment(value: string): string {
  return encodeURIComponent(value);
}

function graphFileName(value: string): string {
  if (!/\.xlsx$/iu.test(value)) throw new Error('teacher_model_graph_filename_not_xlsx');
  const hasUnsafeCharacter = Array.from(value).some(
    (character) => character === '\\' || character === '/' || character.charCodeAt(0) <= 0x1f,
  );
  if (hasUnsafeCharacter) {
    throw new Error('teacher_model_graph_filename_unsafe');
  }
  return encodeURIComponent(value);
}

export function teacherModelGraphTargetFromEnv(env: RuntimeEnv): TeacherModelGraphTarget {
  return targetSchema.parse({
    driveId: env.BANCO_NOTAS_GRAPH_DRIVE_ID,
    parentItemId: env.BANCO_NOTAS_GRAPH_PARENT_ITEM_ID,
  });
}

export function createTeacherModelGraphGateway(args: {
  env: RuntimeEnv;
  target: TeacherModelGraphTarget;
  dependencies?: TeacherModelGraphGatewayDependencies;
}): TeacherModelGraphGateway {
  const target = targetSchema.parse(args.target);
  const graphDependencies = args.dependencies?.graph;
  let tokenPromise: Promise<string> | undefined;
  const token = (): Promise<string> => {
    tokenPromise ??=
      args.dependencies?.tokenProvider?.() ?? getGraphToken(args.env, graphDependencies);
    return tokenPromise;
  };
  const drivePath = `/drives/${graphSegment(target.driveId)}`;

  return {
    async store(input) {
      const accessToken = await token();
      const result = await graphContentRequest({
        env: args.env,
        path: `${drivePath}/items/${graphSegment(target.parentItemId)}:/${graphFileName(input.fileName)}:/content`,
        method: 'PUT',
        body: input.content,
        contentType: XLSX_CONTENT_TYPE,
        correlationId: input.correlationId,
        dependencies: graphDependencies,
        token: accessToken,
      });
      const uploaded = uploadResponseSchema.parse(await result.response.json());
      const etag = uploaded.eTag ?? result.response.headers.get('ETag');
      if (!etag) throw new Error('teacher_model_graph_upload_etag_missing');
      return { driveItemId: uploaded.id, etag };
    },

    async share(input) {
      if (!input.requireSignIn) throw new Error('teacher_model_graph_signin_required');
      const accessToken = await token();
      const result = await graphRequest<unknown>({
        env: args.env,
        path: `${drivePath}/items/${graphSegment(input.driveItemId)}/invite`,
        method: 'POST',
        body: {
          recipients: [{ email: input.recipientUpn }],
          requireSignIn: true,
          sendInvitation: false,
          roles: ['write'],
        },
        correlationId: input.correlationId,
        dependencies: graphDependencies,
        token: accessToken,
      });
      const invited = inviteResponseSchema.parse(result.data);
      const permission = invited.value.find(
        (item) => item.grantedToV2?.user?.id === input.recipientEntraObjectId,
      );
      if (!permission) throw new Error('teacher_model_graph_recipient_identity_mismatch');
      return { permissionId: permission.id };
    },

    async metadata(input) {
      const accessToken = await token();
      const metadata = metadataResponseSchema.parse(
        (
          await graphRequest<unknown>({
            env: args.env,
            path: `${drivePath}/items/${graphSegment(input.driveItemId)}?$select=id,eTag,size`,
            correlationId: input.correlationId,
            dependencies: graphDependencies,
            token: accessToken,
          })
        ).data,
      );
      if (metadata.id !== input.driveItemId) {
        throw new Error('teacher_model_graph_metadata_identity_mismatch');
      }
      return { etag: metadata.eTag, size: metadata.size };
    },

    async download(input) {
      const accessToken = await token();
      const downloaded = await graphContentRequest({
        env: args.env,
        path: `${drivePath}/items/${graphSegment(input.driveItemId)}/content`,
        method: 'GET',
        correlationId: input.correlationId,
        dependencies: graphDependencies,
        token: accessToken,
      });
      return new Uint8Array(await downloaded.response.arrayBuffer());
    },

    async revokeShare(input) {
      const accessToken = await token();
      await graphRequest<unknown>({
        env: args.env,
        path: `${drivePath}/items/${graphSegment(input.driveItemId)}/permissions/${graphSegment(input.permissionId)}`,
        method: 'DELETE',
        correlationId: input.correlationId,
        dependencies: graphDependencies,
        token: accessToken,
      });
    },

    async remove(input) {
      const accessToken = await token();
      await graphRequest<unknown>({
        env: args.env,
        path: `${drivePath}/items/${graphSegment(input.driveItemId)}`,
        method: 'DELETE',
        prefer: input.bypassSharedLock ? 'bypass-shared-lock' : undefined,
        correlationId: input.correlationId,
        dependencies: graphDependencies,
        token: accessToken,
      });
    },
  };
}
