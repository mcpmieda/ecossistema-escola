import { withRequestSessionScopeV1 } from '../server/auth/session';
import type { RuntimeEnv } from '../server/env';
import { guardAdminOperationV1 } from '../server/http/admin-rate-limit-v1';

export const onRequest: PagesFunction<RuntimeEnv> = (context) =>
  withRequestSessionScopeV1(
    async () =>
      (await guardAdminOperationV1(context.request, context.env)) ?? (await context.next()),
  );
