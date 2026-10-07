import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  classifyMonitorV1,
  deploymentSummaryV1,
  githubEvidenceV1,
  monitorWindowV1,
  renderMonitorV1,
} from '../scripts/operational-monitor-v1';
import type { MonitorReportV1 } from '../scripts/operational-monitor-v1';
import {
  alertFingerprintV1,
  publishMonitorV1,
  transitionV1,
  unresolvedAlertsV1,
} from '../scripts/operational-monitor-publish-v1';

const now = new Date('2026-09-29T03:07:00Z');
const deploymentRun = {
  id: 10,
  run_number: 10,
  run_attempt: 1,
  head_sha: 'a'.repeat(40),
  created_at: now.toISOString(),
  head_branch: 'main',
  event: 'push',
  path: '.github/workflows/deploy-cloudflare-pages.yml',
  repository: { id: 1345061518 },
  head_repository: { id: 1345061518 },
};
const deploymentJob = { run_id: 10, run_attempt: 1, head_sha: deploymentRun.head_sha };
function monitorFetcherV1(fetcher: typeof fetch, body = '<!-- operational-monitor-v1 -->') {
  return (async (url, init) => {
    if (String(url).endsWith('/issues/1211'))
      return new Response(JSON.stringify({ user: { login: 'mcpmieda' } }));
    if (String(url).includes('/issues/1211/comments'))
      return new Response(
        JSON.stringify([{ id: 2, user: { login: 'github-actions[bot]' }, body }]),
      );
    return fetcher(url, init);
  }) as typeof fetch;
}
const report: MonitorReportV1 = {
  contractVersion: 1,
  checkedAt: now.toISOString(),
  window: { start: '2026-09-29T02:45:00.000Z', end: '2026-09-29T03:00:00.000Z' },
  daily: false,
  signals: {},
  alerts: [],
  gaps: ['database-no-workflow-credential'],
};

describe('operational monitor evidence', () => {
  it('fixes non-overlapping delayed quarters and yesterday in BRT', () => {
    expect(monitorWindowV1(now)).toEqual({
      start: new Date('2026-09-29T02:45:00Z'),
      end: new Date('2026-09-29T03:00:00Z'),
    });
    expect(monitorWindowV1(now, true)).toEqual({
      start: new Date('2026-09-28T03:00:00Z'),
      end: new Date('2026-09-29T03:00:00Z'),
    });
    expect(monitorWindowV1(new Date('2026-09-29T03:01:00Z')).end.toISOString()).toBe(
      '2026-09-29T02:45:00.000Z',
    );
  });
  it('rejects provider-controlled deployment strings and non-finite counters', () => {
    const clean = deploymentSummaryV1({
      worker: { state: 'accessible', modifiedAt: 'SECRET', present: true },
      pages: { state: 'SECRET', deploymentStatus: 'SECRET', productionBranch: 'SECRET' },
      analytics: { state: 'accessible', requests: Infinity, errors: 2 },
    });
    expect(JSON.stringify(clean)).not.toContain('SECRET');
    expect(clean.analytics.errors).toBe(2);
    expect(clean.analytics.requests).toBeUndefined();
  });
  it('reports missing evidence rather than inventing healthy counts', () => {
    const result = classifyMonitorV1({}, now);
    expect(result.alerts).toEqual([]);
    expect(result.gaps).toContain('telemetry');
    expect(result.gaps).toContain('public-probes');
    expect(renderMonitorV1(report)).toContain('cobertura parcial');
    expect(renderMonitorV1(report)).toContain('nem informa alunos online');
  });
  it('does not render discarded partial evidence as zero events', () => {
    const markdown = renderMonitorV1({
      ...report,
      signals: { telemetry: { sources: [{ id: 'auth-result', state: 'partial', rows: [] }] } },
    });
    expect(markdown).toContain('eventos observados: —');
    expect(markdown).not.toContain('eventos observados: 0');
  });
  it('does not equate refusal or canceled socket with native exception', () => {
    const result = classifyMonitorV1(
      {
        telemetry: {
          sources: [
            {
              id: 'auth-result',
              state: 'observed',
              rows: [{ count: 2, dimensions: { outcome: 'denied' } }],
            },
            {
              id: 'native-outcome',
              state: 'observed',
              rows: [{ count: 3, dimensions: { '$workers.outcome': 'canceled' } }],
            },
          ],
        },
      },
      now,
    );
    expect(result.alerts).toEqual([]);
    const failed = classifyMonitorV1(
      {
        telemetry: {
          sources: [
            {
              id: 'native-outcome',
              state: 'observed',
              rows: [{ count: 1, dimensions: { '$workers.outcome': 'exception' } }],
            },
          ],
        },
      },
      now,
    );
    expect(failed.alerts).toContain('telemetry:native-outcome:error');
  });
  it.each([
    { status: 'completed', conclusion: 'success', alert: false, gap: false },
    { status: 'completed', conclusion: 'failure', alert: true, gap: true },
    { status: 'in_progress', conclusion: null, alert: false, gap: true },
  ])(
    'classifies only the production job: $status / $conclusion',
    async ({ status, conclusion, alert, gap }) => {
      const fetcher = vi.fn<typeof fetch>(async (url, init) => {
        expect(init?.redirect).toBe('error');
        if (String(url).includes('/jobs?')) {
          expect(String(url)).toBe(
            'https://api.github.com/repos/mcpmieda/ecossistema-escola/actions/runs/10/jobs?filter=latest&per_page=100',
          );
          return new Response(
            JSON.stringify({
              total_count: 2,
              jobs: [
                {
                  name: 'Deploy production',
                  ...deploymentJob,
                  status,
                  conclusion,
                  completed_at: now.toISOString(),
                  private: 'SECRET',
                },
                { name: 'Monitoramento', status: 'completed', conclusion: 'failure' },
              ],
            }),
          );
        }
        return new Response(
          JSON.stringify({
            workflow_runs: [
              {
                ...deploymentRun,
                id: 10,
                head_sha: 'a'.repeat(40),
                updated_at: now.toISOString(),
                status: 'completed',
                conclusion: 'failure',
              },
            ],
          }),
        );
      });
      const github = await githubEvidenceV1('private-token', monitorFetcherV1(fetcher), {
        collectorSha: deploymentRun.head_sha,
      });
      expect(github[0]).toMatchObject({ scope: 'production-job', status });
      const classification = classifyMonitorV1({ github }, now);
      expect(classification.alerts.includes('production-workflow')).toBe(alert);
      expect(classification.gaps.includes('production-workflow')).toBe(gap);
      expect(classification.alerts).toContain('entra-audit');
      expect(JSON.stringify(github)).not.toMatch(/SECRET|private-token|Monitoramento/u);
    },
  );
  it.each([200, 403])(
    'keeps absent or inaccessible production jobs inconclusive, HTTP %i',
    async (status) => {
      const fetcher = vi.fn<typeof fetch>(async (url) =>
        String(url).includes('/jobs?')
          ? new Response(JSON.stringify({ jobs: [], error: 'SECRET' }), { status })
          : new Response(
              JSON.stringify({
                workflow_runs: [
                  { ...deploymentRun, id: 10, status: 'completed', conclusion: 'success' },
                ],
              }),
            ),
      );
      const github = await githubEvidenceV1('private-token', monitorFetcherV1(fetcher), {
        collectorSha: deploymentRun.head_sha,
      });
      expect(github[0]?.state).toBe(status === 200 ? 'inconclusive' : 'permission-required');
      const classification = classifyMonitorV1({ github }, now);
      expect(classification.gaps).toContain('production-workflow');
      expect(classification.alerts).not.toContain('production-workflow');
      expect(unresolvedAlertsV1(['production-workflow'], { ...report, ...classification })).toEqual(
        ['production-workflow'],
      );
      expect(JSON.stringify(github)).not.toContain('SECRET');
    },
  );
  it('returns only enumerated GitHub evidence', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          workflow_runs: [
            {
              id: 10,
              head_sha: 'a'.repeat(40),
              updated_at: now.toISOString(),
              status: 'completed',
              conclusion: 'success',
              name: 'SECRET',
              actor: { login: 'SECRET' },
            },
          ],
        }),
      ),
    );
    // Response bodies may be read once; return a fresh instance each call.
    fetcher.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            workflow_runs: [
              {
                ...deploymentRun,
                id: 10,
                head_sha: 'a'.repeat(40),
                updated_at: now.toISOString(),
                status: 'completed',
                conclusion: 'success',
                name: 'SECRET',
              },
            ],
          }),
        ),
      ),
    );
    const output = await githubEvidenceV1('private-token', monitorFetcherV1(fetcher), {
      collectorSha: deploymentRun.head_sha,
    });
    expect(JSON.stringify(output)).not.toMatch(/SECRET|private-token/u);
    expect(output[0]?.headSha).toBe('a'.repeat(40));
  });
});

describe('status and incident publication', () => {
  it('does not resolve a deployment incident while the next run is queued or cancelled', () => {
    for (const result of [
      { status: 'in_progress' },
      { status: 'completed', conclusion: 'cancelled' },
    ]) {
      const classification = classifyMonitorV1(
        {
          github: [{ workflow: 'deploy-cloudflare-pages.yml', state: 'accessible', ...result }],
          deployment: { pages: { state: 'accessible', status: 'queued' } },
        },
        now,
      );
      expect(
        unresolvedAlertsV1(['production-workflow', 'cloudflare:pages'], {
          ...report,
          ...classification,
        }),
      ).toEqual(['production-workflow', 'cloudflare:pages']);
    }
  });
  it('preserves incidents when their source becomes unavailable instead of declaring recovery', () => {
    const previous = ['probe:portal-health', 'worker-errors', 'telemetry:auth-result:error'];
    const unknown = {
      ...report,
      gaps: ['probe:portal-health', 'cloudflare:analytics', 'telemetry:auth-result'],
    };
    const unresolved = unresolvedAlertsV1(previous, unknown);
    expect(unresolved).toEqual(previous);
    expect(transitionV1(alertFingerprintV1(previous), unresolved)).toBe('unchanged');
    expect(unresolvedAlertsV1(previous, { ...report, gaps: [] })).toEqual([]);
  });
  it('deduplicates incident states but records recovery', () => {
    expect(transitionV1(undefined, [])).toBe('initial');
    expect(transitionV1(alertFingerprintV1(['a', 'b']), ['b', 'a', 'b'])).toBe('unchanged');
    expect(transitionV1(alertFingerprintV1(['a']), [])).toBe('recovery');
    expect(transitionV1(alertFingerprintV1([]), ['a'])).toBe('incident');
  });
  it('updates only a bot-owned marker and does not repeat normal comments', async () => {
    const requests: Array<{ url: string; method: string; body?: string }> = [];
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({
        url: String(url),
        method: init?.method ?? 'GET',
        body: String(init?.body ?? ''),
      });
      if (String(url).endsWith('/issues/1211'))
        return new Response(JSON.stringify({ user: { login: 'mcpmieda' } }));
      if ((init?.method ?? 'GET') === 'GET')
        return new Response(
          JSON.stringify([
            { id: 1, user: { login: 'untrusted' }, body: '<!-- operational-monitor-v1 -->' },
            {
              id: 2,
              user: { login: 'github-actions[bot]' },
              body: `<!-- operational-monitor-v1 -->\n<!-- alerts:${alertFingerprintV1([])} -->`,
            },
          ]),
        );
      return new Response('{}');
    });
    expect(
      await publishMonitorV1({ token: 'test', report, markdown: 'safe', runId: '123', fetcher }),
    ).toBe('unchanged');
    const mutations = requests.filter((r) => r.method !== 'GET');
    expect(mutations).toHaveLength(1);
    expect(mutations[0]?.url).toMatch(/issues\/comments\/2$/u);
    expect(mutations[0]?.method).toBe('PATCH');
  });
  it('keeps production secrets away from PR and report publication steps', () => {
    const yaml = readFileSync('.github/workflows/cloudflare-on-demand.yml', 'utf8');
    expect(yaml).toContain("cron: '7,22,37,52 * * * *'");
    expect(yaml).toContain('workflow_call:');
    expect(yaml).not.toContain('workflow_run:');
    const deploy = readFileSync('.github/workflows/deploy-cloudflare-pages.yml', 'utf8');
    expect(deploy).toContain('needs: deploy');
    expect(deploy).toContain('uses: ./.github/workflows/cloudflare-on-demand.yml');
    expect(deploy).toContain('post_deploy: true');
    expect(yaml).toContain('github.actor_id == github.repository_owner_id');
    expect(yaml).toContain('retention-days: 14');
    expect(yaml).toContain('retention-days: 90');
    const validation = yaml.split('  validate-definition:')[1]?.split('  execute:')[0];
    expect(validation).not.toContain('secrets.');
    const publish = yaml.split('- name: Atualizar painel')[1]?.split('- name: Sinalizar')[0];
    expect(publish).not.toContain('CLOUDFLARE');
    expect(yaml).not.toContain('actions: write');
  });
});

const recentRun = {
  ...deploymentRun,
  id: 37401708433,
  run_number: 800,
  created_at: '2026-10-06T01:56:40Z',
  updated_at: '2026-10-06T01:58:00Z',
  status: 'completed',
  conclusion: 'success',
};
const historicalRun = {
  ...recentRun,
  id: 35957973514,
  run_number: 600,
  created_at: '2026-09-24T02:00:00Z',
  updated_at: '2026-10-07T05:49:00Z',
  head_sha: 'b'.repeat(40),
  conclusion: 'failure',
};
function referenceForV1(run: typeof recentRun) {
  return {
    runId: run.id,
    runNumber: run.run_number,
    runAttempt: run.run_attempt,
    createdAt: new Date(run.created_at).toISOString(),
    headSha: run.head_sha,
  };
}
function statusForV1(run?: typeof recentRun, alerts: string[] = []) {
  return `<!-- operational-monitor-v1 -->\n${run ? `<!-- deployment-reference:${JSON.stringify(referenceForV1(run))} -->\n` : ''}<!-- alerts:${alertFingerprintV1(alerts)} -->\n<!-- alert-keys:${alerts.join(',')} -->`;
}
function monitorApiV1(
  options: {
    runs?: Record<string, unknown>[];
    body?: string;
    commentStatus?: number;
    job?: Record<string, unknown>;
    steps?: Record<string, unknown>[];
    jobCount?: number | null;
    jobLink?: string;
  } = {},
) {
  let body = options.body ?? statusForV1();
  const writes: Array<{ method: string; body: string }> = [];
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    const path = String(url);
    expect(init?.redirect).toBe('error');
    if ((init?.method ?? 'GET') !== 'GET') {
      const payload = JSON.parse(String(init?.body)) as { body: string };
      writes.push({ method: init!.method!, body: payload.body });
      if (init?.method === 'PATCH') body = payload.body;
      return new Response('{}');
    }
    if (path.endsWith('/issues/1211'))
      return new Response(JSON.stringify({ user: { login: 'mcpmieda' } }));
    if (path.includes('/issues/1211/comments'))
      return new Response(
        JSON.stringify([{ id: 2, user: { login: 'github-actions[bot]' }, body }]),
        {
          status: options.commentStatus ?? 200,
        },
      );
    if (path.includes('/jobs?')) {
      const run = (options.runs ?? [recentRun]).find((row) => path.includes(`/runs/${row.id}/`))!;
      return new Response(
        JSON.stringify({
          total_count: options.jobCount === null ? undefined : (options.jobCount ?? 1),
          jobs: [
            {
              name: 'Deploy production',
              run_id: run.id,
              run_attempt: run.run_attempt,
              head_sha: run.head_sha,
              status: run.status,
              conclusion: run.conclusion,
              completed_at: run.updated_at,
              steps: options.steps ?? [],
              ...options.job,
            },
          ],
        }),
        { headers: options.jobLink ? { link: options.jobLink } : {} },
      );
    }
    if (path.includes('deploy-cloudflare-pages.yml')) {
      expect(path).toContain('branch=main&event=push&per_page=20');
      return new Response(JSON.stringify({ workflow_runs: options.runs ?? [recentRun] }));
    }
    if (path.includes('entra-operations-audit.yml'))
      return new Response(
        JSON.stringify({ workflow_runs: [{ ...recentRun, conclusion: 'success' }] }),
      );
    throw new Error('Unexpected test endpoint');
  });
  return { fetcher, writes, body: () => body };
}
async function referenceReportV1(
  api: ReturnType<typeof monitorApiV1>,
  collectorSha = recentRun.head_sha,
) {
  const github = await githubEvidenceV1('private-token', api.fetcher, { collectorSha });
  return {
    ...report,
    collectorSha,
    signals: { github },
    ...classifyMonitorV1({ github }, new Date('2026-10-07T05:49:00Z')),
  };
}
async function publishReferenceReportV1(
  api: ReturnType<typeof monitorApiV1>,
  next: MonitorReportV1,
) {
  return publishMonitorV1({
    token: 'test',
    report: next,
    markdown: renderMonitorV1(next, true),
    runId: '123',
    fetcher: api.fetcher,
  });
}

describe('monotonic production workflow references', () => {
  it('persists a recent success then rejects the historical failure without a false incident', async () => {
    const first = monitorApiV1();
    const success = await referenceReportV1(first);
    expect(success.alerts).not.toContain('production-workflow');
    expect(await publishReferenceReportV1(first, success)).toBe('unchanged');
    expect(first.body()).toContain(
      `<!-- deployment-reference:${JSON.stringify(referenceForV1(recentRun))} -->`,
    );
    const next = monitorApiV1({ body: first.body(), runs: [historicalRun] });
    const stale = await referenceReportV1(next);
    expect(stale.signals.github[0]).toMatchObject({
      state: 'inconclusive',
      referenceState: 'regressed',
    });
    expect(stale.alerts).not.toContain('production-workflow');
    expect(stale.gaps).toContain('production-workflow-reference');
    expect(next.fetcher.mock.calls.some(([url]) => String(url).includes('/jobs?'))).toBe(false);
    expect(await publishReferenceReportV1(next, stale)).toBe('unchanged');
    expect(next.writes).toHaveLength(1);
    expect(next.body()).toContain(
      `<!-- deployment-reference:${JSON.stringify(referenceForV1(recentRun))} -->`,
    );
    const markdown = renderMonitorV1(stale);
    expect(markdown).toContain('run 35957973514');
    expect(markdown).toContain('2026-09-24T02:00:00.000Z');
    expect(markdown).toContain('Última referência confiável: [run 37401708433]');
    expect(markdown).toContain('não pôde ser confirmada');
    expect(markdown).not.toContain('terminou com falha');
  });
  it('does not recover a newer failure from historical success', async () => {
    const api = monitorApiV1({
      body: statusForV1({ ...recentRun, conclusion: 'failure' }, ['production-workflow']),
      runs: [{ ...historicalRun, conclusion: 'success' }],
    });
    const stale = await referenceReportV1(api);
    expect(await publishReferenceReportV1(api, stale)).toBe('unchanged');
    expect(api.writes).toHaveLength(1);
    expect(api.body()).toContain('Alertas anteriores ainda sem recuperação comprovada');
    expect(api.body()).toContain('<!-- alert-keys:production-workflow -->');
  });
  it('reports a genuine new failure with its exact run, date and allowed failed step', async () => {
    const failed = {
      ...recentRun,
      id: recentRun.id + 1,
      run_number: 801,
      head_sha: 'c'.repeat(40),
      created_at: '2026-10-07T06:00:00Z',
      updated_at: '2026-10-07T06:01:00Z',
      conclusion: 'failure',
    };
    const api = monitorApiV1({
      body: statusForV1(recentRun),
      runs: [failed],
      steps: [
        {
          number: 7,
          name: 'Prove both PR gates tested the production tree',
          conclusion: 'failure',
        },
        { number: 18, name: 'Deploy Cloudflare Pages', conclusion: 'skipped' },
        { number: 19, name: 'SECRET', conclusion: 'failure' },
      ],
    });
    const next = await referenceReportV1(api, failed.head_sha);
    expect(next.alerts).toContain('production-workflow');
    expect(await publishReferenceReportV1(api, next)).toBe('incident');
    expect(api.writes).toHaveLength(2);
    for (const write of api.writes) {
      expect(write.body).toContain(`run ${failed.id}`);
      expect(write.body).toContain('2026-10-07T06:01:00.000Z');
      expect(write.body).toContain('Prove both PR gates tested the production tree');
      expect(write.body).not.toContain('SECRET');
    }
    expect(JSON.stringify(next)).not.toMatch(/SECRET|private-token/u);
  });
  it('orders a shuffled page by immutable creation identity, not updated_at or array position', async () => {
    const api = monitorApiV1({ runs: [historicalRun, recentRun] });
    const next = await referenceReportV1(api);
    expect(next.signals.github[0]).toMatchObject({
      runId: recentRun.id,
      referenceState: 'verified',
      conclusion: 'success',
    });
    expect(next.alerts).not.toContain('production-workflow');
  });
  it.each([
    { patch: { run_number: 801 }, reason: 'inconsistent' },
    { patch: { run_number: 700, created_at: '2026-10-07T06:00:00Z' }, reason: 'inconsistent' },
    { patch: { head_branch: 'other' }, reason: 'invalid-metadata' },
    { patch: { event: 'pull_request' }, reason: 'invalid-metadata' },
    { patch: { path: 'other.yml' }, reason: 'invalid-metadata' },
    { patch: { repository: { id: 1 } }, reason: 'invalid-metadata' },
    { patch: { head_repository: { id: 1 } }, reason: 'invalid-metadata' },
    { patch: { created_at: 'SECRET' }, reason: 'invalid-metadata' },
    { patch: { run_attempt: 0 }, reason: 'invalid-metadata' },
  ])('rejects invalid or conflicting run identity: $patch', async ({ patch, reason }) => {
    const api = monitorApiV1({
      body: statusForV1(recentRun),
      runs: [{ ...historicalRun, ...patch }],
    });
    const next = await referenceReportV1(api);
    expect(next.signals.github[0]).toMatchObject({ state: 'inconclusive', referenceState: reason });
    expect(next.alerts).not.toContain('production-workflow');
    expect(next.gaps).toContain('production-workflow');
    expect(JSON.stringify(next)).not.toContain('SECRET');
  });
  it('cannot bootstrap against an old head or without a checkout SHA', async () => {
    for (const collectorSha of [recentRun.head_sha, '']) {
      const api = monitorApiV1({ runs: [historicalRun] });
      const next = await referenceReportV1(api, collectorSha);
      expect(next.signals.github[0]).toMatchObject({
        state: 'inconclusive',
        referenceState: 'head-mismatch',
      });
      expect(next.alerts).not.toContain('production-workflow');
      await publishReferenceReportV1(api, next);
      expect(api.body()).not.toContain('<!-- deployment-reference:');
    }
  });
  it('preserves the watermark and incident when main has advanced but its run is absent', async () => {
    const api = monitorApiV1({ body: statusForV1(recentRun, ['production-workflow']) });
    const next = await referenceReportV1(api, 'c'.repeat(40));
    expect(next.gaps).toContain('production-workflow');
    expect(await publishReferenceReportV1(api, next)).toBe('unchanged');
    expect(api.body()).toContain('<!-- alert-keys:production-workflow -->');
    expect(api.body()).toContain(
      `<!-- deployment-reference:${JSON.stringify(referenceForV1(recentRun))} -->`,
    );
  });
  it('does not treat an unreadable watermark as first-run bootstrap', async () => {
    const api = monitorApiV1({ commentStatus: 403 });
    const next = await referenceReportV1(api);
    expect(next.signals.github[0]).toMatchObject({
      state: 'inconclusive',
      referenceState: 'baseline-unavailable',
    });
    expect(next.gaps).toContain('production-workflow');
  });
  it('keeps a corrupted watermark as a gap until a run matching main replaces it', async () => {
    const corrupted = `${statusForV1(undefined, ['production-workflow'])}\n<!-- deployment-reference:SECRET -->`;
    const stale = monitorApiV1({ body: corrupted, runs: [historicalRun] });
    const gap = await referenceReportV1(stale);
    expect(gap.signals.github[0]).toMatchObject({
      state: 'inconclusive',
      referenceState: 'head-mismatch',
    });
    expect(gap.alerts).not.toContain('production-workflow');
    expect(JSON.stringify(gap)).not.toContain('SECRET');
    expect(await publishReferenceReportV1(stale, gap)).toBe('unchanged');
    expect(stale.body()).toContain('<!-- deployment-reference:invalid -->');
    const healed = monitorApiV1({ body: stale.body() });
    const next = await referenceReportV1(healed);
    expect(next.signals.github[0]).toMatchObject({ referenceState: 'verified' });
    await publishReferenceReportV1(healed, next);
    expect(healed.body()).toContain(
      `<!-- deployment-reference:${JSON.stringify(referenceForV1(recentRun))} -->`,
    );
    expect(healed.body()).not.toContain('deployment-reference:invalid');
  });
  it('rejects earlier attempts and permits a newer successful attempt to prove recovery', async () => {
    const attempted = { ...recentRun, run_attempt: 2 };
    const old = monitorApiV1({ body: statusForV1(attempted, ['production-workflow']) });
    const next = await referenceReportV1(old);
    expect(next.signals.github[0]).toMatchObject({ referenceState: 'regressed' });
    expect(await publishReferenceReportV1(old, next)).toBe('unchanged');
    const retry = monitorApiV1({
      body: statusForV1(recentRun, ['production-workflow']),
      runs: [attempted],
    });
    const recovery = await referenceReportV1(retry);
    expect(await publishReferenceReportV1(retry, recovery)).toBe('recovery');
  });
  it.each([{ run_id: 1 }, { run_attempt: 2 }, { head_sha: 'c'.repeat(40) }])(
    'does not use jobs from a different run, attempt or head: $0',
    async (job) => {
      const api = monitorApiV1({ body: statusForV1(recentRun, ['production-workflow']), job });
      const next = await referenceReportV1(api);
      expect(next.signals.github[0]).toMatchObject({ state: 'inconclusive' });
      expect(next.alerts).not.toContain('production-workflow');
      expect(await publishReferenceReportV1(api, next)).toBe('unchanged');
    },
  );
  it('refuses a collector whose verified reference became obsolete before publication', async () => {
    const first = monitorApiV1({ runs: [historicalRun] });
    const next = await referenceReportV1(first, historicalRun.head_sha);
    const changed = monitorApiV1({ body: statusForV1(recentRun) });
    await expect(publishReferenceReportV1(changed, next)).rejects.toThrow(
      'Deployment reference changed',
    );
    expect(changed.writes).toHaveLength(0);
  });
});

describe('incomplete production job responses', () => {
  it.each([
    { jobCount: null },
    { jobCount: 2 },
    { jobCount: 1.5 },
    { jobLink: '<https://api.github.com/next>; rel="next"' },
  ])('keeps truncated or malformed job evidence inconclusive: $0', async (options) => {
    const api = monitorApiV1({ ...options, body: statusForV1(recentRun, ['production-workflow']) });
    const next = await referenceReportV1(api);
    expect(next.gaps).toContain('production-workflow');
    expect(await publishReferenceReportV1(api, next)).toBe('unchanged');
  });
  it('does not alert on a contradictory in-progress failure', async () => {
    const api = monitorApiV1({ job: { status: 'in_progress', conclusion: 'failure' } });
    const next = await referenceReportV1(api);
    expect(next.alerts).not.toContain('production-workflow');
    expect(next.gaps).toContain('production-workflow');
  });
});
