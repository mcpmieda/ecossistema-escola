import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  diagnoseCloudflarePortalDeployV1,
  diagnoseCloudflarePortalHyperdriveV1,
} from './cloudflare-operator-v1.ts';
import { collectOperationalProbesV1 } from './operational-probes-v1.ts';
import {
  collectOperationalTelemetryV1,
  collectOperationalHourlyTelemetryV1,
} from './operational-telemetry-v1.ts';

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as ObjectValue) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const count = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
const states = [
  'accessible',
  'permission-required',
  'inconclusive',
  'unavailable',
  'credential-missing',
  'not-found',
] as const;
const safeState = (value: unknown) => states.find((item) => item === value) ?? 'inconclusive';
const timestamp = (value: unknown): string | undefined =>
  typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT[\d:.]+Z$/u.test(value) &&
  Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : undefined;
const sha = (value: unknown): string | undefined =>
  typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value) ? value : undefined;

function scalar(value: unknown, fallback = '—'): string {
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

export function monitorWindowV1(now: Date, daily = false) {
  const interval = daily ? 86_400_000 : 900_000;
  const offset = daily ? 10_800_000 : 0; // midnight America/Sao_Paulo (UTC-03).
  const end = Math.floor((now.getTime() - 120_000 - offset) / interval) * interval + offset;
  return { start: new Date(end - interval), end: new Date(end) };
}

// The old operator's strings are provider-controlled; narrow them again before public output.
export function deploymentSummaryV1(input: unknown) {
  const data = object(input),
    worker = object(data.worker),
    pages = object(data.pages),
    analytics = object(data.analytics);
  return {
    checkedAt: timestamp(data.checkedAt),
    worker: {
      state: safeState(worker.state),
      present: typeof worker.present === 'boolean' ? worker.present : undefined,
      modifiedAt: timestamp(worker.modifiedAt),
    },
    pages: {
      state: safeState(pages.state),
      present: typeof pages.present === 'boolean' ? pages.present : undefined,
      status: ['success', 'failure', 'active', 'queued', 'canceled'].find(
        (value) => value === pages.deploymentStatus,
      ),
      createdAt: timestamp(pages.deploymentCreatedAt),
    },
    analytics: {
      state: safeState(analytics.state),
      windowMinutes: 60,
      requests: count(analytics.requests),
      errors: count(analytics.errors),
      maxBucketCpuP50: count(analytics.maxCpuTimeP50),
      maxBucketCpuP99: count(analytics.maxCpuTimeP99),
    },
  };
}

function githubRunSummaryV1(workflow: string, run: ObjectValue) {
  return {
    workflow,
    state: run.id ? 'accessible' : 'inconclusive',
    runId: Number.isSafeInteger(run.id) ? run.id : undefined,
    headSha: sha(run.head_sha),
    updatedAt: timestamp(run.updated_at),
    status: ['completed', 'in_progress', 'queued', 'waiting', 'pending', 'requested'].find(
      (value) => value === run.status,
    ),
    conclusion: [
      'success',
      'failure',
      'cancelled',
      'timed_out',
      'neutral',
      'skipped',
      'action_required',
      'stale',
    ].find((value) => value === run.conclusion),
  };
}

async function productionJobEvidenceV1(token: string, run: ObjectValue, fetcher: typeof fetch) {
  const metadata = githubRunSummaryV1('deploy-cloudflare-pages.yml', run);
  const incomplete = {
    ...metadata,
    scope: 'production-job',
    state: 'inconclusive',
    status: undefined,
    conclusion: undefined,
  };
  if (typeof run.id !== 'number' || !Number.isSafeInteger(run.id) || run.id <= 0) return incomplete;
  const response = await fetcher(
    `https://api.github.com/repos/mcpmieda/ecossistema-escola/actions/runs/${run.id}/jobs?filter=latest&per_page=100`,
    {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    const state =
      response.status === 401 || response.status === 403 ? 'permission-required' : 'unavailable';
    return { ...incomplete, state };
  }
  const data = object(await response.json());
  const jobs = list(data.jobs)
    .map(object)
    .filter((job) => job.name === 'Deploy production');
  if (jobs.length !== 1) return incomplete;
  const job = jobs[0]!;
  return {
    ...githubRunSummaryV1('deploy-cloudflare-pages.yml', {
      id: run.id,
      head_sha: run.head_sha,
      updated_at: job.completed_at ?? job.started_at ?? run.updated_at,
      status: job.status,
      conclusion: job.conclusion,
    }),
    scope: 'production-job',
  };
}

async function githubWorkflowEvidenceV1(
  workflow: string,
  token: string,
  run: ObjectValue,
  fetcher: typeof fetch,
) {
  return workflow === 'deploy-cloudflare-pages.yml'
    ? productionJobEvidenceV1(token, run, fetcher)
    : githubRunSummaryV1(workflow, run);
}

export async function githubEvidenceV1(token: string, fetcher = fetch) {
  const reports: ObjectValue[] = [];
  for (const workflow of ['deploy-cloudflare-pages.yml', 'entra-operations-audit.yml']) {
    if (!token) {
      reports.push({ workflow, state: 'credential-missing' });
      continue;
    }
    try {
      const response = await fetcher(
        `https://api.github.com/repos/mcpmieda/ecossistema-escola/actions/workflows/${workflow}/runs?branch=main&event=${workflow.startsWith('deploy') ? 'push' : 'schedule'}&per_page=1`,
        {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
          redirect: 'error',
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        reports.push({
          workflow,
          state:
            response.status === 403 || response.status === 401
              ? 'permission-required'
              : 'unavailable',
        });
        continue;
      }
      const data = object(await response.json()),
        run = object(list(data.workflow_runs)[0]);
      reports.push(await githubWorkflowEvidenceV1(workflow, token, run, fetcher));
    } catch {
      reports.push({ workflow, state: 'unavailable' });
    }
  }
  return reports;
}

export type MonitorReportV1 = {
  contractVersion: 1;
  checkedAt: string;
  window: { start: string; end: string };
  daily: boolean;
  collectorSha?: string;
  triggeringDeploySha?: string;
  signals: Record<string, unknown>;
  alerts: string[];
  gaps: string[];
};

function telemetryRowFailedV1(raw: unknown) {
  const row = object(raw),
    dims = object(row.dimensions);
  const total = Number(scalar(row.count, '0'));
  if (Number.isNaN(total) || total <= 0) return false;
  return (
    ['unavailable', 'exception', 'exceededCpu', 'exceededMemory', 'scriptNotFound'].includes(
      scalar(dims.outcome ?? dims['$workers.outcome']),
    ) || Number(dims.status) >= 500
  );
}

function classifyPublicV1(signals: Record<string, unknown>, alerts: string[], gaps: string[]) {
  const publicRead = object(signals.public);
  for (const raw of list(publicRead.probes)) {
    const probe = object(raw);
    const id = [
      'portal-health',
      'portal-document',
      'portal-access',
      'portal-status',
      'admin-document',
      'admin-health',
      'school-document',
      'portal-assets',
    ].find((value) => value === probe.id);
    if (!id) continue;
    if (probe.state === 'failed') alerts.push(`probe:${id}`);
    else if (probe.state !== 'ok') gaps.push(`probe:${id}`);
  }
  if (!Array.isArray(publicRead.probes)) gaps.push('public-probes');
  const sonar = object(publicRead.sonar);
  if (sonar.status === 'ERROR') alerts.push('sonar-quality-gate');
  else if (sonar.state !== 'ok') gaps.push('sonar');
}

function classifyDeploymentV1(signals: Record<string, unknown>, alerts: string[], gaps: string[]) {
  const deploy = object(signals.deployment);
  for (const name of ['worker', 'pages', 'analytics']) {
    const row = object(deploy[name]);
    if (row.state !== 'accessible') gaps.push(`cloudflare:${name}`);
    if (row.present === false || row.status === 'failure') alerts.push(`cloudflare:${name}`);
    if (name === 'pages' && row.status !== 'success') gaps.push('cloudflare:pages');
  }
  if ((count(object(deploy.analytics).errors) ?? 0) > 0) alerts.push('worker-errors');
}

function classifyHyperdriveV1(signals: Record<string, unknown>, alerts: string[], gaps: string[]) {
  const hyperdrive = object(object(signals.hyperdrive).hyperdrive);
  if (hyperdrive.state !== 'accessible') gaps.push('hyperdrive');
  else if (hyperdrive.cacheDisabled !== true || hyperdrive.originConnections !== 8)
    alerts.push('hyperdrive-config');
}

function classifyTelemetryV1(signals: Record<string, unknown>, alerts: string[], gaps: string[]) {
  const telemetry = object(signals.telemetry);
  for (const raw of list(telemetry.sources)) {
    const source = object(raw);
    const id = ['auth-result', 'live-close', 'edge-result', 'operation', 'native-outcome'].find(
      (value) => value === source.id,
    );
    if (!id) continue;
    if (source.state !== 'observed') gaps.push(`telemetry:${id}`);
    if (list(source.rows).some(telemetryRowFailedV1)) alerts.push(`telemetry:${id}:error`);
  }
  if (!Array.isArray(telemetry.sources)) gaps.push('telemetry');
}

function classifyGithubV1(
  signals: Record<string, unknown>,
  alerts: string[],
  gaps: string[],
  now: Date,
) {
  for (const raw of list(signals.github)) {
    const row = object(raw),
      isDeploy = row.workflow === 'deploy-cloudflare-pages.yml';
    const id = isDeploy ? 'production-workflow' : 'entra-audit';
    if (row.state !== 'accessible') gaps.push(id);
    else if (['failure', 'timed_out', 'action_required'].includes(scalar(row.conclusion)))
      alerts.push(id);
    if (row.status !== 'completed' || row.conclusion !== 'success') gaps.push(id);
    if (
      !isDeploy &&
      (!timestamp(row.updatedAt) ||
        now.getTime() - Date.parse(scalar(row.updatedAt)) > 28 * 3_600_000)
    )
      gaps.push('entra-audit-stale');
  }
  if (!Array.isArray(signals.github)) gaps.push('github');
}

export function classifyMonitorV1(signals: Record<string, unknown>, now: Date) {
  const alerts: string[] = [],
    gaps: string[] = [];
  classifyPublicV1(signals, alerts, gaps);
  classifyDeploymentV1(signals, alerts, gaps);
  classifyHyperdriveV1(signals, alerts, gaps);
  classifyTelemetryV1(signals, alerts, gaps);
  classifyGithubV1(signals, alerts, gaps, now);
  gaps.push(
    'database-no-workflow-credential',
    'authenticated-visual-validation',
    'individual-duplicate-proof',
    'gradebook-deep-audit',
  );
  return {
    alerts: [...new Set(alerts)].sort((a, b) => a.localeCompare(b)),
    gaps: [...new Set(gaps)].sort((a, b) => a.localeCompare(b)),
  };
}

const explanations: Record<string, string> = {
  'worker-errors': 'Cloudflare registrou erros do Worker na janela de 60 minutos.',
  'hyperdrive-config': 'A configuração lida diverge do esperado: cache desabilitado e limite 8.',
  'sonar-quality-gate': 'O Quality Gate público do Sonar está reprovado.',
  'production-workflow': 'O job de publicação mais recente terminou com falha.',
  'entra-audit': 'A auditoria existente do Entra terminou com falha.',
  'database-no-workflow-credential':
    'Banco: consultas profundas e contagens de contas/sessões não estão conectadas; não há credencial de diagnóstico de banco neste workflow.',
  'authenticated-visual-validation':
    'Telas autenticadas, câmera/QR e experiência em aparelho real dependem de uso humano.',
  'individual-duplicate-proof':
    'Contagens agregadas não provam ausência de duplicidade por tentativa individual.',
  'gradebook-deep-audit':
    'Banco de Notas: saúde pública do ADM não comprova importações, cálculos ou persistência acadêmica.',
  'entra-audit-stale':
    'A auditoria diária do Entra não tem atualização confirmada nas últimas 28 horas.',
};

const brt = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });

const labels: Record<string, string> = {
  'portal-health': 'Portal — saúde',
  'portal-document': 'Portal — página inicial',
  'portal-access': 'Portal — entrada',
  'portal-status': 'Portal — disponibilidade pública',
  'admin-document': 'Administração — página inicial',
  'admin-health': 'Administração — saúde',
  'school-document': 'Site institucional',
  'portal-assets': 'Portal — arquivos da página',
  'auth-result': 'Autenticação',
  'live-close': 'Encerramento do canal ao vivo',
  'edge-result': 'Borda de entrega',
  operation: 'Operações do Portal',
  'native-outcome': 'Execuções do Worker',
  ok: 'Verificado',
  observed: 'Eventos observados',
  partial: 'Parcial',
  'credential-missing': 'Credencial ausente',
  unavailable: 'Indisponível',
  inconclusive: 'Sem evidência suficiente',
  failed: 'Falha',
  'permission-required': 'Permissão insuficiente',
  accessible: 'Consultado',
};
const label = (value: unknown) => labels[scalar(value)] ?? scalar(value, 'Não informado');
function observedCount(source: ObjectValue) {
  return ['observed', 'partial'].includes(scalar(source.state)) && list(source.rows).length > 0
    ? list(source.rows).reduce<number>((sum, row) => sum + (count(object(row).count) ?? 0), 0)
    : '—';
}
function detailedTelemetry(signals: Record<string, unknown>) {
  const lines = [
    '',
    '## Evidências de uso real',
    '',
    '| Fonte | Dimensões técnicas | Eventos observados | p95 de duração (ms) |',
    '| --- | --- | --- | --- |',
  ];
  for (const raw of list(object(signals.telemetry).sources)) {
    const source = object(raw);
    for (const entry of list(source.rows)) {
      const row = object(entry);
      lines.push(
        `| ${label(source.id)} | ${Object.entries(object(row.dimensions))
          .map(([key, value]) => `${key}=${scalar(value)}`)
          .join(' · ')} | ${scalar(row.count)} | ${scalar(row.elapsedMsP95)} |`,
      );
    }
  }
  lines.push(
    '',
    '`issued`: autenticação/sessão emitida; `denied`: recusa; `blocked`: bloqueio; `access-closed`: acesso fechado; `unavailable`: operação indisponível. São eventos armazenados; não são contagens de pessoas.',
    'Sem linhas significa ausência de evidência utilizável, e não zero erros comprovados. Consulte estado, motivo e amostragem no JSON.',
  );
  if (signals.hourly) {
    lines.push(
      '',
      '## Distribuição por horário — Brasília',
      '',
      '| Início | Fim solicitado | Autenticação: eventos | Worker: eventos | Cobertura |',
      '| --- | --- | --- | --- | --- |',
    );
    for (const raw of list(object(signals.hourly).buckets)) {
      const bucket = object(raw),
        sources = list(bucket.sources).map(object);
      lines.push(
        `| ${brt(scalar(bucket.start))} | ${brt(scalar(bucket.end))} | ${observedCount(sources.find((s) => s.id === 'auth-result') ?? {})} | ${observedCount(sources.find((s) => s.id === 'native-outcome') ?? {})} | ${label(bucket.state)} |`,
      );
    }
    lines.push(
      '',
      'O JSON mantém resultados por etapa/outcome em cada hora, inclusive falhas e recusas. Campos indisponíveis são lacunas, não zeros. Amostragem do provedor pode limitar as contagens.',
    );
  }
  return lines;
}

function alertLineV1(id: string) {
  const text = explanations[id] ?? `Verificar ${id}; detalhes no JSON sanitizado.`;
  return `- ${text}`;
}
function gapLineV1(id: string) {
  const text =
    explanations[id] ?? `${id}: fonte sem evidência suficiente; consultar o estado no JSON.`;
  return `- ${text}`;
}

export function renderMonitorV1(report: MonitorReportV1, compact = false) {
  const data = report.signals;
  const deploy = object(data.deployment),
    analytics = object(deploy.analytics);
  const publicRead = object(data.public);
  const telemetry = object(data.telemetry);
  const title = report.alerts.length
    ? '⚠️ Atenção: sinais que precisam de investigação'
    : '🔎 Sem alertas detectados nas fontes verificadas; cobertura parcial';
  const lines = [
    '# Monitoramento automático do Ecossistema',
    '',
    `**${title}**`,
    '',
    `Atualizado em **${brt(report.checkedAt)} (Brasília)** — ${report.checkedAt}.`,
    `Janela de telemetria: **${brt(report.window.start)} até ${brt(report.window.end)}** (janela solicitada ao provedor).`,
    `Tipo: ${report.daily ? 'consolidado diário — consulta do dia anterior' : 'verificação periódica'}.`,
    '',
    '| Área | Resultado |',
    '| --- | --- |',
    ...list(publicRead.probes).map((raw) => {
      const p = object(raw);
      return `| ${label(p.id)} | ${label(p.state)} · HTTP ${scalar(p.status)} · ${scalar(p.durationMs)} ms |`;
    }),
    `| Cloudflare / Portal | requests: ${scalar(analytics.requests)} · erros: ${scalar(analytics.errors)} · janela própria de 60 min |`,
    `| Hyperdrive | ${scalar(object(object(data.hyperdrive).hyperdrive).state, 'indisponível')} |`,
    `| Sonar / qualidade | ${scalar(object(publicRead.sonar).status, 'não comprovado')} |`,
    ...list(telemetry.sources).map((raw) => {
      const s = object(raw);
      return `| ${label(s.id)} | ${label(s.state)} · eventos observados: ${observedCount(s)} |`;
    }),
    '',
    '## Problemas encontrados',
    '',
    ...(report.alerts.length
      ? report.alerts.map(alertLineV1)
      : [
          'Nenhum alerta nas verificações disponíveis. Isso não comprova funcionamento integral nem capacidade de carga.',
        ]),
    '',
    '## O que não foi possível comprovar',
    '',
    ...report.gaps.map(gapLineV1),
    ...(compact ? [] : detailedTelemetry(data)),
    '',
    '## Como ler e onde encontrar os detalhes',
    '',
    '- `ok` / `accessible`: a verificação específica respondeu conforme esperado; `observed`: houve eventos observáveis.',
    '- `inconclusive`: informação insuficiente ou sem atividade; `permission-required`: permissão atual insuficiente; `unavailable`: fonte indisponível; `credential-missing`: credencial ausente; `partial`: cobertura incompleta.',
    '- Requisições e eventos não são alunos. Este relatório não identifica estudantes nem informa alunos online.',
    '- As consultas usam logs armazenados, sujeitos à retenção/amostragem do provedor. Não some janelas de 60 minutos sobrepostas nem relatórios repetidos da mesma janela.',
    '- Em **Artifacts**, baixe `monitor-detalhado-*` (14 dias) ou `monitor-diario-*` (90 dias). O JSON contém fontes, contagens, motivos técnicos, horários e lacunas.',
    '- O agendamento é a cada 15 minutos; o GitHub pode atrasar ou omitir disparos. Confira sempre o horário acima.',
    '',
    `Código do coletor: \`${report.collectorSha ?? 'não informado'}\`. Publicação que disparou a leitura: \`${report.triggeringDeploySha ?? 'execução periódica/manual'}\`.`,
    'O SHA do coletor ou do workflow não comprova sozinho a versão ativa no provedor. Horários de alteração/publicação constam no JSON; uma janela pode conter mais de uma versão.',
  ];
  return lines.join('\n') + '\n';
}

async function save(root: string, name: string, value: unknown) {
  await mkdir(root, { recursive: true });
  await writeFile(`${root}/${name}.json`, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}

async function load(root: string, name: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(`${root}/${name}.json`, 'utf8')) as unknown;
  } catch {
    return { state: 'unavailable' };
  }
}

async function saveReportV1(root: string, now: Date, window: { start: Date; end: Date }) {
  const signals = Object.fromEntries(
    await Promise.all(
      [
        'public',
        'deployment',
        'hyperdrive',
        'telemetry',
        'github',
        ...(process.env.MONITOR_DAILY === 'true' ? ['hourly'] : []),
      ].map(async (key) => [key, await load(root, key)]),
    ),
  );
  const report: MonitorReportV1 = {
    contractVersion: 1,
    checkedAt: now.toISOString(),
    window: { start: window.start.toISOString(), end: window.end.toISOString() },
    daily: process.env.MONITOR_DAILY === 'true',
    collectorSha: sha(process.env.MONITOR_SHA),
    triggeringDeploySha: sha(process.env.DEPLOY_SHA),
    signals,
    ...classifyMonitorV1(signals, now),
  };
  await save(root, 'report', report);
  const markdown = renderMonitorV1(report);
  await writeFile(`${root}/report.md`, markdown);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
}

type CollectorContextV1 = { accountId: string; token: string; now: Date };
async function collectDeploymentV1(common: CollectorContextV1) {
  const result =
    common.accountId && common.token
      ? await diagnoseCloudflarePortalDeployV1(common)
      : {
          worker: { state: 'credential-missing' },
          pages: { state: 'credential-missing' },
          analytics: { state: 'credential-missing' },
        };
  return deploymentSummaryV1(result);
}
async function collectHyperdriveV1(common: CollectorContextV1) {
  return common.accountId && common.token
    ? diagnoseCloudflarePortalHyperdriveV1(common)
    : { hyperdrive: { state: 'credential-missing' } };
}

async function main() {
  const op = process.argv[2],
    root = process.env.MONITOR_DIR;
  if (!root) throw new Error('Missing monitor directory');
  const now = new Date(process.env.MONITOR_NOW ?? Date.now());
  const window = monitorWindowV1(now, process.env.MONITOR_DAILY === 'true');
  const common = {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
    token: process.env.CLOUDFLARE_API_TOKEN ?? '',
    now,
  };
  if (op === 'public') await save(root, op, await collectOperationalProbesV1({ now }));
  else if (op === 'deployment') {
    await save(root, op, await collectDeploymentV1(common));
  } else if (op === 'hyperdrive') {
    await save(root, op, await collectHyperdriveV1(common));
  } else if (op === 'telemetry') {
    await save(root, op, await collectOperationalTelemetryV1({ ...common, ...window }));
    if (process.env.MONITOR_DAILY === 'true')
      await save(
        root,
        'hourly',
        await collectOperationalHourlyTelemetryV1({ ...common, ...window }),
      );
  } else if (op === 'github')
    await save(root, op, await githubEvidenceV1(process.env.GH_TOKEN ?? ''));
  else if (op === 'report') await saveReportV1(root, now, window);
  else throw new Error('Unsupported monitor operation');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch {
    console.error('Monitoramento: etapa indisponível; nenhuma resposta bruta foi registrada.');
    process.exitCode = 1;
  }
}
