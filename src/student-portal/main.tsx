import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StudentPortalApp } from './app';
import '../features/student-portal/shared/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Portal root missing');
createRoot(root).render(<StrictMode><StudentPortalApp /></StrictMode>);
