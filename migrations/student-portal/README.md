# Student Portal PostgreSQL migrations

Owner: #704 (`[PA][P1]`, family P1-02). These migrations are additive and separate from `migrations/gradebook*`.

## Ledger

| Migration | Purpose |
| --- | --- |
| `0001_identity_credentials_acl_v1.sql` | private schema, runtime role, account/link, birth access data, QR/password credentials, sessions and auth state |
| `0002_policy_publication_revision_v1.sql` | settings, publication/projection/jobs, durable revision state/events and narrow 2026 academic read views |
| `0003_audit_receipts_closure_integration_v1.sql` | audit, idempotency receipts, explicit link tombstones, reset preview proof and narrow Gradebook revision function |
| `0004_gradebook_integration_usage_v1.sql` | namespace-only integration ACL plus read-only reset guard function for `gradebook_app`; no table privilege |
| `0005_year_reset_protocol_v1.sql` | #706: amplia a coordenação técnica do reset ao intervalo anual do BN, inicializa revisão por ano e cria guards sem conceder DML acadêmico |
| `0006_gradebook_revision_year_range_v1.sql` | #706: amplia `record_gradebook_change_v1` ao intervalo anual contratado, preservando idempotência e revisões duráveis |
| `0007_lifecycle_integration_v1.sql` | #707: adiciona controle/snapshot de lifecycle, preview de fechamento de vínculos e sincronização de perfis com população inicialmente desabilitada |
| `0008_atomic_publication_v2.sql` | #803: introduz preparação/publicação V2 atômica e escopada, inicialmente desabilitada, sem alterar fatos acadêmicos |
| `0009_publication_cutover_guard_v2.sql` | bloqueia escritores legados de publicação/projeção/jobs quando o cutover V2 escopado estiver ativo |
| `0010_incremental_publication_v3.sql` | #806: acrescenta preparação incremental V3 e métricas sem mudar decisões de publicação nem notas |
| `0011_live_event_outbox_v1.sql` | #808: outbox transacional mínimo para avisos live autenticados, contendo apenas roteamento e versões opacas |
| `0012_granular_observations_names_v1.sql` | #817: projeta nomes de avaliações e observação granular no Portal e restringe emissão live ao ano 2026; depende de Gradebook 0009 |
| `0013_publication_inheritance_v1.sql` | #827: marca herança lógica da decisão do escopo pai sem apagar release nem copiar fatos acadêmicos |
| `0014_year_reset_full_cleanup_v1.sql` | mantém o contrato do reset anual e remove, ao concluir, eventos de revisão, provas técnicas e coordenação anual do ano apagado |
| `0015_student_portal_rls_v1.sql` | defesa em profundidade #859: RLS não-forçado nas 27 tabelas privadas, policy restrita a `student_portal_app` e ACL existente preservada |

The ledger above is the **repository migration sequence**, not independent proof that every file has been applied remotely. Production application is recorded by the owning issue/deploy evidence and by the canonical project state. The sequence began against the Gradebook catalog through `migrations/gradebook-simplified/0008_year_reset_acl_v1.sql`; later Portal migrations declare newer Gradebook dependencies explicitly (for example `0012` depends on Gradebook `0009`). `gradebook.aluno(id, ano)` must remain unique and `gradebook.fechamento.rec_rr_mask` must exist. #705 must compare the target catalog and migration ledger before applying anything remotely.

## Invariants

- Portal V1 is restricted to academic year 2026.
- A live Portal link is unique by `(academic_year, gradebook_student_id)` and references `gradebook.aluno(id, ano)` with `RESTRICT`, never cascade.
- Closing a link first writes `link_closure`, then nulls the live academic reference. The tombstone deliberately has no FK to Gradebook so history survives a later authorized Gradebook reset. Relinking by name is outside the contract.
- QR payloads, raw session tokens, PINs and passwords are never stored. Only credential metadata, verifiers and hashes are persisted.
- `student_portal_app` owns no schema objects and has no DDL, superuser or BYPASSRLS capability. It receives only runtime DML in the private Portal schema and SELECT on the narrow Portal-owned academic views. Desde #859, as 27 tabelas privadas também exigem a policy `student_portal_app_backend_v1`; a policy não concede operações e a ACL continua sendo o limite de SELECT/INSERT/UPDATE/DELETE.
- `PUBLIC` receives no schema/table/function privileges. Supabase client roles are not granted privileges by these migrations.
- `gradebook_app` receives schema `USAGE` plus only `EXECUTE` on `record_gradebook_change_v1` and `inspect_year_reset_guard_v1`; it receives no table DML in `student_portal`.
- Revision generations are random per database and counters are positive/durable. `record_gradebook_change_v1` is idempotent by `event_id` and must be called only after the #703 common lock protocol has been acquired by the writer. `inspect_year_reset_guard_v1` is read-only and must run in the same reset transaction after those locks.
- D1/KV are not fallback persistence for this schema.

## Application and rollback

#704 authors and tests these files only. It does **not** apply them to Supabase. #705 owns remote application/Hyperdrive/driver proof after this branch is integrated.

These migrations intentionally fail on replay against an existing `student_portal` schema rather than silently resetting it. Rollback of code must remain compatible with the additive schema; dropping tables/schema/roles in production is not a standard rollback and requires a separate destructive plan.
