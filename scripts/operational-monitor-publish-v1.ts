import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { MonitorReportV1 } from './operational-monitor-v1.ts';
import { renderMonitorV1 } from './operational-monitor-v1.ts';

const base = 'https://api.github.com/repos/mcpmieda/ecossistema-escola';
const marker = '<!-- operational-monitor-v1 -->';
export const alertFingerprintV1 = (alerts: string[]) =>
  createHash('sha256')
    .update([...new Set(alerts)].sort().join('\n'))
    .digest('hex');

export function transitionV1(previous: string | undefined, alerts: string[]) {
  const current = alertFingerprintV1(alerts);
  if (!previous) return alerts.length ? 'incident' : 'initial';
  if (previous === current) return 'unchanged';
  return alerts.length ? 'incident' : 'recovery';
}

export function unresolvedAlertsV1(previousAlerts: string[], report: MonitorReportV1) {
  return previousAlerts.filter((id) => {
    if (report.alerts.includes(id)) return false;
    if (id.startsWith('probe:'))
      return report.gaps.includes(id) || report.gaps.includes('public-probes');
    if (id === 'worker-errors') return report.gaps.includes('cloudflare:analytics');
    if (id === 'hyperdrive-config') return report.gaps.includes('hyperdrive');
    if (id === 'sonar-quality-gate') return report.gaps.includes('sonar');
    if (id.startsWith('telemetry:'))
      return report.gaps.includes(id.replace(/:error$/u, '')) || report.gaps.includes('telemetry');
    if (id.startsWith('cloudflare:')) return report.gaps.includes(id);
    return report.gaps.includes(id) || report.gaps.includes('github');
  });
}

export async function publishMonitorV1(input: {
  token: string;
  report: MonitorReportV1;
  markdown: string;
  runId: string;
  fetcher?: typeof fetch;
}) {
  if (!/^\d+$/u.test(input.runId) || !input.token) throw new Error('Missing publisher context');
  const fetcher = input.fetcher ?? fetch;
  async function api(path: string, method = 'GET', body?: unknown): Promise<unknown> {
    const response = await fetcher(base + path, {
      method,
      headers: {
        Authorization: `Bearer ${input.token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('GitHub report unavailable');
    }
    return response.json();
  }
  const issue = (await api('/issues/1211')) as {
    user?: { login?: string };
    pull_request?: unknown;
  };
  if (issue.user?.login !== 'mcpmieda' || issue.pull_request)
    throw new Error('Unexpected monitor issue');
  let existing: { id: number; body: string } | undefined;
  for (let page = 1; page <= 10; page++) {
    const result = await api(`/issues/1211/comments?per_page=100&page=${page}`);
    if (!Array.isArray(result)) throw new Error('Invalid comments');
    for (const item of result) {
      if (
        item.user?.login === 'github-actions[bot]' &&
        Number.isSafeInteger(item.id) &&
        typeof item.body === 'string' &&
        item.body.startsWith(marker)
      )
        existing = { id: item.id, body: item.body };
    }
    if (result.length < 100) break;
    if (page === 10) throw new Error('Comment lookup exceeded bound');
  }
  const previous = existing?.body.match(/<!-- alerts:([a-f0-9]{64}) -->/u)?.[1];
  const encodedAlerts = existing?.body.match(/<!-- alert-keys:([a-z:,-]*) -->/u)?.[1] ?? '';
  const unresolved = unresolvedAlertsV1(encodedAlerts.split(',').filter(Boolean), input.report);
  const effectiveAlerts = [...new Set([...input.report.alerts, ...unresolved])].sort();
  const kind = transitionV1(previous, effectiveAlerts);
  const runUrl = `https://github.com/mcpmieda/ecossistema-escola/actions/runs/${input.runId}`;
  const earlierEnd = existing?.body.match(/<!-- window-end:(\d{4}-\d\d-\d\dT[\d:.]+Z) -->/u)?.[1];
  const gap =
    earlierEnd && Date.parse(earlierEnd) < Date.parse(input.report.window.start)
      ? '\n**Lacuna entre verificações:** a janela anterior terminou antes do início desta. Não há comprovação contínua desse intervalo pelos relatórios periódicos.\n'
      : '';
  const uncertainty = unresolved.length
    ? `\n**Alertas anteriores ainda sem recuperação comprovada:** ${unresolved.map((id) => `\`${id}\``).join(', ')}. A fonte ficou sem evidência suficiente; isso não é recuperação.\n`
    : '';
  const body = `${marker}\n<!-- alerts:${alertFingerprintV1(effectiveAlerts)} -->\n<!-- alert-keys:${effectiveAlerts.join(',')} -->\n<!-- window-end:${input.report.window.end} -->\n${uncertainty}\n${input.markdown}\n${gap}\n[Última execução e relatórios para download](${runUrl})\n`;
  await api(
    existing ? `/issues/comments/${existing.id}` : '/issues/1211/comments',
    existing ? 'PATCH' : 'POST',
    { body },
  );
  if (kind === 'incident' || kind === 'recovery') {
    await api('/issues/1211/comments', 'POST', {
      body: `### Monitoramento automático — ${kind === 'incident' ? 'mudança nos alertas' : 'recuperação dos alertas anteriores'}\n\n${input.report.checkedAt}\n\n${kind === 'incident' ? effectiveAlerts.map((id) => `- \`${id}\``).join('\n') : 'As fontes dos alertas anteriores responderam sem os sinais de erro nesta verificação. As demais limitações de cobertura continuam registradas no relatório.'}\n${uncertainty}\n[Ver evidências e limitações](${runUrl})`,
    });
  }
  return kind;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.env.MONITOR_DIR;
  readFile(`${root}/report.json`, 'utf8')
    .then((json) => {
      const report = JSON.parse(json) as MonitorReportV1;
      return publishMonitorV1({
        token: process.env.GH_TOKEN ?? '',
        report,
        markdown: renderMonitorV1(report, true),
        runId: process.env.GITHUB_RUN_ID ?? '',
      });
    })
    .catch(() => {
      console.error(
        'Não foi possível atualizar o painel na issue; consulte os artefatos desta execução.',
      );
      process.exitCode = 1;
    });
}
