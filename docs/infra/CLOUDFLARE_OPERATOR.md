# Cloudflare read-only operator

Status: v2 for #1027, built on the capability probe from #1016.

## Purpose

The operator lets the repository owner and the ChatGPT lead inspect bounded Cloudflare production state through GitHub Actions without exposing credentials and without depending on a local terminal.

It never accepts arbitrary shell, URL, HTTP method, account ID, resource ID or Cloudflare payload from an issue.

## Triggers

On an issue created by the repository owner, the owner may add one of these exact comments:

```text
/cloudflare
/cloudflare portal
```

- `/cloudflare`: capability probe for the existing Cloudflare credentials.
- `/cloudflare portal`: sanitized operational diagnostic for the fixed Portal resources.

The workflow also supports manual `workflow_dispatch` with the fixed operations `capabilities` or `portal`.

The workflow checks out trusted `main`, uses `persist-credentials: false`, runs in the existing `production` GitHub environment and publishes only the sanitized result back to the owner-authored issue.

## Existing credentials only

The operator reuses, without changing:

- `CLOUDFLARE_DEPLOY_TOKEN`
- `CLOUDFLARE_HYPERDRIVE_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

No token is created, rotated or widened. Each secret is injected only into the step that needs it. Rendering and GitHub commenting receive no Cloudflare secret.

The first real probe after #1016 proved:

| Capability | Deploy token | Hyperdrive token |
| --- | --- | --- |
| Workers scripts | accessible | accessible |
| Pages projects | accessible | permission-required |
| Hyperdrive configs | permission-required | accessible |
| Zones | accessible | accessible |
| Workers analytics | accessible | inconclusive |

Together, the two existing tokens cover every read-only surface needed by the current operator. No new Cloudflare credential is required for v2.

## Capability probe

Both existing tokens are tested against a fixed allowlist:

| Capability | Cloudflare API |
| --- | --- |
| Workers scripts | `GET /accounts/{account}/workers/scripts` |
| Pages projects | `GET /accounts/{account}/pages/projects` |
| Hyperdrive configs | `GET /accounts/{account}/hyperdrive/configs` |
| Zones | `GET /zones` filtered to the account |
| Workers analytics | GraphQL `workersInvocationsAdaptive` query |

The GraphQL call is a query, never a mutation. No raw analytics values are published by the capability probe.

DNS for the school remains authoritative at GoDaddy. Zone visibility is informational only and does not imply changing nameservers or DNS authority.

## Portal diagnostic

`/cloudflare portal` reads only the fixed production resources already named by the repository:

| Resource | Read | Published evidence |
| --- | --- | --- |
| Worker `student-portal-production` | Workers scripts list | presence, modified time and compatibility date |
| Pages `student-portal-edge` | exact Pages project | presence, production branch, canonical deployment status and creation time |
| Hyperdrive `PORTAL_DB` | exact config `46ac2fcb25ad4ad5b5662d536ccd968a` | presence, whether cache is disabled, origin connection limit |
| Worker analytics | GraphQL for `student-portal-production`, last 60 minutes | aggregate requests and errors only |

The diagnostic never downloads Worker source and never publishes Pages environment variables, deployment aliases/domains, Hyperdrive origin/database/user/host/password, individual analytics events, student data or provider error payloads.

## Sanitized states

- `accessible`: the existing credential proved that surface.
- `permission-required`: REST returned HTTP 401/403.
- `not-found`: the fixed expected resource returned HTTP 404.
- `inconclusive`: the provider responded but did not prove the expected structure.
- `unavailable`: transport, rate limit or provider availability prevented proof.
- `credential-missing`: the named existing secret was not available to the workflow.

A non-accessible state does not authorize creating or expanding a token.

## Security boundary

The operator performs no mutable Cloudflare request.

- REST calls are `GET`.
- The only `POST` is the Cloudflare GraphQL analytics query.
- GraphQL documents contain no `mutation`.
- Issue input chooses only a fixed operation; it cannot inject URLs, resource IDs, methods or provider payloads.
- Raw provider responses are processed in memory and never copied to issue comments or artifacts.
- Cloudflare secrets are never passed to the renderer/comment step.

A future write operator is not implied by this read-only design. Mutations, wider permissions or additional credentials require a separate reviewed delivery and the applicable authorization.

## Implementation

- Workflow: `.github/workflows/cloudflare-on-demand.yml`
- Executor: `scripts/cloudflare-operator-v1.ts`
- Tests: `tests/cloudflare-operator-v1.test.ts`
- Credential inventory: `docs/infra/AUTOMATION_CREDENTIAL_INVENTORY.md`
