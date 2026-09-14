import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StudentPortalApp, type StudentEntryV1 } from './app';
import { consumeStudentQrLocationV1 } from '../features/student-portal/auth/qr-input-v1';
import '../features/student-portal/shared/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Portal root missing');
const entry: StudentEntryV1 = {
  qr: null,
  invalidQr: false,
  route:
    location.pathname === '/' ? 'root' : location.pathname === '/access' ? 'access' : 'unknown',
};
// Remove even malformed fragments before rendering or mounting the external risk widget.
try {
  entry.qr = consumeStudentQrLocationV1(location, history);
} catch {
  entry.invalidQr = true;
}
createRoot(root).render(
  <StrictMode>
    <StudentPortalApp entry={entry} />
  </StrictMode>,
);
