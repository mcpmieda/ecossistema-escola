export const FACTORY_LABELS = Object.freeze({
  parent: 'factory:run',
  task: 'factory:task',
  blocked: 'factory:human-required',
  waiting: 'factory:waiting',
  ready: 'factory:ready',
  providerJules: 'factory:provider:jules',
  julesTrigger: 'jules',
});

export function initialDispatch(task) {
  if (task.humanGates.length > 0) {
    return { provider: null, status: 'human-required' };
  }
  if (task.dependsOn.length > 0) {
    return { provider: null, status: 'waiting' };
  }
  if (task.preferredProviders.includes('jules')) {
    return { provider: 'jules', status: 'trigger-requested' };
  }
  return { provider: null, status: 'unassigned' };
}

export function desiredTaskLabels(task) {
  const dispatch = initialDispatch(task);
  const labels = [FACTORY_LABELS.task];

  if (dispatch.status === 'human-required') {
    labels.push(FACTORY_LABELS.blocked);
  } else if (dispatch.status === 'waiting') {
    labels.push(FACTORY_LABELS.waiting);
  } else if (dispatch.provider === 'jules') {
    labels.push(FACTORY_LABELS.providerJules, FACTORY_LABELS.julesTrigger);
  }

  return labels;
}

export function taskLabelPlan(task) {
  const desired = desiredTaskLabels(task);
  const triggerLabels = desired.includes(FACTORY_LABELS.julesTrigger)
    ? [FACTORY_LABELS.julesTrigger]
    : [];
  return {
    creationLabels: desired.filter((label) => !triggerLabels.includes(label)),
    triggerLabels,
    desiredLabels: desired,
  };
}
