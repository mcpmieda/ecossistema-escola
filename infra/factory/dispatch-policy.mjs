export const FACTORY_LABELS = Object.freeze({
  parent: 'factory:run',
  task: 'factory:task',
  blocked: 'factory:human-required',
  waiting: 'factory:waiting',
  ready: 'factory:ready',
  running: 'factory:running',
  ci: 'factory:ci',
  merged: 'factory:merged',
  failed: 'factory:failed',
  final: 'factory:final',
  providerJules: 'factory:provider:jules',
  providerOpenCode: 'factory:provider:opencode-ollama',
  julesApi: 'factory:dispatch:jules-api',
  durableAgent: 'factory:dispatch:durable-agent',
  julesTrigger: 'jules',
});

export const AUTOMATIC_PROVIDER_ORDER = Object.freeze(['opencode_ollama', 'jules']);

export const DURABLE_PROVIDERS = Object.freeze(['opencode_ollama']);

export function providerLabel(provider) {
  if (provider === 'jules') return FACTORY_LABELS.providerJules;
  if (provider === 'opencode_ollama') return FACTORY_LABELS.providerOpenCode;
  return null;
}

export function selectedAutomaticProvider(task) {
  const preferred = new Set(task?.preferredProviders ?? []);
  return AUTOMATIC_PROVIDER_ORDER.find((provider) => preferred.has(provider)) ?? null;
}

export function initialDispatch(task) {
  if (task.humanGates.length > 0) {
    return { provider: null, status: 'human-required' };
  }
  if (task.dependsOn.length > 0) {
    return { provider: null, status: 'waiting' };
  }
  const provider = selectedAutomaticProvider(task);
  if (provider) return { provider, status: 'ready' };
  return { provider: null, status: 'unassigned' };
}

export function desiredTaskLabels(task) {
  const dispatch = initialDispatch(task);
  const labels = [FACTORY_LABELS.task];

  if (dispatch.status === 'human-required') {
    labels.push(FACTORY_LABELS.blocked);
  } else if (dispatch.status === 'waiting') {
    labels.push(FACTORY_LABELS.waiting);
  } else if (dispatch.status === 'ready') {
    const label = providerLabel(dispatch.provider);
    if (label) labels.push(label);
    labels.push(FACTORY_LABELS.ready);
  }

  return labels;
}

export function taskLabelPlan(task) {
  const desired = desiredTaskLabels(task);
  return {
    creationLabels: desired,
    triggerLabels: [],
    desiredLabels: desired,
  };
}
