import type { z } from 'zod';
import { activateRequestV1, challengeRequestV1, challengeResponseV1, loginRequestV1,
  logoutRequestV1, logoutResponseV1, sessionResponseV1 } from '../../../../shared/student-portal-contracts/auth-v1';
import { selfResponseV1 } from '../../../../shared/student-portal-contracts/self-v1';
import { createPortalTransportV1, portalRequestBodyV1, type PortalTransportOptionsV1 } from './transport-v1';

export function createPortalSelfClientV1(options: PortalTransportOptionsV1 = {}) {
  const send = createPortalTransportV1(options);
  return {
    session: (signal?: AbortSignal) => send('/api/student/session', sessionResponseV1, signal),
    me: (signal?: AbortSignal) => send('/api/student/me', selfResponseV1, signal),
    challenge: (input: z.input<typeof challengeRequestV1>, signal?: AbortSignal) =>
      send('/api/student/auth/challenge', challengeResponseV1, signal, portalRequestBodyV1(challengeRequestV1, input)),
    activate: (input: z.input<typeof activateRequestV1>, signal?: AbortSignal) =>
      send('/api/student/auth/activate', sessionResponseV1, signal, portalRequestBodyV1(activateRequestV1, input)),
    login: (input: z.input<typeof loginRequestV1>, signal?: AbortSignal) =>
      send('/api/student/auth/login', sessionResponseV1, signal, portalRequestBodyV1(loginRequestV1, input)),
    logout: (signal?: AbortSignal) => send('/api/student/auth/logout', logoutResponseV1, signal,
      portalRequestBodyV1(logoutRequestV1, { contractVersion: 1 })),
  };
}
export type PortalSelfClientV1 = ReturnType<typeof createPortalSelfClientV1>;
