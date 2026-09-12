# Portal do Aluno

Fundação da Parte 1, issue #702, filha da #701. Esta entrega contém contratos e documentação, sem runtime, migrations, dados ou UI. O gate G-C aguarda o contrato BN #703. Não iniciar consumidores automaticamente.

Ordem: AGENTS.md → este README → [MASTER_SPEC](MASTER_SPEC.md) → [ARCHITECTURE](ARCHITECTURE.md) → [DECISIONS](DECISIONS.md) → [PROJECT_STATE](PROJECT_STATE.yaml) → issue → [ISSUE_MAP](ISSUE_MAP.md) e [TEST_MATRIX](TEST_MATRIX.md). A prontidão está em [PRODUCTION_READINESS](PRODUCTION_READINESS.md).

Contratos executáveis: [shared/student-portal-contracts](../../shared/student-portal-contracts/). core-v1: identidade/escopo/versões/erros; auth-v1: HTTP e QR; policy-v1: configurações; self-v1: payload estudantil; admin-v1: comandos/consultas/DTOs ADM; ports-v1: interfaces internas; fixtures-v1: exemplos inteiramente inventados, nunca seeds produtivos.

Validação: `npm run verify`; suite focal `npx vitest run tests/student-portal/contracts/`. Nenhum teste de schema demonstra locks, ACL, KDF, autenticação real ou publicação: esses aceites pertencem às issues indicadas na matriz.

Títulos: **[SEQUENCIAL]** significa aguardar predecessor e janela própria de integração. **[PARALELO]** significa que a autoria pode coexistir com outra frente somente após seus pré-requisitos e sem compartilhar paths/recursos mutáveis. O segundo marcador é **[CODEX]** ou **[CHAT ONLINE]**. Nenhum marcador significa iniciar agora. Primeiro paralelismo: #704 e preparação da #705, após #703/G-C. CODEX não significa autorização para delegar a agentes auxiliares.
