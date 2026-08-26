import process from 'node:process';

const API_ROOT = 'https://jules.googleapis.com/v1alpha';
const SESSION_MARKER = /<!-- factory-jules-session:([^ ]+) -->/;

function fail(message) {
  throw new Error(message);
}

function apiKey() {
  const value = process.env.JULES_API_KEY?.trim();
  if (!value) fail('JULES_API_KEY is required for Jules API dispatch.');
  return value;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey(),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    fail(`Jules API ${options.method ?? 'GET'} ${path} failed (${response.status}).`);
  }
  return payload;
}

export function julesSessionMarker(sessionName) {
  const value = String(sessionName ?? '').trim();
  if (!/^sessions\/[^\s/]+$/.test(value)) fail('Invalid Jules session resource name.');
  return `<!-- factory-jules-session:${value} -->`;
}

export function julesSessionNameFromComments(comments) {
  for (const comment of comments ?? []) {
    const match = String(comment?.body ?? '').match(SESSION_MARKER);
    if (match && /^sessions\/[^\s/]+$/.test(match[1])) return match[1];
  }
  return null;
}

export function pullRequestUrlsFromSession(session) {
  const urls = new Set();
  for (const output of session?.outputs ?? []) {
    const url = output?.pullRequest?.url;
    if (typeof url === 'string' && url.startsWith('https://github.com/')) urls.add(url);
  }
  return [...urls];
}

export function buildJulesPrompt({
  runId,
  taskId,
  issueNumber,
  goal,
  title,
  paths,
  integrationBranch,
}) {
  const scopes = paths.length ? paths.map((path) => `- ${path}`).join('\n') : '- none (fail closed)';
  return [
    `Factory Run: ${runId}`,
    `Task ID: ${taskId}`,
    `GitHub task issue: #${issueNumber}`,
    '',
    `Goal: ${goal}`,
    '',
    `Task: ${title}`,
    '',
    'Allowed write scopes:',
    scopes,
    '',
    `Starting/integration branch: ${integrationBranch}`,
    '',
    'Guardrails:',
    '- Modify only the declared write scopes.',
    '- Preserve existing architecture, contracts, tests, and security boundaries.',
    '- Do not change credentials, privileges, production configuration, or deployment settings.',
    '- Do not enable Banco de Notas synchronization.',
    '- Do not merge the pull request yourself.',
    `- Create a pull request back to ${integrationBranch} when the task is complete.`,
    `- Include "Factory task #${issueNumber}" in the pull request description.`,
  ].join('\n');
}

export async function findGithubSource(owner, repo) {
  let pageToken = '';
  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({ pageSize: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const payload = await request(`/sources?${params.toString()}`);
    for (const source of payload?.sources ?? []) {
      if (source?.githubRepo?.owner === owner && source?.githubRepo?.repo === repo) return source;
    }
    pageToken = payload?.nextPageToken ?? '';
    if (!pageToken) break;
  }
  fail(`Jules source not found for ${owner}/${repo}.`);
}

export async function createJulesSession({ sourceName, startingBranch, title, prompt }) {
  if (!/^sources\/.+/.test(sourceName)) fail('Invalid Jules source resource name.');
  const payload = await request('/sessions', {
    method: 'POST',
    body: JSON.stringify({
      prompt,
      title,
      sourceContext: {
        source: sourceName,
        githubRepoContext: { startingBranch },
      },
      requirePlanApproval: false,
      automationMode: 'AUTO_CREATE_PR',
    }),
  });
  if (!payload?.name || !/^sessions\/[^\s/]+$/.test(payload.name)) {
    fail('Jules API returned an invalid session resource.');
  }
  return payload;
}

export async function getJulesSession(sessionName) {
  if (!/^sessions\/[^\s/]+$/.test(sessionName)) fail('Invalid Jules session resource name.');
  return request(`/${sessionName}`);
}
