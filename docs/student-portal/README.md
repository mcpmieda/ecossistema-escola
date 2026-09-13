# Portal do Aluno — Parte 1

A implementação segue a autorização contínua do responsável, uma fase por vez, sem agentes auxiliares. #702–#714 estão integradas e publicadas; #715 está integrada e publicada, com HTTP e cron remotos verificados; ainda faltam o RPC Portal com sessão real, widget produtivo e piloto privado. **G-B PARCIAL: não há abertura escolar nem interface P2.**

Baseline integrada verificada: `6071d725bbc4a0d1ed89e63e9f11e49852464df8`, PR738, deploy oficial34737943189 SUCCESS. Verify no head20450e2163e237ab2bd3f86b43675c7966f0d5d5:1694 PASS+3 skips históricos,18workerd; CI PostgreSQL17.6:55 nativos+2 smokes compostos PASS. Evidências e limites em [PRODUCTION_READINESS](PRODUCTION_READINESS.md).

Ordem de leitura: AGENTS → [MASTER_SPEC](MASTER_SPEC.md) → [ARCHITECTURE](ARCHITECTURE.md) → [DECISIONS](DECISIONS.md) → [PROJECT_STATE](PROJECT_STATE.yaml) → issue → [TEST_MATRIX](TEST_MATRIX.md) → [PRODUCTION_READINESS](PRODUCTION_READINESS.md). [ISSUE_MAP](ISSUE_MAP.md) mantém rastreio dos nove grupos. Contratos executáveis: shared/student-portal-contracts e shared/gradebook-contracts.

O endereço é https://aluno.escolaieda.com, com Pages mínimo e Worker separado. ADM usa seu SSO e binding administrativo privado. PostgreSQL/Supabase via Hyperdrive próprio, papel restrito e cache desativado; sete migrations Portal já aplicadas. Sem DDL nesta integração.

Composição: server/student-portal/composition; Worker/edge: workers/student-portal; rota ADM: functions/[[path]].ts. Políticas/calendário, nascimento, autenticação, publicação, manutenção e leitura acadêmica são serviços reais. Nenhuma fórmula acadêmica duplicada. Default público não tem RPC administrativo.

`npm run verify` valida lint/types/test/build e18 provas workerd. `npm run test:student-portal-postgres` exige banco local novo portal705_test, roda55 provas nativas e depois smoke da composição real em workerd com PostgreSQL restrito. Dados e identidades de teste são inteiramente sintéticos. Isso não substitui Entra e piloto real6A.

Títulos atuais: [AGORA] pode ser executada dentro de suas dependências/ownership; [DEPOIS] aguarda. [SEQUENCIAL]/[PARALELO] descrevem concorrência permitida; [CODEX]/[CHAT ONLINE], executor. A execução corrente é sequencial e direta. Não criar issues P2.
