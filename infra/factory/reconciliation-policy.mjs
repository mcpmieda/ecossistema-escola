const TASK_MARKER = /<!-- factory-run:([^;]+);task:([^ ]+) -->/;
const FIELD_LINE = /^([^\n:]+):\s*(.*)$/gm;

export const TRUSTED_JULES_LOGIN = 'google-labs-jules[bot]';

function splitCsv(value) {
  const text = String(value ?? '').trim();
  if (!text || text === 'none') return [];
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseMaterializedTask(issue) {
  if (issue?.user?.login !== 'github-actions[bot]') return null;
  const body = String(issue.body ?? '');
  const marker = body.match(TASK_MARKER);
  if (!marker) return null;

  const fields = new Map();
  for (const match of body.matchAll(FIELD_LINE)) {
    fields.set(match[1].trim(), match[2].trim());
  }

  return {
    runId: marker[1],
    taskId: marker[2],
    dependencies: splitCsv(fields.get('Dependencies')),
    paths: splitCsv(fields.get('Path scopes')),
    preferredProviders: splitCsv(fields.get('Preferred providers')),
    humanGates: splitCsv(fields.get('Human gates')),
  };
}

export function sameRepositoryPrNumbers(comments, owner, repo) {
  const prefix = `https://github.com/${owner}/${repo}/pull/`;
  const numbers = new Set();

  for (const comment of comments ?? []) {
    if (comment?.user?.login !== TRUSTED_JULES_LOGIN) continue;
    const body = String(comment.body ?? '');
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(`${escaped}(\\d+)`, 'g');
    for (const match of body.matchAll(expression)) {
      numbers.add(Number(match[1]));
    }
  }

  return [...numbers];
}

function normalizePath(path) {
  const value = String(path ?? '')
    .trim()
    .replace(/^\/+/, '');
  if (!value || value.includes('..') || value.includes('\\')) return null;
  return value;
}

export function pathWithinScope(filename, declaredScope) {
  const file = normalizePath(filename);
  const scope = normalizePath(declaredScope);
  if (!file || !scope || scope === 'unknown/conservative') return false;

  if (scope.endsWith('/**')) {
    const prefix = scope.slice(0, -3).replace(/\/$/, '');
    return file === prefix || file.startsWith(`${prefix}/`);
  }

  if (scope.endsWith('/')) return file.startsWith(scope);
  return file === scope;
}

export function changedFilesWithinDeclaredScope(changedFiles, declaredScopes) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) return false;
  if (!Array.isArray(declaredScopes) || declaredScopes.length === 0) return false;
  return changedFiles.every((filename) =>
    declaredScopes.some((scope) => pathWithinScope(filename, scope)),
  );
}

export function shouldReleaseTask(task, dependencyEvidence) {
  if (!task || task.humanGates.length > 0 || task.dependencies.length === 0) {
    return false;
  }
  return task.dependencies.every(
    (dependency) => dependencyEvidence.get(dependency)?.ready === true,
  );
}
