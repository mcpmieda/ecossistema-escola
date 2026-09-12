# Banco de Notas — estado operacional

Data da consolidação: 11/09/2026 (America/Sao_Paulo).

O programa relacional está implementado, publicado e exercitado. FINAL-1 #633, FINAL-2 #634, FINAL-3 #635, FINAL-4 #406 e o aceite acadêmico #347 estão encerrados. A matriz do piloto está em [FINAL4_PILOT_406.md](FINAL4_PILOT_406.md) e a operação final em [FINAL_OPERATION_596.md](FINAL_OPERATION_596.md).

Baseline factual desta memória: `main@80b2916185fc6a49df7c5ab0af71e2be4dcdeb66`, CI `34667519751` e deploy `34667699446` verdes. Usar sempre `main` + branch + PR + issues + CI como estado mais recente; `PROJECT_STATE.yaml` é apenas um resumo auditado e pode ficar atrás do head.

## Contrato vigente

- PostgreSQL/Supabase via Hyperdrive `PROD_DB` é a persistência atual.
- `imported-source` é a autoridade dos consumidores; `native-engine` permanece descritivo.
- 2026 é o ano oficial em curso. A massa materializada de 2025 é descartável e serve apenas para teste integral.
- O ano é selecionado globalmente e isola dados e identidades. Comparação existe somente entre trimestres do mesmo ano.
- R/R em qualquer componente implica `REPROVADO` e exclui o aluno do Conselho.
- Conselho registra decisão humana e votos favoráveis/contrários; desempate do diretor ocorre fora do sistema.
- Situação do aluno vem exclusivamente da Relação; AM/U vêm da fonte importada.

## Limite operacional aceito

Backup/restore gerenciado, retenção, RPO e RTO não estão implementados. O responsável decidiu adiar esse trabalho e operar por enquanto sem a garantia. A restauração local da #662 não deve ser apresentada como backup institucional, e o D1 histórico não recupera escritas novas.

## Ordem de leitura

1. [FINAL_OPERATION_596.md](FINAL_OPERATION_596.md): rotina, responsabilidades, monitoramento e incidente.
2. [FINAL4_PILOT_406.md](FINAL4_PILOT_406.md): matriz sanitizada do percurso integral.
3. [DECISIONS.md](DECISIONS.md): decisões e limites normativos.
4. [ARCHITECTURE.md](ARCHITECTURE.md), [CONSUMER_MAP.md](CONSUMER_MAP.md) e [CONTRACTS.md](CONTRACTS.md): arquitetura e contratos.
5. [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md), [ROADMAP.md](ROADMAP.md), [ISSUE_MAP.md](ISSUE_MAP.md) e [TEST_MATRIX.md](TEST_MATRIX.md): evidências e histórico executável.

Toda mudança segue `issue → branch → commit → npm run verify → CI do head → revisão → merge por SHA → deploy oficial → smoke`. BN-DEC-023 dispensa confirmação por PR concluída, não autoriza publicar check falhando nem ampliar regra, dado, schema, autoridade ou infraestrutura.
