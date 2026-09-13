# Portal do Aluno — Parte 2

A Parte 1 está tecnicamente encerrada (#701/#715). A fila da Parte 2 é [#742](https://github.com/mcpmieda/ecossistema-escola/issues/742), com entregas #743–#760. O responsável autorizou execução autônoma **uma issue por vez**, preservando CODEX/CHAT ONLINE nos títulos: [PA-DEC-007](DECISIONS.md). Preparação atual: #743; próxima entrega: #744 depois de sua integração/publicação verificada.

**G-B continua PARCIAL.** A [checklist de aceite integrado](TEST_MATRIX.md) pertence à #759, antes de G-P e qualquer liberação aos alunos. O backend publicado não equivale a homologação funcional das telas. Nenhuma interface P2 foi implementada pela preparação documental.

## Baseline e evidência

Main auditada `9066c04d01b8d62bf59e1de0b51c6ce4c567c668`, PR #741, workflow oficial `34749391273` SUCCESS. A publicação do aluno e do ADM foi reconfirmada no mesmo SHA em 13/09/2026. Evidência P1: 1694 testes aprovados, 3 skips históricos, 18 workerd; CI PostgreSQL: 55 provas nativas e 2 smokes compostos; dez verificações HTTP aprovadas. Essa evidência não foi repetida para a varredura.

Supabase: `gradebook` com 30 tabelas e `student_portal` com 20; Portal V1 somente 2026, independente do seletor multi-ano do BN. Piloto preservado: três contas com nascimento não confirmado e calendário provisório, zero acessos/sessões/períodos publicados, população global false. O objeto calendário escolar existe, mas seus marcos continuam nulos. [Inventário e limites](PRODUCTION_READINESS.md).

## Leitura e execução

AGENTS → [MASTER_SPEC](MASTER_SPEC.md) → [ARCHITECTURE](ARCHITECTURE.md) → [DECISIONS](DECISIONS.md) → [PROJECT_STATE](PROJECT_STATE.yaml) → issue atribuída e handoff anterior → [TEST_MATRIX](TEST_MATRIX.md) → [PRODUCTION_READINESS](PRODUCTION_READINESS.md). Ao consumir BN, ler seus contratos, decisões e CONSUMER_MAP. [ISSUE_MAP](ISSUE_MAP.md) contém dependências, ownership, sequência e rastreio P1/P2.

Uma branch curta e um PR por entrega, verify/CI no head final, revisão, merge com SHA esperado e deploy oficial. Atualizar somente o marcador de estado; não renomear CODEX/CHAT ONLINE. Nenhum subagente ou execução simultânea. O editor integrador mantém os oito docs; outros owners entregam deltas nas issues.

## Runtime preservado

`aluno.escolaieda.com`: Pages HTTPS e Worker próprio, PORTAL_SELF para entrypoint self. ADM mantém Entra e PORTAL_SERVICE privado. PostgreSQL/Supabase via PORTAL_DB Hyperdrive sem cache e role restrita. Migrations Portal 0001–0007 já aplicadas; nenhuma DDL nesta preparação. Composição em `server/student-portal/composition`, entrada em `workers/student-portal`, rota ADM em `functions/[[path]].ts`.

`npm run verify` cobre lint, tipos, testes, builds e 18 provas workerd. `npm run test:student-portal-postgres` usa PostgreSQL descartável `portal705_test`, 55 provas nativas e dois smokes compostos. Fixture e selo sintético não provam Entra real, dispositivo ou piloto legítimo.
