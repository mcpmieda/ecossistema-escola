# Student Portal PostgreSQL migrations

Owner: #704 (`[PA][P1]`, family P1-02). These migrations are additive and separate from `migrations/gradebook*`.

## Ledger

| Migration | Purpose |
| --- | --- |
| `0001_identity_credentials_acl_v1.sql` | private schema, runtime role, account/link, birth access data, QR/password credentials, sessions and auth state |
| `0002_policy_publication_revision_v1.sql` | settings, publication/projection/jobs, durable revision state/events and narrow 2026 academic read views |
| `0003_audit_receipts_closure_integration_v1.sql` | audit, idempotency receipts, explicit link tombstones, reset preview proof and narrow Gradebook revision function |
| `0004_gradebook_integration_usage_v1.sql` | namespace-only access required for `gradebook_app` to invoke the single integration function; no table privilege |

The sequence assumes the current relational Gradebook catalog through `migrations/gradebook-simplified/0008_year_reset_acl_v1.sql`. In particular, `gradebook.aluno(id, ano)` must remain unique and `gradebook.fechamento.rec_rr_mask` must exist. #705 must compare the target catalog and migration ledger before applying anything remotely.

## Invariants

- Portal V1 is restricted to academic year 2026.
- A live Portal link is unique by `(academic_year, gradebook_student_id)` and references `gradebook.aluno(id, ano)` with `RESTRICT`, never cascade.
- Closing a link first writes `link_closure`, then nulls the live academic reference. The tombstone deliberately has no FK to Gradebook so history survives a later authorized Gradebook reset. Relinking by name is outside the contract.
- QR payloads, raw session tokens, PINs and passwords are never stored. Only credential metadata, verifiers and hashes are persisted.
- `student_portal_app` owns no schema objects and has no DDL, superuser or BYPASSRLS capability. It receives only runtime DML in the private Portal schema and SELECT on the narrow Portal-owned academic views.
- `PUBLIC` receives no schema/table/function privileges. Supabase client roles are not granted privileges by these migrations.
- `gradebook_app` receives schema `USAGE` plus only `EXECUTE` on `record_gradebook_change_v1`; it receives no table DML in `student_portal`.
- Revision generations are random per database and counters are positive/durable. The narrow integration function is idempotent by `event_id` and must be called only after the #703 common lock protocol has been acquired by the writer.
- D1/KV are not fallback persistence for this schema.

## Application and rollback

#704 authors and tests these files only. It does **not** apply them to Supabase. #705 owns remote application/Hyperdrive/driver proof after this branch is integrated.

These migrations intentionally fail on replay against an existing `student_portal` schema rather than silently resetting it. Rollback of code must remain compatible with the additive schema; dropping tables/schema/roles in production is not a standard rollback and requires a separate destructive plan.
