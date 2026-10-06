import { z } from 'zod';

export const PUBLIC_DEMO_ADMIN_PATH_V1 = '/api/platform/public-demo';
export const publicDemoStateSchemaV1 = z
  .object({ enabled: z.boolean(), revision: z.number().int().nonnegative() })
  .strict();
export const publicDemoChangeSchemaV1 = z
  .object({ enabled: z.boolean(), expectedRevision: z.number().int().nonnegative() })
  .strict();
export type PublicDemoStateV1 = z.infer<typeof publicDemoStateSchemaV1>;
export type PublicDemoAuthorityV1 = {
  actorId: string;
  tenantId: string;
  requestId: string;
  authenticatedAt: string;
  capability: 'platform.settings.read' | 'platform.settings.write';
};
export type PublicDemoControlBindingV1 = {
  getState(authority: PublicDemoAuthorityV1): Promise<PublicDemoStateV1>;
  setEnabled(
    authority: PublicDemoAuthorityV1,
    change: z.infer<typeof publicDemoChangeSchemaV1>,
  ): Promise<{ ok: boolean; state: PublicDemoStateV1 }>;
};
