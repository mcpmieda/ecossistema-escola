import { expect, it, vi } from 'vitest';
import { portalAuthBurstV1 } from '../../../server/student-portal/observability/auth-burst-v1';
import { portalServingGateV1 } from '../../../server/student-portal/maintenance/serving-gate-v1';

it('never exports the opaque credential to the limiter and refuses missing or failed bindings', async () => {
  const global = { limit: vi.fn().mockResolvedValue({ success: true }) };
  const subject = { limit: vi.fn().mockResolvedValue({ success: true }) };
  const guard = portalAuthBurstV1(global, subject);
  expect(await guard('SYNTHETIC_OPAQUE_CREDENTIAL')).toBe(true);
  expect(subject.limit).toHaveBeenCalledWith({ key: expect.stringMatching(/^[a-f0-9]{64}$/u) });
  expect(JSON.stringify(subject.limit.mock.calls)).not.toContain('SYNTHETIC');
  global.limit.mockResolvedValueOnce({ success: false });
  expect(await guard('SYNTHETIC_OPAQUE_CREDENTIAL')).toBe(false);
  expect(subject.limit).toHaveBeenCalledTimes(1);
  subject.limit.mockRejectedValueOnce(new Error('provider-private-detail'));
  await expect(guard('SYNTHETIC_OPAQUE_CREDENTIAL')).rejects.toThrow('student-portal-rate-limit-unavailable');
});

it('keeps missing, malformed and closed deployment gates unavailable', () => {
  for (const value of [undefined, null, false, true, '', 'false', 'TRUE']) expect(portalServingGateV1(value)?.status).toBe(503);
  expect(portalServingGateV1('true')).toBeNull();
});
