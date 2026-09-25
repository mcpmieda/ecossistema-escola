import { validateEnv, type RuntimeEnv } from '../../../server/env';
import { previewRequestAllowed } from '../../../server/preview-read-only';
import { servePhotoRuntimeV1 } from '../../../server/student-photos/http/runtime-v1';
import { runtimePhotoCodecV1 } from '../../../server/student-photos/runtime-codec-v1';

export const onRequest: PagesFunction<RuntimeEnv> = async ({ request, env }) => {
  try {
    const runtimeEnv = validateEnv(env);
    if (!(await previewRequestAllowed(request, runtimeEnv)))
      return Response.json({ state: 'forbidden' }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
    return await servePhotoRuntimeV1(request, runtimeEnv, runtimePhotoCodecV1);
  } catch {
    return Response.json({ state: 'unavailable' }, { status: 503, headers: {
      'Cache-Control': 'private, no-store', Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin',
    } });
  }
};
