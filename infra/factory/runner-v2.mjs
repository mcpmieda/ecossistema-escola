import process from 'node:process';

import { FACTORY_LABELS } from './dispatch-policy.mjs';
import { parseFactoryRunV2 } from './contract-v2.mjs';
import {
  addComment,
  addLabels,
  github,
  githubPaged,
  issueComments,
  labelNames,
  removeLabel,
  requiredEnv,
  sleep,
} from './github-api.mjs';
import {
  buildJulesPrompt,
  createJulesSession,
  findGithubSource,
  getJulesSession,
  julesSessionMarker,
  julesSessionNameFromComments,
  pullRequestUrlsFromSession,
} from './jules-api.mjs';
import {
  changedFilesWithinDeclaredScope,
  mergedPrEvidenceFromComments,
  mergedPrMarker,
  parseMaterializedTask,
  sameRepositoryPrNumberFromUrl,
} from './reconciliation-policy.mjs';

const POLL_MS = 10_000;
const MAX_RUNNER_CYCLES = 540;
const CI_WORKFLOW = 'ci.yml';

function repositoryParts() {
  const repository = requiredEnv('GITHUB_REPOSITORY');
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) throw new Error('GITHUB_REPOSITORY must be owner/repo.');
  return { owner, repo };
}

async function childIssues(owner, repo, runId) {
  const query = encodeURIComponent(`repo:${owner}/${repo} is:issue "factory-run:${runId};task:"`);
  const result = await github(`/search/issues?q=${query}&per_page=100`);
  const map = new Map();
  for (const issue of result.items ?? []) {
    const parsed = parseMaterializedTask(issue);
    if (parsed?.runId === runId) map.set(parsed.taskId, { issue, task: parsed });
  }
  return map;
}

async function refreshIssue(owner, repo, number) {
  return github(`/repos/${owner}/${repo}/issues/${number}`);
}

async function setTaskState(owner, repo, issueNumber, add, remove = []) {
  for (const label of remove) await removeLabel(owner, repo, issueNumber, label);
  await addLabels(owner, repo, issueNumber, add);
}

async function failTask(owner, repo, issueNumber, message) {
  await setTaskState(
    owner,
    repo,
    issueNumber,
    [FACTORY_LABELS.failed],
    [FACTORY_LABELS.ready, FACTORY_LABELS.running, FACTORY_LABELS.ci, FACTORY_LABELS.waiting],
  );
  await addComment(owner, repo, issueNumber, `Factory task failed closed.\n\n${message}`);
  throw new Error(`Factory task #${issueNumber} failed closed: ${message}`);
}

export function taskFromManifest(run, taskId) {
  const task = run.tasks.find((item) => item.id === taskId);
  if (!task)
    throw new Error(`Materialized task ${taskId} is absent from immutable parent manifest.`);
  return task;
}

export function dependenciesMerged(task, siblings, mergedEvidence) {
  return task.dependsOn.every((dependencyId) => {
    const dependency = siblings.get(dependencyId);
    return dependency && mergedEvidence.has(dependencyId);
  });
}

export function isProcessableTaskState(labels) {
  const names = new Set(labelNames(labels));
  return names.has(FACTORY_LABELS.running) || names.has(FACTORY_LABELS.ci);
}

async function ensureReadyDependencies(owner, repo, run, siblings) {
  const mergedEvidence = new Map();
  for (const [taskId, record] of siblings) {
    const comments = await issueComments(owner, repo, record.issue.number);
    const evidence = mergedPrEvidenceFromComments(comments);
    if (evidence) mergedEvidence.set(taskId, evidence);
  }

  for (const record of siblings.values()) {
    const labels = new Set(labelNames(record.issue.labels));
    if (!labels.has(FACTORY_LABELS.waiting)) continue;
    const taskDefinition = taskFromManifest(run, record.task.taskId);
    if (taskDefinition.humanGates.length > 0) continue;
    if (!dependenciesMerged(taskDefinition, siblings, mergedEvidence)) continue;
    if (!taskDefinition.preferredProviders.includes('jules')) continue;

    await setTaskState(
      owner,
      repo,
      record.issue.number,
      [FACTORY_LABELS.providerJules, FACTORY_LABELS.ready],
      [FACTORY_LABELS.waiting],
    );
    await addComment(
      owner,
      repo,
      record.issue.number,
      'All declared dependencies are integrated into the isolated Factory branch. Task is ready for Jules API dispatch.',
    );
  }
}

async function dispatchReadyTasks(owner, repo, run, source, siblings) {
  let active = 0;
  for (const record of siblings.values()) {
    const issue = await refreshIssue(owner, repo, record.issue.number);
    const labels = new Set(labelNames(issue.labels));
    if (labels.has(FACTORY_LABELS.running) || labels.has(FACTORY_LABELS.ci)) active += 1;
  }

  for (const record of siblings.values()) {
    if (active >= run.maxParallel) break;
    const issue = await refreshIssue(owner, repo, record.issue.number);
    const labels = new Set(labelNames(issue.labels));
    if (!labels.has(FACTORY_LABELS.ready)) continue;
    if (labels.has(FACTORY_LABELS.failed) || labels.has(FACTORY_LABELS.merged)) continue;
    const taskDefinition = taskFromManifest(run, record.task.taskId);
    if (!taskDefinition.preferredProviders.includes('jules')) continue;
    if (taskDefinition.humanGates.length > 0) continue;
    if (taskDefinition.paths.length === 0) {
      await failTask(owner, repo, issue.number, 'Declared write scope is empty.');
    }

    const comments = await issueComments(owner, repo, issue.number);
    const existingSession = julesSessionNameFromComments(comments);
    if (existingSession) {
      await setTaskState(
        owner,
        repo,
        issue.number,
        [FACTORY_LABELS.providerJules, FACTORY_LABELS.julesApi, FACTORY_LABELS.running],
        [FACTORY_LABELS.ready],
      );
      active += 1;
      continue;
    }

    const session = await createJulesSession({
      sourceName: source.name,
      startingBranch: run.integrationBranch,
      title: `[Factory:${run.runId}] ${taskDefinition.title}`,
      prompt: buildJulesPrompt({
        runId: run.runId,
        taskId: taskDefinition.id,
        issueNumber: issue.number,
        goal: run.goal,
        title: taskDefinition.title,
        paths: taskDefinition.paths,
        integrationBranch: run.integrationBranch,
      }),
    });

    await addComment(
      owner,
      repo,
      issue.number,
      `${julesSessionMarker(session.name)}\nJules API session created for this typed Factory task. Session identifiers are non-secret; API credentials remain only in GitHub Actions secrets.`,
    );
    await setTaskState(
      owner,
      repo,
      issue.number,
      [FACTORY_LABELS.providerJules, FACTORY_LABELS.julesApi, FACTORY_LABELS.running],
      [FACTORY_LABELS.ready, FACTORY_LABELS.julesTrigger],
    );
    active += 1;
  }
}

async function prChangedFiles(owner, repo, prNumber) {
  const files = await githubPaged(`/repos/${owner}/${repo}/pulls/${prNumber}/files`);
  return files.map((item) => item.filename).filter(Boolean);
}

async function syncWorkerBranch(owner, repo, pr, integrationBranch) {
  try {
    await github(`/repos/${owner}/${repo}/merges`, {
      method: 'POST',
      body: JSON.stringify({
        base: pr.head.ref,
        head: integrationBranch,
        commit_message: `Factory: sync ${integrationBranch} before mandatory CI`,
      }),
    });
  } catch (error) {
    if (String(error.message).includes('(204)')) return;
    throw error;
  }
  return github(`/repos/${owner}/${repo}/pulls/${pr.number}`);
}

async function dispatchCi(owner, repo, branch) {
  await github(`/repos/${owner}/${repo}/actions/workflows/${CI_WORKFLOW}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: branch }),
  });
}

async function findCiRun(owner, repo, branch, sha) {
  const params = new URLSearchParams({
    event: 'workflow_dispatch',
    head_sha: sha,
    per_page: '30',
  });
  const payload = await github(
    `/repos/${owner}/${repo}/actions/workflows/${CI_WORKFLOW}/runs?${params.toString()}`,
  );
  return (payload.workflow_runs ?? []).find((run) => run.head_sha === sha) ?? null;
}

async function waitForCi(owner, repo, branch, sha) {
  let run = await findCiRun(owner, repo, branch, sha);
  if (!run) {
    await dispatchCi(owner, repo, branch);
  }
  for (let attempt = 0; attempt < 180; attempt += 1) {
    run = await findCiRun(owner, repo, branch, sha);
    if (run?.status === 'completed') {
      if (run.conclusion !== 'success') {
        throw new Error(`Mandatory CI run ${run.id} concluded ${run.conclusion}.`);
      }
      return run;
    }
    await sleep(POLL_MS);
  }
  throw new Error(`Mandatory CI timed out for ${branch}@${sha}.`);
}

async function ensureUpToDateAndGreen(owner, repo, prNumber, integrationBranch) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let pr = await github(`/repos/${owner}/${repo}/pulls/${prNumber}`);
    if (pr.base.ref !== integrationBranch) {
      throw new Error(
        `Worker PR #${prNumber} targets ${pr.base.ref}, expected ${integrationBranch}.`,
      );
    }

    const integration = await github(
      `/repos/${owner}/${repo}/branches/${encodeURIComponent(integrationBranch)}`,
    );
    const beforeSha = pr.head.sha;
    if (pr.base.sha !== integration.commit.sha) {
      const synced = await syncWorkerBranch(owner, repo, pr, integrationBranch);
      pr = synced ?? (await github(`/repos/${owner}/${repo}/pulls/${prNumber}`));
    }

    const ci = await waitForCi(owner, repo, pr.head.ref, pr.head.sha);
    const latestIntegration = await github(
      `/repos/${owner}/${repo}/branches/${encodeURIComponent(integrationBranch)}`,
    );
    if (latestIntegration.commit.sha === integration.commit.sha) {
      return { pr, ci };
    }
    if (pr.head.sha === beforeSha && attempt === 4) {
      throw new Error(`Integration branch kept moving while validating PR #${prNumber}.`);
    }
  }
  throw new Error(`Unable to stabilize PR #${prNumber} against the integration branch.`);
}

async function processCompletedSessions(owner, repo, run, siblings) {
  for (const record of siblings.values()) {
    const issue = await refreshIssue(owner, repo, record.issue.number);
    if (!isProcessableTaskState(issue.labels)) continue;
    const taskDefinition = taskFromManifest(run, record.task.taskId);

    const comments = await issueComments(owner, repo, issue.number);
    const sessionName = julesSessionNameFromComments(comments);
    if (!sessionName) {
      await failTask(owner, repo, issue.number, 'Running task has no Jules API session marker.');
    }
    const session = await getJulesSession(sessionName);
    const state = String(session.state ?? '').toUpperCase();
    if (['FAILED', 'CANCELLED', 'CANCELED'].includes(state)) {
      await failTask(owner, repo, issue.number, `Jules session ${sessionName} ended in ${state}.`);
    }
    if (state !== 'COMPLETED') continue;

    const urls = pullRequestUrlsFromSession(session);
    if (urls.length !== 1) {
      await failTask(
        owner,
        repo,
        issue.number,
        `Expected exactly one Jules PR output, received ${urls.length}.`,
      );
    }
    const prNumber = sameRepositoryPrNumberFromUrl(urls[0], owner, repo);
    if (!prNumber) {
      await failTask(
        owner,
        repo,
        issue.number,
        'Jules output is not a PR from the current repository.',
      );
    }

    let pr = await github(`/repos/${owner}/${repo}/pulls/${prNumber}`);
    if (pr.base.ref !== run.integrationBranch) {
      await failTask(
        owner,
        repo,
        issue.number,
        `Jules PR #${prNumber} targets ${pr.base.ref}, expected ${run.integrationBranch}.`,
      );
    }
    const files = await prChangedFiles(owner, repo, prNumber);
    if (!changedFilesWithinDeclaredScope(files, taskDefinition.paths)) {
      await failTask(
        owner,
        repo,
        issue.number,
        `PR #${prNumber} changed files outside declared task scopes.`,
      );
    }

    await setTaskState(owner, repo, issue.number, [FACTORY_LABELS.ci], [FACTORY_LABELS.running]);
    const validated = await ensureUpToDateAndGreen(owner, repo, prNumber, run.integrationBranch);
    pr = validated.pr;

    const merged = await github(`/repos/${owner}/${repo}/pulls/${prNumber}/merge`, {
      method: 'PUT',
      body: JSON.stringify({
        merge_method: 'squash',
        sha: pr.head.sha,
        commit_title: `[Factory:${run.runId}] ${record.task.taskId}`,
        commit_message: `Typed Factory task #${issue.number}; mandatory CI run ${validated.ci.id} succeeded.`,
      }),
    });
    if (!merged?.merged || !/^[0-9a-f]{40}$/.test(String(merged.sha ?? ''))) {
      await failTask(owner, repo, issue.number, `GitHub did not merge worker PR #${prNumber}.`);
    }

    await addComment(
      owner,
      repo,
      issue.number,
      `${mergedPrMarker(prNumber, merged.sha)}\nWorker PR #${prNumber} passed mandatory CI and was merged only into \`${run.integrationBranch}\`. Target branch \`${run.baseBranch}\` remains untouched.`,
    );
    await setTaskState(
      owner,
      repo,
      issue.number,
      [FACTORY_LABELS.merged],
      [FACTORY_LABELS.ci, FACTORY_LABELS.running, FACTORY_LABELS.ready],
    );
    await github(`/repos/${owner}/${repo}/issues/${issue.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
    });
  }
}

async function allAutomatedTasksMerged(owner, repo, run, siblings) {
  for (const task of run.tasks) {
    if (task.humanGates.length > 0) continue;
    const record = siblings.get(task.id);
    if (!record) return false;
    const issue = await refreshIssue(owner, repo, record.issue.number);
    const labels = new Set(labelNames(issue.labels));
    if (!labels.has(FACTORY_LABELS.merged)) return false;
  }
  return true;
}

async function finalPullRequest(owner, repo, run, parentIssue) {
  const branch = await github(
    `/repos/${owner}/${repo}/branches/${encodeURIComponent(run.integrationBranch)}`,
  );
  const ci = await waitForCi(owner, repo, run.integrationBranch, branch.commit.sha);
  const headQuery = encodeURIComponent(`${owner}:${run.integrationBranch}`);
  const existing = await github(
    `/repos/${owner}/${repo}/pulls?state=open&head=${headQuery}&base=${encodeURIComponent(run.baseBranch)}`,
  );
  let pr = existing[0];
  if (!pr) {
    pr = await github(`/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      body: JSON.stringify({
        title: `[Factory:${run.runId}] consolidated result`,
        head: run.integrationBranch,
        base: run.baseBranch,
        draft: true,
        body: [
          `Factory Run #${parentIssue}: \`${run.runId}\``,
          '',
          `Goal: ${run.goal}`,
          '',
          `Mandatory integration CI: run ${ci.id} — success.`,
          '',
          'This is the final human gate. The Factory runner will never merge this PR into the target branch.',
        ].join('\n'),
      }),
    });
  }
  await addLabels(owner, repo, pr.number, [FACTORY_LABELS.final]);
  await addComment(
    owner,
    repo,
    parentIssue,
    `Factory Run \`${run.runId}\` completed all automated tasks. Final draft PR: #${pr.number}. Integration CI run ${ci.id} succeeded. Final merge remains human-controlled. Production activation was not performed.`,
  );
  return pr;
}

export async function runParent(parentIssue) {
  const { owner, repo } = repositoryParts();
  const parent = await github(`/repos/${owner}/${repo}/issues/${parentIssue}`);
  const run = parseFactoryRunV2(parent.body ?? '');
  const source = await findGithubSource(owner, repo);

  for (let cycle = 0; cycle < MAX_RUNNER_CYCLES; cycle += 1) {
    let siblings = await childIssues(owner, repo, run.runId);
    if (siblings.size !== run.tasks.length) {
      await sleep(POLL_MS);
      continue;
    }

    await ensureReadyDependencies(owner, repo, run, siblings);
    siblings = await childIssues(owner, repo, run.runId);
    await dispatchReadyTasks(owner, repo, run, source, siblings);
    siblings = await childIssues(owner, repo, run.runId);
    await processCompletedSessions(owner, repo, run, siblings);
    siblings = await childIssues(owner, repo, run.runId);

    const failed = [];
    for (const record of siblings.values()) {
      const issue = await refreshIssue(owner, repo, record.issue.number);
      if (labelNames(issue.labels).includes(FACTORY_LABELS.failed)) failed.push(issue.number);
    }
    if (failed.length) throw new Error(`Factory Run failed closed in tasks: ${failed.join(', ')}`);

    if (await allAutomatedTasksMerged(owner, repo, run, siblings)) {
      const pr = await finalPullRequest(owner, repo, run, parentIssue);
      return {
        status: 'human-final-gate',
        run_id: run.runId,
        integration_branch: run.integrationBranch,
        target_branch: run.baseBranch,
        final_pr: pr.number,
        final_merge: 'not-performed',
        production_activation: 'not-performed',
      };
    }
    await sleep(POLL_MS);
  }
  throw new Error('Factory runner reached its bounded execution window before completion.');
}

async function main() {
  const parentIssue = Number(requiredEnv('FACTORY_PARENT_ISSUE'));
  if (!Number.isInteger(parentIssue) || parentIssue <= 0) {
    throw new Error('FACTORY_PARENT_ISSUE must be a positive integer.');
  }
  const result = await runParent(parentIssue);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]?.endsWith('/runner-v2.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
