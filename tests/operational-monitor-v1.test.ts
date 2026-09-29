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
    const output = await githubEvidenceV1('private-token', fetcher);
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
