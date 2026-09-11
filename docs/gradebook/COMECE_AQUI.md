# Entrega corrente — recuperação lógica e contenção PostgreSQL

**#662 / PR #663**, branch `test/bn-relational-recovery-contention-662`. Base factual: `main@92e9f97a23e110cb77011570e1edaef97389cb3d`, após configuração docente #660/PR #661, deploy 266 (`34585674112`) e smoke autenticado somente leitura. O trabalho atual existe no head da branch e só será fato integrado depois de CI, revisão, merge e deploy.

#646/#647 integrou fonte, siglas, detalhe e desktop. #649/#650 fixou 2026, removeu criação/seleção de anos e entregou comparação descritiva entre trimestres. #651/#652 redesenhou Desempenho. #648/#653 integrou Conselho V3. #654/#655 integrou Boletins V2. #656/#657 integrou Relatórios V2. Não reconstruir esses blocos. Usar `main` + branch + issue/PR + CI como estado factual; `PROJECT_STATE.yaml` é resumo e pode ficar um commit atrás.

A #662 restaura a cópia lógica V2 em PostgreSQL local descartável, confere dados/identities/catalog/ACL e executa jornadas e contenção com conexões reais. Ela não toca produção nem converte a medida local em RPO/RTO institucional. [Escopo e evidência](RELATIONAL_RECOVERY_REHEARSAL_662.md).

Gravar cada bloco revisável em commit antes de avançar. Executar testes, `npm run verify`, CI do head e revisão do diff. Atualizar o head documental e integrar/publicar conforme BN-DEC-023. O utilitário é inerte sem chamada explícita e a CI não recebe backup/credencial.

Não criar/comparar anos, alterar dados acadêmicos, schema, regras do motor, importador, binding, segredo ou autoridade #347. Falha ou drift fecha o escopo afetado. A validação visual conjunta de FINAL-1/2/3 permanece adiada para uma única sessão avisada previamente ao responsável.

Os consumidores funcionais relacionais da FINAL-1 #633 estão reancorados. A #662 comprova restore do artefato e contenção local; ainda faltam durabilidade explícita da trilha humana de Auditoria, recuperação operacional externa e retirada comprovada de legado. FINAL-2 #634 aguarda validação visual/medições. FINAL-3 #635 tem código/publicação e contenção local do Conselho concluídos, mas visual/piloto continuam separados. FINAL-4 #406 valida o produto integral; #596 encerra a entrega institucional.

Leia também [PROJECT_STATE.yaml](PROJECT_STATE.yaml), [DECISIONS.md](DECISIONS.md), [ARCHITECTURE.md](ARCHITECTURE.md), [CONSUMER_MAP.md](CONSUMER_MAP.md), [CONTRACTS.md](CONTRACTS.md), [ROADMAP.md](ROADMAP.md) e [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md). Memória anterior: [history/pre-final-1/README.md](history/pre-final-1/README.md).
