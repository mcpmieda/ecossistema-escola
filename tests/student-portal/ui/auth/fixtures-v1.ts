import { vi } from 'vitest';
import {
  SYNTHETIC_ID_V1,
  SYNTHETIC_SELF_V1,
} from '../../../../shared/student-portal-contracts/fixtures-v1';
import type { PortalSelfClientV1 } from '../../../../src/features/student-portal/shared/self-client-v1';

export const SESSION = {
  contractVersion: 1,
  requestId: SYNTHETIC_ID_V1,
  state: 'authenticated',
  expiresAt: '2026-09-14T12:00:00Z',
  persistent: true,
} as const;
export const REQUIRED = (next: 'pin' | 'password' | 'risk') =>
  ({ contractVersion: 1, requestId: SYNTHETIC_ID_V1, state: 'credential-required', next }) as const;
export const PROOF = {
  contractVersion: 1,
  requestId: SYNTHETIC_ID_V1,
  state: 'password-creation',
  challenge: 'synthetic_proof_'.repeat(3),
  expiresAt: '2026-09-13T12:05:00Z',
} as const;
export const NOW = Date.parse('2026-09-13T12:00:00Z');
export function clientFixtureV1() {
  return {
    session: vi.fn<PortalSelfClientV1['session']>().mockResolvedValue(SESSION),
    me: vi.fn<PortalSelfClientV1['me']>().mockResolvedValue(SYNTHETIC_SELF_V1),
    challenge: vi.fn<PortalSelfClientV1['challenge']>().mockResolvedValue(REQUIRED('pin')),
    activate: vi.fn<PortalSelfClientV1['activate']>().mockResolvedValue(SESSION),
    login: vi.fn<PortalSelfClientV1['login']>().mockResolvedValue(SESSION),
    logout: vi
      .fn<PortalSelfClientV1['logout']>()
      .mockResolvedValue({ contractVersion: 1, requestId: SYNTHETIC_ID_V1, state: 'logged-out' }),
  };
}
