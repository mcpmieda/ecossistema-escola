# infra/factory

Provider-neutral Factory Control Plane foundation with Jules as the first active remote provider.

## Current path

- `contract-v2.mjs`: validates the immutable Factory Run contract, dependencies, path scopes and bounded parallelism.
- `materialize-v2.mjs`: creates/reuses the isolated `factory/<run_id>` branch and typed task issues.
- `jules-api.mjs`: bounded Jules REST API adapter; provider credentials remain in GitHub Actions secrets.
- `runner-v2.mjs`: dispatches up to three workers, verifies scope, runs mandatory CI and integrates only into the isolated Factory branch.
- `github-api.mjs`: narrow GitHub REST helpers used by the typed runner.
- `validate-v2.mjs`: validates API-first fixtures without external network dispatch.
- `examples/`: safe legacy and API-first fixtures used by CI.

## Compatibility

- `control-plane.mjs` and `reconcile.mjs` preserve the already-proven legacy issue/label path while API-first rollout is validated.
- The plain `jules` label is legacy compatibility only; new automated runs use the Jules REST API.

The runner never merges the consolidated final PR into the target branch and never grants production, privilege or destructive-operation authority to an AI provider.
