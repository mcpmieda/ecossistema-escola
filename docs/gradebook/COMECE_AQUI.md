# Entrega corrente — Auditoria relacional atual V2

**#658 / PR #659**, branch `feat/bn-current-audit-v2-658`. Base factual: `main@3d762d7412fe0a5760680566ae6739f4d10c1172`, após Relatórios V2 #656/PR #657, merge, deploy 264 (`34577894561`) e smoke autenticado somente leitura. O trabalho atual existe no head da branch e só será fato integrado depois de CI, revisão, merge, deploy e smoke.

#646/#647 integrou fonte, siglas, detalhe e desktop. #649/#650 fixou 2026, removeu criação/seleção de anos e entregou comparação descritiva entre trimestres. #651/#652 redesenhou Desempenho. #648/#653 integrou Conselho V3. #654/#655 integrou Boletins V2. #656/#657 integrou Relatórios V2. Não reconstruir esses blocos. Usar `main` + branch + issue/PR + CI como estado factual; `PROJECT_STATE.yaml` é resumo e pode ficar um commit atrás.

A #658 substitui a composição híbrida da aba Auditoria por uma página que consulta somente os diagnósticos relacionais atuais de 2026. Ela detecta, explica e sugere; não monta o Audit Workspace V1 e não oferece correção automática. Achado atual e histórico humano são separados. Como a durabilidade mínima de reconhecimento/justificativa/resolução ainda não possui contrato explícito, esta entrega não cria schema nem simula um histórico. [Escopo detalhado](RELATIONAL_CURRENT_AUDIT_V2.md).

Gravar cada bloco revisável em commit antes de avançar. Executar testes, `npm run verify`, CI do head e revisão do diff. Atualizar o head documental, integrar/publicar conforme BN-DEC-023 e fazer smoke autenticado somente leitura — não reconhecer, resolver, corrigir, importar, emitir ou reimprimir durante a automação visual.

Não criar/comparar anos, alterar dados acadêmicos, schema, regras do motor, importador, binding, segredo ou autoridade #347. Falha ou drift fecha o escopo afetado. A validação visual conjunta de FINAL-1/2/3 permanece adiada para uma única sessão avisada previamente ao responsável.

Depois da #658, FINAL-1 #633 ainda contém manutenção docente, durabilidade explícita da trilha humana de Auditoria, isolamento/recuperação e retirada comprovada de legado. FINAL-2 #634 aguarda validação visual/medições. FINAL-3 #635 tem código/publicação do Conselho concluídos, mas visual/piloto continuam separados. FINAL-4 #406 valida o produto integral; #596 encerra a entrega institucional.

Leia também [PROJECT_STATE.yaml](PROJECT_STATE.yaml), [DECISIONS.md](DECISIONS.md), [ARCHITECTURE.md](ARCHITECTURE.md), [CONSUMER_MAP.md](CONSUMER_MAP.md), [CONTRACTS.md](CONTRACTS.md), [ROADMAP.md](ROADMAP.md) e [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md). Memória anterior: [history/pre-final-1/README.md](history/pre-final-1/README.md).
