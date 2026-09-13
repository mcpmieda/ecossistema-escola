import type { z } from 'zod';
import {
  adminClassCatalogRequestV2,
  adminReadQueryV2,
  adminReadResponseV2,
  type AdminReadResponseV2,
} from '../../../../shared/student-portal-contracts/admin-read-v2';
import {
  createPortalTransportV1,
  portalRequestBodyV1,
  PortalClientErrorV1,
  type PortalTransportOptionsV1,
} from '../../student-portal/shared/transport-v1';
import { requestOperationalWorkspaceV2 } from '../../gradebook/operational-workspace/operational-workspace-client-v2';
import {
  isOperationalWorkspaceResponseV2,
  workspaceResponseMatchesRequestV2,
} from '../../../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v2';

export type AccountsReadPageV2 = Extract<AdminReadResponseV2, { state: 'accounts-read' }>;
export type ClassCatalogPageV2 = {
  items: { id: number; label: string }[];
  nextOffset: number | null;
};
export function createPortalAdminReadClientV2(options: PortalTransportOptionsV1 = {}) {
  const send = createPortalTransportV1(options);
  return {
    query: (input: z.input<typeof adminReadQueryV2>, signal?: AbortSignal) =>
      send(
        '/api/student-portal/admin/query',
        adminReadResponseV2.refine((value) => value.state === input.operation),
        signal,
        portalRequestBodyV1(adminReadQueryV2, input),
      ),
  };
}
export type PortalAdminReadClientV2 = ReturnType<typeof createPortalAdminReadClientV2>;

/** The existing authorized BN search is the catalog, including classes with zero accounts. */
export function createPortalClassCatalogV2(request = requestOperationalWorkspaceV2) {
  return async (
    offset: number,
    query: string,
    signal?: AbortSignal,
  ): Promise<ClassCatalogPageV2> => {
    const input = adminClassCatalogRequestV2(offset, 100, query);
    const result = await request(input, signal);
    signal?.throwIfAborted();
    if (result.state === 'not-authorized') throw new PortalClientErrorV1('forbidden');
    if (
      !isOperationalWorkspaceResponseV2(result) ||
      !workspaceResponseMatchesRequestV2(input, result) ||
      result.state !== 'ready' ||
      result.operation !== 'search'
    )
      throw new PortalClientErrorV1('unavailable');
    const items = result.items.map((item) => {
      if (item.entity.kind !== 'class-group') throw new PortalClientErrorV1('invalid-response');
      return { id: item.entity.id, label: item.entity.label };
    });
    if (
      new Set(items.map((item) => item.id)).size !== items.length ||
      (result.nextOffset !== null && result.nextOffset <= offset)
    )
      throw new PortalClientErrorV1('invalid-response');
    return { items, nextOffset: result.nextOffset };
  };
}
export type PortalClassCatalogV2 = ReturnType<typeof createPortalClassCatalogV2>;
