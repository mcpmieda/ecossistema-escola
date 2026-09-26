import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StudentPortalAdminPage } from '../features/student-portal-admin/student-portal-admin-page';
import type { PortalFetchV1 } from '../features/student-portal/shared/transport-v1';
import type { AdminQueryV1 } from '../../shared/student-portal-contracts/admin-v1';
import type { AdminReadQueryV2 } from '../../shared/student-portal-contracts/admin-read-v2';
import {
  operationsMockV1,
  opIdV1,
  opJsonV1,
} from '../../tests/student-portal/ui/overview/fixtures-v1';
import { settingsFixtureV1 } from '../../tests/student-portal/ui/settings/fixtures-v1';
import { publicationFixtureV1 } from '../../tests/student-portal/ui/publication/fixtures-v1';
import { SYNTHETIC_QR_V1 } from '../../shared/student-portal-contracts/fixtures-v1';
import syntheticPortraitWebp from './assets/synthetic-student-portrait.webp';
import '../styles.css';

/** Local visual preview. Optional personal data lives only in a git-ignored file. */
type LocalStudent = {
  name: string;
  birthYear: string | null;
  classId: number | null;
  classLabel: string;
};
const syntheticView = new URLSearchParams(window.location.search).has('synthetic');
const localStudents = syntheticView
  ? undefined
  : Object.values(
      import.meta.glob<LocalStudent[]>('./local-data.json', { eager: true, import: 'default' }),
    )[0];
const mock = operationsMockV1();
if (localStudents?.length) {
  const template = mock.accounts[0]!;
  mock.accounts.splice(
    0,
    mock.accounts.length,
    ...localStudents.map((student, index) => ({
      ...template,
      accountId: opIdV1(index + 1),
      link: { academicYear: 2026 as const, studentId: 756001 + index },
      name: student.name,
      classId: student.classId,
      classLabel: student.classLabel,
      eligibility: student.classId === null ? ('unlinked' as const) : ('eligible' as const),
      access:
        student.classId === null
          ? {
              state: 'unresolved' as const,
              enabled: null,
              source: null,
              settingsVersion: null,
              accessPermitted: false,
            }
          : {
              state: 'resolved' as const,
              enabled: true,
              source: {
                kind: 'class' as const,
                academicYear: 2026 as const,
                classId: student.classId,
              },
              settingsVersion: 3,
              accessPermitted: true,
            },
    })),
  );
} else {
  for (const [index, account] of mock.accounts.entries()) {
    account.accountId = opIdV1(9901 + index);
    account.name = [
      'Ana Costa',
      'Bruno Martins',
      'Maria Eduarda de Albuquerque Vasconcelos Ferreira da Silva',
    ][index]!;
    account.classLabel = '7º ANO A';
  }
}
const classes = localStudents?.length
  ? [
      ...new Map(
        localStudents
          .filter((student) => student.classId !== null)
          .map((student) => [
            student.classId!,
            { id: student.classId!, label: student.classLabel },
          ]),
      ).values(),
    ]
  : [{ id: 756001, label: '7º ANO A' }];
const inScope = (scope: AdminQueryV1['scope']) =>
  mock.accounts.filter(
    (account) =>
      scope.kind === 'school' ||
      (scope.kind === 'class' && account.classId === scope.classId) ||
      (scope.kind === 'account' && account.accountId === scope.accountId),
  );
const pageOf = <T,>(items: T[], cursor: string | undefined, limit: number) => {
  const offset = cursor ? Number(cursor.slice(32)) : 0;
  const end = offset + limit;
  return {
    items: items.slice(offset, end),
    nextCursor: end < items.length ? 'c'.repeat(32) + end : null,
  };
};
const requestId = opIdV1(9900);
const observedAt = '2026-09-25T12:00:00Z';
const meta = { contractVersion: 1, requestId };
const nativeFetch = window.fetch.bind(window);

const previewFetch: PortalFetchV1 = async (path, init) => {
  init.signal?.throwIfAborted();
  if (path.startsWith('/api/student-photos/admin/image')) {
    const response = await nativeFetch(syntheticView ? syntheticPortraitWebp : path, init);
    return response.headers.get('content-type')?.split(';', 1)[0] === 'image/webp'
      ? response
      : new Response(null, { status: 404 });
  }
  if (path === '/api/me')
    return opJsonV1({
      authenticated: true,
      identityKey: 'preview-sintetico-admin',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      capabilities: ['platform.settings.read', 'platform.settings.write'],
    });
  if (path === '/api/gradebook/operational-workspace') {
    const input = JSON.parse(String(init.body)) as { offset: number; limit: number; query: string };
    const filtered = classes.filter((item) =>
      item.label.toLocaleLowerCase('pt-BR').includes(input.query.toLocaleLowerCase('pt-BR')),
    );
    return opJsonV1({
      contractVersion: 2,
      state: 'ready',
      operation: 'search',
      context: { year: 2026, minimumApprovalMilli: 60000, maxCouncilComponents: 2 },
      items: filtered.slice(input.offset, input.offset + input.limit).map((item) => ({
        entity: { kind: 'class-group' as const, id: item.id, label: item.label },
        description: null,
      })),
      nextOffset: input.offset + input.limit < filtered.length ? input.offset + input.limit : null,
    });
  }
  if (path === '/api/student-portal/admin/command') {
    const command = JSON.parse(String(init.body)) as {
      operation: string;
      accountId?: string;
      expectedVersion?: number;
    };
    const account = mock.accounts.find((item) => item.accountId === command.accountId);
    if (
      command.operation === 'qr-reprint' &&
      account?.firstAccess.qrIssued &&
      command.expectedVersion === account.version
    )
      return opJsonV1({
        ...meta,
        state: 'qr',
        version: account.version,
        cards: [{ accountId: account.accountId, qr: SYNTHETIC_QR_V1, mode: 'qr-only' }],
      });
    return opJsonV1({ ...meta, state: 'forbidden' }, 403);
  }
  if (path !== '/api/student-portal/admin/query')
    return opJsonV1({ ...meta, state: 'not-found' }, 404);

  const query = JSON.parse(String(init.body)) as AdminQueryV1 | AdminReadQueryV2;
  const scope = query.scope;
  if (query.operation === 'settings')
    return opJsonV1({ ...meta, state: 'settings', settings: settingsFixtureV1(scope) });
  if (query.operation === 'publication')
    return opJsonV1({ ...meta, state: 'publication', items: publicationFixtureV1(scope).items });
  if (query.operation === 'birth-years')
    return opJsonV1({
      ...meta,
      state: 'birth-years',
      scopeVersion: 7,
      ...pageOf(
        inScope(scope).map((account) => ({
          accountId: account.accountId,
          accountVersion: account.version,
          year: localStudents?.[mock.accounts.indexOf(account)]?.birthYear ?? null,
          confirmation: localStudents?.[mock.accounts.indexOf(account)]?.birthYear
            ? 'confirmed'
            : null,
          version: 1,
        })),
        query.page.cursor,
        query.page.limit,
      ),
    });
  if (query.operation === 'settings-overrides')
    return opJsonV1({
      ...meta,
      contractVersion: 2,
      state: 'settings-overrides',
      observedAt,
      scope,
      items: [],
      nextCursor: null,
    });
  if (query.operation === 'customizations-read')
    return opJsonV1({
      ...meta,
      contractVersion: 2,
      state: 'customizations-read',
      observedAt,
      scope,
      publicationVersion: 7,
      items: [],
      nextCursor: null,
      context: null,
    });
  if (query.operation === 'closing-preview')
    return opJsonV1({
      ...meta,
      contractVersion: 2,
      state: 'closing-preview',
      observedAt,
      scope,
      available: true,
      visibleToStudent: false,
      mode: 'conclusion',
      closedPeriods: ['T1'],
      subjects: [
        {
          subjectId: 800001,
          label: 'MATEMÁTICA',
          closings: [
            {
              period: 'T1',
              mode: 'conclusion',
              level: 'attention',
              conclusion: { code: 'conclusion.attention', variant: 0 },
              weight: { code: 'weight.assessments', variant: 0 },
              strength: { code: 'strength.activities', variant: 0 },
              action: { code: 'action.assessments', variant: 0 },
            },
          ],
        },
        {
          subjectId: 800002,
          label: 'LÍNGUA PORTUGUESA',
          closings: [
            {
              period: 'T1',
              mode: 'conclusion',
              level: 'good',
              conclusion: { code: 'line.good', variant: 0 },
            },
          ],
        },
      ],
      summary: {
        period: 'T1',
        mode: 'conclusion',
        message: { code: 'summary.few-attention', variant: 0 },
        attentionSubjectIds: [800001],
      },
    });
  if (query.operation === 'presence')
    return opJsonV1({
      ...meta,
      state: 'presence',
      connectedStudents: 2,
      observedAt,
      windowSeconds: 60,
    });
  if (query.operation === 'links-preview')
    return opJsonV1({
      ...meta,
      state: 'links-preview',
      count: 0,
      previewToken: 'synthetic-preview-token',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      version: 7,
    });
  if (query.operation === 'accounts')
    return opJsonV1({
      ...meta,
      state: 'accounts',
      scopeVersion: 7,
      ...pageOf(
        inScope(scope).map(
          ({ accountId, link, name, classLabel, state, eligibility, blocked, version }) => ({
            accountId,
            link,
            name,
            classLabel,
            state,
            eligibility,
            blocked,
            version,
          }),
        ),
        query.page.cursor,
        query.page.limit,
      ),
    });
  if (query.operation === 'population') {
    const count = mock.accounts.length;
    const unlinked = mock.accounts.filter((account) => account.eligibility === 'unlinked').length;
    return opJsonV1({
      ...meta,
      state: 'population',
      enabled: true,
      version: 7,
      sourceProfiles: count,
      eligibleSourceProfiles: count - unlinked,
      exitSourceProfiles: unlinked,
      classes: classes.length,
      accounts: count,
      eligibleAccounts: count - unlinked,
      deniedAccounts: unlinked,
      missingProfiles: 0,
      overrideRows: 0,
    });
  }
  if (query.operation === 'overview') {
    const response = await mock.reader.query(query);
    if (response.state === 'overview')
      return opJsonV1({
        ...response,
        observedAt,
        counts: {
          accounts: inScope(scope).length,
          active: inScope(scope).length,
          pendingActivation: 0,
          resetRequired: 0,
          blocked: 0,
          unresolved: inScope(scope).filter((account) => account.access.state === 'unresolved')
            .length,
          unlinked: inScope(scope).filter((account) => account.eligibility === 'unlinked').length,
          accessEnabled: inScope(scope).filter((account) => account.access.enabled).length,
          accessPermitted: inScope(scope).filter((account) => account.access.accessPermitted)
            .length,
          validSessions: inScope(scope).some((account) => account.accountId === opIdV1(1)) ? 1 : 0,
        },
      });
  }
  const response =
    query.contractVersion === 2 ? await mock.reader.query(query) : await mock.client.query(query);
  return opJsonV1(response);
};

// The class catalog and other browser reads use fetch directly; keep this preview offline.
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  previewFetch(String(input), init ?? {})) as typeof window.fetch;

if (!window.location.hash) window.history.replaceState(null, '', '#/painel-do-aluno');
const root = document.getElementById('root');
if (!root) throw new Error('Preview root missing');
createRoot(root).render(
  <StrictMode>
    <main className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
      <p className="mb-5 text-xs font-medium text-muted">
        Preview local ·{' '}
        {localStudents
          ? 'nomes, anos de nascimento e fotos reais locais; demais dados sintéticos'
          : 'dados sintéticos'}{' '}
        · QR sintético; alterações bloqueadas
      </p>
      <StudentPortalAdminPage fetcher={previewFetch} />
    </main>
  </StrictMode>,
);
