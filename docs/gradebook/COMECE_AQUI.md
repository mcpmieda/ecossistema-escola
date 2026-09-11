# Entrega corrente — medições autenticadas de Desempenho

**#668**, branch `test/bn-final2-performance-metrics-668`. Base factual: `main@fc6547f1cf994a9f87fe5c01fd80c1b58c5de642`, após a retirada dos frontends antigos #666/PR #667, deploy 269 (`34604746376`) e smoke autenticado somente leitura. O trabalho atual existe no head da branch e só será fato integrado depois de CI, revisão, merge e deploy.

#646/#647 integrou fonte, siglas, detalhe e desktop. #649/#650 fixou 2026, removeu criação/seleção de anos e entregou comparação descritiva entre trimestres. #651/#652 redesenhou Desempenho. #648/#653 integrou Conselho V3. #654/#655 integrou Boletins V2. #656/#657 integrou Relatórios V2. Não reconstruir esses blocos. Usar `main` + branch + issue/PR + CI como estado factual; `PROJECT_STATE.yaml` é resumo e pode ficar um commit atrás.

A #662 restaurou a cópia lógica V2 em PostgreSQL local descartável, conferiu dados/identities/catalog/ACL e executou jornadas e contenção com conexões reais. A PR #663 foi integrada e publicada; não converte a medida local em RPO/RTO institucional. [Escopo e evidência](RELATIONAL_RECOVERY_REHEARSAL_662.md).

A #664 retirou somente os três módulos de UI e o endpoint dedicado do Audit Workspace V1 sem consumidores ativos. A Auditoria Atual V2 e `/api/gradebook/import-diagnostics` não mudaram; o núcleo V1 continua preservado porque Relatórios V1 ainda o consome. [Prova e limite](LEGACY_AUDIT_RETIREMENT_664.md).

A #666 retira os clusters frontend antigos de Centrais, Desempenho, Conselho, Boletins e Relatórios que não são montados nem importados pela aplicação atual. Endpoints, handlers, contratos, serviços, adapters e o renderizador PDF V1 ainda reutilizado permanecem. [Prova e limite](LEGACY_FRONTEND_RETIREMENT_666.md).

A #668 registra as medições autenticadas já executadas no Desempenho publicado: payload, p95 de dashboard/detalhe e tempo até a matriz utilizável passaram nas metas da #634 no cenário sanitizado. Não altera runtime. [Cenário e resultado](PERFORMANCE_MEASUREMENTS_668.md).

Gravar cada bloco revisável em commit antes de avançar. Executar testes, `npm run verify`, CI do head e revisão do diff. Atualizar o head documental e integrar/publicar conforme BN-DEC-023.

Não criar/comparar anos, alterar dados acadêmicos, schema, regras do motor, importador, binding, segredo ou autoridade #347. Falha ou drift fecha o escopo afetado. A validação visual conjunta de FINAL-1/2/3 permanece adiada para uma única sessão avisada previamente ao responsável.

Os consumidores funcionais relacionais da FINAL-1 #633 estão reancorados. A #662 comprova restore do artefato e contenção local; a #664 remove a superfície dedicada Audit V1; a #666 retira somente frontends antigos sem montagem. Ainda faltam durabilidade explícita da trilha humana de Auditoria e recuperação operacional externa. Endpoints V1 externos só podem ser retirados após inventário próprio. FINAL-2 #634 tem implementação e métricas técnicas concluídas; aguarda a validação visual/acessibilidade manual conjunta. FINAL-3 #635 tem código/publicação e contenção local do Conselho concluídos, mas visual/piloto continuam separados. FINAL-4 #406 valida o produto integral; #596 encerra a entrega institucional.

Leia também [PROJECT_STATE.yaml](PROJECT_STATE.yaml), [DECISIONS.md](DECISIONS.md), [ARCHITECTURE.md](ARCHITECTURE.md), [CONSUMER_MAP.md](CONSUMER_MAP.md), [CONTRACTS.md](CONTRACTS.md), [ROADMAP.md](ROADMAP.md) e [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md). Memória anterior: [history/pre-final-1/README.md](history/pre-final-1/README.md).
