# Entrega corrente — Boletins relacionais V2

**#654**, branch `feat/bn-relational-bulletins-v2-654`. Base factual: `main@4f32dd5150641d0a24c2e2c241768f953202ce56`, após Conselho V3 #648/PR #653, migration/postflight, CI 594, deploy 262 (`34565744488`) e smoke autenticado somente leitura.

#646/#647 integrou fonte, siglas, detalhe e desktop. #649/#650 fixou 2026, removeu criação/seleção de anos e entregou comparação descritiva entre trimestres. #651/#652 redesenhou Desempenho. #648/#653 integrou Conselho V3. Não reconstruir esses blocos. Usar `main` + branch + issue/PR + CI como estado factual; `PROJECT_STATE.yaml` é resumo e pode ficar um commit atrás.

A #654 reancora Boletins em PostgreSQL relacional: catálogo/alunos, prévia, emissão individual/lote, histórico, reimpressão e PDF. AM/U importadas são oficiais; cálculo nativo é comparação descritiva. `ASSISTIDO` mostra notas sem resultado geral. REC e `N/C` aparecem junto das notas normais. Decisão formal de Conselho é somente o fato humano registrado. [Contrato detalhado](RELATIONAL_BULLETINS_V2.md).

Gravar cada bloco revisável em commit antes de avançar. Executar testes, `npm run verify`, CI do head e revisão do diff. Antes de `0005`, preservar backup lógico fora do Git, confirmar as 28 tabelas atuais/ausência do alvo e contagens; depois conferir estrutura, ACL e zero linhas. Só então integrar/publicar conforme BN-DEC-023 e fazer smoke autenticado somente leitura — não emitir snapshot oficial durante automação visual.

Não criar/comparar anos, alterar dados acadêmicos, schema fora de `0005`, regras do motor, importador, binding, segredo ou autoridade #347. Falha ou drift fecha o escopo afetado. A validação visual conjunta de FINAL-1/2/3 permanece adiada para uma única sessão avisada previamente ao responsável.

Depois da #654, FINAL-1 #633 ainda contém manutenção docente, Audit Workspace antigo, Relatórios, isolamento/recuperação e retirada comprovada de legado. FINAL-2 #634 aguarda validação visual/medições. FINAL-3 #635 tem código/publicação do Conselho concluídos, mas visual/piloto continuam separados. FINAL-4 #406 valida o produto integral; #596 encerra a entrega institucional.

Leia também [PROJECT_STATE.yaml](PROJECT_STATE.yaml), [DECISIONS.md](DECISIONS.md), [ARCHITECTURE.md](ARCHITECTURE.md), [CONSUMER_MAP.md](CONSUMER_MAP.md), [CONTRACTS.md](CONTRACTS.md), [ROADMAP.md](ROADMAP.md) e [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md). Memória anterior: [history/pre-final-1/README.md](history/pre-final-1/README.md).
