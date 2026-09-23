import { useEffect, useState } from 'react';
import type { SelfResponseV1 } from '../../../../shared/student-portal-contracts/self-v1';
import { createPortraitClientV1, type PortraitClientV1, type PortraitObjectV1 } from './portrait-client-v1';

const defaultClient = createPortraitClientV1();
const dispose = (photo: PortraitObjectV1 | undefined) => { try { photo?.dispose(); } catch { /* Optional media cleanup cannot interrupt logout. */ } };
export type PortraitScopeV1 = Pick<SelfResponseV1, 'requestId'> & {
  profile: Pick<SelfResponseV1['profile'], 'accountId'>;
};

/** No polling, persistence, focus listener, session transition or academic dependency. */
export function useStudentPortraitV1(self: PortraitScopeV1 | null, client: PortraitClientV1 = defaultClient): string | undefined {
  const accountId = self?.profile.accountId;
  const key = self ? `${self.profile.accountId}:${self.requestId}` : null;
  const [loaded, setLoaded] = useState<{ key: string; client: PortraitClientV1; signal: AbortSignal; photo: PortraitObjectV1 }>();
  useEffect(() => {
    if (!key || !accountId) return;
    const controller = new AbortController();
    let current = true;
    let photo: PortraitObjectV1 | undefined;
    // StrictMode's abandoned initial setup must not cause a duplicate network download.
    void Promise.resolve().then(() => controller.signal.aborted ? undefined : client(accountId, controller.signal)).then(value => {
      if (!current) { dispose(value); return; }
      photo = value;
      if (value) setLoaded({ key, client, signal: controller.signal, photo: value });
    }).catch(() => undefined);
    return () => { current = false; controller.abort(); dispose(photo); };
  }, [key, accountId, client]);
  // Also reject disposed media when a caller reuses a previous self object after logging out.
  return key && loaded?.key === key && loaded.client === client && !loaded.signal.aborted ? loaded.photo.src : undefined;
}
