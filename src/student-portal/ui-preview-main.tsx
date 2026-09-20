import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StudentGradesV1 } from '../features/student-portal/grades/student-grades-v1';
import { StudentPortalPageV1 } from '../features/student-portal/shell/student-shell-v1';
import { selfResponseV1 } from '../../shared/student-portal-contracts/self-v1';
import '../features/student-portal/shared/styles.css';

const previewData = selfResponseV1.parse({
  contractVersion: 1,
  requestId: '11111111-1111-4111-8111-111111111111',
  state: 'ready',
  profile: {
    accountId: '11111111-1111-4111-8111-111111111111',
    link: { academicYear: 2026, studentId: 900001 },
    name: 'Estudante de demonstração',
    classLabel: '9º Ano A · Demonstração',
    academicState: 'regular',
    result: 'in-progress',
  },
  revisions: {
    dataVersion: 'preview:academic:1',
    policyVersion: 'preview:policy:1',
    publicationVersion: 'preview:publication:1',
  },
  generatedAt: '2026-09-20T12:00:00-03:00',
  subjects: [
    {
      subjectId: 900001,
      label: 'Matemática',
      order: 1,
      periods: [
        {
          period: 'T1',
          final: { kind: 'score', value: 8.2, maximum: 10, meetsMinimum: true },
          partials: [
            { assessmentId: 910001, label: 'I Avaliação', mark: { kind: 'score', value: 8.5, maximum: 10, meetsMinimum: true } },
            { assessmentId: 910002, label: 'II Avaliação', mark: { kind: 'score', value: 7.9, maximum: 10, meetsMinimum: true } },
          ],
        },
        {
          period: 'T2',
          final: { kind: 'score', value: 8.8, maximum: 10, meetsMinimum: true },
          partials: [
            { assessmentId: 910003, label: 'I Avaliação', mark: { kind: 'score', value: 9, maximum: 10, meetsMinimum: true } },
            { assessmentId: 910004, label: 'Atividade de resolução de problemas', mark: { kind: 'score', value: 1.8, maximum: 2, meetsMinimum: true } },
          ],
        },
        { period: 'T3', final: { kind: 'score', value: 9.2, maximum: 10, meetsMinimum: true } },
        { period: 'REC1', final: { kind: 'recovery-pending' } },
      ],
    },
    {
      subjectId: 900002,
      label: 'Língua Portuguesa',
      order: 2,
      periods: [
        { period: 'T1', final: { kind: 'score', value: 7.4, maximum: 10, meetsMinimum: true } },
        { period: 'T2', final: { kind: 'score', value: 8.1, maximum: 10, meetsMinimum: true } },
        { period: 'T3', final: { kind: 'score', value: 8.5, maximum: 10, meetsMinimum: true } },
      ],
    },
    {
      subjectId: 900003,
      label: 'Ciências',
      order: 3,
      periods: [
        { period: 'T1', final: { kind: 'score', value: 8.6, maximum: 10, meetsMinimum: true } },
        { period: 'T2', final: { kind: 'score', value: 9, maximum: 10, meetsMinimum: true } },
        { period: 'T3', final: { kind: 'score', value: 8.9, maximum: 10, meetsMinimum: true } },
      ],
      officialOutcome: 'approved',
    },
    {
      subjectId: 900004,
      label: 'História',
      order: 4,
      periods: [
        { period: 'T1', final: { kind: 'score', value: 6.1, maximum: 10, meetsMinimum: false } },
        { period: 'T2', final: { kind: 'score', value: 6.8, maximum: 10, meetsMinimum: false } },
        { period: 'T3', final: { kind: 'score', value: 7.2, maximum: 10, meetsMinimum: true } },
      ],
    },
    {
      subjectId: 900005,
      label: 'Geografia',
      order: 5,
      periods: [
        { period: 'T1', final: { kind: 'score', value: 7.9, maximum: 10, meetsMinimum: true } },
        { period: 'T2', final: { kind: 'score', value: 8.3, maximum: 10, meetsMinimum: true } },
        { period: 'T3', final: { kind: 'score', value: 8.4, maximum: 10, meetsMinimum: true } },
      ],
    },
    {
      subjectId: 900006,
      label: 'Inglês',
      order: 6,
      periods: [
        { period: 'T1', final: { kind: 'score', value: 8.4, maximum: 10, meetsMinimum: true } },
        { period: 'T2', final: { kind: 'score', value: 8.7, maximum: 10, meetsMinimum: true } },
        { period: 'T3', final: { kind: 'score', value: 9, maximum: 10, meetsMinimum: true } },
      ],
    },
  ],
});

const root = document.getElementById('root');
if (!root) throw new Error('Preview root missing');

createRoot(root).render(
  <StrictMode>
    <StudentPortalPageV1
      load={{ state: 'ready', data: previewData }}
      grades={(data) => <StudentGradesV1 data={data} />}
      onLogout={() => undefined}
    />
  </StrictMode>,
);
