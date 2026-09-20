# Cloudflare read-only operator

Status: v1 for #1016.

## Purpose

`/cloudflare` gives the repository owner and the ChatGPT lead a bounded way to inspect the Cloudflare authority already available to GitHub Actions without exposing credentials and without depending on a local terminal.

The operator is intentionally a capability probe. It does not accept arbitrary shell, URL, HTTP method, account ID, resource ID or Cloudflare payload from an issue.

## Trigger

On an issue created by the repository owner, the owner may add the exact comment:

```text
/cloudflare
```

The workflow also supports manual `workflow_dispatch` with an owner-authored issue number.

The workflow checks out trusted `main`, uses `persist-credentials: false`, runs in the existing `production` GitHub environment and publishes only the sanitized matrix back to the issue.

## Existing credentials only

V1 reuses, without changing:

- `CLOUDFLARE_DEPLOY_TOKEN`
- `CLOUDFLARE_HYPERDRIVE_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

No token is created, rotated or widened by this workflow. Each secret is injected only into its own probe step. The render/comment step receives no Cloudflare secret.

## Fixed read/query allowlist

Both existing tokens are tested against the same fixed surfaces so overlap is visible:

| Capability | Cloudflare API | Expected permission family |
| --- | --- | --- |
| Workers scripts | `GET /accounts/{account}/workers/scripts` | Workers Scripts Read/Write or accepted equivalent |
| Pages projects | `GET /accounts/{account}/pages/projects` | Pages Read/Write |
| Hyperdrive configs | `GET /accounts/{account}/hyperdrive/configs` | Hyperdrive Read/Write |
| Zones | `GET /zones` filtered to the account | Zone Zone Read |
| Workers analytics | GraphQL `workersInvocationsAdaptive`, five-minute window, one row | Account Analytics Read |

The GraphQL call is a query, never a mutation. No raw analytics values are put in the issue.

DNS for the school remains authoritative at GoDaddy. A missing Cloudflare Zone capability is therefore informative, not a request to move DNS or nameservers.

## Sanitized states

- `accessible`: the existing token proved that read/query surface.
- `permission-required`: REST returned HTTP 401/403.
- `inconclusive`: the provider responded but did not prove the capability. This does not justify a new token.
- `unavailable`: transport, rate limit or provider availability prevented proof. This does not justify a new token.
- `credential-missing`: the named existing secret was not available to the workflow.

The operator never reports response bodies, Cloudflare error messages, token values, authorization headers, Hyperdrive origin/database/user/host, project contents, Worker source, zone identifiers or analytics values.

## Security boundary

The operator performs no mutable Cloudflare request. REST probes use `GET`; the only `POST` is the Cloudflare GraphQL analytics query and its document contains no `mutation`.

A future write operator is not implied by this v1. Any expansion to mutations, arbitrary parameters, additional secrets or wider Cloudflare permissions requires a separate reviewed change and the applicable authorization.

## Implementation

- Workflow: `.github/workflows/cloudflare-on-demand.yml`
- Executor: `scripts/cloudflare-operator-v1.ts`
- Tests: `tests/cloudflare-operator-v1.test.ts`
- Credential inventory: `docs/infra/AUTOMATION_CREDENTIAL_INVENTORY.md`
