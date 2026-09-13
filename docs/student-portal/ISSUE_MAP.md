# Entregas P1, dependÃªncias e ownership

## SituaÃ§Ã£o atual (13/09/2026)

#702â€“#714 integradas/publicadas, inclusive #732 e #735 para lacunas contratuais especÃ­ficas. #715 Ã© [AGORA][SEQUENCIAL][CODEX], execuÃ§Ã£o direta. O quadro original abaixo Ã© rastreio de planejamento: rÃ³tulos/executor histÃ³ricos nÃ£o substituem o estado atual no GitHub. Nenhuma P2 criada.

P1-01 contratos=#702/#703; P1-02 persistÃªncia/guarda=#704/#706; P1-03 runtime=#705; P1-04 perfis/polÃ­ticas/nascimento=#707/#708/#709; P1-05 auth=#711; P1-06 fonte/publicaÃ§Ã£o=#710/#712; P1-07 ADM=#713; P1-08 hardening=#714; P1-09 integraÃ§Ã£o/aceite=#715. Autoria concluÃ­da nÃ£o substitui os aceites remotos consolidados de I.

MÃ£e [#701](https://github.com/mcpmieda/ecossistema-escola/issues/701). TÃ­tulos abaixo identificam executor e paralelismo; consulta Ã  issue confirma estado atual. Autoria, integraÃ§Ã£o, DDL e prova real sÃ£o etapas distintas. Nenhuma P2 nesta fila.

| Issue | TÃ­tulo | Predecessores de integraÃ§Ã£o | Rastreio |
|---|---|---|---|
| [#702](https://github.com/mcpmieda/ecossistema-escola/issues/702) | [SEQUENCIAL][CODEX] [PA][P1] Contratos, decisÃµes operacionais e ownership da fundaÃ§Ã£o | G-V | P1-01 |
| [#703](https://github.com/mcpmieda/ecossistema-escola/issues/703) | [SEQUENCIAL][CHAT ONLINE] [BN][CONTRATO][PA][P1][INTEGRAÃ‡ÃƒO-BN] Leitura acadÃªmica, revisÃµes e guarda do reset | #702 | P1-01 / P1-06 / reset A |
| [#704](https://github.com/mcpmieda/ecossistema-escola/issues/704) | [PARALELO][CHAT ONLINE] [PA][P1] Schema, ACL e persistÃªncia PostgreSQL nativa | #703 | P1-02 |
| [#705](https://github.com/mcpmieda/ecossistema-escola/issues/705) | [PARALELO][CODEX] [PA][P1] Runtime Cloudflare, DDL real e conexÃµes isoladas | #704 | P1-03 / validaÃ§Ã£o P1-02 |
| [#706](https://github.com/mcpmieda/ecossistema-escola/issues/706) | [PARALELO][CODEX] [PA][P1][INTEGRAÃ‡ÃƒO-BN] Impedir reset anual com contas vinculadas | #705 | Reset A / P1-02 / P1-09 |
| [#707](https://github.com/mcpmieda/ecossistema-escola/issues/707) | [PARALELO][CODEX] [PA][P1][INTEGRAÃ‡ÃƒO-BN] Sincronizar perfis e registrar revisÃµes transacionais | #706 | P1-04 / P1-06 |
| [#708](https://github.com/mcpmieda/ecossistema-escola/issues/708) | [PARALELO][CHAT ONLINE] [PA][P1] PolÃ­ticas herdadas, calendÃ¡rio e divulgaÃ§Ã£o configurÃ¡vel | #704 | P1-05 |
| [#709](https://github.com/mcpmieda/ecossistema-escola/issues/709) | [PARALELO][CHAT ONLINE] [PA][P1] Cadastro de nascimento com CAS e invalidaÃ§Ã£o atÃ´mica de desafios | #704 | P1-04 / P1-07 |
| [#710](https://github.com/mcpmieda/ecossistema-escola/issues/710) | [PARALELO][CHAT ONLINE] [PA][P1] Adaptador acadÃªmico oficial e projeÃ§Ã£o self mÃ­nima | #704 | P1-06 |
| [#711](https://github.com/mcpmieda/ecossistema-escola/issues/711) | [PARALELO][CODEX] [PA][P1] AutenticaÃ§Ã£o, QR, KDF e sessÃµes revogÃ¡veis | #705, #708, #709 | P1-04 / P1-08 |
| [#712](https://github.com/mcpmieda/ecossistema-escola/issues/712) | [PARALELO][CHAT ONLINE] [PA][P1] PublicaÃ§Ã£o versionada e jobs durÃ¡veis recuperÃ¡veis | #708, #710, #707 | P1-06 |
| [#713](https://github.com/mcpmieda/ecossistema-escola/issues/713) | [SEQUENCIAL][CHAT ONLINE] [PA][P1] API administrativa privada e operaÃ§Ãµes em lote | #711, #712 | P1-07 |
| [#714](https://github.com/mcpmieda/ecossistema-escola/issues/714) | [SEQUENCIAL][CODEX] [PA][P1] Hardening, observabilidade, carga e recuperaÃ§Ã£o tÃ©cnica | #713 | P1-08 |
| [#715](https://github.com/mcpmieda/ecossistema-escola/issues/715) | [SEQUENCIAL][CODEX] [PA][P1] IntegraÃ§Ã£o final, smoke 6A e gate G-B | #714 | P1-09 |

```mermaid
graph TD
  C[702] --> B[703 G-C]
  B --> D[704]
  D --> R[705]
  D --> P[708]
  D --> N[709]
  D --> L[710]
  R --> G[706]
  G --> S[707]
  R --> A[711]
  P --> A
  N --> A
  P --> U[712]
  L --> U
  S --> U
  A --> M[713]
  U --> M
  M --> H[714]
  H --> I[715 G-B]
```

Primeira onda: apÃ³s G-C, D e preparaÃ§Ã£o R simultÃ¢neas (R sÃ³ fecha apÃ³s DDL D). Depois D, P/N/L no CHAT ONLINE enquanto CODEX configura R; A desenha crypto. Depois guarda G publicada, S integra/popula; A/S/L separados. U consome S/P/L. M apÃ³s A/U; H harness sem wiringprod antesI, depois I compÃµe/deploya. NÃ£o existe dependÃªncia reversa Râ†’D para fechar autoria D: workflow teste pode ser preparado por R antes de fechar runtime. N usa CryptoPort congelado, nÃ£o depende da autoria A. Isso evita ciclos.

## Reserva exclusiva

| Owner | Paths |
|---|---|
| #702 | docs/student-portal/{README.md,MASTER_SPEC.md,ARCHITECTURE.md,DECISIONS.md,ISSUE_MAP.md,PROJECT_STATE.yaml,TEST_MATRIX.md,PRODUCTION_READINESS.md}; shared/student-portal-contracts/**; tests/student-portal/contracts/** |
| #703 | shared/gradebook-contracts/student-portal/**; shared/gradebook-contracts/settings/year-reset-contract-v1.ts; docs/gradebook/{CONTRACTS.md,CONSUMER_MAP.md,YEAR_RESET_SETTINGS.md}; tests/student-portal/bn-contract/** |
| #704 | migrations/student-portal/**; server/student-portal/persistence/**; tests/student-portal/persistence/** |
| #705 | workers/student-portal/**; wrangler.student-portal.jsonc; wrangler.student-portal-edge.jsonc (somente se alternativa Pages validada); package.json; package-lock.json; tsconfig*.json; worker-configuration.d.ts; wrangler.jsonc; .github/workflows/{validate-pull-request.yml,deploy-cloudflare-pages.yml,deploy-student-portal.yml}; server/env.ts; server/student-portal/runtime/**; tests/student-portal/runtime/** |
| #706 | server/gradebook/application/settings/year-reset-v1.ts; server/gradebook/http/year-reset-routes-v1.ts; src/features/gradebook/settings/gradebook-settings-page-v1.tsx; src/features/gradebook/settings/year-reset-client-v1.ts; server/student-portal/integration/year-reset/**; tests/student-portal/year-reset/**; testes existentes de year-reset afetados |
| #707 | server/student-portal/integration/lifecycle/**; server/student-portal/integration/revisions/**; server/gradebook/application/import/import-relational-service-v9.ts; server/gradebook/application/import/import-relational-service-v10.ts; server/gradebook/application/import/import-relational-service-v11.ts; server/gradebook/persistence/postgres/relational-import-write-buffer-v11.ts; server/gradebook/application/council/relational-council-v3.ts (decisÃµes/fechamentos; mutaÃ§Ãµes adicionais exigem ajuste nominal em B); tests/student-portal/lifecycle/**; tests/student-portal/revisions/** |
| #708 | server/student-portal/policies/**; tests/student-portal/policies/** |
| #709 | server/student-portal/birth-year/**; tests/student-portal/birth-year/** |
| #710 | server/student-portal/academic/**; tests/student-portal/academic/** |
| #711 | server/student-portal/auth/**; server/student-portal/crypto/**; server/student-portal/http/auth/**; tests/student-portal/auth/**; tests/student-portal/crypto/** |
| #712 | server/student-portal/publication/**; server/student-portal/jobs/**; tests/student-portal/publication/**; tests/student-portal/jobs/** |
| #713 | server/student-portal/admin/**; server/student-portal/http/admin/**; server/student-portal/admin-client/**; tests/student-portal/admin/** |
| #714 | server/student-portal/observability/**; server/student-portal/maintenance/**; tests/student-portal/security/**; tests/student-portal/integration/**; tests/student-portal/load/**; tests/student-portal/recovery/** |
| #715 | functions/[[path]].ts; workers/student-portal/**; server/student-portal/composition/**; server/env.ts; worker-configuration.d.ts; wrangler*.jsonc; package.json; package-lock.json; tsconfig*.json; .github/workflows/{validate-pull-request.yml,deploy-cloudflare-pages.yml,deploy-student-portal.yml}; docs/student-portal/{README.md,MASTER_SPEC.md,ARCHITECTURE.md,DECISIONS.md,ISSUE_MAP.md,PROJECT_STATE.yaml,TEST_MATRIX.md,PRODUCTION_READINESS.md}; docs/gradebook/PROJECT_STATE.yaml (somente status/links da integraÃ§Ã£o); tests/student-portal/smoke/** |

Migrations D Ãºnicas; R aplica. Package/lock/tsconfig/wrangler/workflows/runtime Râ†’I somente apÃ³s handoff; roteador functions/[[path]].ts exclusivo I. Contratos C/B nÃ£o sÃ£o editados por consumidores: propor delta. Documentos centrais Câ†’I; demais entregam evidÃªncia no handoff. Os paths de S adicionais devem ser nomeados em #703; nÃ£o hÃ¡ wildcard livre BN. Na baseline, produtores observados: import-relational-service-v9/v10/v11, relational-import-write-buffer-v11, relational-council-v3. GuardaG e hooksS nÃ£o disputam locks/test DB em paralelo. DDL/deploy/carga/importaÃ§Ã£o/teste 6A requerem janela exclusiva ou ambientes/contas isolados. Sem subagentes/orquestrador.
