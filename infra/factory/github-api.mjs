import process from 'node:process';

const API_ROOT = 'https://api.github.com';

export function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function github(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${requiredEnv('GITHUB_TOKEN')}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(
      `GitHub API ${options.method ?? 'GET'} ${path} failed (${response.status}): ${payload?.message ?? 'unknown error'}`,
    );
  }
  return payload;
}

export async function githubOptional(path) {
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${requiredEnv('GITHUB_TOKEN')}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (response.status === 404) return null;
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`GitHub API GET ${path} failed (${response.status}).`);
  return payload;
}

export async function githubPaged(path, maxPages = 10) {
  const items = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const payload = await github(`${path}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(payload)) throw new Error(`Expected array from GitHub API path: ${path}`);
    items.push(...payload);
    if (payload.length < 100) break;
  }
  return items;
}

export function labelNames(labels) {
  return (labels ?? [])
    .map((item) => (typeof item === 'string' ? item : item?.name))
    .filter(Boolean);
}

export async function addLabels(owner, repo, issueNumber, labels) {
  if (!labels.length) return;
  await github(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
    method: 'POST',
    body: JSON.stringify({ labels }),
  });
}

export async function removeLabel(owner, repo, issueNumber, label) {
  const existing = await githubOptional(
    `/repos/${owner}/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
  );
  if (!existing) return;
  await github(
    `/repos/${owner}/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
    {
      method: 'DELETE',
    },
  );
}

export async function addComment(owner, repo, issueNumber, body) {
  return github(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export async function issueComments(owner, repo, issueNumber) {
  return githubPaged(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`);
}

export async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
