# Entrega corrente — Relatórios institucionais V2

**#656**, branch `feat/bn-relational-reports-v2-656`. Base factual: `main@1512d5b37c42931b1df81bbfe6483d1ad5340130`, após Boletins V2 #654/PR #655, migration/postflight, merge, deploy 263 (`34572772095`) e smoke autenticado somente leitura. O trabalho atual existe no head da branch e só será fato integrado depois de `npm run verify`, CI, revisão, merge e deploy.

#646/#647 integrou fonte, siglas, detalhe e desktop. #649/#650 fixou 2026, removeu criação/seleção de anos e entregou comparação descritiva entre trimestres. #651/#652 redesenhou Desempenho. #648/#653 integrou Conselho V3. Não reconstruir esses blocos. Usar `main` + branch + issue/PR + CI como estado factual; `PROJECT_STATE.yaml` é resumo e pode ficar um commit atrás.

A #656 reancora Relatórios nas projeções relacionais vigentes: catálogo; desempenho e comparação entre trimestres do mesmo ano; Conselho humano V3; diagnósticos atuais; histórico e reimpressão snapshot-only de Boletins V2. É somente leitura, fixa 2026 e não inventa motor, regra, autoridade, comparação entre anos ou voto do diretor. [Contrato detalhado](RELATIONAL_REPORTS_V2.md).

Gravar cada bloco revisável em commit antes de avançar. Executar testes, `npm run verify`, CI do head e revisão do diff. A #656 não altera schema nem dados e testa o caminho PostgreSQL com massa sintética. Atualizar o head documental, integrar/publicar conforme BN-DEC-023 e fazer smoke autenticado somente leitura — não emitir nem reimprimir snapshot durante automação visual.

Não criar/comparar anos, alterar dados acadêmicos, schema, regras do motor, importador, binding, segredo ou autoridade #347. Falha ou drift fecha o escopo afetado. A validação visual conjunta de FINAL-1/2/3 permanece adiada para uma única sessão avisada previamente ao responsável.

Depois da #656, FINAL-1 #633 ainda contém manutenção docente, Audit Workspace antigo, isolamento/recuperação e retirada comprovada de legado. FINAL-2 #634 aguarda validação visual/medições. FINAL-3 #635 tem código/publicação do Conselho concluídos, mas visual/piloto continuam separados. FINAL-4 #406 valida o produto integral; #596 encerra a entrega institucional.

Leia também [PROJECT_STATE.yaml](PROJECT_STATE.yaml), [DECISIONS.md](DECISIONS.md), [ARCHITECTURE.md](ARCHITECTURE.md), [CONSUMER_MAP.md](CONSUMER_MAP.md), [CONTRACTS.md](CONTRACTS.md), [ROADMAP.md](ROADMAP.md) e [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md). Memória anterior: [history/pre-final-1/README.md](history/pre-final-1/README.md).
