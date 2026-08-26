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
const SAFE_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const SAFE_BRANCH = /^(?!\/)(?!.*(?:\.\.|@\{|\\|[~^:?*\[]))(?!.*\/$)[A-Za-z0-9._\/-]+$/;

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
  if (!SAFE_BRANCH.test(branch) || branch.endsWith('.lock') || branch.startsWith('.')) {
    fail(`${label} is not a safe Git branch name.`);
  }
  return branch;
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
    const paths = stringArray(rawTask.paths, `paths for ${id}`);
    const requiredCapabilities = stringArray(rawTask.required_capabilities, `required_capabilities for ${id}`);
    const preferredProviders = stringArray(rawTask.preferred_providers, `preferred_providers for ${id}`);
    for (const provider of preferredProviders) {
      if (!ALLOWED_PROVIDERS.has(provider)) fail(`Unknown provider '${provider}' in task ${id}.`);
    }
    const humanGates = stringArray(rawTask.human_gates, `human_gates for ${id}`);
    for (const gate of humanGates) {
      if (!ALLOWED_HUMAN_GATES.has(gate)) fail(`Unknown human gate '${gate}' in task ${id}.`);
    }
    return { id, title, role, dependsOn, paths, requiredCapabilities, preferredProviders, humanGates };
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

  return {
    runId,
    goal,
    baseBranch,
    integrationBranch: `factory/${runId}`,
    maxParallel,
    tasks,
  };
}

export function taskMarker(runId, taskId) {
  return `<!-- factory-run:${runId};task:${taskId} -->`;
}

export function integrationMarker(run) {
  return `<!-- factory-integration-branch:${run.integrationBranch};base:${run.baseBranch} -->`;
}
