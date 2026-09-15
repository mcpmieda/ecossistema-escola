import { z } from 'zod';
import {
  adminCommandV1,
  adminQueryV1,
  adminResponseV1,
  type AdminCommandV1,
  type AdminResponseV1,
} from '../../../../shared/student-portal-contracts/admin-v1';
import {
  createPortalTransportV1,
  isAmbiguousPortalResponseV1,
  portalRequestBodyV1,
  type PortalTransportOptionsV1,
} from '../../student-portal/shared/transport-v1';

export type PortalAdminQueryInputV1 = z.input<typeof adminQueryV1>;
export type PortalAdminCommandInputV1 = z.input<typeof adminCommandV1>;
function responseFor(state: AdminResponseV1['state']) {
  return adminResponseV1.refine((value) => value.state === state, 'Unexpected operation response');
}
function commandState(command: AdminCommandV1): AdminResponseV1['state'] {
  return command.operation.startsWith('qr-')
    ? 'qr'
    : command.operation === 'birth-batch'
      ? 'batch'
      : 'committed';
}
export function createPortalAdminClientV1(options: PortalTransportOptionsV1 = {}) {
  const send = createPortalTransportV1(options);
  const prepareCommand = (input: PortalAdminCommandInputV1) => {
    // Capture canonical bytes once. A retry preserves CAS, idempotency and every batch item.
    const body = portalRequestBodyV1(adminCommandV1, input);
    const command = adminCommandV1.parse(JSON.parse(body));
    const schema = responseFor(commandState(command));
    return {
      execute: async (signal?: AbortSignal) => {
        try {
          return await send('/api/student-portal/admin/command', schema, signal, body);
        } catch (error) {
          signal?.throwIfAborted();
          if (!isAmbiguousPortalResponseV1(error)) throw error;
          // One bounded confirmation replay preserves the exact idempotency key, CAS and bytes.
          // Domain controllers retain the same prepared command for explicit recovery if this also fails.
          return send('/api/student-portal/admin/command', schema, signal, body);
        }
      },
    };
  };
  return {
    query: async (input: PortalAdminQueryInputV1, signal?: AbortSignal) => {
      const body = portalRequestBodyV1(adminQueryV1, input);
      const schema = responseFor(input.operation);
      const recoverableRead = input.operation === 'publication' || input.operation === 'settings';
      try {
        return await send('/api/student-portal/admin/query', schema, signal, body);
      } catch (error) {
        signal?.throwIfAborted();
        // Pure reads only; never retry preview creation, denial, conflict or Retry-After here.
        if (!recoverableRead || !isAmbiguousPortalResponseV1(error)) throw error;
        return send('/api/student-portal/admin/query', schema, signal, body);
      }
    },
    command: (input: PortalAdminCommandInputV1, signal?: AbortSignal) =>
      prepareCommand(input).execute(signal),
    prepareCommand,
  };
}
export type PortalAdminClientV1 = ReturnType<typeof createPortalAdminClientV1>;
