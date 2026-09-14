# Portal do Aluno — Parte 2

A Parte 1 (#701/#715) e as 18 entregas da Parte 2 (#743–#760, mãe #742) estão tecnicamente concluídas. A execução permaneceu sequencial e preservou CODEX/CHAT ONLINE nos títulos, conforme [PA-DEC-007](DECISIONS.md).

**Estado operacional deliberado:** o produto está publicado e tecnicamente aceito, mas permanece fechado para abertura escolar geral. População global desabilitada, nenhum acesso explicitamente habilitado, nenhuma sessão válida e nenhum período publicado ou pendente. As três projeções históricas da massa de teste foram preservadas, sem ficarem acessíveis enquanto essas guardas estiverem fechadas.

G-C passou. G-B foi aceito pelo responsável após o fluxo produtivo real de redefinição, QR, PIN, senha, entrada, saída e reentrada; testes físicos de câmera, impressão, Narrador e a matriz ampla de dispositivos ficaram explicitamente adiados, sem PASS presumido. G-P passou para a publicação técnica fechada por política; isso não autoriza população, períodos, distribuição de QR ou acesso geral. Uma abertura futura exige decisão institucional específica e o roteiro de [operação](../../server/student-portal/observability/OPERATIONS_V1.md).

## Baseline e evidência

Runtime publicado: main `436e9db8aebd67ea8e9765676aca47d385cd3119`, PR #787 e deploy oficial `34871838273` SUCCESS. O handoff da #759 registra o aceite real e o encerramento do piloto; a #760 registra o SHA/CI/deploy desta consolidação documental.

A entrega de runtime passou por `npm run verify` com 2072 testes aprovados, 3 skips históricos e 21 provas workerd; as composições PostgreSQL somaram 87 aprovações. O ADM passou por 20 recargas produtivas sem indisponibilidade ou retorno indevido ao login. `/healthz` respondeu 20/20 com HTTP 200, `state=ok` e `no-store`.

## Leitura e manutenção

AGENTS → [MASTER_SPEC](MASTER_SPEC.md) → [ARCHITECTURE](ARCHITECTURE.md) → [DECISIONS](DECISIONS.md) → [PROJECT_STATE](PROJECT_STATE.yaml) → [TEST_MATRIX](TEST_MATRIX.md) → [PRODUCTION_READINESS](PRODUCTION_READINESS.md). Ao consumir BN, ler seus contratos, decisões e CONSUMER_MAP.

Defeitos futuros recebem issue própria e reproduzível, sem reabrir silenciosamente a fila concluída. Não registrar PII, QR, PIN, senha, cookie, token ou notas em issue, log, captura ou fixture pública.

## Runtime preservado

`aluno.escolaieda.com`: Pages HTTPS e Worker próprio, PORTAL_SELF para entrypoint self. ADM mantém Entra e PORTAL_SERVICE privado. PostgreSQL/Supabase via PORTAL_DB Hyperdrive sem cache e role restrita. Migrations Portal 0001–0007 já aplicadas; nenhuma DDL na composição #757. Composição em `server/student-portal/composition`, entrada em `workers/student-portal`, rota ADM em `functions/[[path]].ts`.

`npm run verify` cobre lint, tipos, testes, builds e provas workerd. `npm run test:student-portal-postgres` usa PostgreSQL descartável `portal705_test`, as suites nativas de runtime, smokes, fundação, consultas administrativas e composição. Fixture e selo sintético não provam Entra real, dispositivo ou piloto legítimo.
