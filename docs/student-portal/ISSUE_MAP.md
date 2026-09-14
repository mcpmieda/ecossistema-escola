# Entregas P1/P2, dependências e ownership

## Fila vigente — #742

PA-DEC-007 manteve a execução direta e sequencial, inclusive CHAT ONLINE, preservando as identidades dos títulos. As 18 filhas #743–#760 e a mãe #742 encerram após a integração da #760. PA-DEC-009 registra G-B aceito com limitações e G-P aprovado para release técnica fechada por política.

| Chave / issue | Entrega | Família | Identidade preservada | Estado / independência | Depende de |
| --- | --- | --- | --- | --- | --- |
| A [#743](https://github.com/mcpmieda/ecossistema-escola/issues/743) | Reconciliar estado, contratos de interface e ownership da Parte 2 | P2-00 | CODEX | CONCLUÍDA / SEQUENCIAL | início autorizado |
| B [#744](https://github.com/mcpmieda/ecossistema-escola/issues/744) | Preparar build estudantil, transporte e ambiente de teste isolado | P2-01A / P2-06 preparação | CODEX | CONCLUÍDA / PARALELO | #743 |
| C [#745](https://github.com/mcpmieda/ecossistema-escola/issues/745) | Contratar classificação de notas pela regra acadêmica oficial | P2-03 pré-requisito BN | CHAT ONLINE | CONCLUÍDA / PARALELO | #743 |
| D [#746](https://github.com/mcpmieda/ecossistema-escola/issues/746) | Completar consultas administrativas necessárias às telas | P2-04/05 pré-requisito PA | CHAT ONLINE | CONCLUÍDA / PARALELO | #743 |
| E [#747](https://github.com/mcpmieda/ecossistema-escola/issues/747) | Projetar classificação acadêmica oficial sem duplicar cálculos | P2-03 integração BN | CODEX | CONCLUÍDA / PARALELO | #745 |
| F [#748](https://github.com/mcpmieda/ecossistema-escola/issues/748) | Construir shell, Perfil do aluno e estados visuais HeroUI | P2-01 | CHAT ONLINE | CONCLUÍDA / PARALELO | #744 |
| G [#749](https://github.com/mcpmieda/ecossistema-escola/issues/749) | Implementar leitor QR, ativação, senha e sessão estudantil | P2-02 | CODEX | CONCLUÍDA / PARALELO | #744 |
| H [#750](https://github.com/mcpmieda/ecossistema-escola/issues/750) | Construir Minhas notas com períodos publicados e estados oficiais | P2-03 | CHAT ONLINE | CONCLUÍDA / PARALELO | #744, #745 |
| I [#751](https://github.com/mcpmieda/ecossistema-escola/issues/751) | Configurar acesso, herança, calendário e encerramento de vínculos no ADM | P2-04A | CHAT ONLINE | CONCLUÍDA / PARALELO | #744, #746 |
| J [#752](https://github.com/mcpmieda/ecossistema-escola/issues/752) | Operar publicação e atualização de períodos no ADM | P2-04B | CHAT ONLINE | CONCLUÍDA / PARALELO | #744, #746 |
| K [#753](https://github.com/mcpmieda/ecossistema-escola/issues/753) | Criar lista e ficha de contas com ações de acesso no ADM | P2-05A | CHAT ONLINE | CONCLUÍDA / PARALELO | #744, #746 |
| L [#754](https://github.com/mcpmieda/ecossistema-escola/issues/754) | Cadastrar nascimento por turma com autosave e lotes retomáveis | P2-05B | CHAT ONLINE | CONCLUÍDA / PARALELO | #744, #746 |
| M [#755](https://github.com/mcpmieda/ecossistema-escola/issues/755) | Gerar e copiar QR e PDF em três modos no ADM | P2-05C | CODEX | CONCLUÍDA / PARALELO | #744, #746 |
| N [#756](https://github.com/mcpmieda/ecossistema-escola/issues/756) | Gerenciar sessões, auditoria e saúde operacional no ADM | P2-05D | CHAT ONLINE | CONCLUÍDA / PARALELO | #744, #746 |
| O [#757](https://github.com/mcpmieda/ecossistema-escola/issues/757) | Integrar telas aos serviços reais e à navegação existente | P2-06 | CODEX | CONCLUÍDA / SEQUENCIAL | #744, #746, #747, #748, #749, #750, #751, #752, #753, #754, #755, #756 |
| P [#758](https://github.com/mcpmieda/ecossistema-escola/issues/758) | Validar segurança, acessibilidade, desempenho e regressões integradas | P2-07 | CODEX | CONCLUÍDA / SEQUENCIAL | #757 |
| Q [#759](https://github.com/mcpmieda/ecossistema-escola/issues/759) | Executar aceite real, piloto 6A e checklist adiada da Parte 1 | P2-08 | CODEX | CONCLUÍDA / SEQUENCIAL | #758 |
| R [#760](https://github.com/mcpmieda/ecossistema-escola/issues/760) | Preparar liberação deliberada, operação e continuidade do Portal | P2-09 | CODEX | CONCLUÍDA / SEQUENCIAL | #759 |

## Grafo de dependências de integração

```mermaid
graph TD
  A["A #743"]
  B["B #744"]
  C["C #745"]
  D["D #746"]
  E["E #747"]
  F["F #748"]
  G["G #749"]
  H["H #750"]
  I["I #751"]
  J["J #752"]
  K["K #753"]
  L["L #754"]
  M["M #755"]
  N["N #756"]
  O["O #757"]
  P["P #758"]
  Q["Q #759"]
  R["R #760"]
  A --> B
  A --> C
  A --> D
  C --> E
  B --> F
  B --> G
  B --> H
  C --> H
  B --> I
  D --> I
  B --> J
  D --> J
  B --> K
  D --> K
  B --> L
  D --> L
  B --> M
  D --> M
  B --> N
  D --> N
  B --> O
  D --> O
  E --> O
  F --> O
  G --> O
  H --> O
  I --> O
  J --> O
  K --> O
  L --> O
  M --> O
  N --> O
  O --> P
  P --> Q
  Q --> R
```

São 18 filhas, 35 arestas e nenhum ciclo. Estado final: 18/18 concluídas. Todas as frentes chegam à #757. Dependência exige main integrada e handoff; não basta PR aberto. Sequência direta recomendada: #743 → #744 → #745 → #746 → #747 → #748 → #749 → #750 → #751 → #752 → #753 → #754 → #755 → #756 → #757 → #758 → #759 → #760. A ordem adicional resulta da execução sequencial, não de dependências técnicas inventadas.

## Ownership e promoção

#743 edita memória central; #744 reserva package/lock/config/build/edge e shared UI/clients até transferência para #757. #745 é o contrato BN, #746 contrato/consultas ADM, #747 helper acadêmico e adapter. #748 shell; #749 auth/leitor; #750 grades; #751 settings; #752 publication; #753 accounts; #754 birth-year; #755 credentials/PDF; #756 sessions/audit/overview. Paths completos reservados em cada issue.

#757 centraliza montagem/roteador/navegação/docs/release; #758 recebe apenas matriz/readiness na sua janela; #759 registra gates/dados institucionais/aceite; #760 consolida operação. Fora da janela, alterações documentais são deltas no handoff. Uma lacuna de contrato/allowlist é resolvida antes da alteração; não implica autorização de nova regra/DDL.

Ao concluir uma filha, registrar main/deploy/provas, marcar CONCLUÍDA e promover somente a próxima filha da sequência a AGORA. Preservar literalmente CODEX/CHAT ONLINE e a classificação SEQUENCIAL/PARALELO. Teste legítimo/dispositivo/calendário só bloqueia sua operação dependente, sem PASS presumido. Nenhuma abertura geral na montagem das telas.

## Planejamento P1 preservado como histórico

Os títulos, contagens e instruções de execução abaixo são checkpoints anteriores, substituídos no estado corrente por PA-DEC-006/007 e pela matriz acima. Não retomar #715 ou criar novamente sua fila.

# Entregas P1, dependÃªncias e ownership

## Encerramento da fila técnica P1

PA-DEC-006 autoriza concluir #715 e #701 após a entrega documental final. #702–#714 e contratos #732/#735 já estavam encerrados. Nenhuma issue atual é transferida silenciosamente para PASS: as provas finais permanecem na checklist de TEST_MATRIX e devem ser incorporadas ao planejamento da Parte2. Os títulos e regras de permanência abaixo são memória do planejamento original, substituídos apenas quanto ao momento do aceite por PA-DEC-006.

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
