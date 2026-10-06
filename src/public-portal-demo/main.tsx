import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PortalDemoAppV1 } from '../student-portal/portal-demo-app-v1';
import './privacy.css';
import { PortalPreferenceScopeV1 } from '../features/student-portal/shell/preference-scope-v1';

// Standalone presentation and invented data. Never mount the ADM/session entrypoint here.
const root = document.getElementById('root');
if (!root) throw new Error('Demo root missing');
createRoot(root).render(
  <StrictMode>
    <aside className="public-demo-privacy" aria-label="Sobre esta demonstração">
      <strong>Demonstração com dados fictícios.</strong> Explore o Portal do Aluno e experimente os
      controles de simulação.
    </aside>
    <PortalPreferenceScopeV1 value="publicPortalDemo:">
      <PortalDemoAppV1 />
    </PortalPreferenceScopeV1>
  </StrictMode>,
);
