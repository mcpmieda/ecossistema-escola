# Portal do Aluno — Parte 2

A Parte 1 está tecnicamente encerrada (#701/#715). A fila da Parte 2 é [#742](https://github.com/mcpmieda/ecossistema-escola/issues/742), com entregas #743–#760. O responsável autorizou execução autônoma **uma issue por vez**, preservando CODEX/CHAT ONLINE nos títulos: [PA-DEC-007](DECISIONS.md). #743–#756 estão concluídas e publicadas (14/18). Entrega corrente: #757, composição das telas; próxima: #758, depois dos gates de integração e publicação.

**G-B continua PARCIAL.** A [checklist de aceite integrado](TEST_MATRIX.md) pertence à #759, antes de G-P e qualquer liberação aos alunos. O backend publicado não equivale a homologação funcional das telas. Os componentes P2 estão implementados; #757 monta as entradas do aluno e do ADM. A conclusão técnica não antecipa o aceite real.

## Baseline e evidência

Baseline publicada #756: main `270ab8a442e833cd089d4d139bacbef55c7c52a0`, PR #774, deploy `34788638736` SUCCESS. Evidência anterior: 1990 testes aprovados, 3 skips históricos, 21 workerd; CI PostgreSQL 55 + 2 + 1 + 16 provas e 12 verificações HTTP. A candidata #757 exige seus próprios verify/CI, merge e publicação; SHA e resultados finais ficam no handoff da issue.

Último inventário produtivo, observado na #742 (não reconsultado por esta composição): `gradebook` com 30 tabelas e `student_portal` com 20; Portal V1 somente 2026, independente do seletor multi-ano do BN. Piloto preservado: três contas com nascimento não confirmado e calendário provisório, zero acessos/sessões/períodos publicados, população global false. O objeto calendário escolar existe, mas seus marcos continuam nulos. [Inventário e limites](PRODUCTION_READINESS.md).

## Leitura e execução

AGENTS → [MASTER_SPEC](MASTER_SPEC.md) → [ARCHITECTURE](ARCHITECTURE.md) → [DECISIONS](DECISIONS.md) → [PROJECT_STATE](PROJECT_STATE.yaml) → issue atribuída e handoff anterior → [TEST_MATRIX](TEST_MATRIX.md) → [PRODUCTION_READINESS](PRODUCTION_READINESS.md). Ao consumir BN, ler seus contratos, decisões e CONSUMER_MAP. [ISSUE_MAP](ISSUE_MAP.md) contém dependências, ownership, sequência e rastreio P1/P2.

Uma branch curta e um PR por entrega, verify/CI no head final, revisão, merge com SHA esperado e deploy oficial. Atualizar somente o marcador de estado; não renomear CODEX/CHAT ONLINE. Nenhum subagente ou execução simultânea. O editor integrador mantém os oito docs; outros owners entregam deltas nas issues.

## Runtime preservado

`aluno.escolaieda.com`: Pages HTTPS e Worker próprio, PORTAL_SELF para entrypoint self. ADM mantém Entra e PORTAL_SERVICE privado. PostgreSQL/Supabase via PORTAL_DB Hyperdrive sem cache e role restrita. Migrations Portal 0001–0007 já aplicadas; nenhuma DDL na composição #757. Composição em `server/student-portal/composition`, entrada em `workers/student-portal`, rota ADM em `functions/[[path]].ts`.

`npm run verify` cobre lint, tipos, testes, builds e provas workerd. `npm run test:student-portal-postgres` usa PostgreSQL descartável `portal705_test`, as suites nativas de runtime, smokes, fundação, consultas administrativas e composição. Fixture e selo sintético não provam Entra real, dispositivo ou piloto legítimo.
