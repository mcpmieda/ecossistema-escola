import { createHash } from 'node:crypto';

const RUN_BEGIN = '<!-- FACTORY_RUN_BEGIN -->';
const RUN_END = '<!-- FACTORY_RUN_END -->';
const ALLOWED_HUMAN_GATES = new Set([
  'product_decision',
  'destructive_operation',
  'production_activation',
  'privilege_change',
  'legal_or_organizational_decision',
]);
const ALLOWED_PROVIDERS = new Set(['jules', 'antigravity', 'opencode_ollama', 'manual']);
const ACTIVE_AUTOMATIC_PROVIDERS = new Set(['jules', 'antigravity', 'opencode_ollama']);
const SAFE_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const SAFE_BRANCH = /^[A-Za-z0-9._/-]+$/;
const RESERVED_AUTOMATION_SCOPES = ['.github', 'infra/factory', 'infra/validation'];

function fail(message) {
  throw new Error(message);
}

function cleanText(value, label, max = 200) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required`);
  if (text.length > max) fail(`${label} exceeds ${max} characters`);
  return text;
}

function stringArray(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  const result = [];
  for (const item of value) {
    const text = String(item ?? '').trim();
    if (text && !result.includes(text)) result.push(text);
  }
  return result;
}

function cleanBranch(value, label) {
  const branch = cleanText(value, label, 200);
  if (
    !SAFE_BRANCH.test(branch) ||
    branch.startsWith('/') ||
    branch.endsWith('/') ||
    branch.includes('..') ||
    branch.includes('@{') ||
    branch.includes('\\') ||
    branch.endsWith('.lock') ||
    branch.endsWith('.') ||
    branch.startsWith('.')
  ) {
    fail(`${label} is not a safe Git branch name.`);
  }
  return branch;
}

function hasControlCharacter(value) {
  return [...value].some((character) => character.charCodeAt(0) < 32);
}

function cleanPathScope(value, label) {
  const scope = cleanText(value, label, 300);
  if (scope.startsWith('/') || scope.includes('\\') || hasControlCharacter(scope)) {
    fail(`${label} is not a safe repository-relative path scope.`);
  }
  const withoutGlob = scope.endsWith('/**') ? scope.slice(0, -3) : scope;
  if (scope.includes('*') && !scope.endsWith('/**')) {
    fail(`${label} supports only an optional trailing '/**' recursive glob.`);
  }
  const segments = withoutGlob.split('/');
  if (
    !withoutGlob ||
    segments.some((segment) => !segment || segment === '.' || segment === '..') ||
    withoutGlob === '.git' ||
    withoutGlob.startsWith('.git/')
  ) {
    fail(`${label} is not a safe repository-relative path scope.`);
  }
  return scope;
}

function scopeRoot(scope) {
  return scope.endsWith('/**') ? scope.slice(0, -3) : scope;
}

function isRecursiveScope(scope) {
  return scope.endsWith('/**');
}

function pathPrefixContains(prefix, candidate) {
  return candidate === prefix || candidate.startsWith(`${prefix}/`);
}

export function pathScopesOverlap(left, right) {
  const a = scopeRoot(left);
  const b = scopeRoot(right);
  const aRecursive = isRecursiveScope(left);
  const bRecursive = isRecursiveScope(right);

  if (!aRecursive && !bRecursive) return a === b;
  if (aRecursive && bRecursive) return pathPrefixContains(a, b) || pathPrefixContains(b, a);
  if (aRecursive) return pathPrefixContains(a, b);
  return pathPrefixContains(b, a);
}

function scopeIsReserved(scope) {
  const root = scopeRoot(scope);
  const recursive = isRecursiveScope(scope);
  return RESERVED_AUTOMATION_SCOPES.some(
    (reserved) =>
      root === reserved ||
      root.startsWith(`${reserved}/`) ||
      (recursive && reserved.startsWith(`${root}/`)),
  );
}

function transitiveDependencies(byId, id, memo = new Map()) {
  if (memo.has(id)) return memo.get(id);
  const result = new Set();
  memo.set(id, result);
  for (const dependency of byId.get(id).dependsOn) {
    result.add(dependency);
    for (const nested of transitiveDependencies(byId, dependency, memo)) result.add(nested);
  }
  return result;
}

export function parseFactoryRunV2(body) {
  const start = body.indexOf(RUN_BEGIN);
  const end = body.indexOf(RUN_END);
  if (start < 0 || end < 0 || end <= start) {
    fail('Issue body must contain FACTORY_RUN_BEGIN/FACTORY_RUN_END markers.');
  }

  let value;
  try {
    value = JSON.parse(body.slice(start + RUN_BEGIN.length, end).trim());
  } catch (error) {
    fail(`Factory Run JSON is invalid: ${error.message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('Factory Run must be a JSON object.');
  }
  if ((value.schema_version ?? 1) !== 1) {
    fail(`Unsupported schema_version: ${value.schema_version}`);
  }

  const runId = cleanText(value.run_id, 'run_id', 120);
  if (!SAFE_SLUG.test(runId)) {
    fail('run_id must use only letters, digits, dot, underscore, or hyphen.');
  }
  const goal = cleanText(value.goal, 'goal', 1000);
  const baseBranch = cleanBranch(value.base_branch ?? 'main', 'base_branch');
  const maxParallel = Number(value.max_parallel ?? 3);
  if (!Number.isInteger(maxParallel) || maxParallel < 1 || maxParallel > 3) {
    fail('max_parallel must be an integer from 1 to 3.');
  }
  if (!Array.isArray(value.tasks) || value.tasks.length === 0 || value.tasks.length > 20) {
    fail('Factory Run requires between 1 and 20 tasks.');
  }

  const ids = new Set();
  const tasks = value.tasks.map((rawTask, index) => {
    if (!rawTask || typeof rawTask !== 'object' || Array.isArray(rawTask)) {
      fail(`Task #${index + 1} must be an object.`);
    }
    const id = cleanText(rawTask.id, `task #${index + 1} id`, 120);
    if (!SAFE_SLUG.test(id)) fail(`Task id '${id}' must use the stable slug format.`);
    if (ids.has(id)) fail(`Duplicate task id: ${id}`);
    ids.add(id);
    const title = cleanText(rawTask.title, `title for ${id}`, 200);
    const role = cleanText(rawTask.role ?? 'implementation', `role for ${id}`, 80);
    const dependsOn = stringArray(rawTask.depends_on, `depends_on for ${id}`);
    const paths = stringArray(rawTask.paths, `paths for ${id}`).map((scope, scopeIndex) =>
      cleanPathScope(scope, `paths[${scopeIndex}] for ${id}`),
    );
    const requiredCapabilities = stringArray(
      rawTask.required_capabilities,
      `required_capabilities for ${id}`,
    );
    const preferredProviders = stringArray(
      rawTask.preferred_providers,
      `preferred_providers for ${id}`,
    );
    for (const provider of preferredProviders) {
      if (!ALLOWED_PROVIDERS.has(provider)) fail(`Unknown provider '${provider}' in task ${id}.`);
    }
    const humanGates = stringArray(rawTask.human_gates, `human_gates for ${id}`);
    for (const gate of humanGates) {
      if (!ALLOWED_HUMAN_GATES.has(gate)) fail(`Unknown human gate '${gate}' in task ${id}.`);
    }

    if (humanGates.length === 0) {
      if (paths.length === 0) {
        fail(`Automated task ${id} requires at least one declared path scope.`);
      }
      if (paths.some(scopeIsReserved)) {
        fail(
          `Automated task ${id} targets a reserved Control Plane/GitHub scope. Use a human-gated change instead.`,
        );
      }
      if (!preferredProviders.some((provider) => ACTIVE_AUTOMATIC_PROVIDERS.has(provider))) {
        fail(`Automated task ${id} has no currently active automatic provider.`);
      }
    }

    return {
      id,
      title,
      role,
      dependsOn,
      paths,
      requiredCapabilities,
      preferredProviders,
      humanGates,
    };
  });

  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (!ids.has(dependency)) fail(`Task ${task.id} depends on unknown task ${dependency}.`);
      if (dependency === task.id) fail(`Task ${task.id} cannot depend on itself.`);
    }
  }

  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) fail('Factory Run dependency graph contains a cycle.');
    visiting.add(id);
    for (const dependency of byId.get(id).dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const task of tasks) visit(task.id);

  const dependencyMemo = new Map();
  for (let index = 0; index < tasks.length; index += 1) {
    const left = tasks[index];
    const leftDeps = transitiveDependencies(byId, left.id, dependencyMemo);
    for (let otherIndex = index + 1; otherIndex < tasks.length; otherIndex += 1) {
      const right = tasks[otherIndex];
      const rightDeps = transitiveDependencies(byId, right.id, dependencyMemo);
      const ordered = leftDeps.has(right.id) || rightDeps.has(left.id);
      if (ordered) continue;
      for (const leftScope of left.paths) {
        for (const rightScope of right.paths) {
          if (pathScopesOverlap(leftScope, rightScope)) {
            fail(
              `Parallel-capable tasks ${left.id} and ${right.id} have overlapping write scopes: ${leftScope} <> ${rightScope}.`,
            );
          }
        }
      }
    }
  }

  const integrationBranch = cleanBranch(`factory/${runId}`, 'integration_branch');

  return {
    runId,
    goal,
    baseBranch,
    integrationBranch,
    maxParallel,
    tasks,
  };
}

function canonicalRun(run) {
  return {
    run_id: run.runId,
    goal: run.goal,
    base_branch: run.baseBranch,
    integration_branch: run.integrationBranch,
    max_parallel: run.maxParallel,
    tasks: run.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      role: task.role,
      depends_on: task.dependsOn,
      paths: task.paths,
      required_capabilities: task.requiredCapabilities,
      preferred_providers: task.preferredProviders,
      human_gates: task.humanGates,
    })),
  };
}

export function manifestFingerprint(run) {
  return createHash('sha256').update(JSON.stringify(canonicalRun(run))).digest('hex');
}

export function manifestMarker(run) {
  return `<!-- factory-manifest-sha256:${manifestFingerprint(run)} -->`;
}

export function taskMarker(runId, taskId) {
  return `<!-- factory-run:${runId};task:${taskId} -->`;
}

export function integrationMarker(run) {
  return `<!-- factory-integration-branch:${run.integrationBranch};base:${run.baseBranch} -->`;
}
