import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PortalDemoAppV1 } from '../student-portal/portal-demo-app-v1';

/**
 * Portal do Aluno demo for ADM administrators (owner request 29/09/2026): the real Portal screens
 * with invented data and the admin simulator. No account, database or student data is involved.
 */
function PortalDemoGateV1() {
  const [state, setState] = useState<'checking' | 'allowed' | 'denied'>('checking');
  useEffect(() => {
    let active = true;
    void fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        const me = response.ok ? ((await response.json()) as { capabilities?: unknown }) : null;
        const allowed =
          Array.isArray(me?.capabilities) && me.capabilities.includes('platform.settings.read');
        if (active) setState(allowed ? 'allowed' : 'denied');
      })
      .catch(() => {
        if (active) setState('denied');
      });
    return () => {
      active = false;
    };
  }, []);
  if (state === 'allowed') return <PortalDemoAppV1 />;
  if (state === 'checking') return null;
  return (
    <p style={{ margin: '2rem', font: '16px system-ui' }}>
      Acesso restrito. <a href="/">Entrar no Centro de Administração</a>
    </p>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Demo root missing');

createRoot(root).render(
  <StrictMode>
    <PortalDemoGateV1 />
  </StrictMode>,
);
